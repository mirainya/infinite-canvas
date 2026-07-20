import asyncio
from fastapi import APIRouter, Depends
from sse_starlette.sse import EventSourceResponse
from auth import get_current_user
from plugin_loader import get_all_node_defs, on_reload, remove_reload_callback

router = APIRouter(prefix="/api/nodes", tags=["nodes"])


@router.get("")
async def list_nodes(_user: dict = Depends(get_current_user)):
    return get_all_node_defs()


@router.get("/events")
async def node_events(_user: dict = Depends(get_current_user)):
    """SSE：插件变更时推送 reload 事件。"""
    queue: asyncio.Queue[str] = asyncio.Queue()

    def notify():
        queue.put_nowait("reload")

    on_reload(notify)

    async def stream():
        try:
            while True:
                msg = await queue.get()
                yield {"event": msg, "data": ""}
        except asyncio.CancelledError:
            pass
        finally:
            remove_reload_callback(notify)

    return EventSourceResponse(stream())
