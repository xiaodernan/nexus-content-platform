/**
 * §168 Analytics 的采集口径。这里只有算术，没有 DOM、没有 fetch——
 * 因为"浏览时长"和"看到多少"这两个数最容易说谎：一次后台挂起、一次异常长的 tick，
 * 都能把 play time 吹成几小时。规则必须能在单测里逐条钉住，所以从组件里抽出来。
 */

/** 单次采样的时间上限：超过它多半是标签被挂起或断点停住，不是真的在看 */
export const MAX_SAMPLE_MS = 5_000;
/** 一次上报最多带走的时长。客户端每 FLUSH_INTERVAL_MS 报一次，正常路径永远碰不到这个上限 */
export const MAX_FLUSH_MS = 60_000;
/** 心跳间隔 */
export const FLUSH_INTERVAL_MS = 15_000;

/** 一个访客在一天里的一份聚合：时长累加、到达比例取最远 */
export interface VisitAggregate {
  visibleMs: number;
  completionPct: number;
}

function whole(value: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(max, Math.floor(value));
}

/**
 * 累加一段"页面确实可见"的时长。
 * 负数与超过 MAX_SAMPLE_MS 的样本都按上限截断：宁可少算，也不让挂起变成观看时长。
 */
export function addVisibleMs(current: number, deltaMs: number): number {
  return whole(current, Number.MAX_SAFE_INTEGER) + whole(deltaMs, MAX_SAMPLE_MS);
}

/** 服务端入库前的最后一道：一次请求最多带走 MAX_FLUSH_MS */
export function clampReportedMs(value: unknown): number {
  const n = typeof value === 'number' ? value : Number.NaN;
  return whole(n, MAX_FLUSH_MS);
}

/** 客户端攒够一次上报就清空，攒不满就继续攒 */
export function takePending(aggregate: VisitAggregate): { report: VisitAggregate; rest: VisitAggregate } {
  const ms = Math.min(aggregate.visibleMs, MAX_FLUSH_MS);
  return {
    report: { visibleMs: ms, completionPct: aggregate.completionPct },
    rest: { visibleMs: aggregate.visibleMs - ms, completionPct: aggregate.completionPct },
  };
}

/**
 * 完成度 = 最远看到的页面比例（0-100）。
 * 内容比视口还短时"没有可滚的地方"就是 100%，不是 0%——访客确实看见了整页；
 * 这一条不需要单独分支：视口本身已经覆盖了全部内容，比例算出来 ≥1，和下面的 100 上限同界。
 */
export function completionPct(scrollTop: number, viewportHeight: number, contentHeight: number): number {
  if (!Number.isFinite(contentHeight) || contentHeight <= 0) return 0;
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return 0;
  const reached = (Math.max(0, scrollTop) + viewportHeight) / contentHeight;
  return whole(reached * 100, 100);
}

/** 一天一行怎么合并：时长相加、比例取最远，两个都不是平均数 */
export function mergeVisit(existing: VisitAggregate, incoming: VisitAggregate): VisitAggregate {
  return {
    visibleMs: whole(existing.visibleMs, Number.MAX_SAFE_INTEGER) + whole(incoming.visibleMs, MAX_FLUSH_MS),
    completionPct: Math.max(whole(existing.completionPct, 100), whole(incoming.completionPct, 100)),
  };
}

/** 匿名访客 key 的格式：浏览器里生成的 32 位十六进制；不合法就不合并、直接不收 */
export function validVisitorKey(value: unknown): string | null {
  return typeof value === 'string' && /^[0-9a-f]{32}$/.test(value) ? value : null;
}

/** 归属哪一天由服务端说：客户端传来的时间戳一律不信 */
export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}
