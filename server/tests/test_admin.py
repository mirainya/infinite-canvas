import pytest
from httpx import ASGITransport, AsyncClient


@pytest.fixture
def client(patched_app):
    transport = ASGITransport(app=patched_app)
    return AsyncClient(transport=transport, base_url="http://test")


# 鉴权由 conftest 的 dependency_overrides mock 为管理员, 这里只验业务逻辑。

@pytest.mark.asyncio
async def test_config_get_and_put(client, fake_pool):
    fake_pool.config["xfs_api_key"] = "real-secret"
    resp = await client.get("/api/admin/config")
    assert resp.status_code == 200
    config = resp.json()
    assert "xfs_base_url" in config  # 可编辑键齐全
    assert config["xfs_api_key"] == "********"

    resp = await client.put(
        "/api/admin/config",
        json={"configs": {"xfs_base_url": "https://example.com"}},
    )
    assert resp.status_code == 200
    assert fake_pool.config["xfs_base_url"] == "https://example.com"


@pytest.mark.asyncio
async def test_config_put_keeps_masked_secret(client, fake_pool):
    fake_pool.config["xfs_api_key"] = "real-secret"
    resp = await client.put(
        "/api/admin/config",
        json={"configs": {"xfs_api_key": "********"}},
    )
    assert resp.status_code == 200
    assert fake_pool.config["xfs_api_key"] == "real-secret"


@pytest.mark.asyncio
async def test_config_put_ignores_unknown_keys(client, fake_pool):
    resp = await client.put(
        "/api/admin/config",
        json={"configs": {"not_a_real_key": "x", "prism_token": "tok"}},
    )
    assert resp.status_code == 200
    assert fake_pool.config.get("prism_token") == "tok"
    assert "not_a_real_key" not in fake_pool.config  # 非白名单键被忽略


@pytest.mark.asyncio
async def test_task_logs_list(client, fake_pool):
    fake_pool.task_logs.append({"id": 1, "def_id": "x", "user_id": 1})
    resp = await client.get("/api/admin/task-logs")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_task_logs_limit_is_bounded(client):
    resp = await client.get("/api/admin/task-logs?limit=501")
    assert resp.status_code == 422
