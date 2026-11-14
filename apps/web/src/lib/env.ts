import type { CapabilityStatus, HealthResponse } from '@nexus/schemas';
import { getCachedAiHealth } from '@/server/ai/health-cache';

/**
 * Provider 能力判定（§160 DEMO MODE 标识的真值来源）。
 *
 * 关键边界（docs/SECURITY.md「密钥与配置」）：**web 进程永不持有 provider key**。
 * 早期版本靠"web 环境里有没有 key"来判断是否走真实链路，既违背该边界，也会在
 * "ai-service 有 key 但 web 没有"时误判成 DEMO。现在改为向 ai-service 的 /healthz
 * 询问它自己的 provider 就绪状态——key 只活在 ai-service 进程里。
 *
 * 拿不到 ai-service（未启动 / 不可达）时如实回落到 'demo'，绝不编造真实状态（§159）。
 *
 * §CACHE-1（ADR-0171）：无参数调用走 `getCachedAiHealth` 的 5s 短 TTL 缓存 + 并发去重，
 * 省掉每次 AI 请求都发一次 `/healthz` 的跨服务往返（真机 P95 曾达 1374ms）；失败不缓存、
 * 下次立即重试，provider 故障仍秒级可见。调用方已 prefetched 时走快路径，不经过缓存。
 */
export interface AiCapabilities {
  text: CapabilityStatus;
  image: CapabilityStatus;
  video: CapabilityStatus;
  /** UI 必须在 false 时常驻 DEMO MODE 标识（§160） */
  live: boolean;
  /** v690：应用级 LLM completion cache（未启用 / 不可探时为 null） */
  cache?: AiCacheState | null;
  latency?: AiLatencyState | null;
  /** v698 / ADR 0130：single-flight 省钱账本（未启用 / 不可探时为 null） */
  flight?: AiFlightState | null;
}

/** 两层分别计账、绝不相加：local 省的是本进程重复执行下一层，distributed 省的才是真调用。 */
export interface AiFlightState {
  enabled: boolean;
  mode: 'local' | 'local+redis';
  local: AiFlightLayer | null;
  distributed: (AiFlightLayer & {
    self_served: number;
    lock_failures: number;
    marker_failures: number;
    peek_misses: number;
  }) | null;
  provider_calls: number;
  note: string;
}

export interface AiFlightLayer {
  leaders: number;
  joined: number;
  coalesced: number;
  failures?: number;
  timeouts: number;
  real_calls: number;
  degraded?: boolean;
}

export interface AiCacheState {
  backend: 'memory' | 'redis';
  hits: number;
  misses: number;
  stores: number;
  stores_failed: number;
  evictions: number;
  hit_rate: number;
  namespace: string;
  degraded: boolean;
}

export interface AiLatencyState {
  calls: number;
  errors: number;
  window: number;
  avg_ms: number;
  p50_ms: number;
  p95_ms: number;
  max_ms: number;
}

/**
 * @param prefetched 可选：调用方已经拿到的 /healthz 结果，避免同一次渲染里重复探测。
 *   传 null 表示"探测过但不可达"，与"没探测（undefined）"区分开。
 */
export async function getAiCapabilities(prefetched?: HealthResponse | null): Promise<AiCapabilities> {
  // 已 prefetched（含显式 null=探测过但不可达）走快路径，不重复探测、也不污染缓存；
  // 只有"没探测（undefined）"才经短 TTL 缓存拿 health（热路径 /api/ai/run 等）。
  const health = prefetched === undefined ? await getCachedAiHealth() : prefetched;
  const statusOf = (kind: string): CapabilityStatus =>
    health?.providers.find((p) => p.kind === kind)?.status === 'real' ? 'real' : 'demo';
  // 文本链路读 providers 里 kind='llm' 那一行，不读顶层 capability。
  // 顶层 capability 是 ai-service 的**汇总**（registry.capability()：任一 provider real 即 real），
  // 拿它当"文本能不能用"会在 embedding 就绪而 llm 没就绪时判成真——于是 web 把请求发给
  // 一条根本没有文本 provider 的链路，用户看到的是一句错误而不是一句诚实的 DEMO MODE。
  // 与下面 image/video 同一口径：每个能力各读各的那一行。
  const text: CapabilityStatus = statusOf('llm');
  // 图像 / 视频 provider 属于 M2 / M5，本里程碑恒为 demo（health 里若出现 real 才升级）。
  const image = statusOf('image');
  const video = statusOf('video');

  const raw = (health as { llmCache?: unknown } | null)?.llmCache;
  const cache = raw && typeof raw === 'object' ? (raw as AiCacheState) : null;
  const rawLatency = (health as { llmLatency?: unknown } | null)?.llmLatency;
  const latency = rawLatency && typeof rawLatency === 'object' ? (rawLatency as AiLatencyState) : null;
  const rawFlight = (health as { llmFlight?: unknown } | null)?.llmFlight;
  const flight = rawFlight && typeof rawFlight === 'object' ? (rawFlight as AiFlightState) : null;
  return { text, image, video, live: text === 'real', cache, latency, flight };
}

export async function isDemoMode(): Promise<boolean> {
  return !(await getAiCapabilities()).live;
}
