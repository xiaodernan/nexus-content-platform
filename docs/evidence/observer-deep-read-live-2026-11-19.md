# 证据 · /admin/observe AI 深读真跑通（真 provider + 真实 DB 聚合） · 2026-11-19

> ⚠️ 本记录的数字来自本机 live 库实汇，非 fixture mock。

## 本次实测（口令 123，COOKIE nx_observer=observer-123）

POST /api/admin/observer/digest  · body `{"locale":"zh"}` → **200**

模型：`gpt-6.1-sol`（本会话从 gpt-6.1-terra 切过来，旧渠道被撤）
network path：**Windows host → Clash Verge (127.0.0.1:7897) → aizzz.xyz**

## 模型回答原文（截取）

```
**形势**：当前累计用户为 3438，近 7 天新增 1266；总浏览 877、点赞 11，
公开审核通过数为 0。近 7 天打开 3 次，低于近 30 天日均约 3.23 次；
服务端投影为有效、趋势持平、每日斜率 0，下一日投影约 0.43 次，残差标准差约 1.24。
另有 114 个任务待审批、疑似机器人流量 91，完成率均值为 71.23%。

**展望 · 7 天推断**：推断：按每日投影约 0.43 次、斜率 0 外推，
未来 7 天的打开数基准约为 3 次；结合残差标准差约 1.24，
若按每日 0 至约 1.67 次作情景区间，7 天约为 0 至 12 次，这不是实测。推断：完成率 71.23%
可作为现有完成情况的参考，但没有给出打开到完成的对应关系，因此不能据此收窄上述打开数区间。

**下一步 · 优先级**：1. 先处理 114 个待审批任务，逐批审核并观察积压变化；…
2. 再核查疑似机器人来源并清洗 91 条相关流量，之后再评估转化指标；…
3. 记录接下来 7 天的每日打开数，与当前投影 0.43 次/日、斜率 0 和近 30 天日均约 3.23 次比较，以检查持平推断是否仍适用。
```

每个数字都对齐服务端实算（usersTotal/newNew7d/likes/suspectedBots7d/completionPctAvg30d/proj* 全部）。

## 实测的 metrics（服务端 compactMetrics()）

| 指标 | 值 |
|---|---|
| usersTotal | 3438 |
| usersNew7d | 1266 |
| publishesPublicApproved | 0 |
| viewsTotal | 877 |
| likesTotal | 11 |
| opens7d / opens30d | 3 / 97 |
| completionPctAvg30d | 71.2308% |
| completionsGame / completionsWork | 3 / 16 |
| suspectedBots7d | 91 |
| tasksAwaitingApproval | 114 |
| tasksSucceeded / tasksFailed | 351 / 4 |
| projValid | true |
| projTrend | flat |
| projSlopePerDay | 0 |
| projR2 | 0 |
| projResidualSd | 1.2421 |
| projNext1 | 0.4286 |

## 这一步到底证明了什么

- **真模型（非固定文案 mock）**：POST 报文自带 `"model":"gpt-6.1-sol"`；回答中 `3438/1266/…` 都与 compactMetrics() 真实字段对上
- **/admin/observe "AI 深读" 按钮可用**：旧 gpt-6.1-terra 渠道被撤后会 5xx；新路由由 StickyPromptCacheTransport 路由到 sol，能过 StickyPromptCacheTransport 的限流 + cache 取（不再是 302/banner "模型未上线"）
- **有数字就有**：不是"帮我优化一下"——是合法的、可审计的报文 + 投影字段一起喂给模型

## 与 codex 90% hit 的关系

真实 provider 现在跑的是 gpt-6.1-sol 而不是 terra，语义级 hits/token 级重用率是另一个问题。
本记录只证明「真打真通、真给真数据」，不替换 cache稳定证据（见 `provider-cache-stable-2026-11-19.md`）。

## 复现

```
curl -s -X POST http://127.0.0.1:3475/api/admin/observer/digest \
  -H "Content-Type: application/json" \
  -H "Cookie: nx_observer=observer-123" \
  -d '{"locale":"zh"}'
```
输出报文可直接贴个终端（body 含 digest / model / disclaimer / metrics）。
