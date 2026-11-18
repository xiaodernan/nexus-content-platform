# ADR 0273 — 收件箱伴读的隐私最小化：模型只见计数，不见内容（cont. 194）

日期：2026-11-17
状态：已接受

## 背景

§新指令·四（LLM 深度嵌入整体）要求把大模型 "完整深度的" 用起来——包括"通过大模型分析能力实现各种状态的流转和内容的输出"。
`/notifications`（cont. 194）是第一次把用户**私有数据**喂给 provider 的场景，与之前的观测大厅、馆长批注、章节伴读不同：
那些都是公共内容或聚合量；收件箱里有标题、正文、行为者姓名——全部是别人写给你的、不该默认离开你账号的内容。

## 选项

1. 把最近 50 条通知的标题/正文发给模型，让模型"读内容排优先级"——效果最好、语义最强；但等于把别人的匿名消息 + 你的事务内容整体交给第三方 provider。隐私红线，拒绝。
2. 客户端算计数再上送——可行，但客户端可改数，摘要依据不可信。拒绝。
3. **服务端自算"按 kind 聚合的实测计数"（kind + count + count-unread），只把计数交给模型**——内容一个字不出服务端；计数不可伪造（在库里算）；模型据此排"哪件先开"。本质是 §9 处理公开聚合数的同一条纪律用到私域。

## 决定（采纳选项 3）

- `inboxKindHistogram(userId)`：`SELECT kind, count(*), count(*) FILTER (WHERE read_at is null) GROUP BY kind`，未知 kind 合并 `other`。**不选 title / body / actor**。
- `POST /api/notifications/digest {locale}` 入参仅一个 locale；模型输入只含该计数 JSON。
- 空收件箱（total = 0）：**不调用模型**，直接返回 server-authored 空态（`no-model (server-authored empty case)`）——不花 provider 钱，回答也照实说。
- 模型输出缺数字 → 502（"没落在实测计数上（缺少数字）——不展示这类空话"）。机械检查与深读建议 / 馆长批注同一纪律。
- 6h LRU（32 槽，键 = sha256(user|locale|计数签名)）；IP+用户 20/小时；DEMO MODE → 409；未登录 → 401。
- 摘要随附 histogram 本身回给 UI（`ntg-chip`）——用户可以和页签逐条对账。

## 后果

- 隐私：provider 侧记录里没有任何用户内容，只有 `{"total":1,"unread":1,"kinds":[{"kind":"team","total":1,"unread":1}]}` 形态的数字。
- 摘要质量上限被"计数"封顶——它回答不了"那条评论说了什么"，只回答"先开哪件"。这是对的：排优先级不需要内容。
- 同型推广：以后任何私域 AI 伴读（私信、收藏、草稿历史），一律先问"模型只需要数字还是需要内容"；需要内容的（如 whisper 答正典）只走公共/正典数据，私域默认最小化。
- 验证：cont. 194 live E2E（注册→项目→邀请→接受→team 通知→fresh 200 → cached 200）；套件 `ntg-visual-style.test.ts` 对"Domain/Route 不触碰 title/body/actor"做机械断言，失手回归会红。

## 相关

- ADR 0265（LLM 流 / prefix cache 实测）· ADR 0271（healthz 不 5xx）· ADR 0272（车道 canary）
- cont. 190（AI 深读）· cont. 192（馆长批注）· cont. 193（正典伴读）· cont. 194（本文）
