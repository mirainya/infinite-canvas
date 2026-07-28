"""V2 工作流任务 API。"""

import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from auth import get_current_user
from db import get_pool
from v2_graph import GraphSnapshot, topological_order
import wallet

router = APIRouter(prefix="/api/v2/runs", tags=["v2-runs"])


class CreateRunRequest(BaseModel):
    project_id: uuid.UUID
    graph: GraphSnapshot | None = None


def _decode_json_fields(row, fields: tuple[str, ...]) -> dict:
    item = dict(row)
    for field in fields:
        if isinstance(item.get(field), str):
            item[field] = json.loads(item[field])
    return item


@router.post("", status_code=202)
async def create_run(body: CreateRunRequest, user: dict = Depends(get_current_user)):
    pool = await get_pool()
    project = await pool.fetchrow(
        "SELECT id, revision, graph FROM projects "
        "WHERE id=$1 AND owner_id=$2 AND archived_at IS NULL",
        body.project_id, int(user["sub"]),
    )
    if not project:
        raise HTTPException(404, "项目不存在")
    if body.graph is not None:
        graph = body.graph
    else:
        raw_graph = json.loads(project["graph"]) if isinstance(project["graph"], str) else project["graph"]
        graph = GraphSnapshot.model_validate(raw_graph)
    order = topological_order(graph)
    executable = [
        node_id for node_id in order
        if next(node for node in graph.nodes if node.id == node_id).type
        in {"ai-image", "text-generation", "prompt-enhance", "image-split"}
    ]
    if not executable:
        raise HTTPException(400, "项目中没有需要运行的节点")

    run_id = uuid.uuid4()
    request_id = wallet.new_request_id()
    graph_json = json.dumps(graph.model_dump(by_alias=True), ensure_ascii=False)
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """INSERT INTO workflow_runs
                   (id, project_id, owner_id, project_revision, input_snapshot, request_id)
                   VALUES ($1,$2,$3,$4,$5::jsonb,$6) RETURNING *""",
                run_id, body.project_id, int(user["sub"]), project["revision"], graph_json, request_id,
            )
            node_by_id = {node.id: node for node in graph.nodes}
            for sequence, node_id in enumerate(executable):
                await conn.execute(
                    """INSERT INTO node_runs (id, run_id, node_id, node_type, sequence)
                       VALUES ($1,$2,$3,$4,$5)""",
                    uuid.uuid4(), run_id, node_id, node_by_id[node_id].type, sequence,
                )
    return _decode_json_fields(row, ("input_snapshot", "output_snapshot"))


@router.get("")
async def list_runs(
    project_id: uuid.UUID | None = None,
    limit: int = Query(default=30, ge=1, le=100),
    user: dict = Depends(get_current_user),
):
    pool = await get_pool()
    if project_id:
        rows = await pool.fetch(
            """SELECT id, project_id, project_revision, status, progress, credits_used,
                      error, created_at, started_at, finished_at
               FROM workflow_runs WHERE owner_id=$1 AND project_id=$2
               ORDER BY created_at DESC LIMIT $3""",
            int(user["sub"]), project_id, limit,
        )
    else:
        rows = await pool.fetch(
            """SELECT id, project_id, project_revision, status, progress, credits_used,
                      error, created_at, started_at, finished_at
               FROM workflow_runs WHERE owner_id=$1
               ORDER BY created_at DESC LIMIT $2""",
            int(user["sub"]), limit,
        )
    return [dict(row) for row in rows]


@router.get("/{run_id}")
async def get_run(run_id: uuid.UUID, user: dict = Depends(get_current_user)):
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT * FROM workflow_runs WHERE id=$1 AND owner_id=$2",
        run_id, int(user["sub"]),
    )
    if not row:
        raise HTTPException(404, "任务不存在")
    nodes = await pool.fetch(
        "SELECT * FROM node_runs WHERE run_id=$1 ORDER BY sequence", run_id,
    )
    result = _decode_json_fields(row, ("input_snapshot", "output_snapshot"))
    result["nodes"] = [_decode_json_fields(item, ("inputs", "outputs")) for item in nodes]
    return result


@router.post("/{run_id}/cancel")
async def cancel_run(run_id: uuid.UUID, user: dict = Depends(get_current_user)):
    pool = await get_pool()
    result = await pool.execute(
        """UPDATE workflow_runs SET cancel_requested_at=NOW(),
                  status=CASE WHEN status='queued' THEN 'cancelled' ELSE status END,
                  finished_at=CASE WHEN status='queued' THEN NOW() ELSE finished_at END
           WHERE id=$1 AND owner_id=$2 AND status IN ('queued','running')""",
        run_id, int(user["sub"]),
    )
    if result == "UPDATE 0":
        raise HTTPException(409, "任务已完成或不存在")
    return {"ok": True}
