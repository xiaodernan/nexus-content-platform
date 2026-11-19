# 证据 · /v1/ai/chat 真链路 bible-ask 现场eval (2026-11-19) · provider = gpt-6.1-sol

## 环境
- ai-service（本机 127.0.0.1:8001）DEGRADED-BOOT（Redis 不可达，ADR-0274 明牌）+ `HTTPS_PROXY=http://127.0.0.1:7897`；`transport.stream=true`（sticky `prompt_cache_key=nexus-<sha256(digest)>`）。
- system = 真 digest（**240,870 chars** · 944 锚句 zh/en · sha256 `02c4fcbb…`），model = **gpt-6.1-sol**（gpt-6.1-terra 渠道已撤，见 `provider-gpt61-sol-migration-2026-11-19.md`）。
- 协议：12 题问典式提问（逐字打印，未做截断）；`.scratch/bible-qa-live-eval.py` 现场驱动 + 逐字收集，`.scratch/bible-qa-live-eval-answers.json` 为权威存档。

## 计数板

| 项 | 值 |
|---|---|
| 回答成功率 | **12/12** |
| 累计 tokensIn | 1,864,707（平均/题 ≈ 155K） |
| 累计 cached | 1,527,821（81.9%；首发冷启动 7,399 → 后续每题 ≈ 138,220 ≈ 89.0%） |
| 首发冷启动时间 | 166.7s（digest 换 sha → 新 sticky lane；第二发起稳定在 ~10s） |
| verbatim-overlap 机器指标（≥10 字连续子串匹配锚句） | 0/12（**非问题**：问典提示词鼓励转述+出处而非逐字复述；该指标只用于逐字锚定 lane） |

## 人工阅卷结论（12 题逐字原文在 json 里）

**canon-faithful（11/12）：**
潮候院是雾港的守望之所（名录）；盐灯由守灵人守着（回响《盐灯守灵日记》）；第四十一次大会散会后六十九年无人再提大会正式活书（附录一·旧史简纪）；锚句用于导航与检索/评测锚点（第一章）；桥每天只看水里的自己（回响152）；第九十九是沙漏选择相信的数/门槛，站上去可听见潮（回响155）；账房先生只认工位号（回响154）；世界大典记录潮候院的潮起潮落与守候（附录一）。
**拒答正确（这三题）：** Q6 谜箱答案——书里确实没有解，模型答「典籍里没有……只记载了谜面从未有人猜中」；Q11 盐灯熄火怎么办——典籍没写，模型答「典籍里没有说明……」；Q12 值更册没写过的事——模型答「典籍里没有」。拒答判定正确，与正典一致。

**canon-unfaithful（1/12，实锤缺口）：**
**Q9**：问「祠殿风里那张圆桌留了几把椅子」——**模型答「留了六把椅子」**，而正典/回响151：《只留一把椅子的圆桌》明写只留一把。引用（回响151）对，内容错。这是 digest 全量在上下文里仍会**具体数字/具体物的幻觉**的实证：任务行/写入 path 必须把数字类 canon 事实当成可错信号处理（pin 注 / 让它先读锚再答 / 对数字题走另一条更严的 lane）。

## 如实限度

1. 本 eval 不等于 `/api/bible/q` 的端到端（后者有 excerpt 选择、citations 出处芯片与 `verifyAnchorCitation` 门）；它测的是**digest 直喂 lane 的真模型存在性与 faithful 率**，不是整条 UI 车道。
2. 首发冷启动 166s 是 digest 每次提交 sha 变化换 lane 的固有代价（sticky 设计内），不是 bug；路线不变——一次冷、后续全暖。
3. 本机 16GB 内存下和 node/docker 争资源时，LLM 请求可能超时（本次全在 200）。

## 建议与行动（记账，不假装做完了）

- 把 Q9 那种"具体数字"类问题在问典 lane 上单独跑 `verifyAnchorCitation`（或 excerpt-first 模式强制只取含数字的 6 条锚句）——属于 web 层下一片的活（/bible/q route 已经是这个形状，只需把数字关键词纳入 excerpt 权重）。
- digest 满后（~256K）需要按 256K→320K 抬 SYSTEM_PROMPT_CHAR_BUDGET 或回响退 full-body 配额（ECHO_BODY_CHAR_BUDGET 125K 余量足够撑到 ~#160）。
