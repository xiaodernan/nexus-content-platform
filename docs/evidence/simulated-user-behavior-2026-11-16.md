# 真实用户行为 *模拟*（合成流量，20 会话 × 5 画像，2026-11-16）

> 方法（§159 明示）：这是**合成**的行为模拟——deterministic seed (LCG)，以本机 dev server 为目标，以脚本的假设画像作随机行走；
> **不是**对真实访客的观测数据。真实口径看 /insight（库里聚合的真数）。
> 做「真实用户仿佛会怎么做」这件事只能降低与你想象的差距，不能给出访客的真实心理。

## 目标

`/` → 链接入口离线公共路由（未登录、无 /api/、无 auth 页面）：`impatient`（2 步开火就关）、`rage-clicker`（/ → 3–6 次连点随机链接）、
`lost-wanderer`（/ → /discover → 再一站 → 回 / → 关）、`deep-reader`（/guide +18s → /map）、`bot-ish`（/about-nexus 三连）。

第 1 次运行（服务器冷/warm 交接期）返回 27 / 76 错误（连接被拒或裸 404，dev 冷编译路径）。第 2、3 次（编译缓存 warm）结果：

| 指标 | 数值 |
|---|---|
| 会话 / 命中 | 20 / 76（76/76 = 100% 2xx，0 错误） |
| 端到端延迟 p50 | 764 ms |
| p95 | 1380 ms |
| p99 / max | 1633 ms |

| 画像 | 会话 | 命中 | 错误 | p50 | p95 |
|---|---|---|---|---|---|
| impatient | 4 | 8 | 0 | 1045 ms | 1113 ms |
| rage-clicker | 4 | 28 | 0 | 741 ms | 1014 ms |
| lost-wanderer | 4 | 12 | 0 | 1229 ms | 1453 ms |
| deep-reader | 4 | 12 | 0 | 676 ms | 1017 ms |
| bot-ish | 4 | 16 | 0 | 600 ms | 1633 ms |

## 诚实的结论（什么时候有什么用）

1. **公共路由在 dev warm 状态下全部 2xx**——没有任何一条公共路由在这类流量下崩溃（不包括 Cold compile blocked 的 Turbopack）。冷编译本机 **§159 诚实结论**依然成立（见 `load-web-ssr-2026-11-16.md`）。
2. **proxy 模拟不对话「登录壁垒」之后**：/insight、/admin、/studio 全都未被打，更不存在绕过授权的尾巴。
3. **rage-clicker 表明：公共路由对外不是一个脆弱的**——任何一次乱点都不会把服务器打死；而体验落点仍是画布的 UX（用户抱怨），不是服务器。这与 load-web-ssr-2026-11-16 的 p95 直接拼接。
4. 这次只跑到 20 个会话；想要逼近真实落锁效果，就要用真实生产部署 + 真实访客（用户侧可以接受的前提下）。合成永远不是证明。
5. 证据需要可复现：`npm run simulate:behavior -- --sessions 20 --port 3199`，输出 `docs/evidence/simulated-user-behavior-2026-11-16.json`，JSON 内含 sessions_plan/done、hits、ok/errors、按画像的 p50/p95 + 实数 `errorHits` 列表，数字脚本对白写着「synthetic, seeded, dev」。
