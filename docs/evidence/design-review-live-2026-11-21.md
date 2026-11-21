# §GRAPH-3 自查环真实 provider 实测（2026-11-21）

真调用，不是 mock：`POST http://127.0.0.1:3200/v1/ai/run`，body 取
`contracts/fixtures/ai-request-with-index.json`，仅改 `requestId` / `dryRun:true` / `review`。

| review | HTTP | capability | activities | toolCalls | tokensIn | cachedTokens | latencyMs |
|---|---:|---|---|---:|---:|---:|---:|
| `false` | 200 | real | `[provider]` | 1 | 345,515 | 0 | 7,812 |
| `true` | 200 | real | `[provider, review]` | 2 | 350,507 | 345,515 | 2,219 |

## 读数口径

- **开关真的接线**：勾上 `review` 多打一次 provider，`activities` 多一个 `review` 阶段，`toolCalls` 1→2；不是画了个勾。
- **token 记账没有说谎**：两轮的 tokensIn 是**累计**的（345,515 → 350,507），review 那一轮复用同一段稳定前缀，cachedTokens=345,515、第二次 latency 反而降到 2,219ms——这正是"自查多花钱但前缀免费复用"的预期形状。
- **model 名是用户指定的当前值**：两轮都 `gpt-6.2-sol`，capability=real，demoMode=false。
- `dryRun:true` 只压补丁落库，不影响审稿链是否执行；审稿修订环的 4 臂行为另由 `tests/test_design_review_graph.py`（23/23）覆盖。

复现脚本：`.scratch/review-e2e.mjs`。已消费的真 provider token 如实计入两轮 usage。
