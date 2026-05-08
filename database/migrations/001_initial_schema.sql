-- 初始 schema：所有表的完整定义
-- 全部使用 IF NOT EXISTS，对已有数据库幂等

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
    billing_type    TEXT DEFAULT 'per_call',
    credit_cost     NUMERIC(10,4) DEFAULT 1,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    username        TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    is_admin        BOOLEAN DEFAULT FALSE,
    credits         NUMERIC(12,2) DEFAULT 0,
    nickname        TEXT DEFAULT '',
    avatar          TEXT DEFAULT '',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_logs (
    id              SERIAL PRIMARY KEY,
    def_id          TEXT NOT NULL,
    action          TEXT DEFAULT '',
    prompt          TEXT DEFAULT '',
    status          TEXT DEFAULT 'pending',
    result_url      TEXT DEFAULT '',
    error           TEXT DEFAULT '',
    duration_ms     INTEGER DEFAULT 0,
    user_id         INTEGER,
    credits_used    NUMERIC(12,2) DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credit_logs (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL,
    amount          NUMERIC(12,2) NOT NULL,
    balance_after   NUMERIC(12,2) NOT NULL,
    reason          TEXT DEFAULT '',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
);

-- 兼容旧库：补加可能缺失的列（IF NOT EXISTS 语法 PG 11+）
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_sources' AND column_name = 'chat_model') THEN
        ALTER TABLE api_sources ADD COLUMN chat_model TEXT NOT NULL DEFAULT 'gemini-3-pro-preview';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_sources' AND column_name = 'billing_type') THEN
        ALTER TABLE api_sources ADD COLUMN billing_type TEXT DEFAULT 'per_call';
        ALTER TABLE api_sources ADD COLUMN credit_cost NUMERIC(10,4) DEFAULT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_admin') THEN
        ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'credits') THEN
        ALTER TABLE users ADD COLUMN credits NUMERIC(12,2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'nickname') THEN
        ALTER TABLE users ADD COLUMN nickname TEXT DEFAULT '';
        ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT '';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'task_logs' AND column_name = 'user_id') THEN
        ALTER TABLE task_logs ADD COLUMN user_id INTEGER;
        ALTER TABLE task_logs ADD COLUMN credits_used NUMERIC(12,2) DEFAULT 0;
    END IF;
END $$;
