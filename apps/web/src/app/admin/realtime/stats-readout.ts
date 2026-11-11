/**
 * 实时表盘那两格怎么换成话（§163，第三十七片）。
 *
 * 从 `StatsPanel.tsx` 拆出来单独放着，理由不是"整洁"：这两格的全部价值就在于
 * **它们可以合法地不一致**（Redis 比这台晚起来 ⇒ 启动那次"没接上"而此刻"在"）。
 * 一句合成话的写法在界面上看不出任何毛病，只能把逐档措辞变成可判定的纯函数来钉。
 */

import type { BreakerState, JavaWireStats, JavaActuatorBreakerEntry, JavaActuatorInfo } from '@/server/realtime/java-wire';

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
  /**
   * 同一本账按原因拆开。驱动决定它存在不存在（in-process 是 `null`），
   * **但"有没有线路"这件事必须与上面那格同口供**——见 `isKnownStats`。
   * 这里不收 `WireErrorReason` 那个类型：界面照原样印驱动写下的字，
   * 词表一旦改动界面不该跟着改（改了就会漂），所以这一格对 UI 只是 `Record<string, number>`。
   */
  wireErrorByReason: Record<string, number> | null;
  /** §SC-58：Java 生产者（domain-service）那一侧的读数。`undefined`（老回执没带）/`null`（这次没拿到）= 没接上，**不是**"接了但都是 0" */
  javaWire?: JavaWireStats | null;
  /** §SC-64：/actuator/circuitbreakers 原样端出"name → entry"的清单；`null` = 没拿到，`[]` = 拿到但空。 */
  javaBreakers?: JavaActuatorBreakerEntry[] | null;
  /** §SC-66：/actuator/info 原样端出 app/runtime/os 三组；`null` = 没拿到。 */
  javaActuator?: JavaActuatorInfo | null;
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
 * 按原因拆开那账的话。限流闸那半边的同形状叫 `fallbackByReason`。
 * 有了它，"断过 3 帧"才分得清是投递不出去、收到的帧不合契约，还是有人改错了订阅——
 * 这三件事的第一反应不一样，所以只给总数等于不给建议。
 * 固定顺序：次数从多到少，再按名字，免得同一台的账每次轮询跳来跳去。
 * 词表（那几个字具体是什么）在服务端 `WIRE_ERROR_REASONS`，这里只照读，不认得也不改写。
 */
export function errorReasonList(byReason: Record<string, number> | null): string {
  if (byReason === null) return '—（没有线路，不适用）';
  const entries = Object.entries(byReason).filter(
    ([reason, count]) =>
      reason.trim().length > 0 && typeof count === 'number' && Number.isFinite(count) && count > 0,
  );
  if (entries.length === 0) return '—（这台还没出过一帧失败）';
  entries.sort(([a, an], [b, bn]) => bn - an || (a < b ? -1 : a > b ? 1 : 0));
  return entries.map(([reason, count]) => `${reason} ${count}`).join(' · ');
}

/**
 * 回执形状门：面板只画它认得的自报家门。
 * 认不出来就明说"回执形状不认识"，不能拿半截数据渲染一个看起来正常的表盘——
 * 一次失败的读什么都没证明，画成 0 或画成"在"都是凭空造出来的读数。
 *
 * 这一片加了两条，各自拦一种"看着正常"的半截回执：
 * - **驱动只有两个词**。第三个词会被 `StatsPanel` 那句 `driver === 'redis' ? … : '进程内…'`
 *   画成"进程内（单实例默认）"——对着一台真有线路的机器宣布它没有线路，是最难看出来的一种读反；
 * - **两本线路账必须同口供**。`wireErrorCount` 是数字而分账缺席/为 null，界面上就会同屏出现
 *   "失败累计 3"与"—（没有线路，不适用）"；反过来分账有数而总数 null 也一样。
 *   这一条不是防御性洁癖：`94d7cfe` 那次就是只加了分账、没加这条，
 *   于是喂一份缺 key 的回执能渲染出一张自相矛盾的表盘而没有任何门响。
 */
export function isKnownStats(body: unknown): body is RealtimeStatsReadout {
  const value = body as (Partial<RealtimeStatsReadout> & { message?: string }) | null;
  if (!value) return false;
  if (value.driver !== 'in-process' && value.driver !== 'redis') return false;
  if (typeof value.subscriberCount !== 'number') return false;
  if (typeof value.wire !== 'string') return false;
  if (!(value.wireErrorCount === null || typeof value.wireErrorCount === 'number')) return false;
  // 分账**必填**：`undefined`（整格没带）不等于 `null`（这台没有线路）
  if (value.wireErrorByReason === undefined) return false;
  const ledger = value.wireErrorByReason;
  if (!(ledger === null || (typeof ledger === 'object' && !Array.isArray(ledger)))) return false;
  return (value.wireErrorCount === null) === (ledger === null);
}

/**
 * 断路器 break 状态（可选）：`CLOSED`（闭合，正常走）、`OPEN`（断，拒后续调用/回退 fallback）、
 * `HALF_OPEN`（半开——放行少量请求试回路，仍是测试中的过渡状态）、`null`（部署关了 breaker）
 * `undefined`（老回执不带此格——如实报"未见过"）。
 */
export function breakerStateText(state: BreakerState | undefined): string {
  switch (state) {
    case 'CLOSED':
      return 'CLOSED';
    case 'OPEN':
      return 'OPEN';
    case 'HALF_OPEN':
      return 'HALF_OPEN';
    case null:
      return '—（本次部署 break 关）';
    case undefined:
      return '—（本次 wire 份响应不带此格）';
  }
}

/** §SC-66 · Java actuator info（`/actuator/info` 原样出 info 面板）。 */
export function javaActuatorPanelRows(
  info: JavaActuatorInfo | null | undefined,
): Array<[label: string, value: string]> | null {
  if (!info) return null;
  return [
    ['名称', `${info.app.name} · ${info.app.version}`],
    ['组件', `${info.app.group}:${info.app.artifact}`],
    ['Java', `${info.runtime.java} · ${info.runtime.vendor}`],
    ['OS', `${info.os.name} · ${info.os.arch}`],
  ];
}

export function javaActuatorNote(info: JavaActuatorInfo | null | undefined): string {
  if (info == null) return '没拿到 /actuator/info 的回执——这台实例没暴露 info 段（如实，不冒充）';
  return `Java 生产者 · ${info.app.name} ${info.app.version} · 编译 ${info.runtime.java} · ${info.runtime.vendor} · ${info.os.name} on ${info.os.arch}`;
}

/** §SC-58 · Java 生产者那一侧（`/admin/realtime` 里轮询同一份回执）。 */
export function kb(bytes: number): string {
  return `${Math.round(bytes / 1024)} KiB`;
}

function isJavaWirePanelShape(v: JavaWireStats): boolean {
  if (typeof v.wireChannel !== 'string' || v.wireChannel.trim().length === 0) return false;
  if (typeof v.maxFrameBytes !== 'number' || !Number.isFinite(v.maxFrameBytes) || v.maxFrameBytes <= 0) return false;
  for (const n of [v.publishedTotal, v.tooLargeDropped, v.redisFailures]) {
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return false;
  }
  if (v.breakerState !== undefined) {
    if (v.breakerState === null) return true;   // 部署关了断路器
    if (v.breakerState !== 'CLOSED' && v.breakerState !== 'OPEN' && v.breakerState !== 'HALF_OPEN') return false;
  }
  return true;
}

/**
 * Java 生产者五格行数据。`undefined`（老回执）/`null`（这次没拿到）→ `null` ——
 * 面板画一行"没拿到"，绝不画五个 0。形状不认识（NaN/空 channel/上限≤0）同样给 null。
 */
export function javaWirePanelRows(
  javaWire: JavaWireStats | null | undefined,
): Array<[label: string, value: string]> | null {
  if (!javaWire || !isJavaWirePanelShape(javaWire)) return null;
  return [
    ['线路', javaWire.wireChannel],
    ['帧上限', kb(javaWire.maxFrameBytes)],
    ['已发', String(javaWire.publishedTotal)],
    ['超限丢', String(javaWire.tooLargeDropped)],
    ['线路异常', String(javaWire.redisFailures)],
    ['breaker', breakerStateText(javaWire.breakerState)],
  ];
}

/**
 * Java 一侧的一句话。缺省/null 与 `fetchJavaWireStats` 的 null 同义——这页说话的频道只有一个：
 * **没拿到 ≠ 全 0**。有值的时候数字照原样印，不翻译成模糊的"正常/异常"（避免又写一重读不准的语义）。
 */
export function javaWireNote(javaWire: JavaWireStats | null | undefined): string {
  if (javaWire == null || !isJavaWirePanelShape(javaWire)) {
    return '没拿到 Java 生产者的读数——domain-service 没在跑、连不上 /api/v1/realtime/stats，或回执形状不认识（这不是"接了但都是 0"）';
  }
  const parts: string[] = [`Java 生产者在线：已发 ${javaWire.publishedTotal} 帧`, `帧上限 ${kb(javaWire.maxFrameBytes)}`];
  if (javaWire.tooLargeDropped > 0) parts.push(`超限丢 ${javaWire.tooLargeDropped}（发帧的那段代码值得看一眼）`);
  if (javaWire.redisFailures > 0) parts.push(`线路异常 ${javaWire.redisFailures}（去看线路侧，不是 web 侧）`);
  if (javaWire.tooLargeDropped === 0 && javaWire.redisFailures === 0) parts.push('零超限 · 零线路异常');
  return parts.join(' · ');
}
