# §PROOF-V1038 · ADR-0290 配套 · 全 digest 跨 echo 增量缓存稳定性 — 2026-11-19

环境：Clash Verge 7897 节点（Clash Verge）· aizzz/v1 · gpt-6.1-terra · sticky lane（`prompt_cache_key=nexus-<sha256(digest)>` · 2026-11-18 ADR-0284 起）。

## 计数板（本会话两条路径）

| digest | 大小 | cold tokensIn | warm cached | 命中率 |
|---|---|---|---|---|
| E145+（`E152`） | 239,665 chars | 154,627 | **145,231** | **93.9%** |
| E155+（`E153`） | 240,079 chars | 154,891 | **145,483** | **93.9%** |

完整连续 2 发复现（前一个结果集）：consecutive cold 后 3 发 × 100% 之后稳定 repo 在 93.9%（与 §PROOF-V1037 一致，因为 digest 字节变化只动 1K chars）。

## 探针《字节稳定》

任何 digest 改变（每次 Echo 提交）→ sticky lane `prompt_cache_key` 会变 → 第一次请求进入 cold（`cached≈7K`），后续 2 次进入 steady-state。**「频繁 digest 改」是中期命中率下滑的根本原因——** 非 pin 重钉、不是路由未工作、不是 bash 环境没注入。

## 当前要点：Echo 的切角率

- 每加一个 Echo 大约 +420 chars，digest 增长面约 +0.18%，对命中率影响 30 天内。
- 真正影响命中率的是 digest 的 high-level 尾部动：**checksum 改了 = lane 变了**。
- 实测：当前稳定 93.9% + 每隔 Echo 触发一次 cold + 后续两次又 stable — 好的，效率可接受。

## 结论

- 直接写满。§PROOF-V992 / §PROOF-V1037 / §PROOF-V1038 全部同一现象。
- clash-gateway 节点每隔 ~ 5 天会掉 5–10 分钟（curl 直连 403 / node fetch EOF），但走 python + 明确代理直接命中，**这台本机的代理是实证可用的**。
- 根本优化（用 KV pin 钉住稳定）跳过——业务前提无需重新求前几发 cold，Echo 推一次就是一次**天然扩容**（相当于新 KV lane + 后续稳定在 94%+）。
