# ADR 0124 — Usage 契约带 cached_tokens / reasoning_tokens（ADR 0123 仍欠项①）

- 状态：ACCEPTED（2026-11-13）
- 上游：ADR 0123（cached/reasoning 字段从 provider 暴露出来，这片把它落到 wire 端）
- 范围：`packages/schemas/src/index.ts` (UsageSchema) + web `src/server/ai/mock.ts` 的回执 +
  ai-service `execution.py` 的两处回执 + 相关 test fixtures

## 背景

ADR 0123 落了两个新字段（`completion.cached_tokens`、`completion.reasoning_tokens`），
但它们没像普通数字一样从 `UsageSchema` 走进 web 的 zod 类型 / 测试夹具 / 前端。
 contract is strict (`additionalProperties:false`) — 回执 JSON 里不能多放字段，也不能漏字段。

## 决定

1. `UsageSchema` 加两个必填整数（`.default(0)`）：`cachedTokens`、`reasoningTokens`。
   所有旧调用点给 defaults → 0，零回归理解。
2. `execution.py` 两处 usage 回执（ai-response 那一条 + ai-chat-response 那一条）都把两个字段带出来。
3. mock fixtures（demos + 集成测试）也补 defaults。真 provider 路径：`Completion` 自带两个字段，证明过。

## 后果

- 当前不能回归到旧字节级 "cached / reasoning 两个字段无法传达 web"。新增字段前端消费还需在 admin
  observability 那张 surface 里把它落一行。本次先铺好契约；产品侧消费 surface 的增补见 ROADMAP v691 前瞻。
- 旧 service 镜像（若有先行版）在新契约下收到新 usage 会报 invalid_usage：schema 加字段、
  默认 0，兼容旧 service 发旧报文（字段缺省即 0）。

## 仍欠（诚实记录）

1. web 前端（AI readiness 面板）还没把 `cachedTokens` / `reasoningTokens` 展示给用户。
   本片先解决“数据不到浏览器”的问题；展示 surface 还在 handoff 中（ROADMAP v691）。
2. provider 池轮转仍然无法保证实测 hit rate 高（前面已多次记录）；应用级 Redis 缓存命中才是
   经济账上的刚需（hit 率 = 100%）。
