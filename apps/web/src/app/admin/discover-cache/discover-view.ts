/**
 * 发现页缓存面板的**展示判据**（与 `gateway-view.ts` 同一范式：判据抽成纯模块，组件只消费）。
 *
 * 每一行守着一句能被读反、且读反了界面会说谎的话：
 *   - `busTag(null)` 若把"没接总线"画成 published/received/errors/applied 四个 0，运维会去查
 *     "总线为什么不收发"这个不存在的事故——**没接 ≠ 接了但全 0**（null≠0，这一片最重要的一句）；
 *   - `hitRate(0,0)` 若画成 "0%"，就把"这台实例还没人读过"说成了"缓存一个都没命中"；
 *   - `pollAllowed('hidden')` 若返回 true，面板就在没人看的后台标签里给本实例制造轮询流量；
 *   - `busTag(bus)` 若把 `errors>0` 画成绿，就把"线路丢过帧/连不上"藏了起来——而那正是
 *     ADR-0114 诚实边界的落点（跨实例最终一致、丢帧退回 TTL）。
 *
 * 全部纯函数、零 React / 零 DOM / 零网络，判据可逐支验电。
 */
import type { DiscoverCacheReadout } from '@/server/domain/discover-cache';
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
  for (const key of ['hits', 'misses', 'evictions', 'loads', 'inFlight', 'size', 'globalGen', 'globalEpoch', 'viewerGenerations']) {
    if (typeof s[key] !== 'number') return false;
  }
  // config 的 ttlMs / maxEntries / maxViewers 是面板 KPI 的分母（size/maxEntries）、秒数（ttlMs/1000）
  // 与水位线旁注分母（viewerGenerations/maxViewers）的来源。缺一个，组件就会把 "12/undefined"、
  // "NaN s" 画到运维眼前——坏回执必须在形状门这层挡掉，而不是渲染出 undefined 再被发现。
  const config = s['config'];
  if (!config || typeof config !== 'object') return false;
  const c = config as Record<string, unknown>;
  for (const key of ['ttlMs', 'maxEntries', 'maxViewers']) {
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
