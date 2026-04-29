import sys
import os
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# ── Fake asyncpg pool / connection ──

class FakeRecord(dict):
    """dict that also supports attribute-style access like asyncpg.Record."""
    def __getitem__(self, key):
        return super().__getitem__(key)


class FakePool:
    """In-memory fake pool that stores users / config / credit_logs tables."""

    def __init__(self):
        self.users: list[dict] = []
        self.config: dict[str, str] = {}
        self.credit_logs: list[dict] = []
        self._next_user_id = 1

    def _find_user(self, **kwargs) -> dict | None:
        for u in self.users:
            if all(u.get(k) == v for k, v in kwargs.items()):
                return u
        return None

    async def fetchrow(self, query: str, *args) -> FakeRecord | None:
        q = query.lower().strip()

        if "from users where username" in q:
            u = self._find_user(username=args[0])
            return FakeRecord(u) if u else None

        if "from users where id" in q:
            u = self._find_user(id=args[0])
            return FakeRecord(u) if u else None

        if "insert into users" in q and "returning" in q:
            username, password_hash, is_admin = args[0], args[1], args[2]
            uid = self._next_user_id
            self._next_user_id += 1
            user = {
                "id": uid,
                "username": username,
                "password_hash": password_hash,
                "is_admin": is_admin,
                "credits": Decimal("0"),
            }
            self.users.append(user)
            return FakeRecord({"id": uid, "credits": Decimal("0")})

        if "from users where username" in q:
            u = self._find_user(username=args[0])
            return FakeRecord(u) if u else None

        if "select id from users where id" in q:
            u = self._find_user(id=args[0])
            return FakeRecord(u) if u else None

        if "update users set credits = credits +" in q:
            u = self._find_user(id=args[1])
            if u:
                u["credits"] = u["credits"] + args[0]
                return FakeRecord({"credits": u["credits"]})
            return None

        if "update users set credits = credits -" in q:
            u = self._find_user(id=args[1])
            if u and u["credits"] >= args[0]:
                u["credits"] = u["credits"] - args[0]
                return FakeRecord({"credits": u["credits"]})
            return None

        if "update users set is_admin" in q:
            return None

        if "from system_config where key" in q:
            val = self.config.get(args[0])
            return FakeRecord({"value": val}) if val else None

        if "from system_config where key = any" in q:
            rows = []
            for k in args[0]:
                if k in self.config:
                    rows.append(FakeRecord({"key": k, "value": self.config[k]}))
            return rows

        if "select credits from users where id" in q:
            u = self._find_user(id=int(args[0]))
            return FakeRecord({"credits": u["credits"]}) if u else None

        return None

    async def fetchval(self, query: str, *args):
        q = query.lower().strip()
        if "count(*) from users" in q:
            return len(self.users)
        return None

    async def fetch(self, query: str, *args) -> list[FakeRecord]:
        q = query.lower().strip()

        if "from users order by" in q:
            return [
                FakeRecord({
                    "id": u["id"],
                    "username": u["username"],
                    "is_admin": u["is_admin"],
                    "credits": u["credits"],
                    "created_at": None,
                })
                for u in self.users
            ]

        if "from credit_logs" in q:
            return [FakeRecord(r) for r in self.credit_logs]

        if "from system_config" in q:
            keys = args[0] if args else []
            return [
                FakeRecord({"key": k, "value": self.config[k]})
                for k in keys
                if k in self.config
            ]

        return []

    async def execute(self, query: str, *args) -> str:
        q = query.lower().strip()

        if "insert into system_config" in q or "on conflict" in q:
            self.config[args[0]] = args[1]
            return "INSERT 0 1"

        if "update users set is_admin" in q:
            u = self._find_user(id=args[1])
            if u:
                u["is_admin"] = args[0]
            return "UPDATE 1"

        if "insert into credit_logs" in q:
            self.credit_logs.append({
                "user_id": args[0],
                "amount": args[1],
                "balance_after": args[2],
                "reason": args[3],
            })
            return "INSERT 0 1"

        if "delete from users" in q:
            before = len(self.users)
            self.users = [u for u in self.users if u["id"] != args[0]]
            return f"DELETE {before - len(self.users)}"

        return "OK"


@pytest.fixture
def fake_pool():
    return FakePool()


@pytest.fixture
def patched_app(fake_pool):
    """Create a FastAPI test app with db.get_pool mocked and auth secret fixed."""
    import auth as auth_mod
    import db as db_mod

    # Fix JWT secret so we don't need a real DB for it
    auth_mod._secret_key = "test-secret-key-for-testing-only"

    # Reset rate limiter state between tests
    from rate_limit import auth_limiter
    auth_limiter._hits.clear()

    # Set the module-level _pool so the real get_pool() returns our fake
    original_pool = db_mod._pool
    db_mod._pool = fake_pool

    from main import app
    yield app

    db_mod._pool = original_pool
    auth_mod._secret_key = None
