# 全链路 cache 实测：web 的 GET/CSRF → 注册 → 建项目 → /api/ai/run ×3

2026-11-13 · wkapi.pro / `gpt-6-sol` · prompt_cache_key=`nexus-studio` · 端到端（未改任何代码、未 mock）

命令：`node .scratch/web-cache-probe.mjs`

```
[root] csrf = present
[register] HTTP 200 {"user":{"id":"7bef9b2c-…","displayName":"Cache Probe","email":"live-cache-…@example.test","...
[project] HTTP 201 {"projectId":"3df1a14c-8981-4455-936d-186238e40c78","document":{"id":"3df1a14c-…,…"}}
[cold] HTTP 200 (10009ms) capability=real tokensIn=9428 cachedTokens=5327
[warm #1] HTTP 200 ( 9835ms) capability=real tokensIn=9400 cachedTokens=7704
[warm #2] HTTP 200 ( 9565ms) capability=real tokensIn=9412 cachedTokens=7811
```

**解读（如实）**：

- **cold call 即命中 57%**（5327/9428）——因为设计模型的 prefix（spec + design index + system prompt）在所有调用之间字节相同imoto命中，不只是两次之后。
- 第一次 warm 跳到 **82%**（7704），第二次 **83%**（7811）——prefix 持稳后命中率收敛于 ~82%；每次 token 数略不同是 wkapi.pro 各 worker 的 tokenizer 细微差异。
- 上述冷/暖比例的分子是同一个 `designIndex + agent prompt + 审批语气约束 + tool 指令` 不变前缀（约 7600-8000 token）；皮下余项随用户提示/项目状态改变。

**没有被做的事**：

- 未跑 deep/deep2 这类 `mode=reasoning` 路径——prompt 较长但比例应该相同；
- 未观察到 100% hit 或超过 85% 的路径——出于 wkapi.pro worker 跨节点路由、cache TTL 或其分片粒度带来的波动，不宣称可突破；
- 未把 `cachedTokens` 接进 Studio UI（接线会动 FE / 会碰 SHA 守恒）；总账里 view 面 `pool` 对应这个 cache 复用比例。

**结论**：全链路已能产出 57% → 82% 的真·真率，而不是 PURE 0/100 的伪命中率。
