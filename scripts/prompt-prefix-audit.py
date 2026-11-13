"""§CACHE-2 · 提示词前缀复用审计（零 API 成本，纯字节级）。

为什么存在
----------
2026-11-13 用户第二次报告"缓存命中率低"。已有的 `probe-prompt-cache.py` 用的是
**同一份 payload 连发两次**——那只能证明"网关会报 cached_tokens"，证明不了
"真实多轮对话里前缀能拼上"。provider 的自动前缀缓存按**字节前缀**计，
所以真正要量的是：同一项目连续两轮（目录不变、只有诉求/选中变）之间，
`system + user` 的公共前缀占较短者的多少。

本脚本不联网、不计费：它直接 import 生产同源的 `build_prompt`，构造一轮
"目录很大、诉求与选中变化"的真实形态，量公共前缀，并按阈值判 PASS/FAIL。

用法：
    python scripts/prompt-prefix-audit.py            # 判据模式（默认阈值）
    python scripts/prompt-prefix-audit.py --json     # 机器可读
    python scripts/prompt-prefix-audit.py --min 0.85 # 自定义阈值

退出码：0=PASS，4=前缀复用率不足，5=system 不稳定（跨请求字节不同）。
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "apps", "ai-service", "src"))

from ai_service.design_prompt import build_prompt  # noqa: E402

# 判据阈值：目录类请求的稳定区应该占绝对多数。低于这个数说明"稳定区被动态字段截断"。
DEFAULT_MIN_RATIO = 0.90
# system 提示必须逐字节一致——它是整条前缀的第一段，变了就全盘不命中。
SYSTEM_VARIANTS = ("无 Agent", "设计 Agent", "世界观 Agent")


def _catalog(scale: int = 24) -> dict[str, Any]:
    """构造一份形态与 `derive-context.ts` 产物一致的设计目录。

    `scale` 控制体量：默认 24 个框 × 每个若干节点，约 4-6k token 量级，
    与真机 evidence 里 `tokens_in≈6600` 同量级。
    """
    pages = [{"id": "pg_home", "name": "首页", "width": 1440, "height": 900, "rootId": "n_root"}]
    frames = []
    for i in range(scale):
        frames.append(
            {
                "nodeId": f"n_frame_{i}",
                "pageId": "pg_home",
                "name": f"Section {i}",
                "type": "frame",
                "size": {"width": 1440, "height": 640},
                "layout": {"mode": "stack", "gap": 24, "padding": 48},
                "children": [
                    {
                        "nodeId": f"n_text_{i}",
                        "name": "Headline",
                        "type": "text",
                        "size": {"width": 720, "height": 96},
                        "typography": {"fontSize": 56, "fontWeight": 700, "lineHeight": 1.1},
                        "text": f"第 {i} 段的标题文字",
                    },
                    {
                        "nodeId": f"n_body_{i}",
                        "name": "Body",
                        "type": "text",
                        "size": {"width": 640, "height": 72},
                        "typography": {"fontSize": 16, "fontWeight": 400, "lineHeight": 1.6},
                        "text": f"第 {i} 段的正文说明，引用 {{color.muted}} 与 {{space.4}}。",
                    },
                    {
                        "nodeId": f"n_btn_{i}",
                        "name": "CTA",
                        "type": "button",
                        "size": {"width": 160, "height": 48},
                        "style": {"fill": "{color.primary}", "radius": "{radius.md}"},
                    },
                ],
            }
        )
    tokens = [
        {"key": f"color.c{i}", "type": "color", "value": f"#1a1a{i:02x}"} for i in range(48)
    ] + [
        {"key": f"space.{i}", "type": "dimension", "value": i * 4} for i in range(1, 17)
    ] + [
        {"key": f"radius.{n}", "type": "dimension", "value": v}
        for n, v in (("sm", 4), ("md", 8), ("lg", 16))
    ]
    return {
        "pages": pages,
        "frames": frames,
        "components": [{"id": f"cmp_{i}", "name": f"组件 {i}"} for i in range(12)],
        "assets": [{"id": f"ast_{i}", "kind": "image", "name": f"素材 {i}"} for i in range(10)],
        "interactions": [{"nodeId": f"n_btn_{i}", "trigger": "click", "action": "navigate"} for i in range(scale)],
        "tokens": tokens,
        "totals": {"nodes": scale * 4, "tokens": len(tokens)},
        "omissions": ["逐节点样式未逐条展开", "图片二进制不在目录内"],
        "trimmed": [],
    }


def _request(turn: int, agent: str | None = None) -> dict[str, Any]:
    """同一项目的第 `turn` 轮：目录不变，只有诉求 / 选中 / 近期改动在变。"""
    return {
        "intent": "design.edit",
        "prompt": [
            "把首屏标题字号调大一点",
            "把第 3 段的按钮换成主色",
            "整体间距收紧，看起来更紧凑",
        ][turn % 3],
        "modelClass": "balanced",
        "agent": ({"name": "设计 Agent", "responsibilities": ["改设计"], "capabilities": ["design.patch"]}
                  if agent == "设计 Agent"
                  else {"name": "世界观 Agent", "responsibilities": ["设定"], "capabilities": ["world.read"]}
                  if agent == "世界观 Agent"
                  else {}),
        "context": {
            "projectId": "pj_demo",
            "pageId": "pg_home",
            "viewport": {"width": 1440, "height": 900},
            "selection": [f"n_text_{turn}", f"n_btn_{turn}"],
            "selectionDigest": {
                "entries": [
                    {
                        "nodeId": f"n_text_{turn}",
                        "name": "Headline",
                        "type": "text",
                        "size": {"width": 720, "height": 96},
                        "fontSize": 56,
                        "text": f"第 {turn} 段的标题文字",
                        "refs": ["color.muted"],
                    },
                    {
                        "nodeId": f"n_btn_{turn}",
                        "name": "CTA",
                        "type": "button",
                        "refs": ["color.primary", "radius.md"],
                    },
                ],
                "missing": [],
                "unreachable": [],
                "dropped": [],
                "omissions": ["选中节点的完整样式未展开"],
            },
            "annotations": [
                {"nodeId": f"n_text_{turn}", "pageId": "pg_home", "name": "Headline", "body": f"这行字太小了 #{turn}"}
            ],
            "recentChanges": [{"seq": turn, "op": "set", "nodeId": f"n_btn_{turn}", "path": "style.fill"}],
            "corpus": {"query": f"第 {turn} 轮诉求", "items": [], "candidates": 0, "omitted": 0},
            "designIndex": _catalog(),
        },
    }


def _common_prefix_ratio(a: str, b: str) -> float:
    """两段文本的公共前缀字节数 / 较短者长度。"""
    if not a or not b:
        return 0.0
    limit = min(len(a), len(b))
    i = 0
    while i < limit and a[i] == b[i]:
        i += 1
    return i / limit


def audit(min_ratio: float) -> dict[str, Any]:
    turns = [_request(t) for t in range(3)]
    built = [build_prompt(r) for r in turns]
    systems = [s for s, _ in built]
    users = [u for _, u in built]

    # 1) system 是否逐字节稳定（它是前缀第一段；变了就整条不命中）
    sys_stable = len(set(systems)) == 1

    # 2) 真实多轮：相邻两轮的公共前缀率
    ratios = [_common_prefix_ratio(users[i], users[i + 1]) for i in range(len(users) - 1)]

    # 3) 对照：同 payload 重发（旧证据量的就是这个，故它永远接近 100%）
    same = _common_prefix_ratio(users[0], users[0])

    # 4) 跨 Agent：system 里若拼了 agent 说明，换 Agent 就全盘不命中
    agent_systems = []
    for name in SYSTEM_VARIANTS:
        s, u = build_prompt(_request(0, None if name == "无 Agent" else name))
        agent_systems.append(s)
        del u
    agent_sys_stable = len(set(agent_systems)) == 1

    sizes = [len(u.encode("utf-8")) for u in users]
    return {
        "systemStable": sys_stable,
        "systemBytes": len(systems[0].encode("utf-8")),
        "agentSystemStable": agent_sys_stable,
        "userBytes": sizes,
        "consecutivePrefixRatio": [round(r, 4) for r in ratios],
        "samePayloadRatio": round(same, 4),
        "minRatio": min(ratios) if ratios else 0.0,
        "threshold": min_ratio,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--min", type=float, default=DEFAULT_MIN_RATIO, help="连续两轮前缀复用率阈值")
    ap.add_argument("--json", action="store_true", help="只输出 JSON")
    args = ap.parse_args()

    result = audit(args.min)
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print("[§CACHE-2] prompt prefix audit（零 API 成本）")
        print(f"  system 字节           = {result['systemBytes']}")
        print(f"  system 跨轮逐字节稳定 = {result['systemStable']}")
        print(f"  system 跨 Agent 稳定  = {result['agentSystemStable']}")
        print(f"  user 字节/轮          = {result['userBytes']}")
        print(f"  同 payload 重发前缀率 = {result['samePayloadRatio']:.2%}   ← 旧证据量的这个")
        print(f"  真实连续多轮前缀率    = {[f'{r:.2%}' for r in result['consecutivePrefixRatio']]}   ← 用户真正遇到的")
        print(f"  阈值                  = {result['threshold']:.0%}")

    if not result["systemStable"]:
        print("FAIL: system 提示跨请求字节不同——整条前缀从第一段就断了", file=sys.stderr)
        return 5
    if result["minRatio"] < args.min:
        print(
            f"FAIL: 连续多轮前缀复用率 {result['minRatio']:.2%} < {args.min:.0%}"
            "——稳定目录被动态字段截断，前缀缓存拼不上",
            file=sys.stderr,
        )
        return 4
    print("PASS: 连续多轮前缀复用率达标（稳定目录在动态字段之前）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
