# ADR 0294 — 设计主流程的 LLM 自检修订环（§GRAPH-3）

- 日期：2026-11-20
- 状态：Accepted，默认关闭（`NEXUS_LLM_DESIGN_REVIEW=0`）
- 相关：ADR 0123（流式）、0126（正典前缀）、0127（粘性路由）、0262（没报 ≠ 报了 0）、0270/0275（StateGraph 谱系）

## 背景

`/insight` 的 StateGraph 早已有 `draft → verify → revise` 反馈环（`insightGraph.ts`），
而**设计主流程**的图（`stategraph.py`）虽然也是图，节点却全是确定性的：

- 补丁形状由 JSON schema 判；
- 节点存不存在由 web 侧 apply 时判；
- 模型自己生成的 `patches` 从来没有被另一个模型视角读过一遍。

结果就是：诉求里写了「改成 72px」，补丁里仍是 56，也会一路绿灯落到画布上。
这不是模型能力不足，是**流程里没有让模型用能力自查的那一步**——用户反复要求的
「用大模型分析能力实现状态流转和内容输出」，缺的正是这一格。

## 决定

在 `execute_ai_request` 的 `parse_reply` 之后插入一条有界的反馈环：

```
draft（原生成，system = SYSTEM_PROMPT，含 53 万字节正典）
   ↓
review（LLM 审稿，system = REVIEW_SYSTEM，短且字节级稳定）
   ↓ 机检解析 {ok, issues[]}
   ├─ ok / 无可执行的意见 → finalize
   └─ 有漏项 且 未超上限 → revise（system 不变，原 user 逐字节在前 + 意见在后）→ 终审 → finalize
```

三条不可让步的约束：

1. **增强不是门**。审稿调用失败、输出不是 JSON、`issues` 里夹了脏值——
   一律按「没有可用意见」处理，原稿照常 200 返回。把增强做成新的单点故障，
   是把好主意变成事故。
2. **审稿不重送正典**。`REVIEW_SYSTEM` 短且固定；把 53 万字节的世界大典再发一遍
   去审一个 3 行补丁，是对 token 的挥霍。修订轮才复用原 `SYSTEM_PROMPT`——
   那时前缀缓存能摊掉那一段，才值得。
3. **修订意见排在原 user 之后**。provider 的前缀缓存按字节前缀命中；
   把意见插到前面会让原提示整段作废，正是 §CACHE-2 修掉的老毛病复发。

## 账本纪律

多调用的那几次必须如实进账，否则这个功能是「偷偷打折」：

- `usage.toolCalls` = 实际调用次数；
- `tokensIn / tokensOut / cachedTokens / latencyMs` = 各轮**求和**；
- `cacheReported` = 只有**每一轮**都报了才为 `true`。有一轮没报就说没全报——
  与 ADR 0262「没报 ≠ 报了 0」同一条；
- 只要有一轮没配价目，`costBasis` 就是 `unknown`、`costUsd` 为 0，
  不报一个偏低的总额；
- 每一步在 `activities` 里留下 `stage / status / summary`，
  `status` 只用契约允许的 `completed | failed`。

修订上限默认 1（可设 0 或 2）。「一直改到满意」没有终止条件，不是状态机，是死循环。

## 为什么默认关闭

这是唯一会**主动多花一次调用**的功能。项目里大多数请求不需要自查；
打开它应当是一个有意识的 token 预算决定，不是悄悄生效的默认。
`env.example` 里写明了这一点。

## 实测与判据

- 单元测试：`test_design_review.py` 16 条（坏形状、fence、bool/int、上限、前缀顺序）
- 图级判据：`test_design_review_graph.py` 7 条（零回归、账目求和、前缀复用、失败不阻塞、有界）
- 顺手修掉并轨后遗留的过期断言：`test_world_step_stategraph.py` 把「E177 不存在」
  换成远超当前 207 回响的 `E99999`——canon 扩了，测试不能还活在 #179。
- ai-service 全量：**492 passed / 18 skipped**

### 真机证据（2026-11-20，`gpt-6.2-sol` 经 Clash 7897）

请求：「把 Hero 主标题字号改成 72px，并把 CTA 文案改成『立即开始』。请逐项落实。」

**初稿漏了第二项。** 审稿原话：

> 诉求要求把 CTA 文案改成「立即开始」，补丁没有修改 CTA 文案。

修订后终审通过，交付补丁里出现了 `insert … node.text="立即开始"`。
这条轨迹就是这一片存在的全部理由——不是"模型多说了一句话"，
是**一个真实漏项被抓到并补上了**，且无需人盯。

活动轨迹（`activities`，Studio 的 ActivityFeed 原样渲染）：

```
provider  completed  返回 1 个补丁
review    completed  审稿发现 1 条漏项：诉求要求把 CTA 文案改成「立即开始」…
revise    completed  按审稿意见重做（第 1 轮）
review    completed  审稿通过（第 2 轮）
```

账目（`usage`）：`toolCalls=4`、`tokensIn=697149`、`tokensOut=591`、
`latencyMs=27234`、`cacheReported=false`（四轮里不是每一轮都报）、
`costBasis=unknown`（未配 `NEXUS_LLM_PRICES`）。

**这 69.7 万 token 也顺手回答了「输入上下文是不是太少」**：单是这条设计请求
就打了近 70 万输入 token（53 万字节正典在草稿与修订轮各进一次）。
问题从来不是"塞不进去"，而是"塞进去的东西有没有被真正用来做判断"——
GRAPH-3 让那段大上下文在**第二次判断**（审稿与修订）中又工作了一遍。
代价也摆在这里：修订轮要重买一次正典前缀，所以默认关闭、按需开启。

## 后果

- 开启后一次设计请求可能变成 2–4 次 provider 调用；延迟与成本都上升，账上如实可见。
- 审稿模型可能与生成模型意见相左；`revise` 以审稿意见为准，这是有意的选择——
  它正是这个环存在的意义。
- 审稿本身也会犯错。它只是一个**更便宜的第二视角**，不是事实裁决者；
  节点是否真的存在、补丁是否合法，仍由 web 侧落地时裁决。
