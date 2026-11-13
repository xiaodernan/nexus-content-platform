/**
 * `/api/discover` 的 anon 路有界缓存。
 *
 * 只服务 anon 调用——看这几十行就懂：`/api/discover` 只是把 `discover()` 摊成 JSON，
 * 而 `discover()` 每次调用要算三件事：读 follow-edges（仅 following feed），读所有 public +
 * moderation + 屏蔽过滤的连接，再每行算三条 count(*) 子查询。同 sort、同 limit
 * 的答案，15 秒内一字不差。
 *
 * **为什么 15 秒**：发现页读者点进去之后，已经走到那张真实的 path 上；这条缓存只改
 * "下次 /api/discover?sort=new 的人"看到的头部 ≤60 条，不会把谁一直挡在已经消逝的内容
 * 之外——超过 15 秒就重新算，没有人能在 256 次展示里看到陈旧数据。
 *
 * **运行驱动**：单进程开发/测试 → `MemoryDiscoverCache`（与 Redis 同形状）；
 * 设 `NEXUS_REDIS_URL` → `RedisDiscoverCache`（按 sort 共享同一份窗口，实例之间零重复）。
 *
 * **不缓存的三条**——明说在这里：
 * - 带 viewerId（following feed 是按人照做的）；
 * - 出错（抛什么都不缓存，错误保持第一现场）；
 * - 未经调用方拆包的 rejection（写入缓存里会记着谁，没人知道——所以不）。
 *
 * 接受的界：缓存命中时各计各的——"51 秒前谁改了一笔计数"这个粒度，对任何读都不是可见差异。
 * 跨实例一致性由 Redis 侧 TTL 兜底，不由强一致事务兜底（强一致要分布式信号量才难吃下）。
 *
 * **single-flight（窗口边界的惊群防护）**：15s 窗口过期的那一瞬，N 个并发 anon 请求会同时 miss，
 * 若无防护就各自跑一遍 `discover()`（每行三条 count(*) 子查询）——发现页是全站最热只读路径，
 * 窗口边界 × 并发必然打出数据库尖峰。这里把同一 sort 的并发 compute 压成**一次飞行**，众人共享
 * 那一个 promise。关键细节：飞行必须在第一次 `await` **之前**同步登记进表，否则两个并发会各自开算；
 * 失败要清表（否则下一位 join 一个已 rejected 的旧 promise）；跨进程重复仍由 Redis 共享窗口挡，
 * single-flight 只管本进程这一瞬——两层不重叠。
 *
 * **generation（失效与飞行的竞态）**：publish / moderation 写路径 `invalidateDiscoverRoute()` 时，
 * 可能正有一笔"失效前开算、失效后才落地"的旧计算在飞。若它照常 `set`，就会把刚清掉的窗口填回旧内容，
 * "新发布 15s 内可见"的承诺被绕过。故每次失效 bump 一个 generation；飞行落地时若 generation 已变，
 * 则**不写回**（那份请求仍拿到自己的结果，不凭空失败），并清掉该 sort 的飞行表，让失效后的新请求
 * 另起一次 compute、而不是搭旧快照的车。
 *
 * **跨实例失效（v670，ADR 0102）**：上面那道 generation guard 是 **process-local** 的——它只比较
 * 本实例的代号。多实例部署里，Redis 键跨实例共享，代号不共享：实例 B 在 generation=G 开算，实例
 * A 上 publish 只 bump 了 A 自己的代号并 `DEL` 共享键，B 的旧飞行落地时代号仍是 G，照常把 stale
 * 结果 `SET` 回**共享**键，旧内容"复活"。修法：写路径失效时额外经 `discoverInvalidation` 广播一条
 * 帧（`RedisInvalidationBus`，专用频道）；每个实例订阅后执行**同一套**本地失效（bump + 清飞行表 +
 * 清 cache 驱动）。于是 B 的代号也变成 G+1，它的旧飞行落地时自我判定过期、不写回。两道防线合起来
 * 才闭合：generation guard 挡本实例的迟到飞行，pub/sub 让别机的代号也跟上。详见 ADR 0102。
 */
import type { DiscoverResult, DiscoverSort } from '@/server/domain/social';
import { getDiscoverCache, type DiscoverCache } from './discoverRedis';
import {
  getDiscoverInvalidationBus,
  __resetDiscoverInvalidationBusForTests,
  type DiscoverInvalidationBus,
} from './discoverInvalidation';

/**
 * 一整条 route-cache 运行时的形状：飞行表 + 代号 + 共享缓存驱动 + 失效总线，全是可注入的。
 * 生产用 `getDiscoverCache()` / `getDiscoverInvalidationBus()` 这两个进程级单例；
 * 行为门注入**共享同一份 cache、但各自独立代号与飞行表**的两份 runtime，来确定性地复现
 * "A 失效、B 旧飞行仍写回共享键"的跨实例竞态——不连库、不起真 Redis、共享宿主也跑得动。
 */
export interface DiscoverRouteCacheDeps {
  /**
   * **lazy** 取驱动，不捕获实例：现有测试的 beforeEach 会 `__resetDiscoverCacheDriverForTests()` 重建
   * 驱动单例而不动本 runtime，若这里在构造时抓死一个实例，第二份测试就会读到第一份的残留内容而串味。
   * 生产路径每次调用现取进程级 lazy 单例（等价于重构前每次 `getDiscoverCache()`）。
   */
  cache: () => DiscoverCache;
  /** 总线是订阅的落点，构造时定下并订阅一次；退订由 `dispose()` 负责。 */
  bus: DiscoverInvalidationBus;
}

export interface DiscoverRouteCacheRuntime {
  cachedDiscoverAnonymous(sort: DiscoverSort, compute: () => Promise<DiscoverResult>): Promise<DiscoverResult>;
  invalidateDiscoverRoute(): Promise<void>;
  /** 只读诊断：代号现值/飞行表大小，行为门据此断言"B 的代号确实被别机广播 bump 了"。 */
  snapshot(): { generation: number; inFlight: number };
  /** 退订失效总线；测试收摊用，幂等。 */
  dispose(): void;
}

/**
 * 造一份独立的 route-cache 运行时。构造即订阅总线的别机失效：收到就执行和本地失效**同款**的动作
 * （bump + 清飞行表 + 清缓存驱动），但**不再 publish**——否则会回环成失效风暴。
 */
export function createDiscoverRouteCacheRuntime(deps: DiscoverRouteCacheDeps): DiscoverRouteCacheRuntime {
  const inFlight = new Map<DiscoverSort, Promise<DiscoverResult>>();
  let generation = 0;

  /** 本地失效的同步那一半：代号 bump 与飞行表清空。必须在 publish 之前同步发生。 */
  const bumpLocal = (): void => {
    generation += 1;
    inFlight.clear();
  };

  const unsubscribe = deps.bus.subscribe(() => {
    // 别机失效：清自己的飞行表 + 清共享缓存驱动。不 publish（防回环）。
    bumpLocal();
    void deps.cache().clear();
  });

  return {
    async cachedDiscoverAnonymous(sort, compute) {
      const cache = deps.cache();
      const hit = await cache.get(sort);
      if (hit) return hit;

      // 命中失败后，先看有没有同 sort 的飞行在途——有就 join，绝不再开一次 Discover 计算。
      const existing = inFlight.get(sort);
      if (existing) return existing;

      const startedAt = generation;
      // 只摘掉自己这一程：失效后可能已有新飞行登记在同一 sort 下，无条件 delete 会误删新人。
      const release = () => {
        if (inFlight.get(sort) === flight) inFlight.delete(sort);
      };
      // compute → 若窗口未被失效则写回 → 无论成败都摘掉自己。
      // 用 .then(ok, err) 而非 finally：rejection 也清理，且不吞掉原始结果 / 错误。
      // await 写回：调用方拿到结果时缓存已落地（"命中不再算"这条才确定性成立）；驱动侧本就吞错。
      const flight = compute().then(
        async (fresh) => {
          if (generation === startedAt) await cache.set(sort, fresh);
          release();
          return fresh;
        },
        (error: unknown) => {
          // 失败清表：下一位请求必须能真正重算，而不是 join 一个已 rejected 的旧 promise。
          release();
          throw error;
        },
      );

      // 必须在任何后续 await 之前同步登记——这是"并发只算一次"成立的前提。
      inFlight.set(sort, flight);
      return flight;
    },

    async invalidateDiscoverRoute() {
      // 先 bump 让在途旧飞行落地时立刻自我判定过期（clear 是异步的，窗口关闭必须对它们即时可见），
      // 同步清飞行表后 publish；本地缓存驱动的 clear 与广播谁先谁后都不影响正确性——
      // 别机收到帧后会自己再 clear 一遍共享驱动，两处都清才关闭"旧内容复活"的缝。
      // publish 永不抛/永不 reject：连不上线路只记账，写业务请求照常返回（一致性由 15s TTL 兜底）。
      bumpLocal();
      deps.bus.publish();
      await deps.cache().clear();
    },

    snapshot() {
      return { generation, inFlight: inFlight.size };
    },

    dispose() {
      unsubscribe();
    },
  };
}

/** 生产单例：进程级一份，绑定两个 lazy 驱动（env 在首次调用时读取）。 */
let defaultRuntime: DiscoverRouteCacheRuntime | null = null;
function getDefaultRuntime(): DiscoverRouteCacheRuntime {
  if (!defaultRuntime) {
    defaultRuntime = createDiscoverRouteCacheRuntime({
      cache: getDiscoverCache,
      bus: getDiscoverInvalidationBus(),
    });
  }
  return defaultRuntime;
}

export async function cachedDiscoverAnonymous(
  sort: DiscoverSort,
  compute: () => Promise<DiscoverResult>,
): Promise<DiscoverResult> {
  return getDefaultRuntime().cachedDiscoverAnonymous(sort, compute);
}

/** The two public write paths (publish + moderation verdict) call this to drain the route's 15s window. */
export async function invalidateDiscoverRoute(): Promise<void> {
  return getDefaultRuntime().invalidateDiscoverRoute();
}

/** Test-only seam：退订总线并丢弃进程级单例，让下一轮测试按当前 env 重新装配。 */
export function __resetDiscoverRouteCacheForTests(): void {
  defaultRuntime?.dispose();
  defaultRuntime = null;
  __resetDiscoverInvalidationBusForTests();
}

/**
 * `/api/discover` 应答的 HTTP 缓存契约（§ 计网 × 前后端协同）。
 *
 * 放在这一层、和上面那个 15s 服务端窗口同一个模块，不是随手：这两条头各自护着一件这里发生的事——
 *
 * - `Vary: Cookie`。同一个 URL（`?sort=new`）对 anon 与登录用户返回**不同内容**：登录分支按
 *   `nexus_session` 算出 following feed 与屏蔽过滤。不声明 Cookie 参与缓存键，任何中间缓存
 *   （浏览器 / CDN / 反代）都可能把一个用户的私人结果发给另一个人，或把 anon 结果端给登录者。
 *   今天写着 no-store 所以"暂时没人存"，但漏掉 Vary 正是"现在没事、以后加缓存就出事"那类欠账
 *   （§188 对 Accept-Encoding 立过的同一纪律，这里落到更危险的 cookie 维度）。
 * - `cache-control: no-store`。`invalidateDiscoverRoute()` 只清**服务端**这一层窗口；它清不了浏览器或
 *   CDN。下游若再存一层，新发布/过审内容要等那个下游自己过期才出现，"15s 内可见"的承诺被绕过、
 *   且最坏翻倍。所以下游一律不存，重复 DB 查询由服务端那层 15s 缓存挡住——两层各管一段，不重叠。
 *   登录分支额外标 `private`：这份结果属于单个用户，即使将来有人误把 no-store 放宽成短缓存，
 *   private 仍挡住共享缓存碰它。
 *
 * 返回值是纯数据，`route.ts` 两分支都用它（不手抄头字符串），门钉它不许声称可被共享缓存存储。
 */
export function discoverResponseHeaders(authenticated: boolean): Record<string, string> {
  return {
    vary: 'Cookie',
    'cache-control': authenticated ? 'private, no-store' : 'no-store',
  };
}
