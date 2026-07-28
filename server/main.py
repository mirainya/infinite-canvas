import logging
import os
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.responses import FileResponse
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

from auth import get_current_user, require_admin
from db import init_db, close_db, get_pool
from error_handlers import register_error_handlers
from plugin_loader import load_plugins, reload_plugins, get_all_node_defs, PLUGINS_DIR
from routers import nodes, execute, meta_prompt, auth, admin, templates, models, canvases, downloads, prompt_enhance, prompt_templates
import account_center

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
    if not account_center.enabled():
        raise RuntimeError("账号中心配置不完整，请设置 AC_BASE_URL/AC_CLIENT_ID/AC_CLIENT_SECRET")
    await init_db()
    load_plugins()

    # 恢复上次进程中断遗留的任务与未完成退款。
    try:
        recovered, refunds_pending = await execute.recover_incomplete_tasks()
        if recovered:
            logger.info("已恢复遗留任务: %d，退款待重试: %d", recovered, refunds_pending)
    except Exception as e:
        logger.warning("恢复遗留任务失败: %s", e)

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
register_error_handlers(app)

# ── CORS: env var > default fallback ──
_env_origins = os.environ.get("CORS_ORIGINS", "").strip()
_origins = (
    [o.strip() for o in _env_origins.split(",") if o.strip()]
    if _env_origins
    else [
        "http://localhost:5173", "http://localhost:4173", "http://localhost:9874",
        "http://infinitecanvas.mirainya.icu", "https://infinitecanvas.mirainya.icu",
    ]
)
app.add_middleware(CORSMiddleware, allow_origins=_origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
logger.info("CORS 允许来源: %s", _origins)

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(nodes.router)
app.include_router(execute.router)
app.include_router(meta_prompt.router)
app.include_router(templates.router)
app.include_router(models.router)
app.include_router(canvases.router)
app.include_router(downloads.router)
app.include_router(prompt_enhance.router)
app.include_router(prompt_templates.router)


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
async def list_task_logs(
    def_id: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    _admin: dict = Depends(require_admin),
):
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


@app.get("/api/my/task-logs")
async def my_task_logs(
    limit: int = Query(default=50, ge=1, le=200),
    user: dict = Depends(get_current_user),
):
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT * FROM task_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2",
        int(user["sub"]), limit,
    )
    return [dict(r) for r in rows]


@app.post("/api/my/task-logs/{log_id}/cancel")
async def cancel_task_log(log_id: int, user: dict = Depends(get_current_user)):
    user_id = int(user["sub"])
    cancel_requested = execute.cancel_active_task(log_id, user_id)
    pool = await get_pool()
    result = await pool.execute(
        "UPDATE task_logs SET status = 'failed', error = '用户手动取消' "
        "WHERE id = $1 AND user_id = $2 AND status = 'pending'",
        log_id, user_id,
    )
    if result == "UPDATE 0" and not cancel_requested:
        raise HTTPException(404, "任务不存在或已完成")
    return {"ok": True, "cancel_requested": cancel_requested}
