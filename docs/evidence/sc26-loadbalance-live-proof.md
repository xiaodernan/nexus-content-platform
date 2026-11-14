# SC-26 — LoadBalancer 体征：一个 service id，两个实例，一扇门（2026-11-10）

前五片证明了拓扑能跑、config 能送属性、权限能拒。但"两个实例同时注册进同一个 id、
网关 `lb://` 真的在它们之间选"从来没被测量过。这一片把它变成一条命令：`npm run verify:lb`。

## 布置

```
registry :8773 → domain-service :8085 (PORT=8085, NEXUS_DOMAIN_REGISTER=true)
             → domain-service :8086 (PORT=8086, 同上，同一个 service id)
             → gateway        :8092 (/domain/** → lb://nexus-domain-service)
```

## 实跑读数（全部经 `npm run verify:lb`，zero human hands）

```
eureka is answering
domain-a is healthy on :8085
domain-b is healthy on :8086
eureka holds both domain instances (A and B)
gateway is answering
discovery shows 2 distinct instances (http://192.168.1.5:8085, http://192.168.1.5:8086)
both instances probed UP (allUp=true)
10/10 sequential requests through /domain/** answered 200
[verify-lb] stopped registry / domain-a / domain-b / gateway
[verify-lb] PASS — one service id, two instances, one gateway, all measured
```

三条判据互相独立：registry 里**两个实例**都 UP（`<status>UP</status>` ×2，端口各自可见）；
`/platform/services` 把它们列为**同一个 service id 下 2 个不同地址**（不是两个 id）；
`/platform/health` 各探一次**都是 UP、allUp=true**。十连发 200 是走门而不是直连——
`lb://` 每一次都真的解析了一次发现。

## 如实的边界

- **不测 failover/eviction**：eureka lease 最长 90s + gateway LB 缓存自己的时钟，杀掉一个实例后的
  "请求还能通"是一次超时，不是一个性质——不写进断言，免得把 flaky 包装成结论。
- LB 轮询策略本身（round-robin）没有断言它"请求 A/B 交替"——policy 端点是幂等的，
  无法从响应里看出被谁服务了（响应体刻意不携带实例 id；带了就是把部署细节泄进契约）。
- 两个实例共享同一个 `nexus` 库、都只读（policy/permission/plan 全只读，ledger 只有 web 层写）——
  并发读不产生脏写风险。
- `:8092` 这一组端口（8773/8085/8086/8092）避开 `:8090/8091/8771`——本机已有外部进程占 8090，
  verify:topology 占 8091；脚本全部 env 可覆盖。
- CI 已追加同名的一步（main-line.yml `topology` job）——**CI 仍未被 push 实跑过**。
