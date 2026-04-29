import logging
import os
import threading
from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

from auth import require_admin
from db import init_db, close_db, get_pool
from plugin_loader import load_plugins, reload_plugins, get_all_node_defs, PLUGINS_DIR
from routers import sources, nodes, execute, meta_prompt, auth, admin

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

PORT = 7391


class _PluginFileHandler(FileSystemEventHandler):
    """plugins 目录文件变化时触发热加载。"""
    def __init__(self):
        self._timer: threading.Timer | None = None

    def _schedule_reload(self):
        # 防抖：500ms 内多次变更只触发一次
        if self._timer:
            self._timer.cancel()
        self._timer = threading.Timer(0.5, reload_plugins)
        self._timer.start()

    def on_modified(self, event):
        if event.src_path.endswith(".py"):
            self._schedule_reload()

    def on_created(self, event):
        if event.src_path.endswith(".py"):
            self._schedule_reload()

    def on_deleted(self, event):
        if event.src_path.endswith(".py"):
            self._schedule_reload()


_observer: Observer | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _observer
    await init_db()
    load_plugins()

    _observer = Observer()
    _observer.schedule(_PluginFileHandler(), PLUGINS_DIR, recursive=False)
    _observer.start()
    logger.info("插件热加载已启用，监听: %s", PLUGINS_DIR)

    logger.info("Infinite Canvas 后端已启动 (port %d)", PORT)
    yield

    if _observer:
        _observer.stop()
        _observer.join()
    await close_db()


app = FastAPI(title="Infinite Canvas", lifespan=lifespan)

# ── CORS: env var > default dev fallback (db config removed — not available before startup) ──
_env_origins = os.environ.get("CORS_ORIGINS", "").strip()
_origins = (
    [o.strip() for o in _env_origins.split(",") if o.strip()]
    if _env_origins
    else ["http://localhost:5173", "http://localhost:4173", "http://localhost:9874"]
)
app.add_middleware(CORSMiddleware, allow_origins=_origins, allow_methods=["*"], allow_headers=["*"])
logger.info("CORS 允许来源: %s", _origins)

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(sources.router)
app.include_router(nodes.router)
app.include_router(execute.router)
app.include_router(meta_prompt.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "name": "Infinite Canvas"}


@app.get("/api/plugins")
async def list_plugins(_admin: dict = Depends(require_admin)):
    defs = get_all_node_defs()
    return [
        {
            "def_id": d.get("def_id"),
            "name": d.get("name"),
            "category": d.get("category", ""),
            "inputs": len(d.get("inputs", [])),
            "outputs": len(d.get("outputs", [])),
            "controls": len(d.get("controls", [])),
        }
        for d in defs
    ]


@app.get("/api/task-logs")
async def list_task_logs(def_id: str | None = None, limit: int = 100, _admin: dict = Depends(require_admin)):
    pool = await get_pool()
    if def_id:
        rows = await pool.fetch(
            "SELECT * FROM task_logs WHERE def_id = $1 ORDER BY created_at DESC LIMIT $2",
            def_id, limit,
        )
    else:
        rows = await pool.fetch(
            "SELECT * FROM task_logs ORDER BY created_at DESC LIMIT $1",
            limit,
        )
    return [dict(r) for r in rows]
