# App-chain 缓存命中的实况取证（2026-11-18 · §AILIVE-5）

> 目的：直接证明「同一调用在应用通道上连打两次，第二次起缓存命中」并且**瞭解五万–九万这个量级来自哪一拨 token**。

## 操作

1. 注册临时账号：`live-cache-{ts}@example.test`
2. 建临时项目（website 类型）
3. 连续三次 `POST /api/ai/run`（prompt **字节级一致**）
4. 读 provider 报回的 `usage.cachedTokens + tokensIn`

命令行：

```
npx tsx --tsconfig apps/web/tsconfig.json scripts/live-cache-probe.mts --confirm-real
```

## 结果（2026-11-18T18:57）

```
call-1:  tokensIn=8895  cachedTokens=0
call-2:  tokensIn=8895  cachedTokens=8895
call-3:  tokensIn=8895  cachedTokens=8895
```

**call-2 / call-3 = 100% 命中。**

## 理解现象

- provider 的缓存是**渠道本地缓存**（Distributor-per-channel，见 `docs/CACHE-IDENTITY.md`）—— 每个渠道都有它自己的缓存桶，sticky `prompt_cache_key` 把同一 workload 钉到同一渠道，所以一旦冷启动被钉到某个渠道，之后就一直命中。
- 首调用 0：渠道从未见过这一拨前缀，必须先跑一遍才能落盘命中。
- call-2+ 8895/8895：system 常量字节逐位不變 → sticky key 不变 → 命中。
- 用户看到的「命中率忽高忽低」= 渠道本地有限度：并行 100% 相同 prompt 落到**不同**渠道，每个桶冷一次（见 v874/§PROVED-16/v876/§PROVED-17）。

## 为什么我们的 input 看起来不够大

日常探针用的 prompt 只有一句话——实际使用时整个 system 前缀 + 任务交付文档可以稳定到几万到九万。

- 本探针的 8,895 tokens 多数来自 `SYSTEM_PROMPT`（约 30k 字节）+ 名册 + 任务自述。
- 要让一次调用到五万以上杠杆，需要把整个 canon（v1 26 回响 digest，约 120KB）塞进去。

`apps/web/src/lib/bibleAsk.ts` 里的 SYSTEM_PROMPT ≈ 5–6 万字节（buildDigest 产物 ≈ 29 千字符）。一次 `/bible/ask` 调用就是一个天然的大上下文场景——从实际使用看已符合用户关注点。

## 诚实边界

- 不做超出本次三次探测之外的任何「缓存率」承诺（不伪造数据）。
- 只要渠道没被 distributor 挑走，缓存会一直命中——distrabutor 内部节点不透明（v877 的文档记载 10 路并发分到两条渠道各自命中）。
- 稳定的最佳做法仍然是流式（`stream: true`）+ 恒定 system 内容 + sticky fingerprint；这三项本项目都已落地（`NEXUS_LLM_STREAM=1`）。
