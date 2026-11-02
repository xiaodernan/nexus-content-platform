import { Redis } from 'ioredis';
import { increment } from '../observability';
import type { RateLimitDecision, RateLimiter } from './rateLimit';
import { MemoryRateLimiter } from './rateLimitMemory';

/**
 * 跨实例的限流闸（§64「后端可替换」欠的那一格，也是 `rateLimit.ts` 顶部那段注释里
 * 唯一还没兑现的提议）。取舍与后果见 `docs/adr/0076-rate-limit-redis-sliding-window.md`。
 *
 * 形状没变（还是 `RateLimiter` 那两个方法），变的只有"窗口存在哪儿"：
 * 进程内驱动把窗口存在自己那台进程的 `Map` 里，**每个实例各数各的**——
 * 两个实例部署下，`10 次/15 分钟/邮箱` 实际是 20 次，`6 次/10 分钟/审核员` 是 12 次，
 * 而且没人会说这句话错了。这一版把窗口挪到 Redis 的一条有序集上，所有实例看同一份数。
 *
 * 为什么接口必须是异步的（`RateLimiter.hit` 回 `Promise`）：一次网络往返要有地方等它。
 * 那是上一片先把 44 个调用点改成 `await` 的全部理由，这一片才开始往这个缝里填东西。
 *
 * 失败时的取向与实时总线**相反**，这里是故意的：
 * `realtime/bus.ts` 明确"不在连接失败时悄悄退回进程内"，因为那条线路坏了的表现是
 * 收不到推送，而它宁可让运维看得见地坏；这里的闸退回进程内之后**还在挡东西**（挡得住
 * 单机暴力破解，挡不住跨实例分摊），业务照常跑。所以这里的退回是对的——
 * 但必须说出来：`nexus_rate_limit_driver_fallbacks_total` 与一行限流日志就是这句话的
 * 全部可观测形式。一个不吭声的退回等于把"多实例共享计数"这句话悄悄改成"看运气"。
 */

/** 与 `realtime/redisBus.ts` 读的是同一个变量：一个旋钮管两台子系统，别各设各的。 */
export const REDIS_URL_ENV = 'NEXUS_REDIS_URL';
/**
 * 键前缀带版本段：换窗口算法（比如从有序集改成令牌桶）时旧格式的键不会被新代码误读——
 * 有序集和字符串的 `ZCARD`/`GET` 会当场报错而不是给出一个看着合理的数。
 */
export const DEFAULT_KEY_PREFIX = 'nexus:ratelimit:v1:';
/**
 * 单条命令的等待上限。挑 250ms 的理由不是"Redis 应该这么快"，是"这一格排在每个
 * 写请求前面"：登录、建项目、审核操作都要过它，一次 Redis 卡顿不该比它挡住的那次滥用
 * 更贵。连不上时 `enableOfflineQueue:false` 已经让命令当场失败，这个上限管的是
 * "连上了但答不上来"那一档。
 *
 * 超时**不等于没执行**：脚本可能已经在服务端跑完了，只是回执没赶上。于是这一条请求
 * 在 Redis 里记了一次、又在进程内驱动里记了一次。两个数各多算一点，
 * 方向是**更严不是更松**——限流闸宁可往这个方向错。
 */
const COMMAND_TIMEOUT_MS = 250;

export interface RedisRateLimiterOptions {
  url: string;
  /** 测试用命名空间（同一个 Redis 上别人的窗口不该被我 `reset()` 清掉）；默认见 `DEFAULT_KEY_PREFIX` */
  keyPrefix?: string;
  /** 这台实例的身份，用于给每条命中一个不重复的成员名。默认 `pid:启动时刻:随机段` */
  origin?: string;
}

/**
 * 一条命中在有序集里的名字必须**每次都不同**，这是这一版最容易写错的地方：
 * `ZADD` 对同一个成员是"改分数"而不是"加一条"，所以如果成员名取 `Date.now()`，
 * 同一毫秒里的 N 条请求在集合里永远只占一格——`ZCARD` 恒等于 1，
 * 一台机器上的脚本请求能把整道闸当成没装。所以成员名是"实例身份 + 本机单调序号"：
 * 跨实例不同（身份不同），同实例同毫秒也不同（序号递增）。
 */
let seq = 0;
function defaultOrigin(): string {
  return `${process.pid}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 滑动窗口的判定，一次往返做完。
 *
 * 为什么是 Lua 而不是四条命令：`ZCARD` 与 `ZADD` 之间必须没有别人插进来。
 * 分成两条命令时，两个并发请求能同时读到"窗口里还差一名"，于是同时挤进去——
 * 上限被并发突破，而那正是这道闸要挡的东西。Redis 单线程执行脚本，脚本内部天然原子。
 *
 * 为什么自己删过期条目（`ZREMRANGEBYSCORE`）而不靠 TTL：TTL 只能给整个键设一个值，
 * 而滑动窗口需要"逐个成员按自己的时间淘汰"。`PEXPIRE` 在这里只负责一件事——
 * 长时间没人打的键别永久赖在库里。（进程内那一版原来连这一格都没有，桶只增不减；
 * 现在它有自己的清扫与上界，见 `rateLimitMemory.ts` 的"这张表能有多少只桶"。）
 *
 * `PEXPIRE` 必须排在 `ZADD` **后面**：对一个还不存在的键，`PEXPIRE` 返回 0 什么都不做，
 * 而且不报错。放在 `ZCARD` 之前写的那一版，第一次命中建不出 TTL——而"只来过一次"的
 * (路由, 身份, IP) 组合恰恰是绝大多数桶，于是每个都留下一只永久的有序集，
 * 键空间随流量单调涨。这一格是 `键的寿命` 那条用例在 2026-10-31 抓出来的，
 * 不是设计时想到的。
 *
 * 时间取 `redis.call('TIME')`（服务端时钟）而不是客户端 `Date.now()`：多台机器的时钟
 * 不齐时，各自的 `now` 会让同一个窗口在不同机器上算出不同的边界，快那台的写入会被慢那台
 * 当成"未来的命中"（`ZREMRANGEBYSCORE` 删不掉它，因为它分数比别人的 now 还大）。
 * 一份权威时钟只有一个来源才对。
 *
 * 语义与进程内驱动逐条对齐（`rateLimitMemory.ts`）：被挡下的那一次**不写进窗口**，
 * 否则"一直撞上限"会比"一直干活"涨得更快，限流就成了加速自锁。
 * 返回 `[放行 0/1, 窗口内条数, retryAfterMs]`。
 */
const SLIDING_WINDOW_LUA = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local windowMs = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - windowMs)
local count = tonumber(redis.call('ZCARD', KEYS[1]))
if count < limit then
  redis.call('ZADD', KEYS[1], now, ARGV[3])
  -- 紧跟 ZADD：这一刻键一定存在，TTL 就是"最后一次记录的命中 + 窗口"，
  -- 也正是窗口里最新那条成员自己到期的时刻——键不会比它记着的东西多活一秒。
  redis.call('PEXPIRE', KEYS[1], windowMs)
  return { 1, count + 1, 0 }
end
local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
local retry = 0
if oldest[2] then
  retry = tonumber(oldest[2]) + windowMs - now
  if retry < 0 then retry = 0 end
end
return { 0, count, retry }
`;

/**
 * 回执形状不认识时当"没判出来"，不许读成放行。
 *
 * 与 `RedisRealtimeBus.subscribe()` 那一处同一条纪律：线路上的字节不可信，认不出的形状
 * 就是失败，不是"大概可以"。这里多一层要紧的原因是返回值直接决定放不放行——
 * 把陌生形状解释成 `{ allowed: true }` 的话，一次 Redis 版本变更就是一次全平台免限流。
 */
function decodeDecision(raw: unknown): RateLimitDecision | null {
  if (!Array.isArray(raw) || raw.length < 3) return null;
  const [allowed, count, retryAfterMs] = raw;
  if (typeof allowed !== 'number' || typeof count !== 'number' || typeof retryAfterMs !== 'number') return null;
  if (allowed !== 0 && allowed !== 1) return null;
  return { allowed: allowed === 1, count, retryAfterMs: Math.max(0, Math.round(retryAfterMs)) };
}

/**
 * `SCAN` 的回执必须是 `[游标, 键名数组]`，认不出就当失败抛出去。
 *
 * 这一处单独设防的原因与 `decodeDecision` 不同：把陌生形状**读成"游标已结束"**，
 * 后果是 `reset()` 一声不响地什么都没清，下一批用例踩着上一批的窗口跑——
 * 那是一种只会表现成"这次闸挡住了 / 这次没挡住"的随机红，而且红的那次看起来像别人的 bug。
 */
function decodeScan(reply: unknown): [string, string[]] {
  const text = JSON.stringify(reply);
  if (!Array.isArray(reply) || reply.length < 2) throw new Error(`scan 回执形状不认识：${text}`);
  const [cursor, keys] = reply;
  if (typeof cursor !== 'string' || !Array.isArray(keys)) throw new Error(`scan 回执形状不认识：${text}`);
  return [cursor, keys.filter((k): k is string => typeof k === 'string')];
}

/**
 * 就绪等待的预算。挑 3 秒的理由：`hit` 从来不等它（页眉那条纪律一个字没改），等它的人只有
 * 测试与演练脚本，而那两样都宁可慢三秒，也别拿到一个假阴性。
 *
 * 2026-11-02 本机实测（`.scratch/s33-ready-probe.txt`，逐个新建 12 份 limiter）：
 * 空载时就绪用时（毫秒，排序后）12 / 14 / 16 / 17 / 23 / 25 / 33 / 35 / 39 / 48 / 48 / 129，
 * 八个一次 `new` 出来全部就绪。同一台机器上并行会话在跑构建时，一次 `beta.ready`
 * 在 1 秒预算里落了 false——那一跑的 16 条判定里除了这一句一条没错。这一句量的是
 * "这台机器现在多忙"，而它挂在"驱动对不对"的门上，所以预算按实测最坏值再放一个数量级，
 * 不是按 Redis 应该多快。
 */
const CONNECT_READY_BUDGET_MS = 3_000;

/**
 * ioredis 没有公开的 `ready()`，只有 `status` 与 `ready` 事件，所以就绪信号自己搭
 * （与 `realtime/redisBus.ts` 的同名函数同一形状）。
 *
 * **一次 `error` 不当场判死**：连不上的时候必须有东西结束这个 Promise，否则 await 它的人
 * 吊死在一次永远不来的 ready 上——但结束它的应该是预算，不是第一跳抖动。原来这一版写的是
 * `once('error') → resolve(false)`，于是"这台连接其实好好的"也能读成 false：ioredis 自己会重连，
 * 一次连接抖动之后往往就是 ready。2026-11-02 连跑六次的第 6 次就红在
 * `await expect(alpha.ready).resolves.toBe(true)`（`docs/adr/0077-rate-limit-memory-bucket-ceiling.md`
 * 的"顺手修的上一片仪器"那一节记着读数），而同一趟里 16 条判定一条没错——
 * 那种红说的是仪器，不是驱动。
 *
 * 构造函数里那条常驻 `on('error')` 监听器才是接住 error 事件的地方（没有监听者的 error 是
 * uncaught exception），这里因此不必再挂一份。`end` 还是当场落地：那是有人主动断了，
 * 等下去也不会有 ready。
 */
function connectionReady(redis: Redis): Promise<boolean> {
  if (redis.status === 'ready') return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    const finish = (ok: boolean): void => {
      clearTimeout(timer);
      redis.off('ready', onReady);
      redis.off('end', onEnd);
      resolve(ok);
    };
    const onReady = (): void => finish(true);
    const onEnd = (): void => finish(false);
    const timer = setTimeout(() => finish(false), CONNECT_READY_BUDGET_MS);
    redis.once('ready', onReady);
    redis.once('end', onEnd);
  });
}

export class RedisRateLimiter implements RateLimiter {
  readonly keyPrefix: string;
  private readonly origin: string;
  /**
   * 进程内那一份退回用的窗口。它不是摆设：Redis 答不上来的那些请求必须由它继续挡，
   * 否则"闸坏了"就等于"没闸"。它的键空间与 Redis 那份是两套数，
   * 所以退回期间一个用户的额度是本机看到的次数，不是全平台的——
   * 这是这句话的代价，`fallbackCount` 涨起来的时候要知道。
   */
  private readonly fallback = new MemoryRateLimiter();
  private readonly client: Redis;
  private disposed = false;

  /**
   * Redis 那半边出过问题的次数：判定退回（命令失败 / 回执不认识）与 `reset` 没做成都记在这里。
   * 测试与诊断读它；运维那边的同名读数在 `nexus_rate_limit_driver_fallbacks_total`（分原因）。
   */
  fallbackCount = 0;

  /** 最近一次连接层的报错文本，给诊断读数用（不代表"这一条请求退回了"）。 */
  lastConnectionError: string | null = null;

  /**
   * 这条连接现在能不能用。**`hit` 从来不等它**——让业务请求排在一次建连接后面，
   * 等于把闸做成故障放大器（与 `RedisRealtimeBus.publish` 不等线路是同一条纪律）。
   *
   * 那不等于这一格就没代价：`enableOfflineQueue:false` 意味着连接就绪之前发出去的命令
   * **当场**被拒，于是刚起来的那几笔走的是本机窗口。有界的退化（每台最多多放 `limit` 笔，
   * 不是免限流），但它是真的，所以这里给一个可查的信号，而不是让它只在复盘时才被发现。
   * 谁用它：集成测试与两进程演练用它代替"多打几次直到不红"那种把建连接竞态当成断言的写法。
   *
   * 永不 reject：连不上是这一格明确接受的状态，答案是 `false`，原因在 `lastConnectionError`。
   * 有界：最多等 `CONNECT_READY_BUDGET_MS`，中间出过抖动但后来连上了答案是 `true`（见那里的注释）。
   */
  readonly ready: Promise<boolean>;

  constructor(options: RedisRateLimiterOptions) {
    this.keyPrefix = options.keyPrefix ?? DEFAULT_KEY_PREFIX;
    this.origin = options.origin ?? defaultOrigin();
    this.client = new Redis(options.url, {
      // 与发布侧同一组参数：命令不排队（断线时排队会把内存无上限堆起来，
      // 且重连后把积压的判定突然放出去），也不做重试马拉松（等限流回执的那条请求不该等）。
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      commandTimeout: COMMAND_TIMEOUT_MS,
    });
    // error 监听器必须挂上：没有监听者的 error 事件在 Node 里是 uncaught exception，
    // 于是"一个连不上的 Redis"会把整个进程带走——而这一版恰恰要在 Redis 坏着的时候活着。
    this.client.on('error', (error: Error) => {
      // 只记不抛：连接层的自愈（重连）由 ioredis 负责，这里没有要抢救的东西。
      // 每一次真实判定失败另有 `countFallback` 说出去，所以这条不重复计数。
      if (!this.disposed) this.lastConnectionError = error.message;
    });
    this.ready = connectionReady(this.client);
  }

  private key(bucketKey: string): string {
    return `${this.keyPrefix}${bucketKey}`;
  }

  async hit(key: string, limit: number, windowMs: number): Promise<RateLimitDecision> {
    const member = `${this.origin}:${(seq += 1)}`;
    try {
      // 参数顺序是 eval 的规矩：**脚本在前**，然后 KEYS 的个数，然后先键后参数。
      // 写错不会报错，只会把桶键当成脚本交给 Redis——那是一条"看着在工作、实际上
      // 每次都在评一段不存在的东西"的失败，所以这一行的顺序在这里点明。
      const raw = await this.client.eval(SLIDING_WINDOW_LUA, 1, this.key(key), String(windowMs), String(limit), member);
      const decision = decodeDecision(raw);
      if (decision) {
        // 指标在这一层记（而不是脚本里）：与进程内驱动同一个计数器、同一套标签，
        // 换驱动之后"哪个闸挡了多少次"那张图不会变成两条不相干的曲线。
        increment('nexus_rate_limit_decisions_total', { gate: key.split('|')[0] ?? 'unknown', allowed: String(decision.allowed) });
        return decision;
      }
      return this.fallbackWith('bad-reply', key, limit, windowMs, new Error(`回执形状不认识：${JSON.stringify(raw)}`));
    } catch (error) {
      return this.fallbackWith('command-failed', key, limit, windowMs, error);
    }
  }

  /**
   * `reset(key)` 清那一只桶；**不带参数的 `reset()` 清整个前缀下的所有桶**。
   *
   * 后一句的爆炸半径要说清楚：它清的是"这份 Redis 上、这个前缀下"的窗口，
   * 而共享窗口意味着这一台清完，**所有实例**的计数一起归零。今天生产路径上没有任何
   * 调用方（`reset` 的调用点全在测试里），所以这一格没有主人比有主人危险。
   * 正因为如此，测试必须用 `keyPrefix` 换到自己的命名空间，别去清别人的：
   * 同一台 Redis 上还挂着另一条会话的 e2e，把它们那 20 次/小时的额度抹掉，
   * 会让那轮的"闸挡住了"变成"闸没挡"——读数看着一样，原因完全不同。
   */
  async reset(key?: string): Promise<void> {
    // 退回侧**无条件先清**，不管 Redis 那一趟成没成：它平时不参评，但可能留着上一次
    // 宕机期间攒下的窗口。不清，Redis 恢复之后一旦再抖，那些旧条目就会在新的一轮里挡人。
    await this.fallback.reset(key);
    try {
      if (key !== undefined) {
        await this.client.unlink(this.key(key));
        return;
      }
      let cursor = '0';
      do {
        // 用 SCAN 不用 KEYS：KEYS 在大库上是一次 O(N) 阻塞，而这台 Redis 和别的子系统共用。
        const reply = (await this.client.scan(cursor, 'MATCH', `${this.keyPrefix}*`, 'COUNT', 200)) as unknown;
        const [next, keys] = decodeScan(reply);
        cursor = next;
        if (keys.length > 0) await this.client.unlink(...keys);
      } while (cursor !== '0');
    } catch (error) {
      this.countFallback('reset', error);
    }
  }

  /** 关掉连接。不在 `RateLimiter` 接口上：谁造出这份 limiter 谁知道自己什么时候不再需要它。 */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.client.disconnect();
  }

  private fallbackWith(
    reason: 'bad-reply' | 'command-failed',
    key: string,
    limit: number,
    windowMs: number,
    error: unknown,
  ): Promise<RateLimitDecision> {
    this.countFallback(reason, error);
    return this.fallback.hit(key, limit, windowMs);
  }

  private countFallback(reason: string, error: unknown): void {
    this.fallbackCount += 1;
    increment('nexus_rate_limit_driver_fallbacks_total', { reason });
    console.error(
      `[rateLimit] redis 驱动退回进程内计数（第 ${this.fallbackCount} 次；多实例期间这一台的额度是各算各的）：`,
      error instanceof Error ? error.message : String(error),
    );
  }
}
