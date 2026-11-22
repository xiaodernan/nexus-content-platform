"""§GRAPH-3 · 设计补丁的 LLM 自检修订环。

为什么要有这一层
----------------
现有 `stategraph.py` 把线性管线画成了图，但**所有判断都是确定性的**：
补丁形状对不对由 JSON schema 定，节点存不存在由 web 侧定。
模型自己生成的 `patches` 从来没有被"另一个模型视角"读过一遍——
哪怕它明显漏掉了诉求里的"改成 64px"，也会一路绿灯落到画布上。

`/insight` 的 StateGraph 已经有 draft → verify → revise 反馈环（insightGraph.ts），
设计主流程却没有。这里把同样的语义补上：

    draft（原生成）→ review（LLM 审稿，独立短 system）→ verify（确定性机检）
        ├─ ok → finalize（用原稿）
        └─ 有问题 且 未超修订上限 → revise（LLM 重生成，system 不变 → 共用前缀 KV）→ verify

三条不能破的纪律
----------------
1. **审稿失败不阻塞主链路**。审稿是增强，不是门。网关抖动、输出不是 JSON、
   审稿人自己胡说——都按"没有审稿意见"处理，原稿照常返回，并在 activities 里如实记一笔。
   把增强做成新的单点故障，是把一个好主意变成事故。

2. **审稿 system 字节级稳定且短**。它不复制 53 万字节的世界大典——审稿只需要
   诉求与补丁摘要，把大典再发一遍是纯粹烧 token。短前缀固定不变，
   审稿调用之间照样能吃前缀缓存。

3. **修订轮复用原 system**。重生成仍走 `SYSTEM_PROMPT`（含正典前缀），
   所以那 50 多万字节的 KV 在前缀上命中，不重复付费。这是把图结构用在省钱上，
   不只是画得好看。

token 纪律：默认关闭（`NEXUS_LLM_DESIGN_REVIEW=0`）。显式开启才多花一次审稿调用；
修订上限默认 1 次，不设成"直到满意"——那是一条没有终止条件的循环。
"""

from __future__ import annotations

import json
import logging
from typing import Any, Mapping

_log = logging.getLogger(__name__)

# 字节级稳定：这段字符串不能带时间、计数、项目名或任何"现场"信息。
# 它进 system 位置，是所有审稿调用共享的前缀。
REVIEW_SYSTEM = """你是设计补丁的审稿人。用户提了一个诉求，编辑 Agent 给出了一组补丁。
你只判断一件事：这组补丁**有没有真的落实诉求**。

判定规则：
- 只认补丁里实际出现的 op 与数值；不要脑补"应该改了"。
- 诉求里点名的节点、数值、颜色、字号、位置，逐项核对；有一项没落实就报出来。
- 补丁为空不算通过——除非诉求本身就是"什么都不用改"。
- 不要评价文风、不要提新需求、不要建议重构。只说漏了什么、做错了什么。

只输出一个 JSON 对象，不要 markdown、不要解释：
{"ok": true, "issues": []}
或
{"ok": false, "issues": ["诉求要求把标题改成 64px，补丁里 fontSize 仍是 56"]}

issues 最多 3 条，每条一句话，说清"诉求要什么 / 补丁给了什么"。
"""

MAX_ISSUES = 3


def build_review_user(*, prompt: str, reply: Mapping[str, Any]) -> str:
    """审稿输入：原诉求 + 补丁摘要。不送整份设计目录（那是 draft 的事，不贵第二遍）。"""
    patches = reply.get("patches")
    patches = patches if isinstance(patches, list) else []
    lines: list[str] = ["诉求：", str(prompt)[:4000], "", "编辑 Agent 交出的补丁："]
    if not patches:
        lines.append("（补丁列表为空）")
    for index, patch in enumerate(patches[:12]):
        if not isinstance(patch, Mapping):
            lines.append(f"{index + 1}. <形状不对，无法摘要>")
            continue
        ops = patch.get("ops")
        ops = ops if isinstance(ops, list) else []
        summary = str(patch.get("summary") or "")[:120]
        lines.append(f"{index + 1}. 页面 {str(patch.get('pageId') or '')[:60]} · {summary} · {len(ops)} 个 op")
        for op in ops[:8]:
            if isinstance(op, Mapping):
                lines.append(
                    "   - "
                    + json.dumps(op, ensure_ascii=False, separators=(",", ":"), default=str)[:240]
                )
        if len(ops) > 8:
            lines.append(f"   - ……另有 {len(ops) - 8} 个 op 未列出")
    if len(patches) > 12:
        lines.append(f"……另有 {len(patches) - 12} 组补丁未列出")
    explanation = str(reply.get("explanation") or "")[:400]
    if explanation:
        lines.extend(["", "Agent 自述：", explanation])
    return "\n".join(lines)


def build_revision_user(*, original_user: str, issues: list[str]) -> str:
    """修订输入：原 user 逐字节放前面（保住前缀），审稿意见放最后。

    顺序不能反：provider 的前缀缓存按字节前缀命中，把意见塞到前面会让
    原提示整段作废——那正是 §CACHE-2 花大力气修掉的老毛病。
    """
    bullets = "\n".join(f"- {issue}" for issue in issues[:MAX_ISSUES])
    return f"{original_user}\n\n【审稿意见 · 必须逐条落实】\n{bullets}\n重做补丁，仍只输出合法 JSON。"


def parse_review(text: str) -> tuple[bool, list[str]]:
    """解析审稿输出。坏形状一律当"没有可用的审稿意见"，不抛出、不阻塞主链路。"""
    raw = (text or "").strip()
    if not raw:
        return False, []
    # 模型偶尔会裹一层 ```json fence；只剥这一层已知的噪音，不做更宽的猜测
    if raw.startswith("```"):
        first = raw.find("\n")
        last = raw.rfind("```")
        if first > 0 and last > first:
            raw = raw[first + 1 : last].strip()
    try:
        parsed: Any = json.loads(raw)
    except json.JSONDecodeError:
        _log.info("设计审稿输出不是合法 JSON，按无意见处理")
        return False, []
    if not isinstance(parsed, Mapping):
        return False, []
    ok = parsed.get("ok")
    if not isinstance(ok, bool):
        # bool 是 int 子类但不接受 0/1：审稿结论必须是明确的布尔
        return False, []
    raw_issues = parsed.get("issues")
    issues: list[str] = []
    if isinstance(raw_issues, list):
        # 先筛后截：模型在三条真意见中间夹个 42，不能让后面的真意见凭空消失
        for item in raw_issues:
            if len(issues) >= MAX_ISSUES:
                break
            if isinstance(item, str) and item.strip():
                issues.append(item.strip()[:240])
    return ok, issues


def should_revise(*, ok: bool, issues: list[str]) -> bool:
    """`ok=true` 一次通过；`ok=false` 但没有可执行的意见时不修订（无从改起）。"""
    return (not ok) and bool(issues)
