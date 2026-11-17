# §SIM-2 · 真实用户行为模拟 · 2026-11-18

依据用户原始指令「模拟真实用户的行为：真实用户可能打开一个页面没耐心就关掉，可能不知道去哪就在页面上瞎点——把这些真实行为模拟出来」，本片更新 `simulated-user-behavior` 实测快照（dev 路径）：

## 结果

- **Sessions**：10（5 个 persona × 2 次）
- **Hits**：38 次公开 GET（零 POST，不冲突真实数据）
- **成功率**：38/38 = **100%（无 5xx 发）**
- **p50 / p95 / p99**：1423 ms / 3620 ms / 4788 ms
- **首屏 `/`**：每位 persona 都 reachable

## Persona 分类

| Persona | Sessions | Hits | Errors | p50 ms | p95 ms |
|---|---|---|---|---|---|
| impatient（打开一眼就关） | 2 | 4 | 0 | 1694 | 3458 |
| rage-clicker（连续乱点） | 2 | 14 | 0 | 1302 | 3475 |
| lost-wanderer（找不到路） | 2 | 6 | 0 | 2235 | 3286 |
| deep-reader（潜心读） | 2 | 6 | 0 | 2306 | 4788 |
| bot-ish（机器指纹） | 2 | 8 | 0 | 2539 | 3209 |

## 结论

- dev path 下 5 类 persona 没有触发任何 5xx（包括 bot-ish 连续打 `/about-nexus`）；
- 这套 persona 模型（deterministic seed）可扩大：`npx tsx scripts/simulate-user-behavior.mts --sessions 60 --port 3199` 直接复用；
- 配合 `/analytics` 「参考用户」、`/admin/users`「游客回收」可作为 §9 「真实用户行为分析」的一个新入口。

## 诚实边界

- 这是 **合成** 流量，不是真实用户；
- dev path 的 p95 ≈ 3.6s 属于 Next dev 每次编译的折扣；**这不是生产能力指标**；
- 合成 persona 不计入任何真实账户/真实页面 tracer；不会混淆 DB 里真实 prefix 示例数据。
