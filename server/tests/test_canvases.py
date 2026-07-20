from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from routers import canvases


def _body(canvas_id: str) -> canvases.CanvasSaveRequest:
    return canvases.CanvasSaveRequest(id=canvas_id, name="test", snapshot={"nodes": [], "edges": []})


@pytest.mark.asyncio
async def test_save_canvas_rejects_path_body_id_mismatch():
    with pytest.raises(HTTPException) as exc:
        await canvases.save_canvas("path-id", _body("body-id"), {"sub": "1"})
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_save_canvas_rejects_id_owned_by_another_user(monkeypatch):
    pool = AsyncMock()
    pool.fetchval.return_value = None
    monkeypatch.setattr(canvases, "get_pool", AsyncMock(return_value=pool))

    with pytest.raises(HTTPException) as exc:
        await canvases.save_canvas("shared-id", _body("shared-id"), {"sub": "2"})

    assert exc.value.status_code == 409
    query = pool.fetchval.await_args.args[0]
    assert "WHERE canvases.user_id = EXCLUDED.user_id" in query


@pytest.mark.asyncio
async def test_save_canvas_accepts_owner(monkeypatch):
    pool = AsyncMock()
    pool.fetchval.return_value = "owned-id"
    monkeypatch.setattr(canvases, "get_pool", AsyncMock(return_value=pool))

    result = await canvases.save_canvas("owned-id", _body("owned-id"), {"sub": "2"})

    assert result == {"ok": True}
