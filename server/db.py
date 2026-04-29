import logging
import os
import pathlib
import asyncpg
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://localhost:5432/infinite_canvas")
MIGRATIONS_DIR = pathlib.Path(__file__).resolve().parent.parent / "database" / "migrations"

logger = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None


async def _run_migrations(conn: asyncpg.Connection):
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS schema_version (
            filename TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)

    applied = {r["filename"] for r in await conn.fetch("SELECT filename FROM schema_version")}

    if not MIGRATIONS_DIR.is_dir():
        logger.warning("迁移目录不存在: %s", MIGRATIONS_DIR)
        return

    files = sorted(f for f in MIGRATIONS_DIR.iterdir() if f.suffix == ".sql")
    for f in files:
        if f.name in applied:
            continue
        sql = f.read_text(encoding="utf-8")
        logger.info("执行迁移: %s", f.name)
        await conn.execute(sql)
        await conn.execute("INSERT INTO schema_version (filename) VALUES ($1)", f.name)
        logger.info("迁移完成: %s", f.name)


async def init_db():
    global _pool
    _pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    async with _pool.acquire() as conn:
        await _run_migrations(conn)


async def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("数据库连接池未初始化，请先调用 init_db()")
    return _pool


async def close_db():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


async def get_config(key: str) -> str | None:
    pool = await get_pool()
    row = await pool.fetchrow("SELECT value FROM system_config WHERE key = $1", key)
    return row["value"] if row else None


async def set_config(key: str, value: str):
    pool = await get_pool()
    await pool.execute(
        "INSERT INTO system_config (key, value) VALUES ($1, $2) "
        "ON CONFLICT (key) DO UPDATE SET value = $2",
        key, value,
    )
