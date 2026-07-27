"""PostgreSQL 队列 worker。可独立启动，也可在本地嵌入 API 进程。"""

import asyncio
import json
import logging
import os
import socket
import uuid

import httpx

from db import close_db, get_pool, init_db
from v2_executor import (
    actual_node_cost,
    as_list,
    estimate_node_cost,
    execute_node,
    materialize_output_images,
)
from v2_graph import GraphSnapshot, topological_order
import wallet

logger = logging.getLogger(__name__)
WORKER_ID = f"{socket.gethostname()}:{os.getpid()}"


def _node_inputs(node_id: str, graph: GraphSnapshot, values: dict[str, dict]) -> dict:
    result: dict = {}
    for edge in graph.edges:
        if edge.target != node_id:
            continue
        source = values.get(edge.source, {})
        value = source.get(edge.source_handle)
        if value is None:
            continue
        current = result.get(edge.target_handle)
        if current is None:
            result[edge.target_handle] = value
        else:
            result[edge.target_handle] = as_list(current) + as_list(value)
    return result


def _local_node_output(node, inputs: dict) -> dict:
    if node.type == "image-input":
        return {"image": node.data.get("url") or node.data.get("imageUrl")}
    if node.type == "text-input":
        return {"text": node.data.get("text") or ""}
    if node.type == "image-collection":
        images = [item for item in as_list(inputs.get("images")) if item]
        return {"image": images[0] if images else None, "images": images}
    if node.type == "text-collection":
        texts = as_list(inputs.get("texts")) + as_list(node.data.get("items"))
        texts = [str(item) for item in texts if str(item).strip()]
        return {"text": texts[0] if texts else "", "texts": texts}
    return dict(inputs)


async def claim_next_run():
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """SELECT * FROM workflow_runs WHERE status='queued'
                   ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1"""
            )
            if not row:
                return None
            return await conn.fetchrow(
                """UPDATE workflow_runs SET status='running', worker_id=$2, started_at=NOW(),
                          heartbeat_at=NOW(), progress=1
                   WHERE id=$1 RETURNING *""",
                row["id"], WORKER_ID,
            )


async def _set_run_failed(run_id, message: str):
    pool = await get_pool()
    await pool.execute(
        "UPDATE workflow_runs SET status='failed', error=$2, finished_at=NOW() WHERE id=$1",
        run_id, message[:2000],
    )


async def recover_stale_runs() -> int:
    """标记失去心跳的任务，并按节点幂等退还已记录费用。"""
    pool = await get_pool()
    rows = await pool.fetch(
        """SELECT wr.id AS run_id, wr.owner_id, nr.id AS node_run_id,
                  nr.node_type, nr.request_id, nr.credits_used
           FROM workflow_runs wr
           LEFT JOIN node_runs nr ON nr.run_id=wr.id AND nr.status='running'
           WHERE wr.status='running'
             AND COALESCE(wr.heartbeat_at, wr.started_at) < NOW() - INTERVAL '10 minutes'"""
    )
    run_ids = set()
    for item in rows:
        run_ids.add(item["run_id"])
        charged = int(item["credits_used"] or 0)
        net_charge = charged
        if charged and item["request_id"]:
            refunded = await wallet.refund(
                int(item["owner_id"]), charged, f"{item['node_type']} 异常中断退还",
                item["request_id"], wallet.recovery_request_id(item["request_id"]),
            )
            if refunded:
                net_charge = 0
        if item["node_run_id"]:
            await pool.execute(
                """UPDATE node_runs SET status='failed', error='服务异常中断',
                          credits_used=$2, finished_at=NOW()
                   WHERE id=$1 AND status='running'""",
                item["node_run_id"], net_charge,
            )
    for run_id in run_ids:
        await pool.execute(
            """UPDATE workflow_runs SET status='failed', error='服务异常中断',
                      credits_used=COALESCE((SELECT SUM(credits_used) FROM node_runs WHERE run_id=$1),0),
                      finished_at=NOW()
               WHERE id=$1 AND status='running'""",
            run_id,
        )
    return len(run_ids)


async def execute_run(row) -> None:
    pool = await get_pool()
    raw_graph = json.loads(row["input_snapshot"]) if isinstance(row["input_snapshot"], str) else row["input_snapshot"]
    graph = GraphSnapshot.model_validate(raw_graph)
    nodes = {node.id: node for node in graph.nodes}
    order = topological_order(graph)
    values: dict[str, dict] = {}
    executable = {"ai-image", "text-generation", "prompt-enhance", "image-split"}
    total = max(1, sum(nodes[node_id].type in executable for node_id in order))
    completed = 0
    credits_used = 0

    async with httpx.AsyncClient(timeout=httpx.Timeout(600.0)) as client:
        for node_id in order:
            cancel_requested = await pool.fetchval(
                "SELECT cancel_requested_at IS NOT NULL FROM workflow_runs WHERE id=$1", row["id"]
            )
            if cancel_requested:
                await pool.execute(
                    "UPDATE workflow_runs SET status='cancelled', finished_at=NOW() WHERE id=$1", row["id"]
                )
                await pool.execute(
                    "UPDATE node_runs SET status='cancelled' WHERE run_id=$1 AND status='queued'", row["id"]
                )
                return

            node = nodes[node_id]
            inputs = _node_inputs(node_id, graph, values)
            if node.type not in executable:
                values[node_id] = _local_node_output(node, inputs)
                continue

            request_id = uuid.uuid5(uuid.NAMESPACE_URL, f"{row['request_id']}:{node_id}").hex
            cost = await estimate_node_cost(node, inputs)
            await pool.execute(
                """UPDATE node_runs SET status='running', inputs=$3::jsonb,
                          request_id=$4, started_at=NOW()
                   WHERE run_id=$1 AND node_id=$2""",
                row["id"], node_id, json.dumps(inputs, ensure_ascii=False), request_id,
            )
            charged = 0
            charge_request_id = request_id
            try:
                if cost > 0:
                    await wallet.deduct(int(row["owner_id"]), cost, f"{node.type} 节点", request_id)
                    charged = cost
                    await pool.execute(
                        "UPDATE node_runs SET credits_used=$3 WHERE run_id=$1 AND node_id=$2",
                        row["id"], node_id, charged,
                    )
                output = await execute_node(node, inputs, client)
                if node.type in {"ai-image", "image-split"}:
                    asset_items = await materialize_output_images(output, client)
                    if asset_items:
                        stored_urls = [item["url"] for item in asset_items]
                        output["image"] = stored_urls[0]
                        output["images"] = stored_urls
                        for asset in asset_items:
                            await pool.execute(
                                """INSERT INTO assets
                                   (id, owner_id, project_id, kind, filename, mime_type,
                                    size_bytes, width, height, original_url, thumbnail_url, metadata)
                                   VALUES ($1,$2,$3,'output',$4,$5,$6,$7,$8,$9,$10,$11::jsonb)""",
                                uuid.uuid4(), int(row["owner_id"]), row["project_id"],
                                asset["filename"], asset["mime_type"], asset["size_bytes"],
                                asset["width"], asset["height"], asset["url"], asset["thumbnail_url"],
                                json.dumps({"run_id": str(row["id"]), "node_id": node_id}),
                            )
                actual_cost = await actual_node_cost(node, inputs, output)
                if actual_cost > charged:
                    post_request_id = uuid.uuid5(uuid.NAMESPACE_URL, f"{request_id}:actual").hex
                    await wallet.deduct(
                        int(row["owner_id"]), actual_cost - charged,
                        f"{node.type} Token 费用", post_request_id,
                    )
                    charged = actual_cost
                    charge_request_id = post_request_id
                    await pool.execute(
                        "UPDATE node_runs SET credits_used=$3 WHERE run_id=$1 AND node_id=$2",
                        row["id"], node_id, charged,
                    )
                values[node_id] = output
                credits_used += charged
                await pool.execute(
                    """UPDATE node_runs SET status='succeeded', outputs=$3::jsonb,
                              credits_used=$4, finished_at=NOW()
                       WHERE run_id=$1 AND node_id=$2""",
                    row["id"], node_id, json.dumps(output, ensure_ascii=False), charged,
                )
            except Exception as exc:
                if charged:
                    refunded = await wallet.refund(
                        int(row["owner_id"]), charged, f"{node.type} 执行失败退还", charge_request_id
                    )
                    if not refunded:
                        credits_used += charged
                await pool.execute(
                    """UPDATE node_runs SET status='failed', error=$3,
                              credits_used=$4, finished_at=NOW()
                       WHERE run_id=$1 AND node_id=$2""",
                    row["id"], node_id, str(exc)[:2000], 0 if charged and refunded else charged,
                )
                await pool.execute(
                    """UPDATE workflow_runs SET status='failed', error=$2, credits_used=$3,
                              finished_at=NOW()
                       WHERE id=$1""",
                    row["id"], str(exc)[:2000], credits_used,
                )
                return

            completed += 1
            await pool.execute(
                "UPDATE workflow_runs SET progress=$2, credits_used=$3, heartbeat_at=NOW() WHERE id=$1",
                row["id"], min(99, round(completed * 100 / total)), credits_used,
            )

    await pool.execute(
        """UPDATE workflow_runs SET status='succeeded', progress=100,
                  output_snapshot=$2::jsonb, credits_used=$3, finished_at=NOW()
           WHERE id=$1""",
        row["id"], json.dumps(values, ensure_ascii=False), credits_used,
    )


async def run_worker(stop_event: asyncio.Event | None = None, poll_interval: float = 1.0):
    logger.info("V2 worker 已启动: %s", WORKER_ID)
    recovered = await recover_stale_runs()
    if recovered:
        logger.warning("已处理 %d 个失去心跳的 V2 任务", recovered)
    while stop_event is None or not stop_event.is_set():
        row = await claim_next_run()
        if row:
            try:
                await execute_run(row)
            except Exception as exc:
                logger.exception("V2 任务执行异常: %s", row["id"])
                await _set_run_failed(row["id"], str(exc))
        else:
            await asyncio.sleep(poll_interval)


async def main():
    await init_db()
    try:
        await run_worker()
    finally:
        await close_db()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
