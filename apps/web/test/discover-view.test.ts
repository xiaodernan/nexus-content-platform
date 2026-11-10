import { describe, expect, it } from 'vitest';
import {
  busTag,
  dashOr,
  epochNote,
  footNote,
  generationNote,
  hitRate,
  isKnownReadout,
  keepPreviousOnError,
  loadNote,
  loadRow,
  loadTimingHeadline,
  pollAllowed,
  staleNote,
  waveNote,
  waveRow,
  wavesHeadline,
} from '../src/app/admin/discover-cache/discover-view';
import type { DiscoverCacheReadout, EpochWave, LoadDuration } from '../src/server/domain/discover-cache';

/**
 * §SC-43 展示判据：纯函数、零 React / DOM / 网络，逐支验电。
 * 与 `gateway-view.test.ts` 同范式——守的是"读反了界面就说谎、测试却还绿"的那几句话。
 */

const knownReadout = (): DiscoverCacheReadout => ({
  measuredAt: '2026-11-11T05:00:00.000Z',
  busAttached: false,
  busUrlConfigured: false,
  stats: {
    hits: 10,
    misses: 5,
    evictions: 1,
    loads: 5,
    inFlight: 0,
    size: 12,
    globalGen: 7,
    globalEpoch: 2,
    viewerGenerations: 3,
    config: { ttlMs: 15_000, maxEntries: 2048, maxViewers: 512, waveWindowMs: 15_000, waveCapacity: 12, staleMaxMs: 30_000, slowLoadMs: 1_000, loadSampleCapacity: 12 },
    bus: null,
    waves: [],
    waveConfig: { windowMs: 15_000, capacity: 12 },
    staleServed: 0,
    loadsTimed: 0,
    maxLoadMs: 0,
    slowLoads: 0,
    recentLoads: [],
  },
});

describe('命中率（分母为 0 不说 0%）', () => {
  it('有读时按 hits/(hits+misses) 给出整数百分比', () => {
    expect(hitRate(10, 5)).toBe('67%');
    expect(hitRate(1, 0)).toBe('100%');
    expect(hitRate(0, 1)).toBe('0%'); // 有读且全未命中，0% 是诚实的
  });
  it('分母为 0 说"还没有读"，绝不画 0%（那会把"没人读"说成"读了都没命中"）', () => {
    expect(hitRate(0, 0)).toBe('—（还没有读）');
    expect(hitRate(0, 0)).not.toContain('0%');
  });
});

describe('总线状态（null≠0，本片最重要的一句）', () => {
  it('bus=null 单独一档中性说法，不画 published/received/errors/applied 四个 0', () => {
    const tag = busTag(null);
    expect(tag.connected).toBe(false);
    expect(tag.headline).toContain('未接');
    expect(tag.detail).not.toMatch(/ published \d/); // 没有"发出 N"这种把 null 当 0 的账
    expect(tag.dot).toBe('gw-dotUnmeasured'); // 中性色，不是成功/告警
  });
  it('bus 已接且无错 = success 档，四账照实报', () => {
    const tag = busTag({ published: 3, received: 2, errors: 0, applied: 2 });
    expect(tag.connected).toBe(true);
    expect(tag.dot).toBe('gw-dotUp');
    expect(tag.headline).toContain('正常');
    expect(tag.detail).toContain('发出 3');
    expect(tag.detail).toContain('收到 2');
    expect(tag.detail).toContain('最终一致'); // 已接也绝不承诺瞬时强一致
  });
  it('bus 有错 = warn 档，且把"丢帧退回 TTL"讲出来（不说线路正常）', () => {
    const tag = busTag({ published: 3, received: 1, errors: 2, applied: 1 });
    expect(tag.connected).toBe(true);
    expect(tag.dot).toBe('gw-dotUnknown');
    expect(tag.headline).toContain('错误');
    expect(tag.detail).toContain('TTL');
    expect(tag.detail).not.toContain('线路正常');
  });
});

describe('null / 失败 / 后台的诚实', () => {
  it('dashOr(null) 画"—（未测）"不画 0；有值照实', () => {
    expect(dashOr(null)).toBe('—（未测）');
    expect(dashOr(0)).toBe('0');
    expect(dashOr(null, '—（未接）')).toBe('—（未接）');
  });
  it('后台标签不轮询；只有 visible 发（不在没人看时制造流量）', () => {
    expect(pollAllowed('visible')).toBe(true);
    expect(pollAllowed('hidden')).toBe(false);
    expect(pollAllowed('prerender')).toBe(false);
  });
  it('拉取失败保留上一帧：有旧账就还渲染它，不清空', () => {
    expect(keepPreviousOnError(true)).toBe(true);
    expect(keepPreviousOnError(false)).toBe(false);
  });
});

describe('回执形状门（坏 JSON / 残缺 bus / 残缺 config 不许画成真读数）', () => {
  it('完整读数通过', () => {
    expect(isKnownReadout(knownReadout())).toBe(true);
  });
  it('非对象 / 缺 measuredAt / 缺计数字段都挡掉', () => {
    expect(isKnownReadout(null)).toBe(false);
    expect(isKnownReadout('oops')).toBe(false);
    expect(isKnownReadout({ ...knownReadout(), measuredAt: undefined })).toBe(false);
    const broken = knownReadout();
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, hits: '10' } })).toBe(false);
  });
  it('bus 是残缺对象（缺四账之一）也挡掉——否则会被画成"线路正常"', () => {
    const broken = knownReadout();
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, bus: { published: 1, received: 1 } } })).toBe(false);
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, bus: { published: 1, received: 1, errors: 0, applied: 1 } } })).toBe(true);
  });
  it('bus=null（单机）是合法读数，不被形状门误杀', () => {
    expect(isKnownReadout({ ...knownReadout(), stats: { ...knownReadout().stats, bus: null } })).toBe(true);
  });
  it('globalEpoch（§SC-44 面板要显示）缺/类型错也挡掉——否则运维看到 undefined', () => {
    const broken = knownReadout();
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, globalEpoch: undefined } })).toBe(false);
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, globalEpoch: '2' } })).toBe(false);
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, globalEpoch: 0 } })).toBe(true);
  });
  it('config 是面板分母（size/maxEntries）与秒数（ttlMs/1000）的来源，缺一个/类型错都挡掉', () => {
    const broken = knownReadout();
    for (const key of ['ttlMs', 'maxEntries', 'maxViewers', 'staleMaxMs']) {
      expect(isKnownReadout({
        ...broken,
        stats: { ...broken.stats, config: { ...broken.stats.config, [key]: undefined } },
      })).toBe(false);
      expect(isKnownReadout({
        ...broken,
        stats: { ...broken.stats, config: { ...broken.stats.config, [key]: 'x' } },
      })).toBe(false);
    }
    // 整个 config 缺失 / 非对象也挡掉
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, config: undefined } })).toBe(false);
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, config: 'oops' } })).toBe(false);
  });
  it('§SC-45 waves 缺失/非数组挡掉；空数组是合法读数（还没发生全局失效）', () => {
    const broken = knownReadout();
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, waves: undefined } })).toBe(false);
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, waves: 'oops' } })).toBe(false);
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, waves: [] } })).toBe(true);
  });
  it('§SC-45 单波字段坏（epoch 非数 / firstFillMs 是 undefined / settled 非布尔）都挡掉', () => {
    const broken = knownReadout();
    const good: EpochWave = { epoch: 1, openedAtMs: 0, loadsDelta: 2, peakInFlight: 1, firstFillMs: 5, settled: true };
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, waves: [good] } })).toBe(true);
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, waves: [{ ...good, epoch: '1' }] } })).toBe(false);
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, waves: [{ ...good, firstFillMs: undefined }] } })).toBe(false);
    // firstFillMs=null 是合法的"窗口内无人读"，别误杀
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, waves: [{ ...good, firstFillMs: null }] } })).toBe(true);
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, waves: [{ ...good, settled: 'yes' }] } })).toBe(false);
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, waves: [null] } })).toBe(false);
  });
  it('§SC-45 waveConfig 缺失/字段坏挡掉——它是旁注秒数与容量的分母', () => {
    const broken = knownReadout();
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, waveConfig: undefined } })).toBe(false);
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, waveConfig: { windowMs: 15_000 } } })).toBe(false);
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, waveConfig: { windowMs: 'x', capacity: 12 } } })).toBe(false);
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, waveConfig: { windowMs: 15_000, capacity: 12 } } })).toBe(true);
  });
  it('§SC-46 staleServed 缺失/类型错挡掉——面板拿它画"端了几次旧页"，缺了会画 undefined', () => {
    const broken = knownReadout();
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, staleServed: undefined } })).toBe(false);
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, staleServed: '3' } })).toBe(false);
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, staleServed: 0 } })).toBe(true); // 0 合法：还没抖过
  });
  it('§SC-46 config.staleMaxMs 是旁注秒数的分母，缺/类型错挡掉（不画 NaN s）', () => {
    const broken = knownReadout();
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, config: { ...broken.stats.config, staleMaxMs: undefined } } })).toBe(false);
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, config: { ...broken.stats.config, staleMaxMs: 'x' } } })).toBe(false);
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, config: { ...broken.stats.config, staleMaxMs: 30_000 } } })).toBe(true);
  });
});

describe('旁注与页脚（把方法论结论与最终一致边界放到运维眼前）', () => {
  it('水位线旁注讲清"淘汰只多查库、不复活旧隐私"', () => {
    const note = generationNote(7, 3, 512);
    expect(note).toContain('7');
    expect(note).toContain('3/512');
    expect(note).toContain('不会');
  });
  it('单机未设 env：页脚说跨实例未启用、本机即时生效', () => {
    const foot = footNote(false, false, 4000);
    expect(foot).toContain('未启用');
    expect(foot).toContain('即时生效');
  });
  it('设了 env 但还没接上：页脚说"异步稍后可能接上"，不谎称部署错了', () => {
    expect(footNote(false, true, 4000)).toContain('稍后可能接上');
  });
  it('接了总线：页脚必讲"最终一致 + 丢帧退回 TTL"，不含糊成强一致', () => {
    const foot = footNote(true, true, 4000);
    expect(foot).toContain('最终一致');
    expect(foot).toContain('TTL');
    expect(foot).not.toContain('瞬时强一致生效');
  });
  it('轮询秒数跟 pollMs 走、只在 scope 出现一次（改 POLL_MS 时 scope 不说谎、不重复）', () => {
    const foot = footNote(true, true, 8000);
    expect(foot).toContain('每 8 秒');
    expect(foot).not.toContain('每 4 秒');
    expect(foot.match(/每 \d+ 秒/g)).toHaveLength(1); // 早先 scope 硬编码 4、末尾又拼一次，会在这里红
  });
});

describe('全局世代旁注（§SC-44 把即时可见的收益与冷启动代价都摆出来）', () => {
  it('讲清 epoch 因何涨、涨了作废哪些键、为什么冷启动尖峰不是故障', () => {
    const note = epochNote(3);
    expect(note).toContain('3'); // 当前世代如实报
    expect(note).toContain('发布');
    expect(note).toContain('下架');
    expect(note).toContain('匿名'); // 匿名共享缓存也被作废，这是与 privacy 失效的关键区别
    expect(note).toContain('TTL'); // 明说不用等 TTL
    expect(note).toContain('singleflight'); // 冷启动尖峰的成因
    expect(note).toContain('不是缓存故障'); // 预期行为，不是事故
  });
});

describe('发布冷启动波（§SC-45 只记不拦，把尖峰从猜测变成数字）', () => {
  const wave = (over: Partial<EpochWave> = {}): EpochWave => ({
    epoch: 2, openedAtMs: 1_000, loadsDelta: 4, peakInFlight: 2, firstFillMs: 12, settled: true, ...over,
  });

  it('空波榜：说"还没触发采样"，绝不画成"没有惊群"（那是把没测说成测过没事）', () => {
    const head = wavesHeadline([]);
    expect(head).toContain('还没');
    expect(head).toContain('没有惊群'); // 明确点名这个被禁止的断言
    expect(head).toContain('不是'); // 主动纠正
  });
  it('有波榜：报波数、最新世代、峰值打库与峰值在途，并诚实标"瞬时采样非锁存"', () => {
    const head = wavesHeadline([wave({ epoch: 3, loadsDelta: 2, peakInFlight: 1 }), wave({ epoch: 2, loadsDelta: 7, peakInFlight: 3 })]);
    expect(head).toContain('2 波');
    expect(head).toContain('最新世代 3'); // 首项即最新
    expect(head).toContain('峰值打库 7'); // 取最大，不是首项
    expect(head).toContain('峰值在途 3');
    expect(head).toContain('瞬时'); // 不谎称精确锁存
  });
  it('单波行：firstFillMs=null 说"窗口内无人读"，绝不画 0ms', () => {
    const cold = waveRow(wave({ firstFillMs: null }));
    expect(cold).toContain('窗口内无人读');
    expect(cold).not.toContain('0ms');
    const hot = waveRow(wave({ firstFillMs: 0 }));
    expect(hot).toContain('0ms'); // 真测到 0ms 才照实说
    expect(hot).not.toContain('无人读');
  });
  it('单波行：如实标"已定格"/"采样中"，读数还会变的别画成终值', () => {
    expect(waveRow(wave({ settled: true }))).toContain('已定格');
    expect(waveRow(wave({ settled: false }))).toContain('采样中');
  });
  it('方法论旁注：讲清上界个位数 / 三道舱壁 / 未加闸门的理由 / 触发阈值', () => {
    const note = waveNote(15_000, 12);
    expect(note).toContain('15s'); // 窗口秒数从入参来
    expect(note).toContain('12'); // 有界容量
    expect(note).toContain('个位数'); // 上界判断
    expect(note).toContain('singleflight');
    expect(note).toContain('连接池');
    expect(note).toContain('SemaphoreBulkhead'); // 三道舱壁齐全
    expect(note).toContain('不加跨键并发闸门'); // 反向判断
    expect(note).toContain('permit'); // 说清代价
    expect(note).toContain('逼近'); // 触发阈值
    expect(note).toContain('瞬时采样');
  });
});

describe('上游故障降级旁注（§SC-46 把"端旧页"的次数与边界摆到运维眼前）', () => {
  it('0 次不说"降级没开"——点明只是还没抖过，开关是 staleMaxMs', () => {
    const note = staleNote(0, 30_000);
    expect(note).toContain('0');
    expect(note).toContain('还没抖过'); // 0 ≠ 功能没开（同 null≠0、0% 家族）
    expect(note).toContain('不是降级没开');
    expect(note).toContain('30s'); // 上界秒数从入参来
  });
  it('有降级次数如实报，且讲清旧值上界 / 隐私红线 / 无旧值不画空 / 对读用户透明', () => {
    const note = staleNote(7, 2_000);
    expect(note).toContain('7 次');
    expect(note).toContain('2s'); // 上界秒数从入参来
    expect(note).toContain('超了宁可报错'); // 有界
    expect(note).toContain('拉黑'); // 隐私红线：键变了绝不端
    expect(note).toContain('不画空页'); // 无旧值不造空结果
    expect(note).toContain('察觉不到'); // 降级对内容消费者透明
    expect(note).toContain('运维面板'); // 但运维可见
  });
  it('上界秒数跟入参走，不写死（改 staleMaxMs 时旁注不说谎）', () => {
    expect(staleNote(1, 5_000)).toContain('5s');
    expect(staleNote(1, 5_000)).not.toContain('30s');
  });
});

describe('加载耗时观测（§SC-47 先量再治，0 不说"都很快"）', () => {
  const sample = (over: Partial<LoadDuration> = {}): LoadDuration => ({
    epoch: 2, durationMs: 1345, ok: true, atMs: 1_000, ...over,
  });

  it('形状门：config 缺 slowLoadMs / loadSampleCapacity 挡掉（旁注秒数、容量分母不能画 NaN/undefined）', () => {
    const broken = knownReadout();
    expect(isKnownReadout({
      ...broken,
      stats: { ...broken.stats, config: { ...broken.stats.config, slowLoadMs: undefined } },
    })).toBe(false);
    expect(isKnownReadout({
      ...broken,
      stats: { ...broken.stats, config: { ...broken.stats.config, loadSampleCapacity: '12' } },
    })).toBe(false);
    expect(isKnownReadout({
      ...broken,
      stats: { ...broken.stats, config: { ...broken.stats.config, slowLoadMs: 1_000, loadSampleCapacity: 12 } },
    })).toBe(true);
  });

  it('形状门：loadsTimed / maxLoadMs / slowLoads 缺一个或类型错都挡掉', () => {
    const broken = knownReadout();
    for (const key of ['loadsTimed', 'maxLoadMs', 'slowLoads']) {
      expect(isKnownReadout({ ...broken, stats: { ...broken.stats, [key]: undefined } })).toBe(false);
      expect(isKnownReadout({ ...broken, stats: { ...broken.stats, [key]: 'x' } })).toBe(false);
    }
  });

  it('形状门：recentLoads 非数组挡掉；空数组合法（还没量到）', () => {
    const broken = knownReadout();
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, recentLoads: undefined } })).toBe(false);
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, recentLoads: 'oops' } })).toBe(false);
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, recentLoads: [] } })).toBe(true);
  });

  it('形状门：单条样本字段坏（durationMs 非数 / ok 非布尔 / null 元素）都挡掉', () => {
    const broken = knownReadout();
    const good = sample();
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, recentLoads: [good] } })).toBe(true);
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, recentLoads: [{ ...good, durationMs: '1345' }] } })).toBe(false);
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, recentLoads: [{ ...good, epoch: undefined }] } })).toBe(false);
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, recentLoads: [{ ...good, ok: 'true' }] } })).toBe(false);
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, recentLoads: [{ ...good, atMs: null }] } })).toBe(false);
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, recentLoads: [null] } })).toBe(false);
    // ok=false（失败的慢查询）是合法样本，别误杀
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, recentLoads: [sample({ ok: false })] } })).toBe(true);
  });

  it('空标题：说"尚未观测"，绝不画成"没有慢查询/都很快"（同 hitRate(0,0) 家族）', () => {
    const head = loadTimingHeadline(0, 0, 0);
    expect(head).toContain('还没量到');
    expect(head).toContain('不是');
    // 被禁止的断言只应作为"纠正对象"出现在否定句里，不能成为一句独立结论。
    // 钉法：删掉否定词后，整句不得再以"没有慢查询/都很快"收尾下结论。
    expect(head).toContain('没有慢查询');
    expect(head.split('不是').length).toBe(2); // 恰好一处否定前缀，把那句封在"不是…"里
  });
  it('有样本标题：报已计时次数 / 最慢毫秒 / 超阈值次数，并诚实标"只记已跑完"', () => {
    const head = loadTimingHeadline(9, 1345, 2);
    expect(head).toContain('9 次');
    expect(head).toContain('1345ms');
    expect(head).toContain('2 次');
    expect(head).toContain('只记已跑完'); // 卡住不返回的看在途差，绝不谎报"没有慢查询"
  });
  it('单条样本行：成败如实标、毫秒与世代照实，不下"快/慢"结论', () => {
    expect(loadRow(sample())).toContain('1345ms');
    expect(loadRow(sample())).toContain('成功');
    expect(loadRow(sample())).toContain('世代 2');
    expect(loadRow(sample({ ok: false }))).toContain('失败');
    expect(loadRow(sample({ ok: false }))).not.toContain('成功');
  });
  it('方法论旁注：钉只记真实打库 / hang 不进样本 / 只 ++不拦 / 有界 / 不在 race 层设闸 / 伪需求阈值', () => {
    const note = loadNote(1_000, 12);
    expect(note).toContain('1000ms'); // 阈值是毫秒粒度，画秒会得到 1s 但 50ms 会变 0s——故照画毫秒
    expect(note).toContain('12'); // 有界容量
    expect(note).toContain('singleflight'); // 跟随者不进包装函数
    expect(note).toContain('不进样本'); // hang 诚实边界
    expect(note).toContain('不能'); // "不能证明没有连接黑洞"
    expect(note).toContain('loads − 已计时 loadsTimed'); // hang 的旁证写法，逐字来自文案
    expect(note).toContain('不 abort'); // 只记不拦
    expect(note).toContain(' abandon(key)'); // 正确方向
    expect(note).toContain('statement_timeout');
    expect(note).toContain('Promise.race'); // 明确否掉 race 层
    expect(note).toContain('伪需求'); // 先量再治的收口
  });
  it('旁注阈值毫秒跟入参走、不写死也不画秒（50ms 不能变成 0s 的谎）', () => {
    expect(loadNote(2_000, 8)).toContain('2000ms');
    expect(loadNote(2_000, 8)).not.toContain('1000ms');
    expect(loadNote(50, 8)).toContain('50ms'); // 小阈值照实画毫秒，不 /1000 变 0s
    expect(loadNote(50, 8)).toContain('8'); // 容量也跟入参
  });
});
