"""插件加载器：扫描 plugins/ 目录，动态加载节点定义和 process 函数。支持热加载。"""

import importlib
import importlib.util
import os
import sys
import asyncio
import logging
from typing import Any, Callable, Coroutine

logger = logging.getLogger(__name__)

_node_defs: dict[str, dict] = {}
_node_processors: dict[str, Callable[..., Coroutine]] = {}
_reload_callbacks: list[Callable[[], Any]] = []

PLUGINS_DIR = os.path.join(os.path.dirname(__file__), "plugins")


def load_plugins():
    """扫描 plugins/ 目录，加载所有 .py 插件。"""
    _node_defs.clear()
    _node_processors.clear()

    if not os.path.isdir(PLUGINS_DIR):
        logger.warning("plugins 目录不存在: %s", PLUGINS_DIR)
        return

    for filename in sorted(os.listdir(PLUGINS_DIR)):
        if filename.startswith("_") or not filename.endswith(".py"):
            continue
        module_name = f"plugins.{filename[:-3]}"
        filepath = os.path.join(PLUGINS_DIR, filename)
        try:
            # 热加载时清除旧模块缓存
            if module_name in sys.modules:
                del sys.modules[module_name]

            spec = importlib.util.spec_from_file_location(module_name, filepath)
            if spec is None or spec.loader is None:
                continue
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)

            node_def: dict | None = getattr(mod, "NODE_DEF", None)
            process_fn = getattr(mod, "process", None)

            if node_def is None or process_fn is None:
                logger.warning("插件 %s 缺少 NODE_DEF 或 process，跳过", filename)
                continue

            def_id = node_def.get("def_id")
            if not def_id:
                logger.warning("插件 %s 的 NODE_DEF 缺少 def_id，跳过", filename)
                continue

            _node_defs[def_id] = node_def
            _node_processors[def_id] = process_fn
            logger.info("已加载插件: %s (%s)", def_id, filename)

        except Exception:
            logger.exception("加载插件 %s 失败", filename)


def reload_plugins():
    """热加载：重新扫描并通知所有监听者。"""
    logger.info("检测到插件变更，重新加载...")
    load_plugins()
    for cb in _reload_callbacks:
        try:
            cb()
        except Exception:
            logger.exception("reload callback 执行失败")


def on_reload(callback: Callable[[], Any]):
    _reload_callbacks.append(callback)


def remove_reload_callback(callback: Callable[[], Any]):
    _reload_callbacks.remove(callback)


def get_all_node_defs() -> list[dict]:
    return list(_node_defs.values())


def get_node_def(def_id: str) -> dict | None:
    return _node_defs.get(def_id)


def get_processor(def_id: str) -> Callable[..., Coroutine] | None:
    return _node_processors.get(def_id)
