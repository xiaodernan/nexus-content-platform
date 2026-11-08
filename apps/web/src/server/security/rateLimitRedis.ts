import { Redis } from 'ioredis';
import { increment } from '../observability';
import type { RateLimitDecision, RateLimiter, RateLimiterReadout } from './rateLimit';
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
 * 但必须说出来：`nexus_rate_limit_driver_fallbacks_total`（逐笔，分原因）与一行限流日志
 * （每个原因最多一分钟一行）就是这句话的可观测形式。一个不吭声的退回等于把
 * "多实例共享计数"这句话悄悄改成"看运气"。
 *
 * ## 这台驱动能有多少只桶
 *
 * 上一节管"一次判定存在哪儿"，这一节管另一格，而它从 §32 那天起就空着：每只桶有自己的
 * `PEXPIRE`，所以**单只桶**的寿命收了口；但**桶的条数**没有上界。这条欠账当时写在
 * `rateLimitMemory.ts` 的页眉里（"Redis 那一版从一开始就收了口"），这一片去还它的另一半——
 * 那一版收的是"一台进程的表"，这一版要收的是"一台 Redis 的键空间"。
 *
 * 免成本造新键那句话在这里同样成立，而且代价更大：桶键是 `路由|身份|IP`，§137 的 guest 会话
 * 由中间件用客户端可见 cookie 自动签发，所以"一个新访客＝一只新桶"不要凭据、不花钱。
 * 而这台 Redis 不只服务限流——实时总线（`realtime/redisBus.ts`）与别的子系统住在同一台上。
 * 于是洪水的后果不是"我的键多"那么简单：若这台配了 `allkeys-lru`，我的键会**被别人**的内存压力
 * 逐出（那是丢窗口，方向是更松，读数在 Redis 自己的 `evicted_keys` 里，不在这个进程里）；
 * 若配了 `noeviction`，涨的是我的键，写不进去的是**所有人**。两个方向都说明同一件事：
 * 这道闸要在自己这一侧就把自己能写下的键数钉住，而不是把容量问题留给那台机器兜底。
 *
 * 三条，与进程内那一版逐条对齐但取向不同，差别都写在理由里：
 *
 * 1. **索引**：一条有序集 `${keyPrefix}__bucket_index__`，成员是桶键名，分数是**那只桶自己的
 *    到期时刻**（`最后一次记录的命中 + 它的窗口`）。只在写窗口的那一步顺手续期——被挡下的那次
 *    既不写窗口也不写索引，于是索引分数与键的真实寿命是同一件事，`ZREMRANGEBYSCORE -inf now`
 *    扫掉的正好是"已经不在了或马上不在"的桶。
 * 2. **腾位子按每次命中做**，不像进程内那样攒 256 次扫一趟。差别是有原因的：进程内那张表
 *    攒着的代价只是"过期桶多活一会儿"，这里攒着的代价是**过期条目占住名额、把新来的合法桶挡在门外**。
 *    同一趟 Lua 里两条 `ZREMRANGEBYSCORE`，还是一次往返。
 * 3. **满了就不新建**，而不是淘汰别人。这是与进程内那一版最实质的分歧，也是这一版能提的价更低的原因：
 *    进程内被顶满时只能"白送一些身份一次窗口"（ADR-0077 明写了那笔代价，因为一台进程没有地方
 *    把窗口挪出去）。这里有一个地方可以挪——**新建不了共享桶的那条请求交给本机窗口判**：
 *    它退回的是"每台各数各的"这个已知降级（ADR-0076 后果 1），不是放行，也不动任何人的既有窗口。
 *    所以这一版没有 `cap` 那本淘汰账，只有 `driver_fallbacks_total{reason="over-cap"}` 一句：
 *    它在涨说明 Redis 这一侧的桶名额用完了，而正解是加内存/分片或把闸挪到边缘层，不是把这个数调大。
 *
 * 限度（别把这一节读成"Redis 侧有了容量规划"）：上界管的是**这条驱动写下的键数**，
 * 不管那台机器上别人写了什么，也不管 Redis 自己的惰性逐出节奏——索引条目可能比它记的键晚消失
 * 一点点（分数就是那把 `PEXPIRE` 的时刻，而真键的回收还要排上惰性/定期逐队的队），
 * 那种情况下一次命中会把它重新加回索引，`live` 短暂少算的只是"已经没人用的那只"。
 */

/** 与 `realtime/redisBus.ts` 读的是同一个变量：一个旋钮管两台子系统，别各设各的。 */
export const REDIS_URL_ENV = 'NEXUS_REDIS_URL';
/**
 * 键前缀带版本段：换窗口算法（比如从有序集改成令牌桶）时旧格式的键不会被新代码误读——
 * 有序集和字符串的 `ZCARD`/`GET` 会当场报错而不是给出一个看着合理的数。
 */
export const DEFAULT_KEY_PREFIX = 'nexus:ratelimit:v1:';
/**
 * 桶键索引的名字后缀。它住在**同一个前缀**下，所以 `reset()` 那趟 SCAN 会连它一起清掉——
 * 这是要的：索引丢了会自己长回来（下一次命中把它重新 `ZADD` 进去），代价只是上界短暂少算几个。
 *
 * 名字不会和任何桶键撞：桶键的形状是 `路由|身份|IP`，中间必然有 `|`，而这一串里没有。
 */
export const BUCKET_INDEX_SUFFIX = '__bucket_index__';
/**
 * 默认桶键上界。挑法与进程内那一版同一个数（`rateLimitMemory.ts` 的 `DEFAULT_MAX_BUCKETS`）：
 * 那里按"一格 ≈ 键字符串 + 至多 `limit` 个时间戳 ≈ 300 字节"估出 50 000 条 ≈ 15MB；
 * 这里每只桶多带一条索引成员（成员名就是键名，Redis 有序集一条成员约百余字节开销），
 * 量级同一档，所以数也留同一档。
 *
 * 两个驱动用同一个数还有一层用处：**换驱动时"这张表能有多少只桶"这句话不需要改口**。
 * 这一族用例（parity 那几格）钉的就是两个驱动逐条同答案，把上界写成两个数会多出一条
 * 没人检查的口径差。
 *
 * 与进程内那一版一样，它是构造参数而不是环境变量：真要调这个数的人都在多实例部署，
 * 那种部署的正解是给那台 Redis 做容量规划或分片，不是把闸的键名额再抬高一格。
 */
export const DEFAULT_MAX_BUCKET_KEYS = 50_000;
/**
 * 索引自己的寿命：每次命中都续期，所以只要还有流量它就一直在。
 *
 * 为什么不是一个窗口而是 90 分钟：这一格要的是"长时间没人打这道闸就把这份名册扔掉"，
 * 而今天最宽的窗口是一小时（`projects/create` 的 20 次/小时）。按窗口续期会让**短窗口**
 * 那几档把索引的寿命拖成自己的那一个——一小时的名册在一分钟之后就没了意义，而名册没了
 * 上界就重新开始数。90 分钟 = 最宽窗口再放一半，够它熬过任何一次真实键的收尾。
 *
 * 掉了不危险：桶键自己带着 `PEXPIRE`，判定读的是桶键（`EXISTS`），名册只用来数"有几只"。
 * 名册空了而桶还在时，下一次命中会把那只桶重新登记，于是上界从那一刻起重新数——
 * 少算的只是"已经没人再打的那些桶"，而那几只本来就在自己到期的路上。
 */
export const INDEX_TTL_MS = 90 * 60_000;
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
/**
 * 退回日志最少隔多久一行。这一格从 §32 起就该有：`countFallback` 原来是**每请求一行**
 * `console.error`，于是"Redis 连不上 + 有人在刷"这个组合会让一道用来挡免成本写入口的闸
 * 自己开出一条每请求一次的磁盘写——进程内那一版在 2026-10-31 已经为此把淘汰日志压到
 * 一分钟一条（`rateLimitMemory.ts` 的 `CAP_WARN_INTERVAL_MS`，那里的理由写得更全）。
 *
 * 压的只是日志，不是账：`nexus_rate_limit_driver_fallbacks_total{reason}` 仍然逐笔记数，
 * 所以"看得见地坏"这句话没有打折——它是"每坏一次都有一个数"，不是"每坏一次都有一行字"。
 */
const FALLBACK_LOG_INTERVAL_MS = 60_000;

export interface RedisRateLimiterOptions {
  url: string;
  /** 测试用命名空间（同一个 Redis 上别人的窗口不该被我 `reset()` 清掉）；默认见 `DEFAULT_KEY_PREFIX` */
  keyPrefix?: string;
  /** 这台实例的身份，用于给每条命中一个不重复的成员名。默认 `pid:启动时刻:随机段` */
  origin?: string;
  /** 这台驱动最多能写多少只桶键；默认见 `DEFAULT_MAX_BUCKET_KEYS`。测试用小值，行为一样。 */
  maxBucketKeys?: number;
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
 * 滑动窗口的判定 + 桶键名册的记账，一次往返做完。
 *
 * 为什么是 Lua 而不是四条命令：`ZCARD` 与 `ZADD` 之间必须没有别人插进来。
 * 分成两条命令时，两个并发请求能同时读到"窗口里还差一名"，于是同时挤进去——
 * 上限被并发突破，而那正是这道闸要挡的东西。Redis 单线程执行脚本，脚本内部天然原子。
 * 上界那一条更得在脚本里：`ZCARD 名册` 与 `ZADD 新桶` 之间隔一次往返，就能有 N 个并发
 * 同时看见"还差一名"，于是那台 Redis 上同时出现 N 只超出上界的键——**"防键空间耗尽"
 * 这件事自己变成一个放大入口**，与上面那句是同一个形状。
 *
 * 为什么自己删过期条目（`ZREMRANGEBYSCORE`）而不靠 TTL：TTL 只能给整个键设一个值，
 * 而滑动窗口需要"逐个成员按自己的时间淘汰"。`PEXPIRE` 在这里只负责一件事——
 * 长时间没人打的键别永久赖在库里。
 *
 * `PEXPIRE` 必须排在 `ZADD` **后面**：对一个还不存在的键，`PEXPIRE` 返回 0 什么都不做，
 * 而且不报错。放在 `ZCARD` 之前写的那一版，第一次命中建不出 TTL——而"只来过一次"的
 * (路由, 身份, IP) 组合恰恰是绝大多数桶，于是每个都留下一只永久的有序集，
 * 键空间随流量单调涨。这一格是 `键的寿命` 那条用例在 2026-10-31 抓出来的，
 * 不是设计时想到的。索引那两条（`ZADD 名册` / `PEXPIRE 名册`）排在桶的 `ZADD` 之后是同一个理由，
 * 顺序错了不会报错，只会留下一只没有 TTL 的键。
 *
 * 时间取 `redis.call('TIME')`（服务端时钟）而不是客户端 `Date.now()`：多台机器的时钟
 * 不齐时，各自的 `now` 会让同一个窗口在不同机器上算出不同的边界，快那台的写入会被慢那台
 * 当成"未来的命中"（`ZREMRANGEBYSCORE` 删不掉它，因为它分数比别人的 now 还大）。
 * 一份权威时钟只有一个来源才对。名册的分数也必须用这同一个 `now`：用客户端时钟写的到期时刻
 * 会跟桶键自己的 `PEXPIRE` 对不上，那条名册就会比它记的键早消失或晚消失。
 *
 * 语义与进程内驱动逐条对齐（`rateLimitMemory.ts`）：被挡下的那一次**不写进窗口**，
 * 否则"一直撞上限"会比"一直干活"涨得更快，限流就成了加速自锁。同理它也不续名册——
 * 名册记的是"这只桶还会活多久"，而那次命中没让任何桶多活一秒。
 *
 * 返回 `[判决 0/1/2, 窗口内条数, retryAfterMs, 名册本次扫掉几条, 名册现在几条]`。
 * `2` 是"这是一只新桶，但名额用完了"：这一条判定不在 Redis 里做，交给调用方的本机窗口
 * （页眉第 3 条），所以它**不是放行**，也不带任何计数意义——回执里的数字只为把那句话说明白。
 */
const SLIDING_WINDOW_LUA = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local windowMs = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local member = ARGV[3]
local maxKeys = tonumber(ARGV[4])
local indexTtl = tonumber(ARGV[5])
local bucket = KEYS[1]
local index = KEYS[2]
-- 先腾位子再判名额：反过来的话，一场洪水里过期的条目会占住名额，把合法的新桶挡在门外。
local swept = redis.call('ZREMRANGEBYSCORE', index, '-inf', now)
local live = redis.call('ZCARD', index)
redis.call('ZREMRANGEBYSCORE', bucket, '-inf', now - windowMs)
local count = tonumber(redis.call('ZCARD', bucket))
if count >= limit then
  local oldest = redis.call('ZRANGE', bucket, 0, 0, 'WITHSCORES')
  local retry = 0
  if oldest[2] then
    retry = tonumber(oldest[2]) + windowMs - now
    if retry < 0 then retry = 0 end
  end
  return { 0, count, retry, swept, live }
end
-- 上界只管**新建**桶。已经在数东西的那只不参与这一判：把它赶走才是真的白送额度。
if redis.call('EXISTS', bucket) == 0 and live >= maxKeys then
  return { 2, 0, 0, swept, live }
end
redis.call('ZADD', bucket, now, member)
-- 紧跟 ZADD：这一刻键一定存在，TTL 就是"最后一次记录的命中 + 窗口"，
-- 也正是窗口里最新那条成员自己到期的时刻——键不会比它记着的东西多活一秒。
redis.call('PEXPIRE', bucket, windowMs)
-- 名册里那条的分数就是上面那把锁的到期时刻，两边同一个数，所以"扫掉的都是没了的"才成立。
redis.call('ZADD', index, now + windowMs, bucket)
redis.call('PEXPIRE', index, indexTtl)
return { 1, count + 1, 0, swept, redis.call('ZCARD', index) }
`;

/** 一次 `EVAL` 的判决：`over-cap` 不是"挡下了"，是"这一条不在 Redis 里判"（页眉第 3 条）。 */
type WindowReply =
  | { kind: 'decided'; decision: RateLimitDecision; swept: number; size: number }
  | { kind: 'over-cap'; swept: number; size: number };

/**
 * 回执形状不认识时当"没判出来"，不许读成放行。
 *
 * 与 `RedisRealtimeBus.subscribe()` 那一处同一条纪律：线路上的字节不可信，认不出的形状
 * 就是失败，不是"大概可以"。这里多一层要紧的原因是返回值直接决定放不放行——
 * 把陌生形状解释成 `{ allowed: true }` 的话，一次 Redis 版本变更就是一次全平台免限流。
 *
 * 判决位只认 0/1/2 三个数，**别的整数也算不认识**：这一格将来加第四态时，
 * 老代码读到的应该是"退回并出声"，而不是"按最像的那个数办"。
 * 后面两个数（扫掉几条、名册几条）也要求是非负整数——它们只进指标与诊断读数，
 * 但一个负的 `swept` 会被记进"回收了几只桶"那本账，把账记反比记错更糟。
 */
function decodeWindow(raw: unknown): WindowReply | null {
  if (!Array.isArray(raw) || raw.length < 5) return null;
  const [verdict, count, retryAfterMs, swept, size] = raw;
  if (typeof verdict !== 'number' || (verdict !== 0 && verdict !== 1 && verdict !== 2)) return null;
  if (typeof count !== 'number' || typeof retryAfterMs !== 'number') return null;
  if (typeof swept !== 'number' || typeof size !== 'number') return null;
  if (count < 0 || retryAfterMs < 0 || swept < 0 || size < 0) return null;
  const bookkeeping = { swept: Math.trunc(swept), size: Math.trunc(size) };
  if (verdict === 2) return { kind: 'over-cap', ...bookkeeping };
  return {
    kind: 'decided',
    decision: { allowed: verdict === 1, count, retryAfterMs: Math.round(retryAfterMs) },
    ...bookkeeping,
  };
}

/**
 * `SCAN` 的回执必须是 `[游标, 键名数组]`，认不出就当失败抛出去。
 *
 * 这一处单独设防的原因与 `decodeWindow` 不同：把陌生形状**读成"游标已结束"**，
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
  private readonly maxBucketKeys: number;
  /**
   * 名册那条有序集的**全名**（带前缀）。它和桶键同住一个前缀，所以 `reset()` 的 SCAN
   * 连它一起清——清了会自己长回来，理由见 `INDEX_TTL_MS`。
   */
  private readonly indexKey: string;
  /**
   * 进程内那一份退回用的窗口。它不是摆设：Redis 答不上来的那些请求必须由它继续挡，
   * 否则"闸坏了"就等于"没闸"。它的键空间与 Redis 那份是两套数，
   * 所以退回期间一个用户的额度是本机看到的次数，不是全平台的——
   * 这是这句话的代价，`fallbackCount` 涨起来的时候要知道。
   *
   * 上界满了之后新桶走的也是它（页眉第 3 条），所以这一份不只是"宕机时的备胎"：
   * Redis 好好的、只是名额用完时，它同样在挡东西。它自己那套清扫与上界因此不是理论上的
   * 保险，而是这一条路径的真依赖——进程内那张表要是没有上界，"名额用完"就会变成
   * "把洪水从 Redis 的键空间挪进这台进程的内存"。
   */
  private readonly fallback = new MemoryRateLimiter();
  private readonly client: Redis;
  private disposed = false;
  /** 每个原因各自计时：`command-failed` 压住了一行不该顺手把 `over-cap` 那行也压掉。 */
  private readonly lastLogAt = new Map<string, number>();

  /**
   * Redis 那半边没能给出判定的次数：命令失败 / 回执不认识 / **桶键名额用完**，与 `reset` 没做成
   * 都记在这里。三种原因的取向一样（这一条由本机窗口判），所以共用这一个数；
   * 分原因的读数在 `nexus_rate_limit_driver_fallbacks_total{reason}`。
   */
  fallbackCount = 0;

  /**
   * 名册里当前有几只桶——**只给测试与诊断读**，理由与进程内那一版的 `bucketCount` 同一条：
   * 权威是那台 Redis 上的 `ZCARD`，不是这个字段（用例直接查那台，见 `键的上界` 那一组）。
   * 它读的是最近一次判定带回的数，所以没有流量时它是旧的——那一格正是想要的形状：
   * 长时间没人打这道闸时，桶会随自己的窗口消失，而这个数停在最后一次往来看到的位置，
   * 直到下一次命中把它带回真实值。
   */
  bucketKeysTracked = 0;

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
    this.maxBucketKeys = options.maxBucketKeys ?? DEFAULT_MAX_BUCKET_KEYS;
    this.indexKey = `${this.keyPrefix}${BUCKET_INDEX_SUFFIX}`;
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

  /**
   * 现场自报。`wire` 读的是 `client.status`（连接层的**当下**），不是那个 `ready` promise——
   * 后者在构造时落定一次就不再改，用它回答"现在接上没有"会在断线之后继续说"接上了"，
   * 而那正是这一格唯一要防的读法（`ready` 留给测试与演练当"起点稳定了"的信号，用途不同）。
   *
   * `windowScope` 说这句的是**驱动的设计**：退回期间（`fallbackCount` 在涨）这台实际数的是
   * 本机窗口，那句"共享"要连着 `wire` 与那三个字的 counter 一起读才完整——界面把这句写在页面上。
   */
  describe(): RateLimiterReadout {
    const status = this.client.status;
    return {
      driver: 'redis',
      windowScope: 'shared-across-instances',
      bucketCeiling: this.maxBucketKeys,
      bucketsTracked: this.bucketKeysTracked,
      keyPrefix: this.keyPrefix,
      wire: status === 'ready' ? 'up' : status === 'close' || status === 'end' ? 'down' : 'pending',
      fallbackCount: this.fallbackCount,
      lastConnectionError: this.lastConnectionError,
    };
  }

  async hit(key: string, limit: number, windowMs: number): Promise<RateLimitDecision> {
    const member = `${this.origin}:${(seq += 1)}`;
    try {
      // 参数顺序是 eval 的规矩：**脚本在前**，然后 KEYS 的个数，然后先键后参数。
      // 写错不会报错，只会把桶键当成脚本交给 Redis——那是一条"看着在工作、实际上
      // 每次都在评一段不存在的东西"的失败，所以这一行的顺序在这里点明。
      // 现在是两个 KEYS：桶键与名册。声明成 KEYS 而不是 ARGV 是给集群模式留的口子
      // （键要在脚本外可寻址），今天这台是单实例，`ZADD` 一个 ARGV 里的"键名"照样能跑——
      // 那种写法在集群上会直接 CROSSSLOT 报错，而这里不想那一天来改判定。
      const raw = await this.client.eval(
        SLIDING_WINDOW_LUA,
        2,
        this.key(key),
        this.indexKey,
        String(windowMs),
        String(limit),
        member,
        String(this.maxBucketKeys),
        String(INDEX_TTL_MS),
      );
      const reply = decodeWindow(raw);
      if (!reply) {
        return this.fallbackWith('bad-reply', key, limit, windowMs, new Error(`回执形状不认识：${JSON.stringify(raw)}`));
      }
      this.bucketKeysTracked = reply.size;
      // 名册扫掉的那几条也记一本账：与进程内同一只计数器、同一个 `reason="expired"` 标签，
      // 所以"桶被收了多少只"那张图不会因为换了驱动断档（`over-cap` 不记这里——那不是回收，是拒绝新建）。
      // 两个驱动写同一格而不给这格加"哪个驱动"的标签，是因为一台进程只会用其中一个
      // （`rateLimit.ts` 的门面按 `NEXUS_REDIS_URL` 二选一），"这台贡献了多少"由那台机器的驱动
      // 决定，而那是启动日志已经说过的事；给一个三档枚举再加一栏要让所有调用点都补传，不值。
      if (reply.swept > 0) increment('nexus_rate_limit_buckets_pruned_total', { reason: 'expired' }, reply.swept);
      if (reply.kind === 'over-cap') {
        return this.fallbackWith(
          'over-cap',
          key,
          limit,
          windowMs,
          new Error(`桶键名额用完：上界 ${this.maxBucketKeys}，名册里 ${reply.size} 条`),
        );
      }
      // 指标在这一层记（而不是脚本里）：与进程内驱动同一个计数器、同一套标签，
      // 换驱动之后"哪个闸挡了多少次"那张图不会变成两条不相干的曲线。
      // `over-cap` 那一支不走到这里——它的判定由 `this.fallback.hit` 记，一条请求一个数，不许记两遍。
      increment('nexus_rate_limit_decisions_total', { gate: key.split('|')[0] ?? 'unknown', allowed: String(reply.decision.allowed) });
      return reply.decision;
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
        // 名册也要跟着摘：不摘的话，那只桶已经没了，名额却还被它占着——
        // 直到它的到期时刻才松（`ZREMRANGEBYSCORE` 按分数扫）。对上界满着的这段时间，
        // 差别是"新桶能不能建"，而 `reset` 的语义就是"这一只现在不算了"。
        await this.client.zrem(this.indexKey, this.key(key));
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

  /**
   * 这一条判定交给本机窗口，并**出声**。
   *
   * 三种原因共用这一条路是有意的：`over-cap` 与"Redis 连不上"对调用方来说是同一个结果
   * （本机窗口给的判定，格式与 Redis 那份一模一样），差别只在运维想知道"为什么"，
   * 而那已经写在 `reason` 标签里了。
   */
  private fallbackWith(
    reason: 'bad-reply' | 'command-failed' | 'over-cap',
    key: string,
    limit: number,
    windowMs: number,
    error: unknown,
  ): Promise<RateLimitDecision> {
    this.countFallback(reason, error);
    return this.fallback.hit(key, limit, windowMs);
  }

  /**
   * 计数逐笔，日志按原因各一分钟一行。
   *
   * 日志那半是从进程内那一版抄的（`rateLimitMemory.ts` 的 `CAP_WARN_INTERVAL_MS`），
   * 而这一版原来漏得更宽：它连 Redis 整个连不上时都是**每请求一行** `console.error`。
   * 一道用来挡免成本写入口的闸，在故障期间自己开了一条每请求一次的磁盘写——
   * 那个形状比它要挡的东西更划算。现在"看得见地坏"由两处一起保证：
   * counter 逐笔记数（一个不落），日志只负责让没在看指标的人知道这事正在发生。
   */
  private countFallback(reason: string, error: unknown): void {
    this.fallbackCount += 1;
    increment('nexus_rate_limit_driver_fallbacks_total', { reason });
    const now = Date.now();
    const last = this.lastLogAt.get(reason) ?? 0;
    if (now - last < FALLBACK_LOG_INTERVAL_MS) return;
    this.lastLogAt.set(reason, now);
    console.error(
      `[rateLimit] redis 驱动退回进程内计数（第 ${this.fallbackCount} 次；多实例期间这一台的额度是各算各的；` +
        `原因=${reason}；这类日志每一分钟最多一行，逐笔的数在 nexus_rate_limit_driver_fallbacks_total{reason="${reason}"}）：`,
      error instanceof Error ? error.message : String(error),
    );
  }
}
