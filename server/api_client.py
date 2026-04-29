"""公共 API 调用工具：提交任务 + 轮询结果。"""

import asyncio
import logging

logger = logging.getLogger(__name__)


async def submit_and_poll(
    client,
    source: dict,
    body: dict,
    *,
    capability: str | None = None,
    label: str = "任务",
) -> dict:
    base_url = source["base_url"].rstrip("/")
    token = source["token"]
    cap = capability or source.get("capability") or "doubao_img"
    poll_interval = source.get("poll_interval_ms", 5000) / 1000.0
    max_polls = source.get("max_polls", 60)

    resp = await client.post(
        f"{base_url}/v1/capabilities/{cap}",
        json=body,
        headers={"Authorization": token, "Content-Type": "application/json"},
    )
    resp.raise_for_status()
    data = resp.json()

    if data.get("code") != 0:
        raise RuntimeError(f"{label}提交失败: {data.get('message', '未知错误')}")

    task_id = data["data"].get("task_id") or data["data"].get("task_no")
    if not task_id:
        raise RuntimeError(f"{label}提交成功但未返回 task_id")

    logger.info("%s已提交: task_id=%s", label, task_id)

    for _ in range(max_polls):
        await asyncio.sleep(poll_interval)

        resp = await client.get(
            f"{base_url}/v1/tasks/{task_id}",
            headers={"Authorization": token},
        )
        resp.raise_for_status()
        data = resp.json()

        if data.get("code") != 0:
            continue

        task_data = data["data"]
        status = task_data.get("status")

        if status in ("success", "completed"):
            result = task_data.get("result", {})
            image_url = result.get("url") or result.get("image_url")
            if not image_url:
                raise RuntimeError(f"{label}成功但未返回图片 URL")
            logger.info("%s完成: %s", label, image_url)
            return {"image": image_url}

        if status in ("failed", "cancelled"):
            error = task_data.get("error", "未知错误")
            raise RuntimeError(f"{label}失败: {error}")

    raise RuntimeError(f"{label}超时（已等待 {int(max_polls * poll_interval)}s）")
