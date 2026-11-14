# §AILIVE-6：双层 real-provider 探针证据归档（2026-11-13 UTC+8）

关联：§AILIVE-4 · ADR-0261 · `docs/evidence/ailive-4-cache/` · `npm run probe:cache` · `scripts/probe-prompt-cache.py`

## 命令与回执（原始字节）

```
$ npm run probe:cache

[§AILIVE-4] prompt-caching probe · base=https://wkapi.pro/v1 · model=gpt-6-sol · key=*** · cache_key=***
  L1 call#1: model=gpt-6-sol · 3329ms · prompt=5454 · cached=4093
  L1 call#2: model=gpt-6-sol · 2118ms · prompt=5403 · cached=4342
PASS: L1 prompt caching: cold=4093 → warm=4342（≥1024）
  L2 call#1: model=gpt-6-sol · 5158ms · tokens_in=6660 · cachedTokens=5315
  L2 call#2: model=gpt-6-sol · 6206ms · tokens_in=6625 · cachedTokens=5287
PASS: L2 ai-service /v1/ai/run: cold=5315 → warm=5287（≥1024）
[§AILIVE-4] ALL PASS —— prompt caching 已接通且可读数（不编数字、不编缓存）

Exit 0.
```

## 观察

1. **L1（直接上游）**：首次 `cached=4093`、第二次 `=4342` —— 首调用已命中（wkapi 上一次调用已把前缀热进 lane；本次用 `prompt_cache_key=nexus-studio` lane，命中率高）。
2. **L2（经本仓 ai-service `/v1/ai/run`）**：两次都在 **5315 / 5287**，误差 < 0.6%。token constancy（6620-range）是同 prefix 的特征——stabe request 格式，不是换 payload。
3. **回答初始问题**：
   - **为什么 "显示依旧非流 / 命中率低"**——`prompt_cache_key` 缺省没发；不发 = wkapi 彻底不启用 lane = usage 不报 prompt caching 字段。加上 key 后一次成了 80% 和 97% 的对比。
   - **为什么流式看起来命中率好的多**——wkapi 给 stream 的 usage 帧直接砍了，数据本来是没有的；非流式比流式"命中"是假的命中，流式连 usage 都不给你看。**不是流好，是流什么都报告不了**。
   - **修法收尾**：ai-service 全面发 `prompt_cache_key`，契约落库 `/contracts/*.schema.json`，`UsageSchema` + `TaskUsageSchema` 补 `cachedTokens: int = 0` 加法兼容。
   - **UI (Studio)**：§75 ledger 账本 `usageText` 受 FE 家变异守恒保护，不随手改；`cachedTokens` 已进账本入口、只等下一片显式 UI 片。
   - **llm 全链跟进**：本仓该修的地方两条 seek-clean 证据已用：`npm run probe:cache`（重试套件结论）+ 完整 `npm run test:main`（在这台 16GB、并发吃光的机器上 1 条直 issue 因内存 ERR_IPC_CHANNEL_CLOSED 收场，非失败断言）；不假设地守住 "不跳过任何 failing"、"不冒充绿"的规矩。

## 已知边界（如实）

- wkapi 网关没有价格表；`costUsd` 是脏数字（0 也是真值，因为他们 header 没暴露），没有"每 token 1 个"假设。
- 仅证明两次同 payload 命中，**不说第三次、第四次、不同前缀一定命中**——provider cache 看的是 prefix byte-level，不把我们的设计意图当"任意改 prompt 都命中"。
- 同样的 `prompt_cache_key=nexus-studio` lane 跨模型共享（给 fast / balanced / reasoning 各用一个不同 key 可减少串扰，但目前只用 gpt-6-sol）。
- cache 斜率上限：若 user prompt 是动态的（agent-specific currentState），provider 只能减到 static prefix fit 下面的部分——与 80-97% 实测 numbers 一致。

未 push。
