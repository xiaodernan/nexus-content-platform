import { describe, expect, it } from 'vitest';
import {
  BOOT_LABEL,
  LIVE_LABEL,
  bootTag,
  errorCountText,
  errorReasonList,
  isKnownStats,
  liveTag,
  type RealtimeStatsReadout,
} from '@/app/admin/realtime/stats-readout';
import { WIRE_ERROR_REASONS } from '@/server/realtime/wireErrors';

/**
 * §163 表盘的两行措辞（第三十七片）。
 *
 * 拆出来判的理由写在 `stats-readout.ts` 的文件头：这两格的全部价值是**可以合法地不一致**，
 * 而"不一致时各说什么话"在界面上看不出毛病，只能当纯函数逐档钉。
 * 这里最要紧的是 `late` 与 `closed` 那两条——它们正好是相反的两个现场，
 * 而实现只要把任何一格改成从另一格推出来，这两条就同时红一条。
 */

const stats = (overrides: Partial<RealtimeStatsReadout>): RealtimeStatsReadout => ({
  driver: 'redis',
  instance: 'test-origin',
  subscriberCount: 0,
  wireReady: true,
  wire: 'up',
  wireErrorCount: 0,
  // 默认给一份"有线路、一帧没断过"的空账：缺这一格不再是合法形状（见下面那道形状门）
  wireErrorByReason: {},
  ...overrides,
});

describe('liveTag：现读值只认四档', () => {
  it('四档原样通过', () => {
    for (const value of ['up', 'pending', 'down', 'na'] as const) {
      expect(liveTag(value)).toBe(value);
    }
  });

  it('不认识的一律 na，不许猜成 up 或 down', () => {
    // 猜 up = 把没证据的这台画成健康；猜 down = 给一个不认识的驱动判死。
    // 两种猜法都说得出"这台现在通不通"，而服务端根本没这么报过。
    expect(liveTag('READY')).toBe('na');
    expect(liveTag('')).toBe('na');
    expect(liveTag(undefined)).toBe('na');
    expect(liveTag(null)).toBe('na');
    // 对照：同一个位置上认识的字符串不会被这条门误吞
    expect(liveTag('up')).toBe('up');
  });
});

describe('bootTag：闩的三态与"没有这回事"', () => {
  it('进程内驱动报 na——不是 pending，也不是 down', () => {
    // 这台机器上压根没有跨实例这回事。报 pending 会读成"正在连"，报 down 会读成"断了"，
    // 两句都是凭空造出来的故事
    expect(bootTag(stats({ driver: 'in-process', wireReady: null }))).toBe('na');
    expect(LIVE_LABEL.na).not.toBe(LIVE_LABEL.down);
  });

  it('true→up、false→down、null→pending', () => {
    expect(bootTag(stats({ wireReady: true }))).toBe('up');
    expect(bootTag(stats({ wireReady: false }))).toBe('down');
    expect(bootTag(stats({ wireReady: null }))).toBe('pending');
  });

  it('null 与 false 分开：还没落定不是没接上', () => {
    expect(BOOT_LABEL.pending).not.toBe(BOOT_LABEL.down);
  });
});

describe('两行各说各话：本片要修的就是这个', () => {
  it('late＝启动那次没接上、此刻在——Redis 比这台晚起来的现场', () => {
    const late = stats({ wireReady: false, wire: 'up' });
    expect(bootTag(late)).toBe('down');
    expect(liveTag(late.wire)).toBe('up');
    // 两行的话必须同时挂在界面上：只留一行就必然说出错的那半句
    expect(BOOT_LABEL.down).toContain('现在通不通');
    expect(LIVE_LABEL.up).toContain('在');
  });

  it('closed＝启动那次接上了、此刻已关——dispose / 主动关停的现场', () => {
    const closed = stats({ wireReady: true, wire: 'down' });
    expect(bootTag(closed)).toBe('up');
    expect(liveTag(closed.wire)).toBe('down');
    // 反证：如果活读数是 `wireReady ? up : down` 推出来的，这里会读出 up
    expect(liveTag(closed.wire)).not.toBe(bootTag(closed));
  });

  it('pending 的措辞不把它说成故障：重连是正常自愈', () => {
    // 这一档写错方向会让人去重启一台正在自己恢复的实例
    expect(LIVE_LABEL.pending).toContain('不是故障');
    expect(LIVE_LABEL.down).toContain('收不到');
  });
});

describe('errorReasonList（按原因拆账）', () => {
  it('null 说没有线路；空账说本进程还没出过失败', () => {
    // 这两句不许混成一句：前者是"这台没有跨实例这回事"，后者是"有线路且一帧没断过"
    expect(errorReasonList(null)).toContain('没有线路');
    expect(errorReasonList({})).toContain('还没出过一帧失败');
  });

  it('按次数从多到少排，同次数按名字，顺序稳定', () => {
    const text = errorReasonList({
      投递: 2,
      收到的帧不合契约: 5,
      帧序列化: 2,
    });
    expect(text).toBe('收到的帧不合契约 5 · 帧序列化 2 · 投递 2');
  });

  it('零次或空白原因不画进去', () => {
    expect(errorReasonList({ 投递: 0, '   ': 3 })).toContain('还没出过一帧失败');
  });

  it('词表里每一格都印得出来：界面不认字，只照读', () => {
    // 这一条钉的是"加一格原因要不要改界面"这个分工：不该要。
    // 界面若自己维护一份白名单（或反过来把某个词过滤掉），新加的那格就会静默消失，
    // 而总数照样涨——那是最难发现的一种"账对不上"。
    const full = Object.fromEntries(WIRE_ERROR_REASONS.map((reason) => [reason, 1])) as Record<string, number>;
    const text = errorReasonList(full);
    for (const reason of WIRE_ERROR_REASONS) {
      expect(text).toContain(reason);
    }
    expect(text.split(' · ')).toHaveLength(WIRE_ERROR_REASONS.length);
  });
});

describe('errorCountText：null 不适用与 0 健康是两句话', () => {
  it('进程内驱动的 null 不渲染成 0', () => {
    expect(errorCountText(null)).toContain('不适用');
    // 0 是"跑着一台从没断过帧的 Redis"——把它当成 null 的别名等于对进程内驱动宣布 Redis 健康
    expect(errorCountText(null)).not.toBe(errorCountText(0));
    expect(errorCountText(0)).toBe('0');
    expect(errorCountText(2)).toBe('2');
  });
});

describe('isKnownStats：面板只画它认得的自报家门', () => {
  it('完整形状通过', () => {
    expect(isKnownStats(stats({}))).toBe(true);
  });

  it('缺 wire / 缺 driver / 计数不是数 / 空回执都不通过', () => {
    // 缺 wire 那份就是这次改动之前的回执形状：形状不认得要说出来，
    // 不能拿半截数据渲染一个看起来正常的表盘
    const oldReceipt: Partial<RealtimeStatsReadout> = {
      driver: 'redis',
      instance: 'test-origin',
      subscriberCount: 0,
      wireReady: false,
      wireErrorCount: 0,
    };
    const noDriver: Partial<RealtimeStatsReadout> = { ...stats({}), driver: undefined };
    expect(isKnownStats(oldReceipt)).toBe(false);
    expect(isKnownStats(noDriver)).toBe(false);
    expect(isKnownStats({ ...stats({}), subscriberCount: '3' as unknown as number })).toBe(false);
    expect(isKnownStats(null)).toBe(false);
    // 对照：把缺的两格都补回去才通过——这一行本身就是证据：`94d7cfe` 只加了分账没改这里，
    // 于是"补一份旧回执就绿"这个控制项从此要求分账在场
    expect(isKnownStats({ ...oldReceipt, wire: 'up', wireErrorByReason: {} })).toBe(true);
  });

  it('两本线路账同口供：总数有数而分账缺席，就是半截回执', () => {
    // 这一条拦的是 94d7cfe 留下的那个洞：那一版把分账加进了 stats() 与界面，
    // 却没拦"总数是数字而分账没带"。喂这样一份回执，界面同屏写出
    // 「失败累计 3」与「—（没有线路，不适用）」，而没有任何门响。
    const noLedger: Partial<RealtimeStatsReadout> = { ...stats({}), wireErrorCount: 3, wireErrorByReason: undefined };
    const ledgerWithoutCount: Partial<RealtimeStatsReadout> = {
      ...stats({}),
      wireErrorCount: null,
      wireErrorByReason: { 投递: 1 },
    };
    expect(isKnownStats(noLedger)).toBe(false);
    expect(isKnownStats(ledgerWithoutCount)).toBe(false);
    // 进程内那台两格都是 null：这才是合法的"没有线路"，不是半截
    expect(isKnownStats({ ...stats({}), wireErrorCount: null, wireErrorByReason: null })).toBe(true);
    // 分账得是账：数组/字符串都不算（`Object.entries` 对数组照样出得来东西，界面会安静地画错）
    expect(isKnownStats({ ...stats({}), wireErrorByReason: [] as unknown as Record<string, number> })).toBe(false);
    expect(isKnownStats({ ...stats({}), wireErrorByReason: '投递 2' as unknown as Record<string, number> })).toBe(false);
  });

  it('驱动只认两个词：第三个词会被面板那句三元画成"进程内（单实例默认）"', () => {
    // `StatsPanel` 那句 `driver === 'redis' ? 'Redis 跨实例扇出' : '进程内…'` 是二分的：
    // 陌生驱动名不拦的话，对着一台真有线路的机器宣布它没有线路——是最难看出来的一种读反
    expect(isKnownStats({ ...stats({}), driver: 'kafka' as unknown as RealtimeStatsReadout['driver'] })).toBe(false);
    expect(isKnownStats({ ...stats({}), driver: 'Redis' as unknown as RealtimeStatsReadout['driver'] })).toBe(false);
  });
});
