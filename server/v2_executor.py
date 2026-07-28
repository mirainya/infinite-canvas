"""V2 节点执行器。浏览器关闭后由 worker 继续执行。"""

import asyncio
import base64
import io
import json
from decimal import Decimal
from typing import Any

import httpx
from PIL import Image

from api_client import submit_and_poll
from plugins import prompt_enhance as prompt_enhance_plugin
from prism import get_prism_source
from routers.models import get_model_billing
from routers.downloads import _validate_remote_url
from v2_graph import GraphNode
from wallet import to_int_credits
from xfs import upload_bytes


def as_list(value: Any) -> list:
    if value is None or value == "":
        return []
    return value if isinstance(value, list) else [value]


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": token}


def _extract_image_urls(body: dict) -> list[str]:
    data = body.get("data")
    if isinstance(data, list):
        urls = []
        for item in data:
            if not isinstance(item, dict):
                continue
            if item.get("url"):
                urls.append(item["url"])
            elif item.get("b64_json"):
                urls.append(f"data:image/png;base64,{item['b64_json']}")
        return urls
    result = body.get("result") if isinstance(body.get("result"), dict) else body
    urls = result.get("urls") if isinstance(result, dict) else None
    if urls:
        return [url for url in urls if isinstance(url, str)]
    url = result.get("url") or result.get("image_url") if isinstance(result, dict) else None
    return [url] if url else []


async def _download_image(client: httpx.AsyncClient, url: str, label: str) -> tuple[str, bytes, str]:
    await _validate_remote_url(url)
    response = await client.get(url)
    response.raise_for_status()
    raw = response.content
    if not raw or len(raw) > 20 * 1024 * 1024:
        raise RuntimeError(f"{label}大小无效")
    content_type = response.headers.get("content-type", "image/png").split(";", 1)[0]
    if not content_type.startswith("image/"):
        raise RuntimeError(f"{label}地址没有返回图片")
    extension = ".jpg" if content_type == "image/jpeg" else ".png"
    return f"{label}{extension}", raw, content_type


async def _edit_image(
    client: httpx.AsyncClient,
    source: dict,
    model: str,
    prompt: str,
    image_url: str,
    mask_url: str,
    count: int,
) -> list[str]:
    image_name, image_raw, image_type = await _download_image(client, image_url, "image")
    mask_name, mask_raw, mask_type = await _download_image(client, mask_url, "mask")
    response = await client.post(
        f"{source['base_url'].rstrip('/')}/v1/images/edits",
        headers=_auth_headers(source["token"]),
        files={
            "image": (image_name, image_raw, image_type),
            "mask": (mask_name, mask_raw, mask_type),
        },
        data={"model": model, "prompt": prompt, "n": str(count)},
    )
    response.raise_for_status()
    urls = _extract_image_urls(response.json())
    if not urls:
        raise RuntimeError("图像编辑完成但没有返回图片")
    return urls


async def execute_ai_image(node: GraphNode, inputs: dict, client: httpx.AsyncClient) -> dict:
    source = await get_prism_source()
    if not source:
        raise RuntimeError("未配置 Prism")
    data = node.data
    prompts = [str(item).strip() for item in as_list(inputs.get("prompts")) if str(item).strip()]
    prompt = str(inputs.get("prompt") or data.get("prompt") or "").strip()
    if not prompts:
        prompts = [prompt] if prompt else []
    if not prompts:
        raise RuntimeError("提示词不能为空")

    images = [str(item) for item in as_list(inputs.get("images")) if item]
    mask = str(inputs.get("mask") or data.get("maskUrl") or "").strip()
    model = str(data.get("model") or "").strip()
    if not model:
        raise RuntimeError("请选择图像模型")
    count = max(1, min(int(data.get("count") or 1), 20))

    if mask:
        if not images:
            raise RuntimeError("局部编辑需要原图")
        results: list[str] = []
        for item in prompts:
            results.extend(await _edit_image(client, source, model, item, images[0], mask, count))
        return {"image": results[0], "images": results}

    semaphore = asyncio.Semaphore(4)

    async def generate(item: str) -> str:
        body: dict[str, Any] = {
            "prompt": item,
            "negative_prompt": str(data.get("negativePrompt") or "blurry, low quality, watermark"),
            "aspect_ratio": str(data.get("aspectRatio") or "1:1"),
        }
        if images:
            body["image_urls"] = images
        async with semaphore:
            result = await submit_and_poll(client, source, body, capability=model, label="AI 图像")
        return result["image"]

    tasks = [generate(item) for item in prompts for _ in range(count)]
    generated = await asyncio.gather(*tasks)
    return {"image": generated[0], "images": generated}


async def execute_text_generation(node: GraphNode, inputs: dict, client: httpx.AsyncClient) -> dict:
    source = await get_prism_source()
    if not source:
        raise RuntimeError("未配置 Prism")
    content = inputs.get("content") or node.data.get("content") or ""
    if isinstance(content, list):
        content = "\n\n".join(str(item) for item in content)
    if not str(content).strip():
        raise RuntimeError("文本内容不能为空")
    instruction = str(inputs.get("instruction") or node.data.get("instruction") or "").strip()
    images = [str(item) for item in as_list(inputs.get("images")) if item]
    user_content: Any = str(content)
    if images:
        user_content = [{"type": "text", "text": str(content)}] + [
            {"type": "image_url", "image_url": {"url": url}} for url in images
        ]
    messages = []
    if instruction:
        messages.append({"role": "system", "content": instruction})
    messages.append({"role": "user", "content": user_content})
    response = await client.post(
        f"{source['base_url'].rstrip('/')}/v1/chat/completions",
        headers={**_auth_headers(source["token"]), "Content-Type": "application/json"},
        json={"model": node.data.get("model"), "messages": messages},
    )
    response.raise_for_status()
    body = response.json()
    choices = body.get("choices") or []
    text = choices[0].get("message", {}).get("content", "") if choices else ""
    if not text:
        raise RuntimeError("文本模型没有返回内容")
    usage = body.get("usage") or {}
    return {
        "text": text,
        "_usage": {
            "input_tokens": usage.get("prompt_tokens", 0),
            "output_tokens": usage.get("completion_tokens", 0),
        },
    }


async def execute_prompt_enhance(node: GraphNode, inputs: dict, client: httpx.AsyncClient) -> dict:
    briefs = [str(item) for item in as_list(inputs.get("brief") or node.data.get("brief")) if str(item).strip()]
    if not briefs:
        raise RuntimeError("原始描述不能为空")
    context = {"api_source": await get_prism_source(), "http_client": client}
    results = []
    for brief in briefs:
        result = await prompt_enhance_plugin.process(
            {"text": brief}, {"model": node.data.get("model")}, context
        )
        results.append(result["text"])
    return {"prompt": results[0], "prompts": results}


async def execute_image_split(node: GraphNode, inputs: dict, client: httpx.AsyncClient) -> dict:
    image_url = str(inputs.get("image") or "")
    if not image_url:
        raise RuntimeError("请选择需要切分的图片")
    _, raw, _ = await _download_image(client, image_url, "source")
    rows = max(1, min(int(node.data.get("rows") or 2), 20))
    columns = max(1, min(int(node.data.get("columns") or 2), 20))
    urls = []
    with Image.open(io.BytesIO(raw)) as image:
        width, height = image.size
        for row in range(rows):
            top = round(row * height / rows)
            bottom = round((row + 1) * height / rows)
            for column in range(columns):
                left = round(column * width / columns)
                right = round((column + 1) * width / columns)
                tile = image.crop((left, top, right, bottom))
                output = io.BytesIO()
                tile.save(output, format="PNG")
                encoded = base64.b64encode(output.getvalue()).decode("ascii")
                urls.append(f"data:image/png;base64,{encoded}")
    return {"images": urls}


async def execute_node(node: GraphNode, inputs: dict, client: httpx.AsyncClient) -> dict:
    if node.type == "ai-image":
        return await execute_ai_image(node, inputs, client)
    if node.type == "text-generation":
        return await execute_text_generation(node, inputs, client)
    if node.type == "prompt-enhance":
        return await execute_prompt_enhance(node, inputs, client)
    if node.type == "image-split":
        return await execute_image_split(node, inputs, client)
    raise RuntimeError(f"节点不需要服务端执行: {node.type}")


async def _image_bytes(client: httpx.AsyncClient, url: str, label: str) -> tuple[bytes, str]:
    if url.startswith("data:image/"):
        try:
            header, encoded = url.split(",", 1)
            raw = base64.b64decode(encoded, validate=True)
            content_type = header[5:].split(";", 1)[0]
        except (ValueError, TypeError) as exc:
            raise RuntimeError("生成结果格式无效") from exc
        if not raw or len(raw) > 20 * 1024 * 1024:
            raise RuntimeError("生成结果大小无效")
        return raw, content_type
    _, raw, content_type = await _download_image(client, url, label)
    return raw, content_type


async def materialize_output_images(output: dict, client: httpx.AsyncClient) -> list[dict]:
    """把模型结果统一存入 XFS，并返回素材记录所需元数据。"""
    urls = [str(item) for item in as_list(output.get("images") or output.get("image")) if item]
    if not urls:
        return []
    semaphore = asyncio.Semaphore(4)

    async def materialize(index: int, url: str) -> dict:
        async with semaphore:
            raw, content_type = await _image_bytes(client, url, f"result-{index + 1}")
            try:
                with Image.open(io.BytesIO(raw)) as image:
                    width, height = image.size
                    image_format = (image.format or "PNG").lower()
                    extension = "jpg" if image_format == "jpeg" else image_format
                    thumb = image.copy()
                    thumb.thumbnail((480, 480))
                    if thumb.mode not in ("RGB", "RGBA"):
                        thumb = thumb.convert("RGBA" if "transparency" in thumb.info else "RGB")
                    thumb_buffer = io.BytesIO()
                    thumb.save(thumb_buffer, format="WEBP", quality=82, method=4)
            except OSError as exc:
                raise RuntimeError("生成结果不是有效图片") from exc
            stored_url = await upload_bytes(
                client, raw, f"result-{index + 1}.{extension}", content_type,
                "infinite-canvas/outputs",
            )
            thumbnail_url = await upload_bytes(
                client, thumb_buffer.getvalue(), f"result-{index + 1}.webp", "image/webp",
                "infinite-canvas/thumbnails",
            )
            return {
                "url": stored_url,
                "thumbnail_url": thumbnail_url,
                "filename": f"result-{index + 1}.{extension}",
                "mime_type": content_type,
                "size_bytes": len(raw),
                "width": width,
                "height": height,
            }

    return await asyncio.gather(*(materialize(index, url) for index, url in enumerate(urls)))


async def estimate_node_cost(node: GraphNode, inputs: dict) -> int:
    if node.type == "image-split":
        return 0
    model = str(node.data.get("model") or "")
    billing = await get_model_billing()
    info = billing.get(model, {})
    if info.get("billing_type") == "per_token":
        return 0
    unit = Decimal(str(info.get("credit_cost", 1)))
    multiplier = 1
    if node.type == "ai-image":
        prompts = as_list(inputs.get("prompts") or inputs.get("prompt") or node.data.get("prompt"))
        multiplier = max(1, len(prompts)) * max(1, min(int(node.data.get("count") or 1), 20))
    return to_int_credits(unit * multiplier)


async def actual_node_cost(node: GraphNode, inputs: dict, output: dict) -> int:
    """按模型计费配置计算最终整数积分。"""
    model = str(node.data.get("model") or "")
    info = (await get_model_billing()).get(model, {})
    if info.get("billing_type") != "per_token":
        return await estimate_node_cost(node, inputs)
    usage = output.get("_usage") or {}
    input_tokens = int(usage.get("input_tokens") or 0)
    output_tokens = int(usage.get("output_tokens") or 0)
    cost = (
        Decimal(str(info.get("input_cost", 0))) * input_tokens / 1000
        + Decimal(str(info.get("output_cost", 0))) * output_tokens / 1000
    )
    return to_int_credits(cost)
