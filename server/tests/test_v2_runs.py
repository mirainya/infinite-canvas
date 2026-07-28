import json
import uuid

import pytest
from httpx import ASGITransport, AsyncClient

import routers.v2_runs as runs_router


class RunPool:
    def __init__(self, project_id: uuid.UUID):
        self.project_id = project_id
        self.node_inserts = []

    async def fetchrow(self, query, *args):
        if "SELECT id, revision, graph FROM projects" in query:
            return {
                "id": self.project_id,
                "revision": 7,
                "graph": json.dumps({"nodes": [], "edges": []}),
            }
        if "INSERT INTO workflow_runs" in query:
            return {
                "id": args[0],
                "project_id": args[1],
                "owner_id": args[2],
                "project_revision": args[3],
                "input_snapshot": args[4],
                "output_snapshot": None,
                "status": "queued",
                "progress": 0,
                "credits_used": 0,
            }
        raise AssertionError(query)

    async def execute(self, query, *args):
        if "INSERT INTO node_runs" in query:
            self.node_inserts.append(args)
        return "INSERT 0 1"

    def acquire(self):
        return self

    def transaction(self):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False


@pytest.mark.asyncio
async def test_create_run_accepts_temporary_graph(patched_app, monkeypatch):
    project_id = uuid.uuid4()
    pool = RunPool(project_id)

    async def get_run_pool():
        return pool

    monkeypatch.setattr(runs_router, "get_pool", get_run_pool)
    transport = ASGITransport(app=patched_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v2/runs",
            json={
                "project_id": str(project_id),
                "graph": {
                    "nodes": [
                        {
                            "id": "draw",
                            "type": "ai-image",
                            "data": {"prompt": "糖果色插画", "model": "image-model"},
                        }
                    ],
                    "edges": [],
                },
            },
        )

    assert response.status_code == 202
    assert response.json()["status"] == "queued"
    assert len(pool.node_inserts) == 1
    assert pool.node_inserts[0][3] == "ai-image"
