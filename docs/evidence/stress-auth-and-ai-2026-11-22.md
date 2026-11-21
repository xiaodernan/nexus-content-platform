# 压测 · ai-service 高并发 + 撞库风暴（2026-11-22 · §STRESS-1 续 / §STRESS-4）

> 用户点名「长久持续开发的同时做压力测试：模拟海量用户、高并发、瞬间大数据量冲击系统
> （比如撞库之类的场景）。测试系统的高并发、高可用、容灾能力、鲁棒性」。
> `docs/evidence` 里 §STRESS-1/2/3 量的是只读侧（pgbench / Redis Lua）；
> 这一份补**写路径与认证闸**：ai-service 的三相位 + web 登录闸的撞库风暴。

## A. ai-service 三相位（`npm run stress:ai`）

```
target=http://127.0.0.1:13200 model=none（不触发 provider）
  health 风暴:   600 发 / 并发 60 / 7.56s (79.3 rps)
                 p50=459.2ms  p95=2311.7ms  p99=3663.3ms
                 状态 {200: 600} · 网络失败 0
  畸形请求风暴:  150 发 / 并发 60 / 3.28s (45.7 rps)
                 p50=944.6ms  p95=2132.4ms  p99=2264.0ms
                 状态 {400: 150} · 网络失败 0
  恢复探活:       20 发 / 并发 4  / 0.28s (70.4 rps)
                 p50=51.1ms  p95=67.9ms  p99=77.8ms · {200: 20}
PASS
```

- 600 发健康探测 + 150 发畸形请求（空对象 / 缺必填 / 类型错 / 200 KB 超大串 / 路径样注入）
  **全部按预期收口**：200 与 400，没有一个 500，也没有一次误触 provider；
- 恢复后 p95=67.9ms，与风暴中的 2311.7ms 差 34 倍——**劣化是排队造成的，不是损伤**。

## B. 撞库风暴（`npm run stress:auth`，新脚本 `scripts/stress-auth-bruteforce.mts`）

```
target=http://localhost:3100 total=300 concurrency=30 email=bruteforce-probe+mwqueobf@nexus.test
  300 发错误口令 / 并发 30 / 21.2s (14.1 rps)
  状态 {"401":15,"429":285} · p50=1585ms p95=4093ms p99=4601ms
  ✓ 错误口令 0 次成功
  ✓ 300/300 全部被挡住
  ✓ 限流闸合上：285 发 429，retryAfterMs 879368–899148ms
  ✓ 过程里 0 个 5xx
  ✓ 风暴后 10/10 发首页正常（p50=257ms p95=332ms，风暴中 p50=1585ms）
PASS
```

- 阈值 10 次 / 15 分钟 / (IP, 邮箱)：前 15 发拿到 401（口令错），之后全部 429；
- `retryAfterMs ≈ 879–899s` 与 15 分钟窗口吻合——**这个数是本轮修出来的**（见下）；
- 风暴后首页 p50=257ms，比风暴中的 1585ms 还快：闸合上之后请求在门卫就返回，不再打认证链路。

## C. 压测自己抓到的两个真问题

1. **第一版脚本量到的是 CSRF 门，不是限流闸**：没带 `nexus_csrf` 就打登录，400 发全是 403。
   这不是"测错了"，是发现**两道门叠在一起**。改法按真实攻击者的形状来：每个 worker 先 GET
   首页拿自己的 cookie + token，再带 `x-csrf-token` 打登录——攻击者也会这么做。
2. **登录闸的 429 只回 HTTP `retry-after` 头，报文里没有 `retryAfterMs`**。
   同仓其它限流点（角色对话 / AI 按钮 / 建项目）都在 body 里给这个数，界面据此说"还要等 N 分钟"；
   登录这一处不给，等于把"还要等多久"只写给会读响应头的人——客户端与本仓的判据都读不到。
   已修：`jsonError(429, 'rate_limited', { message, retryAfterMs })`，头与 body 都留。

## 不在本文档内

- 撞库的**分布式**形状（很多 IP 打同一个邮箱）：本机单机，`clientIp` 只有一层反代；
  多实例部署下的口径见 `docs/ENVIRONMENT.md` 的 `NEXUS_TRUSTED_PROXY_COUNT`。
- 登录成功的会话保持 / 令牌轮转压力；
- provider 侧的真实并发（那要烧 token，`probe:cache-parallel` 已单独量过车道稳定性）。