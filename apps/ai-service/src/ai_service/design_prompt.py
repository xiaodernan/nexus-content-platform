"""把 AiRequest 压成模型能吃的紧凑提示，并把模型回复解析回补丁。

设计模型的语义权威在 web 侧（@nexus/design-model）：这里只让模型产出候选 ops，
真正的合法性（节点是否存在、尺寸是否要重算）由 web 应用补丁时决定。
"""

from __future__ import annotations

import json
import re
from typing import Any

MAX_TOKENS_IN_PROMPT = 120
MAX_NODES_IN_PROMPT = 400
MAX_TREE_CHARS = 60_000

SYSTEM_PROMPT = """你是 NEXUS Studio 的设计编辑 Agent。输入是一份设计文档摘要与一句诉求，输出必须只有一段 JSON：

{"patches":[{"pageId":"...","summary":"一句话说明","ops":[...]}],"explanation":"给用户看的中文说明","labels":["方案A"]}

ops 只允许以下形状（字段名与取值必须严格一致）：
- {"op":"set","nodeId":"...","path":"size.width","value":123}
- {"op":"merge","nodeId":"...","path":"style","value":{...}}
- {"op":"insert","parentId":"...","index":0,"node":{...}}
- {"op":"remove","nodeId":"..."}
- {"op":"reparent","nodeId":"...","parentId":"...","index":0}
- {"op":"reorder","parentId":"...","from":0,"to":1}
- {"op":"setToken","key":"color.primary","value":"#rrggbb","mode":"dark"}
- {"op":"addToken","token":{"key":"...","type":"color","value":"..."}}
- {"op":"removeToken","key":"..."}
- {"op":"addComponent","component":{...}}
- {"op":"addAsset","asset":{...}}
- {"op":"addPage","page":{...},"setActive":true}
- {"op":"removePage","pageId":"..."}

规则：
1. 只能引用摘要里出现的 nodeId / pageId / token key；需要新节点时在 node 里给 id、name、type。
2. 颜色与尺寸优先引用 token（形如 "{color.primary}"），不要硬编码十六进制，除非诉求明确要求。
3. 不改变没有提到的节点；不要输出解释文字、Markdown 或代码块。
4. 无法用这些 op 表达的诉求（例如需要生成图片/视频），在 explanation 里说明做不了，patches 留空。
"""


def _walk(nodes: dict[str, Any], node_id: str, depth: int, page_id: str, out: list[dict[str, Any]]) -> None:
    if len(out) >= MAX_NODES_IN_PROMPT:
        return
    node = nodes.get(node_id)
    if not isinstance(node, dict):
        return
    size = node.get("size") or {}
    style = node.get("style") or {}
    typography = node.get("typography") or {}
    out.append(
        {
            "nodeId": node.get("id") or node_id,
            "pageId": page_id,
            "depth": depth,
            "type": node.get("type"),
            "name": node.get("name"),
            "size": {"width": size.get("width"), "height": size.get("height")},
            "text": ((node.get("text") or "")[:120] or None),
            "fontSize": typography.get("fontSize"),
            "fills": [
                paint.get("color")
                for paint in (style.get("fills") or [])
                if isinstance(paint, dict) and paint.get("color")
            ][:3],
        }
    )
    for child in node.get("children") or []:
        if isinstance(child, str):
            _walk(nodes, child, depth + 1, page_id, out)


def build_tree_digest(document: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    """返回（紧凑节点表，当前 pageId）。"""
    tree: list[dict[str, Any]] = []
    active = document.get("activePageId")
    for page in document.get("pages") or []:
        if not isinstance(page, dict):
            continue
        nodes = page.get("nodes")
        root_id = page.get("rootId")
        if not isinstance(nodes, dict) or not isinstance(root_id, str):
            continue
        if page.get("id") == active or not active:
            active = page.get("id")
        _walk(nodes, root_id, 0, str(page.get("id")), tree)
    return tree, str(active or "")


def build_prompt(request: dict[str, Any]) -> tuple[str, str]:
    context = request.get("context") or {}
    document = context.get("document") or {}
    page_id = context.get("pageId") or document.get("activePageId") or ""
    tree, _ = build_tree_digest(document)
    tokens = ((context.get("designSystemDigest") or {}).get("tokens") or [])[:MAX_TOKENS_IN_PROMPT]

    payload = {
        "intent": request.get("intent"),
        "prompt": request.get("prompt"),
        "modelClass": request.get("modelClass"),
        "variants": request.get("variants"),
        "viewport": context.get("viewport"),
        "pageId": page_id,
        "selection": context.get("selection") or [],
        "selectionDigest": context.get("selectionDigest") or [],
        "tokens": tokens,
        "tree": tree,
        "recentChanges": context.get("recentChanges") or [],
    }
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), default=str)
    if len(encoded) > MAX_TREE_CHARS:
        # 大文档先砍节点表：宁可少给上下文，也不能把请求撑爆
        payload["tree"] = tree[: MAX_NODES_IN_PROMPT // 4]
        payload["treeTruncated"] = True
        encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), default=str)
    return SYSTEM_PROMPT, encoded


_JSON_BLOCK = re.compile(r"\{.*\}", re.S)


def parse_reply(text: str) -> dict[str, Any]:
    """模型偶尔会包一层代码块；剥掉后再解析，解析不出就算 provider 失败。"""
    raw = text.strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.startswith("json"):
            raw = raw[4:]
    try:
        return json.loads(raw)
    except ValueError:
        match = _JSON_BLOCK.search(raw)
        if not match:
            raise ValueError("provider 未返回 JSON 对象")
        return json.loads(match.group(0))
