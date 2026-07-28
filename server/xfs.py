"""X-File-Storage 上传模块。"""

import base64
import io
import logging
from datetime import date

from db import get_config

logger = logging.getLogger(__name__)


async def _get_xfs_config() -> tuple[str, str]:
    base = await get_config("xfs_base_url") or ""
    key = await get_config("xfs_api_key") or ""
    if not base or not key:
        raise RuntimeError("未配置 XFS 存储，请在管理后台「系统配置」中设置")
    return base, key


async def upload_data_uri(client, data_uri: str, path_prefix: str = "infinite-canvas/tmp") -> str:
    """把 base64 data URI 上传到 X-File-Storage，返回公网 URL。"""
    xfs_base, xfs_key = await _get_xfs_config()

    if data_uri.startswith("data:"):
        header, b64 = data_uri.split(",", 1)
        ext = "png" if "png" in header else "jpg"
        content_type = "image/png" if "png" in header else "image/jpeg"
    else:
        b64 = data_uri
        ext = "png"
        content_type = "image/png"

    raw = base64.b64decode(b64)
    path = f"{path_prefix}/{date.today().isoformat()}/"
    resp = await client.post(
        f"{xfs_base}/api/v1/upload",
        headers={"X-Api-Key": xfs_key},
        files={"file": (f"upload.{ext}", io.BytesIO(raw), content_type)},
        data={"path": path},
    )
    resp.raise_for_status()
    body = resp.json()
    if body.get("code") != 200:
        raise RuntimeError(f"XFS 上传失败: {body.get('message')}")
    url = body["data"]["url"]
    logger.info("XFS 上传完成: %s (%d bytes)", url, len(raw))
    return url
