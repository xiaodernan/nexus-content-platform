"""Provider 前缀缓存的**粘性路由**（v694，ADR 0126）。

真机（wkapi.pro / gpt-6-sol）同进程交替 A/B 实测（2026-11-13）：
同前缀连续请求，不带 `prompt_cache_key` 时命中 1/8（mean 0.124、p50 0.0）；
带上稳定键后 8/8（mean 0.778、p50 0.778）。非流同样 5/6 vs 2/6。
原因：该 distributor 按请求把流量分到不同后端通道，前缀缓存是**通道本地**的；
不给稳定路由键，连续两轮落到不同通道，上一轮建的前缀缓存就用不上。

本模块只做两件事，都是纯的：

1. `STABLE_PROMPT_KEYS` —— 哪些 prompt 字段跨轮稳定，是**单一真值**。
   `design_prompt.build_prompt` 用它排插入序（稳定现场在前），本模块用它算路由键，
   门也读它。三处同源，改一处其它两处跟着变（ADR 0095）。
2. `StickyPromptCacheTransport` —— httpx transport 装饰器，在**出站 HTTP 报文**里
   注入 `prompt_cache_key`。不改 provider 一行、不改 `complete()` 签名，
   流式与非流两条路自动都覆盖；provider 已经显式给了键就不覆盖。

§159 诚实边界：
- 这个键只是**路由提示**，不是"保证命中"。通道轮转、隐藏前缀注入、TTL 过期都会让
  `cached_tokens` 归零（ADR 0125 三条观察）。本模块不谎称命中率、不伪造 usage。
- prompt_cache_key 不改模型输出，所以它**不进 completion cache 的键**——那是
  (model, system, user, json_mode) 的事，混进来只会无谓降低应用级命中率。
- 不解析模型回复、不吞异常、不重试；body 不是 JSON 或不是 chat/completions 就原样放行。
"""
from __future__ import annotations

import hashlib
import json
from typing import Any, Mapping

import httpx

# 跨轮稳定、体量大、值得放进字节前缀的字段。顺序即 build_prompt 的插入序。
# 注意：modelClass / viewport / pageId 会被用户在轮次间切换，刻意不在此列——
# 它们放中段，稳定目录放最前，前缀才能从第 0 字节一直延续到目录末尾。
STABLE_PROMPT_KEYS: tuple[str, ...] = (
    "contextSource",
    "indexChars",
    "budgetChars",
    "pages",
    "frames",
    "components",
    "assets",
    "interactions",
    "tokens",
    "totals",
    "omissions",
    "catalogTrimmed",
    "code",
    "tree",  # document-fallback 路径的整份节点表（同样是稳定现场）
)

# 本轮诉求必须落在 JSON 末尾：它们是唯一每轮必变、且体量小的字段。
TERMINAL_VOLATILE_KEYS: tuple[str, ...] = ("intent", "prompt", "variants")

KEY_PREFIX = "nexus-"


def ordered_payload(payload: Mapping[str, Any]) -> dict[str, Any]:
    """把 prompt 字段排成前缀缓存友好序：稳定现场 → 中段变动现场 → 本轮诉求。

    纯函数，只重排键的插入序，不改任何值。`json.dumps` 按插入序输出，
    所以同一个项目连续几轮的 prompt 会共享整段稳定前缀。
    """
    stable = {k: payload[k] for k in STABLE_PROMPT_KEYS if k in payload}
    terminal = {k: payload[k] for k in TERMINAL_VOLATILE_KEYS if k in payload}
    reserved = set(STABLE_PROMPT_KEYS) | set(TERMINAL_VOLATILE_KEYS)
    middle = {k: v for k, v in payload.items() if k not in reserved}
    return {**stable, **middle, **terminal}


def stable_material(system: str, user: str) -> str:
    """从 prompt 抽出跨轮稳定的材料，作为粘性键的哈希输入（纯函数）。

    - user 是 build_prompt 产出的 JSON：只取 STABLE_PROMPT_KEYS 的字段，
      规范序列化（sort_keys + 紧凑分隔符），诉求/选中节点怎么变都不影响结果。
    - user 是 chat 的自由文本（不是 JSON）：整段都会变，只能靠 system 做会话身份；
      这时返回 system 本身，不把易变的正文混进键里。
    """
    try:
        obj = json.loads(user)
    except (ValueError, TypeError):
        obj = None
    if isinstance(obj, dict):
        stable = {k: obj[k] for k in STABLE_PROMPT_KEYS if k in obj}
        if stable:
            canonical = json.dumps(
                stable, ensure_ascii=False, separators=(",", ":"), sort_keys=True, default=str
            )
            return f"{system}\0{canonical}"
    # 自由文本对话：system 是稳定的会话身份；正文每轮都变，不能进键
    return f"{system}\0"


def prompt_cache_key(system: str, user: str) -> str:
    """稳定路由键：同项目连续几轮恒定，不同项目/不同目录自然分开。"""
    digest = hashlib.sha256(stable_material(system, user).encode("utf-8")).hexdigest()
    return f"{KEY_PREFIX}{digest[:32]}"


def _messages(body: Mapping[str, Any]) -> tuple[str, str]:
    msgs = body.get("messages")
    if not isinstance(msgs, list):
        return "", ""
    system_parts: list[str] = []
    user_parts: list[str] = []
    for m in msgs:
        if not isinstance(m, Mapping):
            continue
        content = m.get("content")
        if not isinstance(content, str):
            continue
        if m.get("role") == "system":
            system_parts.append(content)
        elif m.get("role") == "user":
            user_parts.append(content)
    return "".join(system_parts), "".join(user_parts)


def sticky_body(body: Mapping[str, Any]) -> dict[str, Any]:
    """返回注入了 prompt_cache_key 的新 body（纯函数，不修改入参）。

    已有键（调用方显式指定）保持不动；没有 messages 就不是 chat 请求，原样返回。
    """
    out = dict(body)
    if "prompt_cache_key" in out:
        return out
    if not isinstance(out.get("messages"), list):
        return out
    system, user = _messages(out)
    out["prompt_cache_key"] = prompt_cache_key(system, user)
    return out


def _judge_sticky_body(body: Mapping[str, Any], *, expected: str) -> bool:
    """判据单一真值：真腿与变异臂共用（ADR 0110）。钉性质，不钉字面。"""
    key = body.get("prompt_cache_key")
    return isinstance(key, str) and key.startswith(KEY_PREFIX) and key == expected


class StickyPromptCacheTransport(httpx.BaseTransport):
    """在 POST chat/completions 的出站 JSON 里注入稳定 `prompt_cache_key`。

    装饰器：所有真实网络行为仍由内层 transport 完成。之所以放在 transport 层，
    是因为流式与非流是 provider 里两条独立的构造 body 的代码路径，改任一处都会漏另一条；
    transport 是它们唯一的共同出站点（ADR 0123 的 SSE/非流分叉教训）。
    """

    def __init__(self, inner: httpx.BaseTransport | None = None, *, enabled: bool = True) -> None:
        self._inner = inner if inner is not None else httpx.HTTPTransport()
        self.enabled = bool(enabled)

    @property
    def inner(self) -> httpx.BaseTransport:
        return self._inner

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        if not self.enabled or request.method != "POST":
            return self._inner.handle_request(request)
        path = request.url.path.rstrip("/")
        if not path.endswith("chat/completions"):
            return self._inner.handle_request(request)
        try:
            request.read()
            body = json.loads(request.content)
        except (ValueError, UnicodeDecodeError, httpx.RequestNotRead):
            return self._inner.handle_request(request)
        if not isinstance(body, dict):
            return self._inner.handle_request(request)
        injected = sticky_body(body)
        if injected == body:
            return self._inner.handle_request(request)
        raw = json.dumps(injected, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        # httpx 在构造 Request 时就写好了 content-length；改 _content 必须同步改长度，
        # 否则对端会按旧长度截断报文（真机 400 / 截断 JSON）。
        request._content = raw  # noqa: SLF001 - httpx 没有公开的 body 改写 API
        request.stream = httpx.ByteStream(raw)
        request.headers["content-length"] = str(len(raw))
        return self._inner.handle_request(request)

    def close(self) -> None:
        self._inner.close()
