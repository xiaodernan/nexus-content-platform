# ADR 0122 — 死信的有界巡检面（admin 页 + NDJSON 导出；LLM 咨询输入，人类裁决）

- 状态：ACCEPTED（2026-11-13）
- 上游：ADR 0120（有界重试 + 死信）/ ADR 0121（有界死信 LTRIM）
- 范围：`apps/web`（新增 server 代码 + admin 页面 + API 路由；ai-service 字节一行不改）

## 背景

ADR 0120 落下了"毒消息耗尽重试进死信"，ADR 0121 加了 LTRIM 上界（500）。但死信对运维仍然是
一个"藏在 Redis 里的黑盒子"：看不到、数不到、导不出。这里补齐那一格——一个**只读巡检面**，
把 `nexus:ai:dead` 变成 admin 里能翻看的一页。

**LLM 咨询纪录**（按本次授权：真 wkapi.pro / gpt-6-sol）：先问诊"ONE single next step"，
它指向"宿主 CI 的 Postgres readiness harness 才优先"——与并轨 lanes 的 hosted-plane
症状吻合（本会话三个 REDs），本片不采纳那一点（不是这一片的边界）；再要"inspector 设计"，
它给出 cursor=LRANGE-tail 的尾部回溯版本（可用、但让页面第一帧看到最老的问题，运维真正
先关心最新的失败）；本片在它上面**人类裁决地偏转**：改为 head-relative（LPUSH 头=最新），
第一页就是最新的问题、cursor 头侧前进；page scope 同时改为 LRANGE 头侧窗口（同样 O(limit)）。
LLM 给的隐私/有界/不写/导出封装（`/export?format=jsonl&maxItems=`、逐行 NDJSON + maxItems）
被采纳并收敛为 500/1000 硬上界；LLM 列出的 11 条 contract test 全量落为本片真值门外加 3 条
web 缝真腿（§159：咨询的是输入，不是门；测试判据由本 repo 自己的真值门写）。

## 决策

1. **server 代码 `server/deadLetters.ts`**：
   `readDeadLettersPage({ cursor?, limit?, client?, key? })` — 测试缝 client/key；路由不传
   （固定只读 `nexus:ai:dead`）。`llen` 一次 + `lrange` 一次；任何 Redis 故障 → 如实
   `unavailable/read-error`，绝不静默伪造空表。
2. **分页**：cursor = base64url `{s, e}`（快照长度 + 头侧下一个起始下标）。第一帧从索引 0
   （头）读 `limit` 条；下一个 cursor 指向 `end+1`。读到：
   - `s !== LLEN` → `snapshot-stale`（409；LPUSH 只动头部，但已读之后窗口会越界）；
   - cursor 不可解析 → `invalid-cursor`（400，无任何修复尝试，不信任何用户输入的指针）；
   - 超界 → `snapshot-stale`。
3. **limit**：默认 20，上界 100，0/垃圾回落默认；export `maxItems` 上界 1000。
4. **解析容错**：任何行 JSON 失败 → `malformed` 行渲染（带标记，记录现场），整页不 500。
5. **Admin 页面 `/admin/dead-letters`**：admin 可见，只读渲染；展示快照尺寸 / 已耗尽原因舆论 /
   导出链接（NDJSON 附件）/ 刷新；`AdminNav` 新增死信入口。
6. **导出 NDJSON**（`GET /api/admin/dead-letters?download=1&maxItems=`）：仅 role=admin；
   一次 `LLEN` + 一次 `LRANGE` 取最新的 maxItems 条，NDJSON 回执 + Content-Disposition attachment；
   不写 Redis、不改任何字节；body 有 `maxItems` 硬上界（1000）。
7. **admin 路由 `GET /api/admin/dead-letters`**：与既有 admin 门同口径（`currentUserOrNull`
   + `role=admin`），所有错误分类映射 401/403/400/409/502/503。
8. **两条 LLM 咨询中**：哨兵测试（`snapshot-stale`）/ 游标编码/解码 roundtrip / malformed 行 /
   `llen+bounded lrange` 断言——全部为本仓自己的判据（§159 决定权归仓，不归模型）。

## 后果

- DLQ 对运维从黑盒变成有页可翻的实况源（LLEN 是权威数；不用进 redis-cli）。
- 零生产回归：两条新读路径（page/export）从不写 Redis；ai-service 队列一字未动。
- 测试：web 缝 11 条（真值腿 + 1 live Redis leg，DB7），fake 计数器钉住了 "LLEn 次数=1,
  LRANGE 次数=1, 只 llen/lrange 两种操作"；typecheck 0、eslint 干净。
- 真实访问未测试（无真 200 巡检人）。

## 仍欠（诚实记录）

1. **鉴权粒度**：目前 role=admin 整体；DLQ 里没有私有 payload（job.public() 不带它），
   所以泄漏面 = 失败原因 + jobId + attempt count，admin 以外不该看到；未来可能按
   "ops 只读"细化。
2. **cursor 无可续性**：页面改写 cursor 后如果列表继续 LPUSH 而用户坚持翻页，每次 LPUSH
   都会把当前页作废；正确行为就是 409 刷新（符合"不读到错数据"的红线），不自动恢复。
3. **paginated export 风景**：export 是一次 LRANGE（上界 1000 行、≤ ~200KB），对 DLQ 但进程内
   构造字符串；未来 dlq 极宽时（>1000 条红队测试中）需要流式；当前上界下无问题。
4. **AdminNav 入口已注册**但 e2e（paced）未纳入：paced 队列是另一套轨道（ADR-0088），
   等 hosted 电池落地后再决定是否进去。
5. **`AdminNav current='dead-letters'` 的 WCAG 24px**：sidebar 项 min-h-6（24px）沿用既有
   设定。
