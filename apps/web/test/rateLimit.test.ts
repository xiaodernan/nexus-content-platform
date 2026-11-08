import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { snapshot } from '../src/server/observability';
import { clientIp, getRateLimiter, rateKey } from '../src/server/security/rateLimit';
import { MemoryRateLimiter } from '../src/server/security/rateLimitMemory';

/** 滑动窗口限流（SECURITY.md 认证节：按 用户 + IP + 路由）。 */
describe('rateLimit（内存滑动窗口）', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-22T00:00:00Z'));
    await getRateLimiter().reset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('窗口内放行到上限，之后挡住', async () => {
    const rl = getRateLimiter();
    const key = rateKey('auth/login', '1.2.3.4', 'a@b.c');
    for (let i = 0; i < 5; i += 1) expect((await rl.hit(key, 5, 60_000)).allowed).toBe(true);
    const blocked = await rl.hit(key, 5, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.count).toBe(5);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it('被挡下的请求不计入窗口（否则限流形同加速自锁）', async () => {
    const rl = getRateLimiter();
    const key = 'route|anon|ip';
    await rl.hit(key, 2, 60_000);
    await rl.hit(key, 2, 60_000);
    expect((await rl.hit(key, 2, 60_000)).allowed).toBe(false);
    expect((await rl.hit(key, 2, 60_000)).count).toBe(2); // 仍是 2，没被拒请求顶上去
  });

  it('窗口滑过后名额重新放出', async () => {
    const rl = getRateLimiter();
    const key = 'route|user|ip';
    await rl.hit(key, 2, 60_000);
    await rl.hit(key, 2, 60_000);
    expect((await rl.hit(key, 2, 60_000)).allowed).toBe(false);
    vi.advanceTimersByTime(60_001);
    expect((await rl.hit(key, 2, 60_000)).allowed).toBe(true);
  });

  it('不同键互不影响（按 用户+IP+路由 分桶）', async () => {
    const rl = getRateLimiter();
    expect((await rl.hit('a', 1, 60_000)).allowed).toBe(true);
    expect((await rl.hit('a', 1, 60_000)).allowed).toBe(false);
    expect((await rl.hit('b', 1, 60_000)).allowed).toBe(true);
  });

  it('reset(key) 只清一个桶', async () => {
    const rl = getRateLimiter();
    await rl.hit('x', 1, 60_000);
    await rl.hit('y', 1, 60_000);
    await rl.reset('x');
    expect((await rl.hit('x', 1, 60_000)).allowed).toBe(true);
    expect((await rl.hit('y', 1, 60_000)).allowed).toBe(false);
  });
});

/**
 * 桶的**数量**这一侧（`rateLimitMemory.ts` 页眉"这张表能有多少只桶"那一节）。
 *
 * 上面那一组问的是"一只桶里存多少"，这一组问的是另一格，而它原来一格门都没有：这张表只在
 * 同一个键再次被命中时刷新自己，于是别的键里早就过期的时间戳与键名永远留着——而桶键里那段
 * 身份是中间件给每个新访客现签的，"来一个人"就是"多一只桶"。
 *
 * 每条用例都配一个反证或者一个"只有对的那版实现能过"的形状：
 * 清扫与上界各自能被"看起来也在工作"的错写法冒充（按最小窗口扫、随机淘汰、每次命中排一次全表），
 * 所以判据落在**谁被删了**与**谁还活着**上，不只落在总数上。臂见 `docs/adr/0077-…`。
 */
describe('进程内限流桶的规模（清扫、上界与记账）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-31T00:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * 某个计数器的累计值（跨所有标签求和，或按给定标签筛）。
   * 读的是 `snapshot()` 而不是驱动内部字段：这一片要证的半句是"运维读得到的那串数真的在动"，
   * 只钉测试能读到的 getter 就等于把那句话钉在一个没人看得见的位置上。
   */
  const counter = (name: 'nexus_rate_limit_buckets_created_total' | 'nexus_rate_limit_buckets_pruned_total', labels?: Record<string, string>): number => {
    const metric = snapshot().find((m) => m.name === name);
    if (!metric || metric.kind !== 'counter') return 0;
    return metric.series
      .filter((s) => !labels || Object.entries(labels).every(([k, v]) => s.labels[k] === v))
      .reduce((n, s) => n + s.value, 0);
  };

  it('记账对得上：created − pruned 就是这张表现在的桶数', async () => {
    const rl = new MemoryRateLimiter({ maxBuckets: 100, sweepEveryHits: 8 });
    const base = {
      created: counter('nexus_rate_limit_buckets_created_total'),
      pruned: counter('nexus_rate_limit_buckets_pruned_total'),
    };
    /** 相对起点的增量——指标是进程全局的，别的用例也在写它，读绝对值就是读别人的账。 */
    const totals = () => ({
      created: counter('nexus_rate_limit_buckets_created_total') - base.created,
      pruned: counter('nexus_rate_limit_buckets_pruned_total') - base.pruned,
    });

    for (let i = 0; i < 5; i += 1) await rl.hit(`gate|user-${i}|10.0.0.${i}`, 3, 60_000);
    expect(totals()).toEqual({ created: 5, pruned: 0 });
    expect(totals().created - totals().pruned).toBe(rl.bucketCount);

    // 窗口过后被清扫：恒等式在"删东西"之后必须照样成立，不然 pruned 少记了一格。
    vi.advanceTimersByTime(60_001);
    for (let i = 0; i < 8; i += 1) await rl.hit('gate|sweep-trigger|x', 100, 60_000);
    expect(rl.bucketCount).toBe(1); // 那 5 只整窗过期被收走，只剩触发清扫的这一只
    expect(totals()).toEqual({ created: 6, pruned: 5 });
    expect(totals().created - totals().pruned).toBe(rl.bucketCount);

    // reset() 也记一笔：不记的话这句恒等式每次清桶都差一截，而差的那一截正是"数不清自己攒了多少桶"。
    await rl.reset();
    expect(totals()).toEqual({ created: 6, pruned: 6 });
    expect(totals().created - totals().pruned).toBe(rl.bucketCount);
    expect(rl.bucketCount).toBe(0);
  });

  it('过期窗口被收走，还在窗口里的那一格一个字没少（清扫按每只桶自己的窗口判）', async () => {
    const rl = new MemoryRateLimiter({ maxBuckets: 100, sweepEveryHits: 4 });
    const shortWindow = 'gate|short|1.1.1.1'; // 60s
    const longWindow = 'gate|long|2.2.2.2'; // 10 分钟——同一张表里同时住着两种窗口
    await rl.hit(shortWindow, 2, 60_000);
    await rl.hit(longWindow, 2, 600_000);
    await rl.hit(longWindow, 2, 600_000);

    vi.advanceTimersByTime(60_001);
    // 触发一次清扫（第 4 条起）：短窗口的桶整只过期，长窗口那只最新一条命中距今才 60s。
    await rl.hit('gate|trigger|3.3.3.3', 100, 60_000);
    await rl.hit('gate|trigger|3.3.3.3', 100, 60_000);
    expect(rl.bucketCount).toBe(2); // 长窗口 + 触发者；短窗口的被收走

    // 长窗口那只的额度没被清扫动过：它已经有 2 条命中，limit 也是 2，所以下一次必须被挡。
    // 这一句就是"清扫不能按最小窗口判"的牙——按错的窗口判，它会在这里变成放行。
    const blocked = await rl.hit(longWindow, 2, 600_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.count).toBe(2);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it('洪水把表顶到上界就不再涨，淘汰的是最久没被碰的那一头', async () => {
    const rl = new MemoryRateLimiter({ maxBuckets: 8, sweepEveryHits: 1000 });
    const base = counter('nexus_rate_limit_buckets_pruned_total', { reason: 'cap' });
    for (let i = 0; i < 50; i += 1) await rl.hit(`gate|visitor-${i}|9.9.9.9`, 20, 600_000);
    expect(rl.bucketCount).toBe(8);
    expect(counter('nexus_rate_limit_buckets_pruned_total', { reason: 'cap' }) - base).toBe(42);
    // 桶被收走不等于"不限量"：活下来的那几只照常按自己的窗口数到顶。
    // `last` 每打一次就被碰一次，所以它在 LRU 尾部，不会被自己这次的洪水挤掉。
    const last = 'gate|visitor-49|9.9.9.9';
    for (let i = 0; i < 19; i += 1) expect((await rl.hit(last, 20, 600_000)).allowed).toBe(true);
    expect((await rl.hit(last, 20, 600_000)).allowed).toBe(false);
    expect(rl.bucketCount).toBe(8);
  });

  it('正在挨挡的那一格不被洪水淘汰（碰过的桶留在 LRU 尾部）', async () => {
    const rl = new MemoryRateLimiter({ maxBuckets: 4, sweepEveryHits: 1000 });
    const offender = 'gate|offender|8.8.8.8';
    expect((await rl.hit(offender, 1, 600_000)).allowed).toBe(true);
    expect((await rl.hit(offender, 1, 600_000)).allowed).toBe(false); // 被挡也碰它一次：这是"活跃"的定义
    for (let i = 0; i < 30; i += 1) {
      await rl.hit(`gate|bystander-${i}|7.7.7.7`, 5, 600_000);
      // 每次洪水都回来挨一次挡，而且**每一次都还得是挡**：中途放过一次就是这一格
      // 被挤出去过（被挤出去的桶窗口是空的）。原来只核最后一次的读数，
      // 于是"碰过之后没挪到尾部"这个变异臂照样绿——那一臂是 2026-11-02 抓出来的惰性臂。
      expect((await rl.hit(offender, 1, 600_000)).allowed, `第 ${i} 轮把正在挨挡的那一格挤掉了`).toBe(false);
    }
    expect(rl.bucketCount).toBe(4);
    // 它的窗口还在：再来一次仍然被挡，而且计数仍贴着上限。
    const again = await rl.hit(offender, 1, 600_000);
    expect(again.allowed).toBe(false);
    expect(again.count).toBe(1);
  });

  /**
   * 顶到上界时，整窗已过期的头部桶是**放过名额**而不是牺牲：它走 `expired` 那本账，
   * `cap` 不涨、日志不喊。
   *
   * 这一格管的是"这张表同时住着 60 秒与 10 分钟的窗口"：一张顶满的表如果新来的都是短窗口，
   * 而淘汰只看插入序不看每只桶自己的窗口，那么每 256 次命中那一趟全表清扫还没轮到，
   * 挨刀的就得是最久没被碰的**活桶**。把放过的额度记进 `cap`，那个读数在正常流量下也会涨，
   * 而它唯一的用处就是说"这台进程正被 distinct 身份压着"。
   */
  it('顶到上界时先放过整窗已过期的名额，不把活桶算成牺牲', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const rl = new MemoryRateLimiter({ maxBuckets: 2, sweepEveryHits: 1000 });
      const cap = () => counter('nexus_rate_limit_buckets_pruned_total', { reason: 'cap' });
      const expired = () => counter('nexus_rate_limit_buckets_pruned_total', { reason: 'expired' });
      const capBase = cap();
      const expiredBase = expired();

      await rl.hit('gate|A|1.1.1.1', 1, 60_000);
      await rl.hit('gate|B|2.2.2.2', 1, 60_000);
      // 第三只进来顶到上界：头部的 A 还在自己窗口里，这一次确实是牺牲。
      await rl.hit('gate|C|3.3.3.3', 1, 60_000);
      expect(rl.bucketCount).toBe(2);
      expect(cap() - capBase).toBe(1);
      expect(expired() - expiredBase).toBe(0);
      expect(warn.mock.calls.length, '牺牲了一只桶，这一声该有').toBe(1);

      // B 与 C 现在整窗过期。新来的 D 顶到上界时该放过 B（额度自然释放），C 不算牺牲。
      vi.advanceTimersByTime(60_001);
      await rl.hit('gate|D|4.4.4.4', 1, 60_000);
      expect(rl.bucketCount).toBe(2);
      expect(cap() - capBase, '没有一只活桶被挤掉，cap 那本账不该动').toBe(1);
      expect(expired() - expiredBase).toBe(1);
      expect(warn.mock.calls.length, '放过过期名额是常态，不该喊到上界').toBe(1);
    } finally {
      warn.mockRestore();
    }
  });

  /**
   * 洪水期间的"到上界"日志最多一分钟一行。
   *
   * 为什么这一格值得钉：顶到上界之后**每一次命中**都淘汰一只，日志若跟着逐笔走，
   * 那就是每请求一次磁盘写——一道挡免成本写入口的闸自己开了一条成本更低的入口。
   * counter 是逐笔的（下面那条 `cap` 增量 26 就是逐笔的读数），日志只需要提醒人。
   */
  it('洪水把上界顶住时日志按分钟收敛，而 counter 仍然逐笔记', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const rl = new MemoryRateLimiter({ maxBuckets: 4, sweepEveryHits: 1000 });
      const base = counter('nexus_rate_limit_buckets_pruned_total', { reason: 'cap' });
      for (let i = 0; i < 30; i += 1) await rl.hit(`gate|flood-${i}|5.5.5.5`, 1, 600_000);
      expect(rl.bucketCount).toBe(4);
      expect(counter('nexus_rate_limit_buckets_pruned_total', { reason: 'cap' }) - base).toBe(26);
      expect(warn.mock.calls.length, '26 次淘汰只该喊一行').toBe(1);

      // 一分钟后仍在洪水里 ⇒ 再喊一行。这一句钉的是"收敛成节奏"，不是"从此闭嘴"。
      vi.advanceTimersByTime(60_001);
      await rl.hit('gate|flood-late|5.5.5.5', 1, 600_000);
      expect(warn.mock.calls.length).toBe(2);
    } finally {
      warn.mockRestore();
    }
  });

  it('代价说清楚：被挤出去的那一格，下一次命中重新变空', async () => {
    const rl = new MemoryRateLimiter({ maxBuckets: 2, sweepEveryHits: 1000 });
    await rl.hit('gate|first|1.1.1.1', 1, 600_000);
    expect((await rl.hit('gate|first|1.1.1.1', 1, 600_000)).allowed).toBe(false);
    await rl.hit('gate|second|2.2.2.2', 1, 600_000);
    await rl.hit('gate|third|3.3.3.3', 1, 600_000); // 顶到上界，first 是最久没被碰的
    expect(rl.bucketCount).toBe(2);
    // first 的窗口没了 → 它重新拿到一次名额。这一条不是缺陷披露，是这一片方向的读数：
    // 上界之内先到先得，真正的答案在 Redis 驱动与边缘层（见页眉"限度"那一段）。
    expect((await rl.hit('gate|first|1.1.1.1', 1, 600_000)).allowed).toBe(true);
  });

  it('上界默认值存在而且不是无穷（没设 maxBuckets 时也有一张收口的表）', async () => {
    const rl = new MemoryRateLimiter();
    const base = counter('nexus_rate_limit_buckets_pruned_total', { reason: 'cap' });
    for (let i = 0; i < 1000; i += 1) await rl.hit(`gate|visitor-${i}|1.1.1.1`, 5, 600_000);
    expect(rl.bucketCount).toBe(1000); // 远没到上界，一条都不该被淘汰
    expect(counter('nexus_rate_limit_buckets_pruned_total', { reason: 'cap' }) - base).toBe(0);
    expect(rl.bucketCount).toBeLessThanOrEqual(50_000);
  });
});

describe('限流键与 IP 提取', () => {
  it('rateKey 把路由 / 身份 / IP 拼成稳定桶键', () => {
    expect(rateKey('auth/login', '9.9.9.9', 'u')).toBe('auth/login|u|9.9.9.9');
    expect(rateKey('auth/register', null)).toBe('auth/register|anon|no-ip');
  });

  /**
   * 取的是**右端**，不是第一段。这一条原来写着"取 x-forwarded-for 第一段"并且真的断到
   * `1.1.1.1`——那是链条里客户端随手写的那一段，每请求换一个值就换一个限流桶。
   * 读法与限度见 `client-ip.test.ts` 与 `docs/adr/0070-forwarded-ip-take-rightmost-trusted-hop.md`。
   */
  it('clientIp 取 x-forwarded-for 右端（反代追加的那一段），回落 x-real-ip', () => {
    expect(clientIp(new Request('http://x', { headers: { 'x-forwarded-for': '1.1.1.1, 2.2.2.2' } }))).toBe('2.2.2.2');
    expect(clientIp(new Request('http://x', { headers: { 'x-real-ip': '3.3.3.3' } }))).toBe('3.3.3.3');
    expect(clientIp(new Request('http://x'))).toBeNull();
  });
});
