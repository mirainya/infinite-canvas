import pytest
from httpx import ASGITransport, AsyncClient


@pytest.fixture
def client(patched_app):
    transport = ASGITransport(app=patched_app)
    return AsyncClient(transport=transport, base_url="http://test")


async def _register_admin(client) -> str:
    """Register first user (auto-admin) and return token."""
    resp = await client.post("/api/auth/register", json={"username": "admin", "password": "admin123"})
    assert resp.status_code == 200
    return resp.json()["token"]


async def _register_user(client, username="user1") -> tuple[str, int]:
    """Register a normal user and return (token, user_id)."""
    resp = await client.post("/api/auth/register", json={"username": username, "password": "pass123456"})
    assert resp.status_code == 200
    data = resp.json()
    return data["token"], data["user_id"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── List users ──

@pytest.mark.asyncio
async def test_list_users(client):
    admin_token = await _register_admin(client)
    await _register_user(client, "bob")
    resp = await client.get("/api/admin/users", headers=_auth(admin_token))
    assert resp.status_code == 200
    users = resp.json()
    assert len(users) == 2
    assert users[0]["username"] == "admin"
    assert users[1]["username"] == "bob"


@pytest.mark.asyncio
async def test_list_users_requires_admin(client):
    await _register_admin(client)
    user_token, _ = await _register_user(client, "bob")
    resp = await client.get("/api/admin/users", headers=_auth(user_token))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_list_users_no_auth(client):
    resp = await client.get("/api/admin/users")
    assert resp.status_code in (401, 403)


# ── Patch user ──

@pytest.mark.asyncio
async def test_patch_user_credits(client, fake_pool):
    admin_token = await _register_admin(client)
    _, user_id = await _register_user(client, "bob")
    resp = await client.patch(
        f"/api/admin/users/{user_id}",
        json={"credits_delta": 100.0},
        headers=_auth(admin_token),
    )
    assert resp.status_code == 200
    # Verify credits were added
    user = fake_pool._find_user(id=user_id)
    assert float(user["credits"]) == 100.0


@pytest.mark.asyncio
async def test_patch_user_not_found(client):
    admin_token = await _register_admin(client)
    resp = await client.patch(
        "/api/admin/users/999",
        json={"is_admin": True},
        headers=_auth(admin_token),
    )
    assert resp.status_code == 404


# ── Delete user ──

@pytest.mark.asyncio
async def test_delete_user(client, fake_pool):
    admin_token = await _register_admin(client)
    _, user_id = await _register_user(client, "bob")
    assert len(fake_pool.users) == 2
    resp = await client.delete(f"/api/admin/users/{user_id}", headers=_auth(admin_token))
    assert resp.status_code == 200
    assert len(fake_pool.users) == 1


@pytest.mark.asyncio
async def test_delete_user_not_found(client):
    admin_token = await _register_admin(client)
    resp = await client.delete("/api/admin/users/999", headers=_auth(admin_token))
    assert resp.status_code == 404


# ── Config ──

@pytest.mark.asyncio
async def test_config_get_and_put(client, fake_pool):
    admin_token = await _register_admin(client)

    resp = await client.get("/api/admin/config", headers=_auth(admin_token))
    assert resp.status_code == 200
    config = resp.json()
    assert "xfs_base_url" in config

    resp = await client.put(
        "/api/admin/config",
        json={"configs": {"xfs_base_url": "https://example.com"}},
        headers=_auth(admin_token),
    )
    assert resp.status_code == 200
    assert fake_pool.config["xfs_base_url"] == "https://example.com"
