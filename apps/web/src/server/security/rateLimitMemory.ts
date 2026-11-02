import { increment } from '../observability';
import type { RateLimitDecision, RateLimiter } from './rateLimit';

/**
 * 进程内驱动：滑动窗口存在**这台进程**的内存里。
 *
 * 默认就是它（`rateLimit.ts` 的驱动选择：不设 `NEXUS_REDIS_URL` 用它）。单进程 dev、
 * vitest、e2e 都只有一个 web 进程，这里是对的，而且不必为了限流去依赖一个外部服务。
 *
 * 它在多实例下的退化方式要写明白：**每实例独立限流**，不是"不限量"。
 * 两个实例下 `10 次/15 分钟/邮箱` 实际是"每台 10 次"，攻击者只要把请求分摊到两台
 * 前端就能拿到 20 次。那正是 `rateLimitRedis.ts` 存在的理由，而换驱动不换调用方——
 * `RateLimiter` 那两个方法两边一模一样。
 *
 * 与 Redis 驱动必须逐条对齐的三条语义（谁改了另一条没跟，多实例与单实例就会给出
 * 两个不同的答案，而那是最难查的一种不一致）：
 * 1. 被挡下的那一次**不计入窗口**（否则"一直撞上限"比"一直干活"涨得更快，限流成了加速自锁）；
 * 2. 窗口边界是**严格大于 cutoff** 的留下来（`t > now - windowMs`）；
 * 3. `retryAfterMs` 从窗口里**最早那一条**到期的时刻算，不是从窗口长度算。
 * 见证在 `apps/web/test/rate-limit.redis.integration.test.ts` 的 parity 一组：同一串请求分别
 * 打到两个驱动，每格的 `allowed / count` 必须相同，`retryAfterMs` 则钉**方向与量级**——
 * 不许一边说"不用等"一边说"还得等"，也不许超过整个窗口。为什么不比毫秒：两边的时钟本来就是
 * 两套（这一版用主机 `Date.now()`，那一版用 Redis 服务端 `TIME`），而倒计时量的是"两趟驱动
 * 各自走了多久"，同一格的差值里混着调度与一次往返（2026-10-31 复跑实测 55–64ms），
 * 钉死一个小容差只会红在仪器上。判决的来龙去脉见 `docs/adr/0077-rate-limit-memory-bucket-ceiling.md`。
 *
 * ## 这张表能有多少只桶
 *
 * 上面那三条管的是"一只桶里存多少"，这一节管的是另一格，而它原来一门门都没有：
 * `buckets` 只在**同一个键再次被命中**时把自己刷新一次，于是别的键里那些早就过期的时间戳
 * 永远留着，键名字符串也永远留着。它的规模因此是"这台进程活期间出现过的 distinct 桶"，
 * 单调涨、不收口。Redis 那一版从一开始就收了口——`PEXPIRE` 让长时间没人打的键自己消失
 * （`rateLimitRedis.ts` 的页眉把这一格点名为"进程内版本的漏"，这一节就是去还它）。
 *
 * 这不是"理论上的涨"。桶键的形状是 `路由|身份|IP`，而 §137 的 guest 会话由中间件用客户端
 * 可见 cookie **自动签发**：没有会话就签一个随机的，`requireUser()` 拿不到会话行就就地建一个
 * guest 用户。所以"一个新访客"＝"一只新桶"，不需要登录、不需要凭据、不花一分钱——
 * `rateLimit.ts` 里 `ipWriteGate` 那段注释记过同一件事的另一面（当年它是"按身份限流空转"的
 * 原因）：**一道闸自己成了一个免成本写入口**，而它要挡的对象恰好就是这类入口。
 *
 * 于是这一版三条：
 *
 * 1. **清扫**：每只桶记着自己那一档的 `windowMs`，`now − 最新一条命中 > windowMs` 就整只删掉。
 *    用"最新一条"而不是"最早一条"判，因为窗口是滑动的——最新那条到期，整只桶才算空。
 *    这一条删掉的桶**不动任何人的额度**：它们已经过期，下次命中本来也会把自己滤空。
 *    它有**两个节奏**：每 `sweepEveryHits` 次命中扫一次全表（攒着扫比较便宜），以及顶到上界时
 *    在淘汰那一步顺手放过整窗已过期的头部桶——后者管的是"这张表同时住着 60 秒与 10 分钟的窗口"
 *    那一格：一张顶满的表如果新来的都是短窗口，只等全表那一趟会让长窗口的桶替它们挨刀。
 * 2. **上界**：还超过 `maxBuckets` 就从"最久没被碰"那一头淘汰。`Map` 的插入序在这里当 LRU 用
 *    （命中时先 `delete` 再 `set`，最近碰过的永远在尾部），所以淘汰是 O(淘汰数) 而不是
 *    每次命中排一次全表——上界被洪水顶住时每次请求只多淘汰一只，这一条必须成立，
 *    否则"防内存耗尽"这件事自己会变成一次放大攻击。
 * 3. **出声**：`nexus_rate_limit_buckets_pruned_total{reason}` 分 `expired` / `cap` / `reset`
 *    三个数，取向与 ADR-0076 的后果 1 同一条：**不吭声的自愈等于没有自愈**。只有 `cap`
 *    额外补一行日志，而且**最多一分钟一行**：顶到上界之后每次命中都会淘汰一只，每请求一行的话
 *    这道闸就在洪水期间给自己开了一条每请求一次的磁盘写入口。逐笔的数在 counter 里，
 *    日志只是给没在看指标的人的提醒，所以它可以有节奏；`expired` / `reset` 不喊——常态不是事件。
 *
 * **"淘汰一只还在窗口里的桶"是往更松的方向错**，和 ADR-0076 后果 2 那句"宁可往更严的方向错"
 * 相反，所以要说清它换来什么：一个被持续滥用的身份，它的桶一直在被碰，因此一直在 LRU 尾部——
 * **正在挨挡的那几格不会被淘汰**，先走的是很久没人碰的桶，而那类桶多半本来就该由第一条收掉。
 * 真正被这一条牺牲的是"洪水把上界内的格子全占满"那种形状：那里要么白送一些身份一次窗口，
 * 要么这台进程先倒。选了前者，并把 `cap` 那个读数留在原地——只有它在涨才说明这台进程
 * 真的被 distinct 身份压着打（`expired` 在涨是正常收尾，别读成事故）。
 *
 * **限度（别把这一节读成"有了上界就有容量规划"）**：单只桶的内存由 `limit` 封顶（只有被放行
 * 的命中才写时间戳，所以至多 `limit` 个），桶数由 `maxBuckets` 封顶，两条合起来才是这台进程
 * 的上界 ≈ `maxBuckets × (键长 + limit×8)`；而 `maxBuckets` 之内仍然先到先得。这一格的正解
 * 不在这里——是 `NEXUS_REDIS_URL`（窗口不在任何一台的内存里）与边缘层。这里做的是
 * "闸不能比自己挡的东西先倒下"，不是"闸有了容量规划"。
 *
 * `RedisRateLimiter` 退回时用的就是这一版，所以上面的三条同时是那条路径的三条：退回期间
 * 每台各数各的（ADR-0076 后果 1）之外，别忘了它也正对着同一张会涨的表。
 */

/**
 * 默认上界。挑法：一格 ≈ 键字符串（`路由|uuid|IP` 约 60 字节）+ 至多 `limit` 个时间戳
 * + 一个小对象，按 300 字节估，50_000 条约 15MB——这台机器上别的进程还要活着。
 *
 * 它是构造参数而不是环境变量：需要调这个数的人都在多实例部署，那种部署的正解是设
 * `NEXUS_REDIS_URL`，不是把本机记账的天花板再抬高一格。
 */
export const DEFAULT_MAX_BUCKETS = 50_000;

/**
 * 每隔多少次命中做一次全表清扫。清扫是 O(桶数)，挂在每一次命中上会让热点路径带上一趟线性扫描；
 * 摊到 256 次一笔，最坏情况是"一只过期桶多活 256 次请求"，而那 256 次里它自己也涨不出多少。
 * 上界那一条不等这个节奏——它按插入序当场收，整窗过期的那几只是顺手放过而不是牺牲，
 * 见页眉第 1 条末尾与 `evictToCap`。
 */
const SWEEP_EVERY_HITS = 256;

/**
 * 淘汰日志最少隔多久一行。这一格不是排版洁癖：顶到上界之后每一次命中都会淘汰一只，
 * 于是"每请求一行 warn"在洪水期间就是**每请求一次磁盘写**——一道用来挡免成本写入口的闸
 * 自己开了一条成本更低的写入口（日志那一路）。逐笔的数在
 * `nexus_rate_limit_buckets_pruned_total{reason="cap"}` 里，一行日志只是给没在看指标的人
 * 的提醒，所以它可以有节奏。
 */
const CAP_WARN_INTERVAL_MS = 60_000;

export interface MemoryRateLimiterOptions {
  maxBuckets?: number;
  /** 测试用：把清扫节奏改小，否则要发满 256 条请求才看得见它。 */
  sweepEveryHits?: number;
}

/**
 * 一只桶：窗口内的命中时刻（升序）+ 这一档自己的窗口。
 *
 * 为什么把 `windowMs` 存进桶里，而不是清扫时传一个全局值：这张表同时住着 `6 次/10 分钟`
 * 与 `600 次/10 分钟`。按最大窗口判过期会让短窗口的桶赖着不走（那正是要收的东西），
 * 按最小窗口判会删掉还在窗口里的长窗口桶（那是白送额度）。两个方向都是错的，所以每只桶
 * 带自己的那一个。
 */
interface Bucket {
  hits: number[];
  windowMs: number;
}

export class MemoryRateLimiter implements RateLimiter {
  /** 插入序＝最近被碰的顺序（命中时先删再写）。头部是最久没被碰的。 */
  private readonly buckets = new Map<string, Bucket>();
  private readonly maxBuckets: number;
  private readonly sweepEveryHits: number;
  private hitsSinceSweep = 0;
  /** 上一次喊"到上界了"的时刻，只用来压日志节奏（见 `CAP_WARN_INTERVAL_MS`）。 */
  private lastCapWarnAt = 0;

  constructor(options: MemoryRateLimiterOptions = {}) {
    this.maxBuckets = options.maxBuckets ?? DEFAULT_MAX_BUCKETS;
    this.sweepEveryHits = options.sweepEveryHits ?? SWEEP_EVERY_HITS;
  }

  /**
   * 只给测试与诊断读：桶数的唯一权威是这张表自己，不是那两个 counter 的差。
   * 用例里两个都核（`created − pruned === bucketCount`），差一截就是记账漏了一格。
   */
  get bucketCount(): number {
    return this.buckets.size;
  }

  async hit(key: string, limit: number, windowMs: number): Promise<RateLimitDecision> {
    const now = Date.now();
    const cutoff = now - windowMs;
    const previous = this.buckets.get(key);
    const window = (previous?.hits ?? []).filter((t) => t > cutoff);
    const allowed = window.length < limit;
    if (allowed) window.push(now);
    // 先删再写：把这只桶挪到插入序的尾部，于是头部永远是最久没被碰的那一只。
    if (previous) this.buckets.delete(key);
    this.buckets.set(key, { hits: window, windowMs });
    /**
     * 只取键的第一段（路由字面量）当标签，不看后面两段。
     * 限流键的形状是 `路由|身份|IP`，而 `auth/login` 那一格的"身份"传的是**邮箱**
     * （`rateKey('auth/login', ip, parsed.data.email.toLowerCase())`）——整串键进指标标签，
     * 等于把账号名单与 IP 抄进一个内存里长住、访问面还可能更宽的地方。
     * 闸的判定次数不需要知道是谁；要查具体人时去审计表，那张表有访问门与保留期。
     *
     * 新建桶那一笔**故意一个标签都不带**：这一格要的读数只是总量与差，加上 `gate` 就是把
     * 那族序列再抄一遍（`MAX_SERIES_PER_METRIC` 只有 64），而"哪一档在被灌"由
     * `nexus_rate_limit_decisions_total{gate,allowed}` 与淘汰总数已经能回答。
     */
    if (!previous) increment('nexus_rate_limit_buckets_created_total');
    increment('nexus_rate_limit_decisions_total', { gate: key.split('|')[0] ?? 'unknown', allowed: String(allowed) });
    // 窗口里最早那条到期的时间 = 再过多久能腾出一个名额。
    const oldest = window[0] ?? now;
    this.prune(now);
    return { allowed, count: window.length, retryAfterMs: allowed ? 0 : Math.max(0, oldest + windowMs - now) };
  }

  /** 清扫按节奏走，上界按插入序当场收——两条的成本不同，触发条件也就不一样。 */
  private prune(now: number): void {
    if (++this.hitsSinceSweep >= this.sweepEveryHits) {
      this.hitsSinceSweep = 0;
      const pruned = this.sweepExpired(now);
      if (pruned > 0) increment('nexus_rate_limit_buckets_pruned_total', { reason: 'expired' }, pruned);
    }
    if (this.buckets.size > this.maxBuckets) this.evictToCap(now);
  }

  /**
   * 删掉"整个窗口都已过期"的桶：最新一条命中距今 > 它自己的 `windowMs`，整只删掉。
   * 空窗口也删——只有被放行的命中会写时间戳，一只桶被滤空就意味着它已经什么都没记了，
   * 留着只剩下一个键名的成本，而那正是这一格要收的东西。
   *
   * 返回删掉的只数，让两个调用方（每 256 次命中那趟全表清扫、上界那条的兜底）记同一本账。
   * 这一条**不动任何人的额度**：那些桶下次命中本来也会把自己滤空，删掉只是把没人读的东西收走。
   */
  private sweepExpired(now: number): number {
    let pruned = 0;
    for (const [key, bucket] of this.buckets) {
      // `?? 0`：空窗口就是"什么都没记"，按最早的可能时刻算 ⇒ 它必然已过期。
      const newest = bucket.hits[bucket.hits.length - 1] ?? 0;
      if (now - newest > bucket.windowMs) {
        this.buckets.delete(key);
        pruned += 1;
      }
    }
    return pruned;
  }

  /**
   * 从 LRU 头部收到上界内。
   *
   * 为什么是"最久没被碰"而不是随机、也不是最活跃：随机会把正在挨挡的那几格也选进去，
   * 那等于每次洪水都白送滥用者一次窗口重置；取最久没被碰的那一头，先走的本来就该由清扫
   * 那一条收掉，只是还没轮到它的节奏。
   *
   * 兜底那一次整窗已过期的桶走 `expired` 那本账、不喊到上界：全表清扫每 256 次命中才跑一趟，
   * 顶着的这一段里短窗口的桶会先占住名额，而释放它不花任何人的额度——把它记进 `cap`
   * 会让那个读数在正常流量下也涨，而"cap 在涨"这句话的意义正是"这台进程被 distinct 身份压着"。
   */
  private evictToCap(now: number): void {
    let capEvictions = 0;
    while (this.buckets.size > this.maxBuckets) {
      // 只取头部那一只：`for…of` 的迭代序就是 `Map` 的插入序，而命中时先删再写，
      // 所以头部是最久没被碰的那一只（见 `hit`）。拿到就 break——于是每淘汰一只只走一格，
      // 不是每次命中排一遍全表（那是"防内存耗尽"自己变成放大攻击的那条路）。
      // `while` 的条件保证表里至少有一只，所以这一趟一定进得去循环体。
      for (const [key, bucket] of this.buckets) {
        this.buckets.delete(key);
        const newest = bucket.hits[bucket.hits.length - 1] ?? 0;
        if (now - newest > bucket.windowMs) {
          increment('nexus_rate_limit_buckets_pruned_total', { reason: 'expired' });
        } else {
          capEvictions += 1;
        }
        break;
      }
    }
    if (capEvictions === 0) return;
    increment('nexus_rate_limit_buckets_pruned_total', { reason: 'cap' }, capEvictions);
    if (now - this.lastCapWarnAt < CAP_WARN_INTERVAL_MS) return;
    this.lastCapWarnAt = now;
    console.warn(
      `[rateLimit] 进程内限流桶到上界 ${this.maxBuckets}，这一趟从最久没被碰的一头淘汰 ${capEvictions} 只` +
        `（过去这段时间的累计数在 nexus_rate_limit_buckets_pruned_total{reason="cap"} 里，` +
        `这条日志最多一分钟一行——洪水期间每请求一行就是闸自己开了一条写日志的入口）。` +
        `后果是被淘汰身份的那一档窗口重新变空；这个读数持续涨说明这台进程正被 distinct 身份压，` +
        `正解是设 NEXUS_REDIS_URL 把窗口挪出内存。`,
    );
  }

  /**
   * `reset(key)` 清一只桶，`reset()` 清全表——两种都记进 `reason:'reset'`。
   *
   * 记账不是洁癖：那句 `created − pruned === bucketCount` 是这一片唯一能核对"我们真的知道
   * 自己攒了多少桶"的恒等式，而它每次 `reset()` 都会差一截，除非这一步也记。
   */
  async reset(key?: string): Promise<void> {
    if (key === undefined) {
      const n = this.buckets.size;
      this.buckets.clear();
      if (n > 0) increment('nexus_rate_limit_buckets_pruned_total', { reason: 'reset' }, n);
    } else if (this.buckets.delete(key)) {
      increment('nexus_rate_limit_buckets_pruned_total', { reason: 'reset' });
    }
  }
}
