"""V2 模板目录与模板实例化。"""

import json
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user
from db import get_pool
from v2_graph import GraphSnapshot
from v2_templates import get_system_template, list_system_templates

router = APIRouter(prefix="/api/v2/templates", tags=["v2-templates"])


class InstantiateTemplateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)


class TemplateWriteRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)
    category: str = Field(default="个人模板", min_length=1, max_length=80)
    graph: GraphSnapshot


@router.get("")
async def list_templates(user: dict = Depends(get_current_user)):
    pool = await get_pool()
    rows = await pool.fetch(
        """SELECT id, owner_id, slug, name, description, category, thumbnail_url,
                  graph, current_version, is_system, is_published
           FROM workflow_templates_v2
           WHERE is_published=TRUE OR owner_id=$1
           ORDER BY is_system DESC, updated_at DESC""",
        int(user["sub"]),
    )
    custom = []
    system_ids = {item["id"] for item in list_system_templates()}
    for row in rows:
        item = dict(row)
        item["id"] = str(item["id"])
        if item["id"] in system_ids:
            continue
        if isinstance(item.get("graph"), str):
            item["graph"] = json.loads(item["graph"])
        item["owned"] = item.pop("owner_id") == int(user["sub"])
        custom.append(item)
    system = [
        {**item, "current_version": 1, "is_system": True, "is_published": True, "owned": False}
        for item in list_system_templates()
    ]
    return system + custom


@router.post("", status_code=201)
async def create_template(body: TemplateWriteRequest, user: dict = Depends(get_current_user)):
    pool = await get_pool()
    template_id = uuid.uuid4()
    graph = json.dumps(body.graph.model_dump(by_alias=True), ensure_ascii=False)
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """INSERT INTO workflow_templates_v2
                   (id, owner_id, name, description, category, graph)
                   VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING *""",
                template_id, int(user["sub"]), body.name, body.description,
                body.category, graph,
            )
            await conn.execute(
                """INSERT INTO template_versions (template_id, version, graph)
                   VALUES ($1,1,$2::jsonb)""",
                template_id, graph,
            )
    item = dict(row)
    item["id"] = str(item["id"])
    item["graph"] = body.graph.model_dump(by_alias=True)
    item["owned"] = True
    item.pop("owner_id", None)
    return item


@router.put("/{template_id}")
async def update_template(
    template_id: uuid.UUID,
    body: TemplateWriteRequest,
    user: dict = Depends(get_current_user),
):
    pool = await get_pool()
    graph = json.dumps(body.graph.model_dump(by_alias=True), ensure_ascii=False)
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """UPDATE workflow_templates_v2 SET name=$3, description=$4,
                          category=$5, graph=$6::jsonb,
                          current_version=current_version+1, updated_at=NOW()
                   WHERE id=$1 AND owner_id=$2 AND is_system=FALSE
                   RETURNING *""",
                template_id, int(user["sub"]), body.name, body.description,
                body.category, graph,
            )
            if not row:
                raise HTTPException(404, "模板不存在")
            await conn.execute(
                """INSERT INTO template_versions (template_id, version, graph)
                   VALUES ($1,$2,$3::jsonb)""",
                template_id, row["current_version"], graph,
            )
    item = dict(row)
    item["id"] = str(item["id"])
    item["graph"] = body.graph.model_dump(by_alias=True)
    item["owned"] = True
    item.pop("owner_id", None)
    return item


@router.post("/{template_id}/instantiate", status_code=201)
async def instantiate_template(
    template_id: uuid.UUID,
    body: InstantiateTemplateRequest,
    user: dict = Depends(get_current_user),
):
    item = get_system_template(str(template_id))
    pool = await get_pool()
    if item is None:
        row = await pool.fetchrow(
            """SELECT id, name, graph FROM workflow_templates_v2
               WHERE id=$1 AND (is_published=TRUE OR owner_id=$2)""",
            template_id, int(user["sub"]),
        )
        if not row:
            raise HTTPException(404, "模板不存在")
        item = dict(row)
        item["graph"] = json.loads(item["graph"]) if isinstance(item["graph"], str) else item["graph"]

    graph = GraphSnapshot.model_validate(item["graph"]).model_dump(by_alias=True)
    project_id = uuid.uuid4()
    project_name = body.name or item["name"]
    graph_json = json.dumps(graph, ensure_ascii=False)
    viewport_json = '{"x":0,"y":0,"zoom":1}'
    async with pool.acquire() as conn:
        async with conn.transaction():
            project = await conn.fetchrow(
                """INSERT INTO projects (id, owner_id, name, graph, viewport)
                   VALUES ($1,$2,$3,$4::jsonb,$5::jsonb) RETURNING *""",
                project_id, int(user["sub"]), project_name, graph_json, viewport_json,
            )
            await conn.execute(
                """INSERT INTO project_versions
                   (project_id, revision, graph, viewport, settings, reason)
                   VALUES ($1,1,$2::jsonb,$3::jsonb,'{}'::jsonb,'manual')""",
                project_id, graph_json, viewport_json,
            )
    result = dict(project)
    for key in ("graph", "viewport", "settings"):
        if isinstance(result.get(key), str):
            result[key] = json.loads(result[key])
    return result
