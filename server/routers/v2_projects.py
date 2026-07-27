"""V2 云端项目与版本 API。"""

import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from auth import get_current_user
from db import get_pool
from v2_graph import GraphSnapshot, ProjectCreate, ProjectPatch, ProjectUpdate

router = APIRouter(prefix="/api/v2/projects", tags=["v2-projects"])


class VersionCreateRequest(BaseModel):
    reason: str = Field(default="manual", min_length=1, max_length=80)


def _json(value):
    return json.loads(value) if isinstance(value, str) else value


def _project_dict(row) -> dict:
    item = dict(row)
    for key in ("graph", "viewport", "settings"):
        if key in item:
            item[key] = _json(item[key])
    return item


@router.get("")
async def list_projects(
    limit: int = Query(default=50, ge=1, le=200),
    user: dict = Depends(get_current_user),
):
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT id, name, description, revision, updated_at, created_at "
        "FROM projects WHERE owner_id=$1 AND archived_at IS NULL "
        "ORDER BY updated_at DESC LIMIT $2",
        int(user["sub"]), limit,
    )
    return [dict(row) for row in rows]


@router.post("", status_code=201)
async def create_project(body: ProjectCreate, user: dict = Depends(get_current_user)):
    pool = await get_pool()
    project_id = uuid.uuid4()
    graph = body.graph.model_dump(by_alias=True)
    viewport = body.viewport.model_dump()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """INSERT INTO projects
                   (id, owner_id, name, description, graph, viewport, settings)
                   VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb)
                   RETURNING *""",
                project_id, int(user["sub"]), body.name, body.description,
                json.dumps(graph, ensure_ascii=False),
                json.dumps(viewport, ensure_ascii=False),
                json.dumps(body.settings, ensure_ascii=False),
            )
            await conn.execute(
                """INSERT INTO project_versions
                   (project_id, revision, graph, viewport, settings, reason)
                   VALUES ($1,1,$2::jsonb,$3::jsonb,$4::jsonb,'manual')""",
                project_id,
                json.dumps(graph, ensure_ascii=False),
                json.dumps(viewport, ensure_ascii=False),
                json.dumps(body.settings, ensure_ascii=False),
            )
    return _project_dict(row)


@router.get("/{project_id}")
async def get_project(project_id: uuid.UUID, user: dict = Depends(get_current_user)):
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT * FROM projects WHERE id=$1 AND owner_id=$2 AND archived_at IS NULL",
        project_id, int(user["sub"]),
    )
    if not row:
        raise HTTPException(404, "项目不存在")
    return _project_dict(row)


@router.put("/{project_id}")
async def update_project(
    project_id: uuid.UUID,
    body: ProjectUpdate,
    user: dict = Depends(get_current_user),
):
    pool = await get_pool()
    graph = body.graph.model_dump(by_alias=True)
    viewport = body.viewport.model_dump()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """UPDATE projects SET
                     name=COALESCE($4,name), description=COALESCE($5,description),
                     graph=$6::jsonb, viewport=$7::jsonb, settings=$8::jsonb,
                     revision=revision+1, updated_at=NOW()
                   WHERE id=$1 AND owner_id=$2 AND revision=$3 AND archived_at IS NULL
                   RETURNING *""",
                project_id, int(user["sub"]), body.revision, body.name, body.description,
                json.dumps(graph, ensure_ascii=False),
                json.dumps(viewport, ensure_ascii=False),
                json.dumps(body.settings, ensure_ascii=False),
            )
            if not row:
                exists = await conn.fetchval(
                    "SELECT EXISTS(SELECT 1 FROM projects WHERE id=$1 AND owner_id=$2 AND archived_at IS NULL)",
                    project_id, int(user["sub"]),
                )
                raise HTTPException(409 if exists else 404, "项目已在其他页面更新" if exists else "项目不存在")
            if body.reason != "auto":
                await conn.execute(
                    """INSERT INTO project_versions
                       (project_id, revision, graph, viewport, settings, reason)
                       VALUES ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6)""",
                    project_id, row["revision"],
                    json.dumps(graph, ensure_ascii=False),
                    json.dumps(viewport, ensure_ascii=False),
                    json.dumps(body.settings, ensure_ascii=False), body.reason,
                )
    return _project_dict(row)


@router.patch("/{project_id}")
async def patch_project(
    project_id: uuid.UUID,
    body: ProjectPatch,
    user: dict = Depends(get_current_user),
):
    """增量保存节点、连线和视口，使用 revision 防止覆盖并发修改。"""
    pool = await get_pool()
    owner_id = int(user["sub"])
    async with pool.acquire() as conn:
        async with conn.transaction():
            current = await conn.fetchrow(
                """SELECT * FROM projects WHERE id=$1 AND owner_id=$2
                   AND archived_at IS NULL FOR UPDATE""",
                project_id, owner_id,
            )
            if not current:
                raise HTTPException(404, "项目不存在")
            if current["revision"] != body.revision:
                raise HTTPException(409, "项目已在其他页面更新")

            raw_graph = _json(current["graph"])
            nodes = {item["id"]: item for item in raw_graph.get("nodes", [])}
            edges = {item["id"]: item for item in raw_graph.get("edges", [])}
            deleted_nodes = set(body.delete_node_ids)
            for node_id in deleted_nodes:
                nodes.pop(node_id, None)
            for edge_id, edge in list(edges.items()):
                if edge.get("source") in deleted_nodes or edge.get("target") in deleted_nodes:
                    edges.pop(edge_id, None)
            for edge_id in body.delete_edge_ids:
                edges.pop(edge_id, None)
            for node in body.upsert_nodes:
                nodes[node.id] = node.model_dump(by_alias=True)
            for edge in body.upsert_edges:
                edges[edge.id] = edge.model_dump(by_alias=True)

            graph = GraphSnapshot.model_validate({
                "nodes": list(nodes.values()),
                "edges": list(edges.values()),
            }).model_dump(by_alias=True)
            viewport = body.viewport.model_dump() if body.viewport else _json(current["viewport"])
            row = await conn.fetchrow(
                """UPDATE projects SET name=COALESCE($4,name),
                          description=COALESCE($5,description), graph=$6::jsonb,
                          viewport=$7::jsonb, revision=revision+1, updated_at=NOW()
                   WHERE id=$1 AND owner_id=$2 AND revision=$3
                   RETURNING id, name, description, revision, updated_at""",
                project_id, owner_id, body.revision, body.name, body.description,
                json.dumps(graph, ensure_ascii=False), json.dumps(viewport, ensure_ascii=False),
            )
    return dict(row)


@router.get("/{project_id}/versions")
async def list_versions(
    project_id: uuid.UUID,
    limit: int = Query(default=30, ge=1, le=100),
    user: dict = Depends(get_current_user),
):
    pool = await get_pool()
    owner = await pool.fetchval(
        "SELECT EXISTS(SELECT 1 FROM projects WHERE id=$1 AND owner_id=$2 AND archived_at IS NULL)",
        project_id, int(user["sub"]),
    )
    if not owner:
        raise HTTPException(404, "项目不存在")
    rows = await pool.fetch(
        "SELECT id, revision, reason, created_at FROM project_versions "
        "WHERE project_id=$1 ORDER BY revision DESC LIMIT $2",
        project_id, limit,
    )
    return [dict(row) for row in rows]


@router.post("/{project_id}/versions", status_code=201)
async def create_version(
    project_id: uuid.UUID,
    body: VersionCreateRequest,
    user: dict = Depends(get_current_user),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            project = await conn.fetchrow(
                """SELECT revision, graph, viewport, settings FROM projects
                   WHERE id=$1 AND owner_id=$2 AND archived_at IS NULL FOR UPDATE""",
                project_id, int(user["sub"]),
            )
            if not project:
                raise HTTPException(404, "项目不存在")
            row = await conn.fetchrow(
                """INSERT INTO project_versions
                   (project_id, revision, graph, viewport, settings, reason)
                   VALUES ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6)
                   ON CONFLICT (project_id, revision) DO UPDATE
                   SET reason=EXCLUDED.reason, created_at=NOW()
                   RETURNING id, revision, reason, created_at""",
                project_id, project["revision"],
                json.dumps(_json(project["graph"]), ensure_ascii=False),
                json.dumps(_json(project["viewport"]), ensure_ascii=False),
                json.dumps(_json(project["settings"]), ensure_ascii=False),
                body.reason,
            )
    return dict(row)


@router.post("/{project_id}/versions/{version_id}/restore")
async def restore_version(
    project_id: uuid.UUID,
    version_id: int,
    user: dict = Depends(get_current_user),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            project = await conn.fetchrow(
                """SELECT * FROM projects WHERE id=$1 AND owner_id=$2
                   AND archived_at IS NULL FOR UPDATE""",
                project_id, int(user["sub"]),
            )
            if not project:
                raise HTTPException(404, "项目不存在")
            version = await conn.fetchrow(
                """SELECT revision, graph, viewport, settings FROM project_versions
                   WHERE id=$1 AND project_id=$2""",
                version_id, project_id,
            )
            if not version:
                raise HTTPException(404, "版本不存在")
            revision = project["revision"] + 1
            graph = json.dumps(_json(version["graph"]), ensure_ascii=False)
            viewport = json.dumps(_json(version["viewport"]), ensure_ascii=False)
            settings = json.dumps(_json(version["settings"]), ensure_ascii=False)
            row = await conn.fetchrow(
                """UPDATE projects SET graph=$3::jsonb, viewport=$4::jsonb,
                          settings=$5::jsonb, revision=$6, updated_at=NOW()
                   WHERE id=$1 AND owner_id=$2 RETURNING *""",
                project_id, int(user["sub"]), graph, viewport, settings, revision,
            )
            await conn.execute(
                """INSERT INTO project_versions
                   (project_id, revision, graph, viewport, settings, reason)
                   VALUES ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6)""",
                project_id, revision, graph, viewport, settings,
                f"恢复版本 {version['revision']}",
            )
    return _project_dict(row)


@router.delete("/{project_id}")
async def archive_project(project_id: uuid.UUID, user: dict = Depends(get_current_user)):
    pool = await get_pool()
    result = await pool.execute(
        "UPDATE projects SET archived_at=NOW(), updated_at=NOW() "
        "WHERE id=$1 AND owner_id=$2 AND archived_at IS NULL",
        project_id, int(user["sub"]),
    )
    if result == "UPDATE 0":
        raise HTTPException(404, "项目不存在")
    return {"ok": True}
