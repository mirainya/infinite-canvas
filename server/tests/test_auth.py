import pytest
from httpx import ASGITransport, AsyncClient


@pytest.fixture
def client(patched_app):
    transport = ASGITransport(app=patched_app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.asyncio
async def test_register_success(client, fake_pool):
    resp = await client.post("/api/auth/register", json={"username": "alice", "password": "secret123"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["username"] == "alice"
    assert data["is_admin"] is True  # first user is admin
    assert "token" in data
    assert len(fake_pool.users) == 1


@pytest.mark.asyncio
async def test_register_second_user_not_admin(client, fake_pool):
    await client.post("/api/auth/register", json={"username": "alice", "password": "secret123"})
    resp = await client.post("/api/auth/register", json={"username": "bob", "password": "secret456"})
    assert resp.status_code == 200
    assert resp.json()["is_admin"] is False


@pytest.mark.asyncio
async def test_register_duplicate_username(client, fake_pool):
    await client.post("/api/auth/register", json={"username": "alice", "password": "secret123"})
    resp = await client.post("/api/auth/register", json={"username": "alice", "password": "other123"})
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_register_validation(client):
    resp = await client.post("/api/auth/register", json={"username": "a", "password": "secret123"})
    assert resp.status_code == 400

    resp = await client.post("/api/auth/register", json={"username": "alice", "password": "12345"})
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_login_success(client, fake_pool):
    await client.post("/api/auth/register", json={"username": "alice", "password": "secret123"})
    resp = await client.post("/api/auth/login", json={"username": "alice", "password": "secret123"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["username"] == "alice"
    assert "token" in data


@pytest.mark.asyncio
async def test_login_wrong_password(client, fake_pool):
    await client.post("/api/auth/register", json={"username": "alice", "password": "secret123"})
    resp = await client.post("/api/auth/login", json={"username": "alice", "password": "wrong"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_nonexistent_user(client):
    resp = await client.post("/api/auth/login", json={"username": "ghost", "password": "secret123"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me_endpoint(client, fake_pool):
    reg = await client.post("/api/auth/register", json={"username": "alice", "password": "secret123"})
    assert reg.status_code == 200, f"register failed: {reg.text}"
    token = reg.json()["token"]
    resp = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["username"] == "alice"


@pytest.mark.asyncio
async def test_me_no_token(client):
    resp = await client.get("/api/auth/me")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_me_invalid_token(client):
    resp = await client.get("/api/auth/me", headers={"Authorization": "Bearer invalid.token.here"})
    assert resp.status_code == 401
