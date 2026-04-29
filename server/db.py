import os
import asyncpg
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://localhost:5432/infinite_canvas")

SCHEMA = """
CREATE TABLE IF NOT EXISTS api_sources (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    base_url        TEXT NOT NULL,
    token           TEXT NOT NULL,
    capability      TEXT NOT NULL DEFAULT '',
    chat_model      TEXT NOT NULL DEFAULT 'gemini-3-pro-preview',
    poll_interval_ms INTEGER DEFAULT 5000,
    max_polls       INTEGER DEFAULT 60,
    is_default      BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'api_sources' AND column_name = 'chat_model'
    ) THEN
        ALTER TABLE api_sources ADD COLUMN chat_model TEXT NOT NULL DEFAULT 'gemini-3-pro-preview';
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS users (
    id          SERIAL PRIMARY KEY,
    username    TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin    BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'is_admin'
    ) THEN
        ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS task_logs (
    id          SERIAL PRIMARY KEY,
    def_id      TEXT NOT NULL,
    action      TEXT DEFAULT '',
    prompt      TEXT DEFAULT '',
    status      TEXT DEFAULT 'pending',
    result_url  TEXT DEFAULT '',
    error       TEXT DEFAULT '',
    duration_ms INTEGER DEFAULT 0,
    user_id     INTEGER,
    credits_used NUMERIC(12,2) DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'task_logs' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE task_logs ADD COLUMN user_id INTEGER;
        ALTER TABLE task_logs ADD COLUMN credits_used NUMERIC(12,2) DEFAULT 0;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'credits'
    ) THEN
        ALTER TABLE users ADD COLUMN credits NUMERIC(12,2) DEFAULT 0;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'api_sources' AND column_name = 'billing_type'
    ) THEN
        ALTER TABLE api_sources ADD COLUMN billing_type TEXT DEFAULT 'per_call';
        ALTER TABLE api_sources ADD COLUMN credit_cost NUMERIC(10,4) DEFAULT 1;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS credit_logs (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL,
    amount      NUMERIC(12,2) NOT NULL,
    balance_after NUMERIC(12,2) NOT NULL,
    reason      TEXT DEFAULT '',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
);
"""

_pool: asyncpg.Pool | None = None


async def init_db():
    global _pool
    _pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    async with _pool.acquire() as conn:
        await conn.execute(SCHEMA)


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
