# ADR-0095：anon 发现页缓存的语义契约要被钉死，两驱的别名差异要被说出来

- 状态：已接受（2026-11-11）
- 相关：`docs/adr/0094-...`（同一族纪律：散落在注释里的承诺必须有门去读它声称的那件事）；
  `apps/web/src/server/cache/discoverRouteCache.ts`、`discoverRedis.ts`、`apps/web/test/discover-redis.integration.test.ts`、
  `apps/web/test/ttl-lru.test.ts`

## 背景

`/api/discover` 的 anon 路（`route.ts` 里 `!viewer` 分支）走一个 15 秒窗口的缓存
（`cachedDiscoverAnonymous`），`publish` 与 `moderation` 两条写路径各自调 `invalidateDiscoverRoute()`
把它清掉。三层各有测试，但**中间那层没人测**：

- `discover-redis.integration.test.ts` 测的是**驱动**（跨进程共享一份、`SET PX` 有界 TTL、连不上报
  `redis-unavailable` 而不是静默退回内存）；
- `ttl-lru.test.ts` 测的是**数据结构**（有界、到期删除、`liveSize` 反映过期）；
- 夹在中间的 `discoverRouteCache.ts`——"命中就不再算、出错不把错误记住、不同 sort 各算各的、
  一 invalidate 就重算、带 viewer 的私人答案绝不进这个键"——只是顶部注释里的**承诺**，没有任何门
  去读它。这几条恰好是缓存最容易静默出错的地方：一个"把 reject 写进缓存"的实现会让整条路在 15 秒
  内对每个人都 500；一个漏接 invalidation 的写路径会让新发布的内容 15 秒内不出现。

## 决定

1. 新门 `apps/web/test/discover-route-cache.test.ts`，用**内存驱动**（不设 `NEXUS_REDIS_URL`，零外部
   依赖）把那层语义确定性地钉死：① 未命中才算一次、窗口内命中不再调 `compute`；② `compute` 抛错
   原样 reject、且失败不被记住（换一个会成功的 `compute` 下一次真重算）；③ 不同 `sort` 各占一格，
   `new` 的结果不会被 `popular` 读到；④ `invalidateDiscoverRoute()` 真的清窗口，失效后必须重算；
   ⑤ 一条**静态门**钉住 `route.ts`：只有 `!viewer` 分支包住 `cachedDiscoverAnonymous`，登录分支直接
   `discover({ sort, viewerId: viewer.id })`，且全文件只有那一处调用缓存——私人答案不会从别处漏进公共键。
   纯内存、不连库、不改源码，低内存共享宿主也跑得动。
2. **有意不为两个驱动的对象隔离语义定门**（见下「仍欠」）：定任何一边都会惩罚将来统一两驱的正当修复。

## 实测读数

- `discover-route-cache.test.ts` **5/5**（命中计次 · 出错不缓存 · sort 隔离 · invalidate 重算 · route
  静态 viewer 隔离）；`npx tsc -p apps/web/tsconfig.json --noEmit` **exit 0**；
  `npx eslint apps/web/test/discover-route-cache.test.ts` **exit 0**。

## 仍欠（如实记）：两驱在"取出的对象是不是别名"上语义不同

写门时实测到一个真差异，值得说出来而不是藏起来或顺手改掉：

- `MemoryDiscoverCache.set/get` 把 `DiscoverResult` 对象**按引用**存进 `TtlLru` 再原样取出；
  `RedisDiscoverCache.set/get` 走 `JSON.stringify` / `JSON.parse`，取出来是**值拷贝**。于是"一个调用方
  mutate 了缓存结果，会不会污染下一位读者"在两驱下答案相反——这与 `discoverRedis.ts` 开头
  "进程内与 Redis 两个驱动，同一条契约"那句话并不完全一致。
- **当前不可观测、不可利用**：唯一调用方 `route.ts` 拿到结果立刻 `NextResponse.json(result)`，
  从不 mutate；单进程内存驱动里也没有第二个读者会改它。所以这不是一条要马上修的事故。
- **为什么不定门**：钉"引用隔离"会与当前内存实现相反（门直接红），钉"引用共享"则把当前实现的
  **别名语义固化成保证**——将来谁把两驱统一成值拷贝（一次合理的修复）就会把门改红。这与 ADR-0094
  的 X4 反向对照立下的纪律冲突：门不许惩罚正当改动。故这里**只记录、不定门**。
- 若将来出现会加工 `DiscoverResult` 的新调用方，或有人做"两驱统一"的那一笔，应同时决定对象隔离
  语义（推荐两驱都返回值拷贝，让"同一条契约"在这条上也成立），并**在那时**重新评估是否需要门。
  本片不替那个决定做主，也不用一个耦合实现的断言把它提前锁死。
