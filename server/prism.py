"""棱镜 (Prism) 连接配置：从 system_config 读取。"""

from db import get_config


async def get_prism_source() -> dict | None:
    base_url = await get_config("prism_base_url")
    token = await get_config("prism_token")
    if not base_url or not token:
        return None
    return {
        "base_url": base_url,
        "token": token,
        "poll_interval_ms": 5000,
        "max_polls": 60,
    }
