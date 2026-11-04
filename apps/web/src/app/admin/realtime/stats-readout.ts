/**
 * 实时表盘那两格怎么换成话（§163，第三十七片）。
 *
 * 从 `StatsPanel.tsx` 拆出来单独放着，理由不是"整洁"：这两格的全部价值就在于
 * **它们可以合法地不一致**（Redis 比这台晚起来 ⇒ 启动那次"没接上"而此刻"在"）。
 * 一句合成话的写法在界面上看不出任何毛病，只能把逐档措辞变成可判定的纯函数来钉。
 */

/** 跨实例线路的档位：`na` 与 `down` 是两句话——没有这回事 ≠ 有一根断了的线 */
export type WireLive = 'up' | 'pending' | 'down' | 'na';

export type RealtimeStatsReadout = {
  driver: 'in-process' | 'redis';
  instance: string;
  subscriberCount: number;
  /** **构造那一次**建起来了没有：一次性的闩，落定后不再改口 */
  wireReady: boolean | null;
  /** **此刻**通不通：服务端每次现读两条连接的 status */
  wire: WireLive;
  wireErrorCount: number | null;
};

/**
 * **此刻**这一行（读 `stats.wire`）。
 * `pending` 的措辞故意不说"故障"：connecting / reconnecting 是连接层在正常自愈，
 * 把它报成故障会让人去做一件没必要的重启。
 */
export const LIVE_LABEL: Record<WireLive, string> = {
  na: '—（这个驱动没有线路）',
  up: '在（发布与订阅两条连接都 ready）',
  pending: '还在路上（connecting / reconnecting——重连是正常自愈，这一档不是故障）',
  down: '已关（end / close）——这台现在收不到别机的事件，直到重新连上',
};

/**
 * **启动那一次**这一行（读 `stats.wireReady`）。
 * 它与上面那行分开写是有意的：合起来就变成一句错话——要么把已经通了的这台说成死的，
 * 要么把启动时根本没接上这件事洗掉，而那件事决定了要不要去看 `wireErrorCount` 的起点。
 */
export const BOOT_LABEL: Record<WireLive, string> = {
  up: '接上了',
  down: '没接上（此后归连接层自动重连——"现在通不通"看上面那一行）',
  pending: '还没落定（刚启动或正在等第一轮重试）',
  na: '—（这个驱动没有线路）',
};

/**
 * 现读值只认这四档。认不出来的一律 `na`，**不许**猜成 `up` 或 `down`：
 * 猜 `up` 是把没证据的这台画成健康，猜 `down` 是给一个不认识的驱动判死。
 */
export function liveTag(wire: unknown): WireLive {
  return wire === 'up' || wire === 'pending' || wire === 'down' || wire === 'na' ? wire : 'na';
}

/** 闩只有三态（true / false / null），驱动决定它适不适不存在 */
export function bootTag(stats: Pick<RealtimeStatsReadout, 'driver' | 'wireReady'>): WireLive {
  if (stats.driver === 'in-process') return 'na';
  if (stats.wireReady === true) return 'up';
  if (stats.wireReady === false) return 'down';
  return 'pending';
}

/**
 * 失败累计：`null` 说"没有线路，不适用"，`0` 说"跑着，一帧没断过"。
 * 把前者渲染成 0 就等于对着一台进程内驱动宣布"你的 Redis 很健康"。
 */
export function errorCountText(wireErrorCount: number | null): string {
  return wireErrorCount === null ? '—（没有线路，不适用）' : String(wireErrorCount);
}

/**
 * 回执形状门：面板只画它认得的自报家门。
 * 认不出来就明说"回执形状不认识"，不能拿半截数据渲染一个看起来正常的表盘——
 * 一次失败的读什么都没证明，画成 0 或画成"在"都是凭空造出来的读数。
 */
export function isKnownStats(body: unknown): body is RealtimeStatsReadout {
  const value = body as (Partial<RealtimeStatsReadout> & { message?: string }) | null;
  return (
    !!value &&
    typeof value.driver === 'string' &&
    typeof value.subscriberCount === 'number' &&
    typeof value.wire === 'string'
  );
}
