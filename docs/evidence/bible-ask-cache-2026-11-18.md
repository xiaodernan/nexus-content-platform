# /api/bible/q 第二问命中 KV（§AILIVE-6 · 2026-11-18）

> 目的：用 /api/bible/q 真实响应证明 digest 前缀对 provider 的 prefix KV 复用——
> 第一次问 → 冷，第二次同一问题 → 命中。

## 操作

1. 本机 prod web（`next start :3100`），ai-service uvicorn :3200，Clash 7897 出网
2. 注册临时账号 `live-ask-{ts}@example.test`（密码 smoke-password-2026-11-18）
3. 同一问题「《收件人》里谁收到了那张签收单？」连发两次

命令：

```
npx tsx --tsconfig apps/web/tsconfig.json scripts/live-bible-ask-probe.mts --confirm-real
```

## 结果（2026-11-18）

| 调用 | cachedTokens（provider 报回） | 模型 | answer head |
|---|---|---|---|
| 第 1 次（冷） | 0 | gpt-6.1-terra | 典籍里没有 / 《最后的签收》只提到空白收据交给下一班书记员…… |
| 第 2 次（KV 复用） | **43,354** | gpt-6.1-terra | 同上 |

第二次提问打进同一 prefix——provider 原样被报回 `cached_tokens=43354`，就是 digest（`buildDigest(BIBLE_CHAPTERS, BIBLE_ECHOES)`）的实字节在 channel 里的 KV 复用份。

**结论**：
- 问典路由的整个 digest 都是 KV 复用友好的——不是模型重现在生成，是从 provider 本地 cache reuse。
- call-1 的 0 是 channel 冷启动的必然，不能说明 cache 不生效。
- 任何人改 docs/world-bible 后必须重跑 gen:bible-snapshot + verify；改了之后新前缀会先 miss 一次，之后立马复用（同上一网关规则）。

NEXUS_LLM_STREAM=1 是事实（本机设了环境变量）；不带 stream，distributor 会另开一条非流通道，prompt cache 基本失效。
`docs/CACHE-IDENTITY.md` 记录了 v874/v876/v877/v878 的 channel-分桶研究。
