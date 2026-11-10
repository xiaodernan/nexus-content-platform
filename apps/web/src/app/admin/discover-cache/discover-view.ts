/**
 * 发现页缓存面板的**展示判据**（与 `gateway-view.ts` 同一范式：判据抽成纯模块，组件只消费）。
 *
 * 每一行守着一句能被读反、且读反了界面会说谎的话：
 *   - `busTag(null)` 若把"没接总线"画成 published/received/errors/applied 四个 0，运维会去查
 *     "总线为什么不收发"这个不存在的事故——**没接 ≠ 接了但全 0**（null≠0，这一片最重要的一句）；
 *   - `hitRate(0,0)` 若画成 "0%"，就把"这台实例还没人读过"说成了"缓存一个都没命中"；
 *   - `pollAllowed('hidden')` 若返回 true，面板就在没人看的后台标签里给本实例制造轮询流量；
 *   - `busTag(bus)` 若把 `errors>0` 画成绿，就把"线路丢过帧/连不上"藏了起来——而那正是
 *     ADR-0114 诚实边界的落点（跨实例最终一致、丢帧退回 TTL）；
 *   - `wavesHeadline([])` 若把"还没有失效波"画成"没有惊群"，就把"还没发布过 public 作品"
 *     说成"压测过且很平稳"——空榜是"没触发采样"，不是"测过没事"（§SC-45 同一家族的诚实）；
 *   - `waveRow` 把 `firstFillMs:null`（窗口内无人读）画成 0ms，会谎称"失效瞬间就有人重填"。
 *
 * 全部纯函数、零 React / 零 DOM / 零网络，判据可逐支验电。
 */
import type { DiscoverCacheReadout, EpochWave } from '@/server/domain/discover-cache';
import type { InvalidationBusStats } from '@/server/domain/invalidation-bus';

/** 没测到 / 不适用渲染成"—（…）"，绝不渲染成 0。 */
export function dashOr(value: number | null, dash = '—（未测）'): string {
  return value === null ? dash : String(value);
}

/**
 * 命中率：分母（hits+misses）为 0 时说"还没人读"，不画 0%（0% 是一句具体的谎——它暗示
 * 有读发生且全没命中）。命中率高到 100% 也照实说，不因为"太满"而怀疑。
 */
export function hitRate(hits: number, misses: number): string {
  const total = hits + misses;
  if (total <= 0) return '—（还没有读）';
  const pct = Math.round((hits / total) * 100);
  return `${pct}%`;
}

export interface BusTag {
  readonly dot: string;
  readonly headline: string;
  readonly detail: string;
  readonly connected: boolean;
}

/** 总线状态三档：没接（null，中性）/ 已接且无错（success）/ 已接但丢过帧（warn 呼吸）。 */
export function busTag(bus: InvalidationBusStats | null): BusTag {
  if (bus === null) {
    return {
      dot: 'gw-dotUnmeasured',
      headline: '单机 · 未接跨实例总线',
      detail: '这台实例只做本机即时失效；跨实例要设 NEXUS_REDIS_URL。这不是"接了但没收发"。',
      connected: false,
    };
  }
  if (bus.errors > 0) {
    return {
      dot: 'gw-dotUnknown',
      headline: '已接 · 线路有过错误',
      detail: `发出 ${bus.published} · 收到 ${bus.received} · 错误 ${bus.errors} · 处置 ${bus.applied}；丢帧的那几台会退回 TTL（15s）自愈。`,
      connected: true,
    };
  }
  return {
    dot: 'gw-dotUp',
    headline: '已接 · 线路正常',
    detail: `发出 ${bus.published} · 收到 ${bus.received} · 错误 0 · 处置 ${bus.applied}；跨实例是最终一致，不是瞬时强一致。`,
    connected: true,
  };
}

/** 后台标签不轮询；只有 visible 才发。判据用字符串注入，不需要真的 document。 */
export function pollAllowed(visibilityState: 'visible' | 'hidden' | 'prerender'): boolean {
  return visibilityState === 'visible';
}

/** 拉取失败时**不清空上一帧**：一次失败的读什么都没证明，旧读数带 measuredAt，比空白诚实。 */
export function keepPreviousOnError(hasPrevious: boolean): boolean {
  return hasPrevious;
}

/**
 * 回执形状门：只有字段齐全、且 `bus` 是 null 或四账齐全的对象、`config` 三字段齐全，才认这份读数。
 * 挡住"后端改了形状/中间层塞了坏 JSON"被当成真读数画出来——尤其不许把缺失的 bus 当 {} 画四账 0，
 * 也不许把缺了容量字段的 config 画成 `12/undefined`、`NaN s`。
 */
export function isKnownReadout(value: unknown): value is DiscoverCacheReadout {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v['measuredAt'] !== 'string') return false;
  if (typeof v['busAttached'] !== 'boolean' || typeof v['busUrlConfigured'] !== 'boolean') return false;
  const stats = v['stats'];
  if (!stats || typeof stats !== 'object') return false;
  const s = stats as Record<string, unknown>;
  for (const key of ['hits', 'misses', 'evictions', 'loads', 'inFlight', 'size', 'globalGen', 'globalEpoch', 'viewerGenerations', 'staleServed']) {
    if (typeof s[key] !== 'number') return false;
  }
  // config 的 ttlMs / maxEntries / maxViewers 是面板 KPI 的分母（size/maxEntries）、秒数（ttlMs/1000）
  // 与水位线旁注分母（viewerGenerations/maxViewers）的来源。缺一个，组件就会把 "12/undefined"、
  // "NaN s" 画到运维眼前——坏回执必须在形状门这层挡掉，而不是渲染出 undefined 再被发现。
  const config = s['config'];
  if (!config || typeof config !== 'object') return false;
  const c = config as Record<string, unknown>;
  for (const key of ['ttlMs', 'maxEntries', 'maxViewers', 'staleMaxMs']) {
    if (typeof c[key] !== 'number') return false;
  }
  const bus = s['bus'];
  // bus 是 null（单机/未接）或四账齐全的对象；残缺对象会让 busTag 读到 undefined
  // 而误画"线路正常"——那是一句谎，必须在形状门这层就挡掉。
  if (bus !== null) {
    if (typeof bus !== 'object' || bus === null) return false;
    const b = bus as Record<string, unknown>;
    for (const key of ['published', 'received', 'errors', 'applied']) {
      if (typeof b[key] !== 'number') return false;
    }
  }
  // §SC-45 失效波读数：waves 必须是数组，每波六字段齐全（firstFillMs 允许 null=窗口内无人读，
  // settled 必须布尔）；waveConfig 的 windowMs/capacity 是旁注分母。缺一个，面板就会把
  // "NaN 波"、"undefined ms" 画到运维眼前——坏回执在形状门这层挡掉，而不是渲染后才发现。
  const waves = s['waves'];
  if (!Array.isArray(waves)) return false;
  for (const raw of waves) {
    if (!raw || typeof raw !== 'object') return false;
    const w = raw as Record<string, unknown>;
    for (const key of ['epoch', 'openedAtMs', 'loadsDelta', 'peakInFlight']) {
      if (typeof w[key] !== 'number') return false;
    }
    if (w['firstFillMs'] !== null && typeof w['firstFillMs'] !== 'number') return false;
    if (typeof w['settled'] !== 'boolean') return false;
  }
  const waveConfig = s['waveConfig'];
  if (!waveConfig || typeof waveConfig !== 'object') return false;
  const wc = waveConfig as Record<string, unknown>;
  for (const key of ['windowMs', 'capacity']) {
    if (typeof wc[key] !== 'number') return false;
  }
  return true;
}

/**
 * 单调水位线那段旁注：讲清"淘汰只会多查库、不会复活拉黑前的隐私缓存"。
 * 这是把 ADR-0113 的方法论结论第一次放到运维眼前，而不是只躺在代码注释里。
 */
export function generationNote(globalGen: number, viewerGenerations: number, maxViewers: number): string {
  return `水位线 ${globalGen}（只增不减）· generation 表 ${viewerGenerations}/${maxViewers} 个 viewer · 被淘汰只会让那个人多查一次库，不会把他拉黑前的旧视图找回来。`;
}

/**
 * §SC-44 全局世代旁注：把"新作品即时进发现页"的代价摆到运维眼前，而不是藏在 ADR 里。
 * 钉三件事：epoch 因何而涨（public 发布/下架/拒绝）、涨了会怎样（所有旧键作废、下一波重查库）、
 * 为什么这是**预期的冷启动尖峰**而非事故（singleflight 只合并同键、不跨键）。
 */
export function epochNote(globalEpoch: number): string {
  return `全局世代 ${globalEpoch}（每次 public 发布/下架/审核拒绝 +1）· 每次 +1 会让所有 sort、所有 viewer（含匿名）的旧键一次性作废，新作品无需等 TTL 就出现；代价是随后那一波会重查库——singleflight 只合并同一键的并发、不跨键，这是预期的冷启动尖峰，不是缓存故障。`;
}

/**
 * §SC-45 发布冷启动波的标题判据。空波**绝不说"没有惊群"**——那会把"还没发布过 public 作品、
 * 一次都没触发过采样"说成"压测过且很平稳"。非空时给峰值，让运维一眼看到"这一波真打了几次库"。
 */
export function wavesHeadline(waves: readonly EpochWave[]): string {
  if (waves.length === 0) {
    return '这台实例还没经历过全局失效波（还没发布/下架过 public 作品）——是尚未触发采样，不是"测过没有惊群"。';
  }
  const newest = waves[0]!; // wavesReadout 保证新的在前
  const peakLoads = waves.reduce((m, w) => Math.max(m, w.loadsDelta), 0);
  const peakFlight = waves.reduce((m, w) => Math.max(m, w.peakInFlight), 0);
  return `${waves.length} 波 · 最新世代 ${newest.epoch} · 峰值打库 ${peakLoads} 次 · 峰值在途 ${peakFlight}（瞬时采样，非锁存的精确峰值）`;
}

/**
 * 单波读数行：`firstFillMs=null` 说"窗口内无人读"，**不画 0ms**（0 会谎称"失效瞬间就有人重填"，
 * 与 `hitRate(0,0)` 不说 0% 同一条纪律）；`settled=false` 如实标"仍在采样"，读数还会变。
 */
export function waveRow(w: EpochWave): string {
  const first = w.firstFillMs === null ? '窗口内无人读' : `${w.firstFillMs}ms`;
  return `世代 ${w.epoch} · 打库 ${w.loadsDelta} 次 · 在途峰值 ${w.peakInFlight} · 首击 ${first} · ${w.settled ? '已定格' : '采样中'}`;
}

/**
 * §SC-45 方法论旁注：把"为什么不写通用并发闸门"这个反向判断放到运维眼前，而不是只躺在 ADR-0117。
 * 钉四件事：① 常态上界是个位数键（匿名 ≤4 sort、登录键受活跃 viewer 与 maxEntries 限）；
 * ② 已有三道天然舱壁（singleflight 同键合并 / DB 连接池 / 网关 SemaphoreBulkhead），无实测尖峰证据；
 * ③ 刻意不加跨键闸门（会引入 permit 泄漏、排队饿死、读数失真、延迟稀释即时可见）；
 * ④ 触发阈值：只有实测峰值逼近 DB 连接池，才按预案做匿名 new 写侧预热 / 满即减载。
 */
export function waveNote(windowMs: number, capacity: number): string {
  return `采样窗口 ${Math.round(windowMs / 1000)}s · 环形缓冲只留最近 ${capacity} 波（有界，不随发布次数涨）· 只记不拦。常态下一次全局失效 ≈ 一次冷启动，匿名键 ≤ 4 个 sort、登录键受活跃 viewer 限，打库上界是个位数；已有三道舱壁：singleflight 只按同键合并、DB 连接池、网关 SemaphoreBulkhead——没有实测尖峰证据。这里刻意不加跨键并发闸门：会引入 permit 泄漏、排队饿死、读数失真，还会把即时可见排队稀释掉；只有当实测峰值逼近 DB 连接池，才按预案做 O(1) 匿名 new 写侧预热 / 满即减载。peakInFlight 是读后瞬时采样，不是锁存精确峰值。`;
}

/**
 * §SC-46 上游故障降级的旁注：把"DB 抖动时这台端过几次旧页"和它的边界摆到运维眼前。
 * 钉四件事：①`staleServed` 是**降级次数**，0 只说明"还没抖过"，不是"降级没开"（那看 staleMaxMs）；
 * ②旧值最多 `staleMaxMs` 毫秒、超过宁可报错；③隐私/收录失效（block/发布）后旧键不可信、**绝不端**；
 * ④无旧值就报错、不画空页，且降级对读用户透明、只在这本账里可见。
 */
export function staleNote(staleServed: number, staleMaxMs: number): string {
  return `上游打库失败时端出旧页 ${staleServed} 次（0 只表示还没抖过，不是降级没开——上界 ${Math.round(staleMaxMs / 1000)}s 才是开关）· 旧值最多 ${Math.round(staleMaxMs / 1000)}s，超了宁可报错也不把几小时前的页冒充此刻 · block/发布让键一变，那份旧值可能含刚拉黑的人或刚下架的作品，**绝不端** · 连旧值都没有就报错、不画空页；普通访客照常看到卡片、察觉不到这次降级，这笔账只记在运维面板里。`;
}

/** 页脚那句"最终一致 + 只看这台"是否该出现：接了总线就一定要说，单机也要说清边界。 */
export function footNote(busAttached: boolean, busUrlConfigured: boolean, pollMs: number): string {
  // 轮询秒数从入参来、只在 scope 出现一次；早先硬编码"每 4 秒"又在末尾拼"每 N 秒"，
  // 改 POLL_MS 时 scope 会悄悄说谎、且同一句里秒数重复两次。
  const scope = `每 ${pollMs / 1000} 秒问一次本实例 · 后台标签暂停 · 多实例各算各的`;
  if (!busAttached) {
    return busUrlConfigured
      ? `${scope} · 设了 Redis 地址但总线还没接上（连接是异步的，稍后可能接上）· 此刻单机语义`
      : `${scope} · 未设 NEXUS_REDIS_URL，跨实例失效未启用 · 本机的屏蔽/关注失效即时生效`;
  }
  return `${scope} · 跨实例失效经 Redis pub/sub（最终一致，掉线窗口丢帧会退回 TTL 15s 自愈，不是瞬时强一致）`;
}
