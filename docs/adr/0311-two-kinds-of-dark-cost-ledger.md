# ADR 0311 · 成本账的"黑"要分两种：没配价目表 ≠ 配了但模型名对不上

日期：2026-11-23
状态：已采纳
相关：ADR 0262（没报 ≠ 报了 0）、ADR 0310（能力行读探测而非读 key）、§COST-1、§COST-2

## 背景

`§COST-2` 收尾时真线路量到一发 `gpt-6.2-sol` 的真调用返回
`costBasis="unknown" · costUsd=0 · tokensIn=4397`。读数没错——`apps/ai-service/.env`
里确实没有 `NEXUS_LLM_PRICES`，`config.py:282` 只在该 env 存在时建表，否则是
`EMPTY_PRICE_TABLE`。问题是这种"账是黑的"状态与另一种黑法在界面上长得一模一样：

| 情形 | `price_table` | `costUsd` | 正确的处置 |
|---|---|---|---|
| 价目表没配 | 空 | 0 / unknown | 配单价，或承认看不见 |
| 价目表配了，但 `NEXUS_MODEL_*` 改名后一条都对不上 | 非空 | 0 / unknown | **改回价目表的键名** |

第二行才是危险的：`gpt-6-sol → gpt-6.2-sol` 这类改名，代码一行没坏、调用照常 200、
探测照样 `ok`，只有成本账静默归零。而 0 会被读成"免费"。本仓库此前已经两次栽在
"同一个数字背后有两件不同的事"上（ADR 0262 把缺席写成 0 命中、ADR 0310 把没验证写成 real），
这一次是它落到钱上。

## 选项

**A. 什么都不加，靠 `costBasis=unknown` 自己解释。**
省一个字段，但 `unknown` 恰恰不区分上面两行——运维只能在两个假设之间猜，
而猜错的方向是"以为已经花了钱在统计"。

**B. 让价目表缺失时启动即抛。**
把配置错误变成启动失败，符合"配置错误必须显式抛出"的既有纪律。但本网关的单价**本来就该是
可选的**（自托管、离线评测、纯 mock 跑都要能起），为一个运维可读性把可用性打掉，代价不成比例。

**C. 在 `/v1/ai/cache-stats` 加第五本账 `pricing`，把两种黑法分开报。**
不新增进程、不打网络、不碰 provider；只用已有的 `PriceTable.price_for()` 问一句
"每个在用的模型名匹配得上吗"。与既有四本账（prefix / appCache / provider / upstream）同位置、
同"运维面不进 healthz"的纪律。

## 决定

C。`Registry.pricing_state()` 返回 `{state, configured, entries, models, priced, unpriced, note}`，
`state ∈ {unconfigured, model-drift, ok}`：空表 → `unconfigured`（根因优先，此时谈不上匹配）；
表非空但有档位对不上 → `model-drift`；全对得上 → `ok`。
判据用 `price_for()` 而不是字典键相等，好让 `gpt-6*` 这种前缀兜法算作匹配——
一个天天误报的门等于没有门。

配套改动：`PriceTable` 加 `__len__`（只数键，不暴露键名，表仍是只读的）；
`/api/bible/q` 与 `/api/insight/chat` 不再自写 `costBasis: 'usage'` 而是透传 provider 的那一档。

## 后果

- 静默归零变成一条能盯的读数；改名事故从"要靠人想到去查价目表"变成"端点直接点名哪一档没价"。
- **本片不填单价。** 我不知道这个转售网关的批发价，编一个数就是 §159 禁止的假账；
  `state=unconfigured` 会一直亮着，直到用户提供真实单价为止。
- 有一处已知未完成：`costLedger.ts:94` 的"不认识就归 unknown"三元——若将来真加第四档，
  它会产出两行同 key 并重复计数。本片**不**加第四档（那是另一个决策），因此不受影响。
- `usageOf()` 现在把"报 configured 但金额为 0"判回 unknown，与 ai-service 侧
  `test_pricing.py:262` 那条既有回归钉同义；代价是一个定价恰好为 0 的模型会被说成未计价——
  当前没有这样的模型，真有再说。
