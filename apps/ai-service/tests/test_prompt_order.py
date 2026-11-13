"""前缀缓存友好序门（§CACHE-2，2026-11-13 重写）。

**旧门测的是代理指标**：它只断言"键顺序——volatile 在尾"。那是必要不充分条件：
键顺序可以完全正确，只要稳定大目录前面还夹着一个每轮会变的字段，字节前缀照样
在第一个不同字节处断掉，整份目录仍然进不了缓存（实测旧序连续两轮只有 0.45%）。

provider 的自动前缀缓存只认**字节前缀**，所以本门直接断言那个东西：
同项目连续两轮（目录不变、只有选中/诉求/批注/近期改动在变），
`user` 载荷的公共前缀必须覆盖较短者的 ≥90%。

对照：`scripts/prompt-prefix-audit.py` 是同一判据的零依赖命令行版（可对真机跑）。
"""

import json
import pathlib

from ai_service.design_prompt import SYSTEM_PROMPT, build_prompt

MIN_PREFIX_RATIO = 0.90


def _fixture_request() -> dict:
    p = pathlib.Path(__file__).resolve().parents[3] / "contracts" / "fixtures" / "ai-request-with-index.json"
    return json.loads(p.read_text(encoding="utf-8"))


def _turn(request: dict, turn: int) -> dict:
    """同一项目的第 `turn` 轮：目录逐字节不变，只有"本轮现场"在变。

    这不是极端场景：真实 Studio 里用户连续提要求时，正是目录不变、
    选中节点与诉求在变。旧序在这种最普通的情形下前缀率只有 0.45%。
    """
    r = json.loads(json.dumps(request))  # deep copy，避免用例间互相污染
    ctx = r.setdefault("context", {})
    digest = ctx.get("selectionDigest") or {}
    entries = digest.get("entries") or []
    if entries:
        picked = entries[turn % len(entries)]  # 换一个选中节点：用户点了另一个元素
        ctx["selection"] = [picked.get("nodeId")]
        digest["entries"] = [picked]
        ctx["selectionDigest"] = digest
    picked_id = (ctx.get("selection") or ["n0"])[0]
    ctx["annotations"] = [
        {"nodeId": picked_id, "pageId": ctx.get("pageId"), "name": "Headline", "body": f"这行字太小了（第 {turn} 轮）"}
    ]
    ctx["recentChanges"] = [{"seq": turn, "op": "set", "nodeId": picked_id}]
    corpus = ctx.get("corpus") or {}
    corpus["query"] = f"第 {turn} 轮诉求"
    ctx["corpus"] = corpus
    r["prompt"] = [
        "把首屏标题字号调大一点",
        "把这一段的按钮换成主色",
        "整体间距收紧，看起来更紧凑",
    ][turn % 3]
    r["intent"] = "design.edit"
    # 同一次会话里 Agent 也可能换人（多 Agent 协作），system 不许因此变
    if turn == 1:
        r["agent"] = {
            "key": "qa",
            "name": "QA Agent",
            "responsibilities": ["只提问题"],
            "capabilities": ["browser.read"],
        }
    return r


def _common_prefix_ratio(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    limit = min(len(a), len(b))
    i = 0
    while i < limit and a[i] == b[i]:
        i += 1
    return i / limit


def test_consecutive_turns_share_a_long_byte_prefix() -> None:
    """核心不变量：连续两轮的公共前缀 ≥90%（旧序实测 0.45%）。"""
    base = _fixture_request()
    built = [build_prompt(_turn(base, t)) for t in range(3)]
    users = [u for _, u in built]
    ratios = [_common_prefix_ratio(users[i], users[i + 1]) for i in range(len(users) - 1)]
    worst = min(ratios)
    assert worst >= MIN_PREFIX_RATIO, (
        f"连续多轮前缀复用率 {worst:.2%} < {MIN_PREFIX_RATIO:.0%}："
        f"每轮会变的字段排在了稳定目录之前，provider 前缀缓存拼不上（逐轮={ratios}）"
    )


def test_system_is_stable_for_same_agent_dict_across_turns() -> None:
    """system 是整条前缀的第一段：同一（同一个 agent 字典对象）的轮次重复生成时必须逐字节一致。

    Agent 名册被并进去后，换 Agent 自然会改变 system（这是有意的：从同一个字节就失配，
    让多 Agent 分车道各用各缓存）。但只要 Agent 不变（换选中/换诉求），system 必须一字不变——
    变的只是 user 里的片段，前缀必须能一字不改地命中。"""
    base = _fixture_request()  # 这个 fixture 没有 agent
    # turn=0/2/3 不注入 agent（同一份无 Agent 的 system）：必须逐字节一致
    same = {build_prompt(_turn(base, t))[0] for t in (0, 2, 3)}
    assert len(same) == 1, f"无 Agent 的同一车道 system 不应随 turn 变，但得到 {len(same)} 种"
    # 换 Agent 后一定不同（这是有意分车道）：turn=1 注入了 QA Agent
    turn1 = build_prompt(_turn(base, 1))[0]
    assert turn1 != next(iter(same)), "turn=1 注入了 QA Agent，system 应与无 Agent 的车道不同；同一车道不应串台"


def test_volatile_fields_stay_behind_the_stable_catalog() -> None:
    """结构性兜底：稳定目录的键必须整段排在所有易变键之前。

    这是上一条的**原因**，不是替代品——字节断言给出一个难懂的比例时，
    它能直接告诉你"是哪个键跑到前面去了"。
    """
    payload = json.loads(build_prompt(_turn(_fixture_request(), 0))[1])
    keys = list(payload.keys())
    stable = ["contextSource", "pages", "frames", "components", "assets", "interactions", "tokens", "totals"]
    volatile = ["selection", "selectionDigest", "annotations", "recentChanges", "corpus", "agentNote", "intent", "prompt", "variants"]
    last_stable = max(keys.index(k) for k in stable if k in keys)
    first_volatile = min(keys.index(k) for k in volatile if k in keys)
    assert last_stable < first_volatile, (
        f"稳定目录的最后一位是第 {last_stable} 个键，易变键最早在第 {first_volatile} 个——中间夹着的东西会截断前缀"
    )
    # 诉求永远在最后三位（provider 只认前缀，能变的必须在尾部）
    assert keys[-3:] == ["intent", "prompt", "variants"], f"诉求必须在末尾，实际={keys[-5:]}"
    assert "promptTruncated" not in payload


def test_rebuilding_the_same_request_is_byte_identical() -> None:
    """同一请求两次构建必须字节相同：任何一次抖动都会让缓存白费。"""
    request = _turn(_fixture_request(), 0)
    assert build_prompt(request) == build_prompt(request)
