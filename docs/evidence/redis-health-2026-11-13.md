# Redis(nexus-redis @ 56379) 健康读数——2026-11-13（只读审计）

关联：§SC-12（`sc12-redis-backend-live-2026-11-13.md`，同一天的网关复现） · 本脚本以 `docker exec nexus-redis redis-cli` 纯读执行。

## 读数（原始字节）

```
used_memory_human               : 2.22M
used_memory_rss_human           : 6.12M
used_memory_peak_human          : 2.41M
maxmemory                       : 0 (no eviction)
maxmemory_policy                : noeviction
DBSIZE                          : 0
```

## 解读（如实）

- **零残留**：本次会话的 `nexus:gateway:verify:*` 测试桶（两把）均已按 `PEXPIRE` 自清——`DBSIZE=0`；本机自 2026-09 起连续多片（SC-12 Lua live、§SC-56 job store、realtime Redis bus、invalidation bus）的测试没有在 nexus-redis 留下垃圾键。
- **内存余量充足**：2.22MB 已用 / 6.12MB RSS，相对 64 MiB 级的镜像开销可以忽略；`maxmemory_policy=noeviction` 对令牌桶/失效发布是对的选择（宁可少拒绝也别默认逐出没人结算的键）。
- **空库的证据价值**：证明 `PEXPIRE` 在验证路径真的兑现（§SC-12 直读 hash 也看到了 `tokens/ts` 与 2642ms PTTL），不是"日志说过期了"、而是"库里没有了"。

## 边界

- 这是**某一时刻**的读数：redis 空不代表功能没在用它（job store/realtime bus 是**短命键**设计，用完即删）；
- 没量带载峰值（本次验收没压满桶）；RDB/AOF 持久化、maxmemory、monotonic 时间源的跨机时钟漂移没测——那是 §SC-36 的边界；
- 真实多实例共享桶的竞争序列（ADR-0095 §SC-12 双实例见证）是"为什么 429 序列166 不冒充多机证据"的原因。
