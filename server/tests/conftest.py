import sys
import os

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# ── Fake asyncpg pool ──
# IC 已归入账号中心: 本地 users/credit_logs 表退役, 仅保留 system_config / task_logs。


class FakeRecord(dict):
    """dict that also supports asyncpg.Record-style access."""


class FakePool:
    """In-memory fake pool: system_config + task_logs。"""

    def __init__(self):
        self.config: dict[str, str] = {}
        self.task_logs: list[dict] = []
        self._next_log_id = 1

    async def fetchrow(self, query: str, *args) -> FakeRecord | None:
        q = query.lower().strip()
        if "from system_config where key" in q:
            val = self.config.get(args[0])
            return FakeRecord({"value": val}) if val else None
        if "insert into task_logs" in q and "returning" in q:
            log_id = self._next_log_id
            self._next_log_id += 1
            self.task_logs.append({"id": log_id})
            return FakeRecord({"id": log_id})
        return None

    async def fetchval(self, query: str, *args):
        return None

    async def fetch(self, query: str, *args) -> list[FakeRecord]:
        q = query.lower().strip()
        if "from system_config" in q:
            keys = args[0] if args else []
            return [FakeRecord({"key": k, "value": self.config[k]}) for k in keys if k in self.config]
        if "from task_logs" in q:
            return [FakeRecord(r) for r in self.task_logs]
        return []

    async def execute(self, query: str, *args) -> str:
        q = query.lower().strip()
        if "insert into system_config" in q or "on conflict" in q:
            self.config[args[0]] = args[1]
            return "INSERT 0 1"
        return "OK"


@pytest.fixture
def fake_pool():
    return FakePool()


@pytest.fixture
def patched_app(fake_pool):
    """构造测试 app: 替换 db 池 + 用 dependency_overrides mock 账号中心鉴权。

    mock 身份: sub='1', username='admin', is_admin=True(管理端测试可直接放行)。
    避免依赖真实账号中心 JWKS / HTTP。
    """
    import db as db_mod
    import auth as auth_mod

    from rate_limit import auth_limiter
    auth_limiter._hits.clear()

    original_pool = db_mod._pool
    db_mod._pool = fake_pool

    from main import app

    admin_identity = {"sub": "1", "username": "admin", "is_admin": True}
    app.dependency_overrides[auth_mod.get_current_user] = lambda: admin_identity
    app.dependency_overrides[auth_mod.require_admin] = lambda: admin_identity

    yield app

    app.dependency_overrides.clear()
    db_mod._pool = original_pool
