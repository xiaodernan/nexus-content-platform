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
1. 输入可能是**目录**（contextSource=designIndex）而不是整份文档：目录只列页面、框与段（frames）、
   token、组件、资产、交互。本轮选中的节点在 `selectionDigest.entries` 里（每项有 nodeId、名称、
   尺寸、字号、文字与它引用了哪些 token）；只能引用这些地方出现的 nodeId / pageId / token key。
   `selectionDigest.missing` 是服务端在文档里**认不出来**的 id：不要动它们，也别另挑一个像样的 id 假装改了，
   在 explanation 里说清楚哪个 id 找不到。`unreachable` 是文档里有、但从页面根走不到的节点（孤儿）；
   `dropped` 是选中太多、这次没展开列出的 id。
   叶子节点（文本、按钮、图片）如果没在目录里出现，就没有可引用的 id——需要动它时，
   用它的父框或 entries 里那个 nodeId 来表达；确实表达不了的，在 explanation 里说做不了，
   不要凭空造一个 id 假装改了。要**新增**节点时例外：那时由你起一个新 id（不能撞目录里已有的）。
2. `omissions` 写明这份目录没带什么（例如逐节点样式）。没列出来不等于不存在，也不等于可以乱猜。
3. 颜色与尺寸优先引用 token（形如 "{color.primary}"），不要硬编码十六进制，除非诉求明确要求。
   尺寸里的 "hug" / "fill" 是模型里的意图，不是量出来的像素。
4. 不改变没有提到的节点；不要输出解释文字、Markdown 或代码块。
5. 无法用这些 op 表达的诉求（例如需要生成图片/视频），在 explanation 里说明做不了，patches 留空。
6. `annotations` 是用户在某个元素上留下的原话（§111），每条带 nodeId / 页面 / 元素名 / 正文。
   它回答"该动哪个元素"，不是要照抄进设计的文案——"这个按钮太大"是要你改尺寸，不是把这句话写进按钮。
   批注与本轮诉求冲突时以诉求为准，并在 explanation 里说一句冲突在哪；
   `annotationsNote` 说明有哪些批注没带上来（过期节点或超出条数上限），别把没看见当成没有。
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


def _has_catalog(index: dict[str, Any]) -> bool:
    """服务端装配的目录长什么样不在这份代码里定义（那是 @nexus/design-model 的事），
    这里只判"有没有目录"：pages 与 frames 至少得有一个是列表。"""
    return isinstance(index.get("pages"), list) or isinstance(index.get("frames"), list)


def _agent_note(request: dict[str, Any]) -> str:
    """§112「每个 Agent 有自己的职责」+ §73「越权调用直接失败」在提示词里的那一句。

    名册由 web 侧按库装配后随报文带过来（这个进程不连业务库）。没点名时不说"你是设计 Agent"：
    SYSTEM_PROMPT 讲的是 op 词汇表，而"这一轮该不该改设计文档"是权限问题，答案在名册里。
    """
    agent = request.get("agent") or {}
    name = agent.get("name") if isinstance(agent, dict) else None
    if not name:
        return (
            "本轮没有点名任何 Agent：按诉求的意图类别处理，名册里的职责与权限没有一条被套用。"
            "需要改设计文档时，输出 ops 即可（审批与落地仍由 web 侧裁决）。"
        )
    responsibilities = "；".join(agent.get("responsibilities") or []) or "名册里没有写这一位的职责"
    capabilities = "、".join(agent.get("capabilities") or []) or "无"
    return (
        f"本轮由 {name} 负责。职责：{responsibilities}。权限作用域：{capabilities}。\n"
        "只有权限作用域里含 design.patch 时，才允许输出会改动设计文档的 op；"
        "没有这个作用域而诉求又要改文档时，patches 留空，并在 explanation 里说明这一位做不了（§73）。"
    )


def build_prompt(request: dict[str, Any]) -> tuple[str, str]:
    """拼发给模型的 user 提示。

    §68 之后**线上没有整份文档**：web 侧装配出预算内的目录再发过来。
    所以这里优先吃 `designIndex` / `codeDigest`；只有旧客户端或测试才会还带 `document`，
    那种情况走 `document-fallback` 并把这个事实写进 payload——降级要看得见（§159）。
    """
    context = request.get("context") or {}
    index = context.get("designIndex") or {}
    code = context.get("codeDigest") or {}
    document = context.get("document") or {}
    page_id = context.get("pageId") or document.get("activePageId") or ""

    payload: dict[str, Any] = {
        "intent": request.get("intent"),
        "prompt": request.get("prompt"),
        "modelClass": request.get("modelClass"),
        "variants": request.get("variants"),
        "viewport": context.get("viewport"),
        "pageId": page_id,
        "selection": context.get("selection") or [],
        # 服务端派生的一份目录（entries / missing / unreachable / dropped / omissions）；
        # 空对象只可能来自手写请求，正常装配一定会带上它
        "selectionDigest": context.get("selectionDigest") or {},
        # §111：钉在元素上的用户原话，服务端按文档核对过定位
        "annotations": context.get("annotations") or [],
        **({"annotationsNote": context["annotationsNote"]} if context.get("annotationsNote") else {}),
        "recentChanges": context.get("recentChanges") or [],
    }
    # 这个进程自己又裁的每一刀，最后一起写进 promptTruncated（§159：短了要说，别默默变短）
    truncations: list[str] = []

    if _has_catalog(index):
        payload["contextSource"] = "designIndex"
        payload["indexChars"] = context.get("indexChars")
        payload["budgetChars"] = context.get("budgetChars")
        payload["pages"] = index.get("pages") or []
        payload["frames"] = index.get("frames") or []
        payload["components"] = index.get("components") or []
        payload["assets"] = index.get("assets") or []
        payload["interactions"] = index.get("interactions") or []
        index_tokens = index.get("tokens") or []
        payload["tokens"] = index_tokens[:MAX_TOKENS_IN_PROMPT]
        # 服务端裁过一轮，这里再裁一轮也必须留痕，否则模型以为这份列表是完整的
        if len(index_tokens) > MAX_TOKENS_IN_PROMPT:
            truncations.append(
                f"token 表从 {len(index_tokens)} 条裁到 {MAX_TOKENS_IN_PROMPT} 条（这份进程的上限，不是服务端预算）"
            )
        payload["totals"] = index.get("totals") or {}
        # 目录说了它没带什么，模型就得知道——否则它会以为"没列出来 = 项目里没有"
        payload["omissions"] = index.get("omissions") or []
        payload["catalogTrimmed"] = index.get("trimmed") or []
        payload["code"] = code or None
    elif document.get("pages"):
        payload["contextSource"] = "document-fallback"
        payload["note"] = "没有服务端目录，退回到整份文档的节点表；这条路径不该出现在正常请求里"
        tree, _ = build_tree_digest(document)
        payload["tree"] = tree
        payload["tokens"] = ((context.get("designSystemDigest") or {}).get("tokens") or [])[:MAX_TOKENS_IN_PROMPT]
    else:
        payload["contextSource"] = "none"
        payload["note"] = "既没有目录也没有文档：这一轮模型看不到项目内容，只能按诉求文字回答（应当说明做不了）"

    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), default=str)
    if len(encoded) > MAX_TREE_CHARS:
        # 服务端已经按预算裁过，这里撑爆说明预算本身失效：宁可少给目录，也不能把请求撑爆，
        # 并且要把"又裁了一刀"写在报文里，不静默变短
        # contextSource=none 时两个列表都不存在：这一刀的体量来自诉求文字，不能瞎砍用户原话
        key = "frames" if isinstance(payload.get("frames"), list) else ("tree" if isinstance(payload.get("tree"), list) else None)
        if key:
            dropped = len(payload[key])
            payload[key] = payload[key][: MAX_NODES_IN_PROMPT // 4]
            truncations.append(
                f"提示超过 {MAX_TREE_CHARS} 字符，{key} 从 {dropped} 条裁到 {len(payload[key])} 条"
            )
        else:
            truncations.append(f"提示超过 {MAX_TREE_CHARS} 字符，但没有可裁的节点表；体量来自诉求文字本身")
        encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), default=str)
    if truncations:
        payload["promptTruncated"] = "；".join(truncations)
        encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), default=str)
    return f"{SYSTEM_PROMPT}\n{_agent_note(request)}", encoded


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
