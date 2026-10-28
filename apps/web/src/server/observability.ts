import { headers } from 'next/headers';

/**
 * 进程内的度量与请求追踪——补的是 `docs/ROADMAP.md` 里"metrics/tracing 也没接，所以『线上发生了什么』
 * 目前只能靠审计表 + stderr"那一格。
 *
 * 三条形状上的决定，都是被现有代码逼出来的，不是顺手选的：
 *
 * 1. **不包路由，只在窄口插桩**。`apps/web/src/app/api` 下的 route.ts 有 101 个，每个都自己重述一遍
 *    "CSRF → 身份 → 限流 → 业务"。`test/route-security-gate.test.ts` 钉的正是**这个形状**（写路由里必须
 *    出现 `csrfOk`）。把路由收进一个 wrapper 会同时拆掉那道门的前提，而一次改动 101 个文件的回归，
 *    本机现在没有 e2e 预算去验（建项目限流 20 次/小时）。所以计数器只落在**本来就只有一处**的窄口：
 *    `recordAudit`、`MemoryRateLimiter.hit`、AI 提交那两条门、Next 的 `onRequestError`。
 * 2. **不引第三方 SDK**。仓库里没有任何 metrics/otel 依赖，`@opentelemetry/api` 只是 drizzle 与 next 的
 *    optional peer。取舍写在 `docs/adr/0063-…`： exposition 文本自己实现（格式小且可测），换成真后端时
 *    这一个文件是唯一要动的地方。
 * 3. **标签是声明出来的，不是调用方随手写的**。基数失控的 metrics 是一种自我 DoS：一个能把 project id
 *    塞进标签的调用点，等于让外部输入决定进程要留多少内存。所以名单封闭、值能枚举就枚举，
 *    剩下的自由值走字符集/长度校验并按每指标 64 条序列封顶。
 *
 * **这些数是什么口径**：一个进程一份，重启清零，多实例各算各的（没有持久化，也没有跨实例合并）。
 * 需要"重启之后还答得出"的那部分在库里——`audit_events` / `agent_tasks` / `api_access_buckets`，
 * 由 `server/domain/metrics.ts` 去读，两者在管理页上分栏展示，不混成一格。
 */

/* ── 请求追踪 ───────────────────────────────────────────────────────────── */

/**
 * 一次请求的关联 id 走请求头，不走 AsyncLocalStorage：中间件与路由处理器不在同一个异步上下文里，
 * 而 `next/headers` 是 Next 自己维护的请求作用域——中间件写进来的头，下游用 `headers()` 读得到。
 * 名字前缀 `x-nexus-` 与 `x-nexus-task`／`x-nexus-agent` 那一族一致（都是我们自己的头）。
 */
export const TRACE_HEADER = 'x-nexus-trace';

/** 形状：16 个 hex。进来的一律先验形状再用——外部的头是不可信输入 */
const TRACE_SHAPE = /^[0-9a-f]{8,32}$/;

export function sanitizeTraceId(value: string | null | undefined): string | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  return TRACE_SHAPE.test(lower) ? lower : null;
}

export function newTraceId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 从 `Request` 取追踪 id；没有或形状不对就发一个新的（中间件与 `onRequestError` 用这条） */
export function traceIdFor(req: Request): string {
  return sanitizeTraceId(req.headers.get(TRACE_HEADER)) ?? newTraceId();
}

/**
 * 在请求作用域里取追踪 id；不在请求里（脚本、单测、队列 worker）返回 null 而不是抛。
 * `headers()` 在请求作用域外是**抛异常**的（实测 vitest 里 `headers was called outside a request scope`），
 * 而这一句要在审计写入的 catch 旁边调用——那里正在记一条失败，绝不能因为"想打个标签"把请求带崩。
 */
export async function currentTraceId(): Promise<string | null> {
  try {
    return sanitizeTraceId((await headers()).get(TRACE_HEADER));
  } catch {
    return null;
  }
}

/* ── 指标声明 ───────────────────────────────────────────────────────────── */

export type LabelMap = Record<string, string>;

interface BaseSpec {
  help: string;
  /**
   * 每个标签名都必须在这里出现。值是数组时=枚举名单，落在名单外直接抛（写错的是我们自己的代码，
   * 让它响在插桩那一步，而不是等到有人读图时才发现某个状态永远不出现）；
   * 值是 null=自由值，但要过字符集与长度，且受每指标序列上限约束。
   */
  labels?: Record<string, readonly string[] | null>;
}
interface CounterSpec extends BaseSpec {
  kind: 'counter';
}
interface HistogramSpec extends BaseSpec {
  kind: 'histogram';
  /** 上界（毫秒），递增 */
  buckets: readonly number[];
}

/** 时延分档：AI 生成从几十毫秒到几十秒都有，档距按对数走 */
const DURATION_BUCKETS = [25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000] as const;

export const METRICS = {
  nexus_audit_decisions_total: {
    kind: 'counter',
    help: '落进审计的决定数（放行与拒绝都算一次）',
    labels: { allowed: ['true', 'false'], action: null },
  },
  nexus_audit_write_failures_total: {
    kind: 'counter',
    help: '审计行没写上的次数——这一格涨说明"证据没留下"，与它记的那件事成不成败无关',
  },
  nexus_rate_limit_decisions_total: {
    kind: 'counter',
    help: '限流闸的判定次数（按闸与放行/拒绝）',
    labels: { allowed: ['true', 'false'], gate: null },
  },
  nexus_ai_jobs_submitted_total: {
    kind: 'counter',
    help: '异步生成作业的提交尝试数（capability=demo 表示这台机器上没有真 provider，走本地确定性合成）',
    labels: { capability: ['real', 'demo', 'unavailable'], outcome: ['ok', 'rejected'] },
  },
  nexus_ai_runs_total: {
    kind: 'counter',
    help: '同步那条路（POST /api/ai/run）走到终态的次数——一次 HTTP 200 不等于做成了，所以带成败标签',
    labels: { capability: ['real', 'demo', 'unavailable'], outcome: ['ok', 'failed'] },
  },
  nexus_ai_run_duration_ms: {
    kind: 'histogram',
    help: '同步生成从进路由到落终态的毫秒数（异步队列的时长在库里，按 agent_tasks 的 started/finished 算）',
    labels: { capability: ['real', 'demo', 'unavailable'], outcome: ['ok', 'failed'] },
    buckets: DURATION_BUCKETS,
  },
  nexus_http_errors_total: {
    kind: 'counter',
    help: 'Next 服务器捕获到的未处理请求错误数（instrumentation.onRequestError）',
    labels: { routeType: ['render', 'route', 'action', 'proxy'] },
  },
  nexus_metric_cardinality_overflow_total: {
    kind: 'counter',
    help: '某个指标的序列数触顶后被折叠的次数（顶上去=有人往标签里塞了无界的东西）',
    labels: { metric: null },
  },
} as const satisfies Record<string, CounterSpec | HistogramSpec>;

export type MetricName = keyof typeof METRICS;

/**
 * 每个指标最多留多少条序列。64 是**按今天实际会出现的标签组合**留的：审计的 action 有 30 多个字面量，
 * 限流的 gate 有 10 来个，两者乘上 allowed 的两态，落在同一个指标里就是几十条。留出余量，
 * 但一旦有调用点把 project id 之类的东西塞进来，第 65 条起不再新增序列，改成累加一条溢出账。
 */
export const MAX_SERIES_PER_METRIC = 64;

/** 自由标签值的形状：够写下路由名与枚举词，不够写下 id、邮箱或一段用户文本 */
const LABEL_VALUE_SHAPE = /^[A-Za-z0-9_.:/@-]{1,48}$/;

interface CounterSeries {
  labels: LabelMap;
  value: number;
}
interface HistogramSeries {
  labels: LabelMap;
  count: number;
  sum: number;
  /** 与 spec.buckets 同长的累计计数 */
  bucketCounts: number[];
}
interface Registry {
  counters: Map<MetricName, Map<string, CounterSeries>>;
  histograms: Map<MetricName, Map<string, HistogramSeries>>;
}

/**
 * 挂在 globalThis 上而不是模块变量上：dev 的热更新会重新求值这个模块，
 * 计数器要是活在模块作用域里，每次改文件就悄悄清零——正在排的队、正在数的错误会一起归零，
 * 而屏幕上没有任何一行说发生过这件事。
 */
const REGISTRY_KEY = Symbol.for('nexus.observability.registry');

function emptyRegistry(): Registry {
  return { counters: new Map(), histograms: new Map() };
}

function registry(): Registry {
  const g = globalThis as Record<symbol, Registry | undefined>;
  if (!g[REGISTRY_KEY]) g[REGISTRY_KEY] = emptyRegistry();
  return g[REGISTRY_KEY];
}

export function resetMetrics(): void {
  const g = globalThis as Record<symbol, Registry | undefined>;
  g[REGISTRY_KEY] = emptyRegistry();
}

/**
 * 把调用方给的标签规整成一条序列的键。返回 null 表示"这条样本被折进溢出账了"（已经在里面记过一笔，
 * 调用方只管丢弃）。
 * 抛错的三种情况都是"我们自己的插桩写错了"（标签名不在名单里、少给了声明的标签、枚举值落在名单外），
 * 让它响在插桩那一步，而不是等到有人读图时才发现某个状态永远不出现；
 * 不抛而折叠的一种情况是"值可能是外面来的"（自由标签值形状不对、或序列顶到上限）——观测不许把请求带崩。
 */
function resolveSeriesKey(name: MetricName, labels?: LabelMap): string | null {
  const spec = METRICS[name] as BaseSpec & { kind: 'counter' | 'histogram' };
  const declared = spec.labels ?? {};
  const given = labels ?? {};
  for (const key of Object.keys(given)) {
    if (!(key in declared)) throw new Error(`指标 ${name} 没声明标签 ${key}（基数失控的入口就是这样开出来的）`);
  }
  const out: LabelMap = {};
  let malformed = false;
  for (const [key, allowed] of Object.entries(declared)) {
    const value = given[key];
    if (value === undefined) throw new Error(`指标 ${name} 缺声明过的标签 ${key}`);
    if (allowed && !allowed.includes(value)) {
      throw new Error(`指标 ${name} 的标签 ${key} 落在枚举外：${value}（名单：${allowed.join('|')}）`);
    }
    if (!allowed && !LABEL_VALUE_SHAPE.test(value)) malformed = true;
    out[key] = value;
  }
  if (malformed) {
    foldIntoOverflow(name);
    return null;
  }
  const key = keyOf(out);
  const table = spec.kind === 'counter' ? registry().counters : registry().histograms;
  const series = table.get(name);
  if (series && series.size >= MAX_SERIES_PER_METRIC && !series.has(key)) {
    foldIntoOverflow(name);
    return null;
  }
  return key;
}

/** 溢出记的是"哪个指标顶了"，不记那个无界的值本身——值本身就是不该留在进程里的东西 */
function foldIntoOverflow(name: MetricName): void {
  addCounter('nexus_metric_cardinality_overflow_total', { metric: name }, 1);
}

function keyOf(labels: LabelMap): string {
  return Object.keys(labels)
    .sort()
    .map((key) => `${key}=${labels[key]}`)
    .join(',');
}

function addCounter(name: MetricName, labels: LabelMap, by: number): void {
  const table = registry().counters;
  let series = table.get(name);
  if (!series) table.set(name, (series = new Map()));
  const key = keyOf(labels);
  let sample = series.get(key);
  if (!sample) series.set(key, (sample = { labels, value: 0 }));
  sample.value += by;
}

/** 计数器 +n（n 默认为 1） */
export function increment(name: MetricName, labels?: LabelMap, by = 1): void {
  const spec = METRICS[name] as CounterSpec;
  if (spec.kind !== 'counter') throw new Error(`${name} 不是 counter`);
  const key = resolveSeriesKey(name, labels);
  if (key === null) return;
  addCounter(name, labels ?? {}, by);
}

export function observe(name: MetricName, ms: number, labels?: LabelMap): void {
  const spec = METRICS[name] as HistogramSpec;
  if (spec.kind !== 'histogram') throw new Error(`${name} 不是 histogram`);
  const key = resolveSeriesKey(name, labels);
  if (key === null) return; // 折叠时溢出账已经记过了，这里只管丢弃
  const table = registry().histograms;
  let series = table.get(name);
  if (!series) table.set(name, (series = new Map()));
  const value = Number.isFinite(ms) && ms >= 0 ? ms : 0;
  let sample = series.get(key);
  if (!sample) {
    series.set(
      key,
      (sample = { labels: labels ?? {}, count: 0, sum: 0, bucketCounts: spec.buckets.map(() => 0) }),
    );
  }
  sample.count += 1;
  sample.sum += value;
  spec.buckets.forEach((upper, i) => {
    if (value <= upper) sample!.bucketCounts[i] = (sample!.bucketCounts[i] ?? 0) + 1;
  });
}

/* ── 读出来 ─────────────────────────────────────────────────────────────── */

export interface CounterSnapshot {
  name: MetricName;
  kind: 'counter';
  help: string;
  series: Array<{ labels: LabelMap; value: number }>;
}
export interface HistogramSnapshot {
  name: MetricName;
  kind: 'histogram';
  help: string;
  buckets: readonly number[];
  series: Array<{ labels: LabelMap; count: number; sum: number; bucketCounts: number[] }>;
}
export type MetricSnapshot = CounterSnapshot | HistogramSnapshot;

/** 排序是判据的一部分：同一份状态必须每次读出同一串，不然"读数变了"就分不清是流量变了还是顺序变了 */
export function snapshot(): MetricSnapshot[] {
  const out: MetricSnapshot[] = [];
  const names = (Object.keys(METRICS) as MetricName[]).sort();
  for (const name of names) {
    const spec = METRICS[name];
    if (spec.kind === 'counter') {
      const series = [...(registry().counters.get(name)?.values() ?? [])]
        .map((s) => ({ labels: s.labels, value: s.value }))
        .sort((a, b) => keyOf(a.labels).localeCompare(keyOf(b.labels)));
      if (series.length) out.push({ name, kind: 'counter', help: spec.help, series });
    } else {
      const series = [...(registry().histograms.get(name)?.values() ?? [])]
        .map((s) => ({ labels: s.labels, count: s.count, sum: s.sum, bucketCounts: s.bucketCounts }))
        .sort((a, b) => keyOf(a.labels).localeCompare(keyOf(b.labels)));
      if (series.length) out.push({ name, kind: 'histogram', help: spec.help, buckets: spec.buckets, series });
    }
  }
  return out;
}

function labelBlock(labels: LabelMap, extra?: Record<string, string>): string {
  const merged = { ...labels, ...extra };
  const keys = Object.keys(merged).sort();
  if (!keys.length) return '';
  return `{${keys.map((k) => `${k}="${merged[k]!.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`).join(',')}}`;
}

/**
 * Prometheus 文本 exposition 格式（`# HELP` / `# TYPE` / 样本行）。
 * histogram 用累计桶（每个 `le` 是"≤ 该上界"的次数，含 `+Inf`=总数），这是格式要求的口径，不是本模块的发明。
 */
export function exposition(): string {
  const lines: string[] = [];
  for (const metric of snapshot()) {
    lines.push(`# HELP ${metric.name} ${metric.help}`, `# TYPE ${metric.name} ${metric.kind}`);
    if (metric.kind === 'counter') {
      for (const s of metric.series) lines.push(`${metric.name}${labelBlock(s.labels)} ${s.value}`);
    } else {
      for (const s of metric.series) {
        metric.buckets.forEach((upper, i) => {
          lines.push(`${metric.name}_bucket${labelBlock(s.labels, { le: String(upper) })} ${s.bucketCounts[i]}`);
        });
        lines.push(`${metric.name}_bucket${labelBlock(s.labels, { le: '+Inf' })} ${s.count}`);
        lines.push(`${metric.name}_sum${labelBlock(s.labels)} ${s.sum}`, `${metric.name}_count${labelBlock(s.labels)} ${s.count}`);
      }
    }
  }
  return `${lines.join('\n')}\n`;
}
