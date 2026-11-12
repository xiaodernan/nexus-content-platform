/**
 * AI 服务那一侧的 capability 读数门面（sibling of java-wire.ts，§SC-79）。
 *
 * 端点是 ai-service 的 `GET /v1/capabilities`——`{service, version, capability, providers, queue}`。
 * 只要 /api/admin/realtime 能拿到的第一手，就给面板一个诚实的"真实 provider 在不在"和"队列在哪"。
 *
 * 三条纪律，与 javaWire / 网关那一典同一口径：
 * - **fail-open**：网络挂/端口没配/回执形状不认识 → `null`。
 *   不假装拿到数，也不改写成 0——"没接上"和"有 provider 但确实为 delivers nothing"必须是两档。
 * - **只收形状**：所有要求的字段缺一不可；非法值（capability 只认 mock/real/unavailable）→ null。
 * - **超时**：`AbortSignal.timeout(3000)`——慢东西不拖死 web 轮询。
 */

export type AiCapability = 'mock' | 'real' | 'unavailable';

export interface AiProviderInfo {
  kind: string;
  name: string;
  status: string;
  models: string[];
  reason: string;
}

export interface AiServiceCapability {
  service: string;
  version: string;
  capability: AiCapability;
  providers: AiProviderInfo[];
  queue: { backend: string | null; pending: number; running: number; capacity: number; note: string | null };
}

const DEFAULT_URL = 'http://127.0.0.1:3200/v1/capabilities';

const PROVIDED_STATUS = new Set(['real', 'mock', 'unavailable', 'legacy-dry-run']);

export function isAiServiceCapability(value: unknown): value is AiServiceCapability {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.service !== 'string' || !v.service.trim()) return false;
  if (typeof v.version !== 'string' || !v.version.trim()) return false;
  if (v.capability !== 'mock' && v.capability !== 'real' && v.capability !== 'unavailable') return false;
  if (!Array.isArray(v.providers)) return false;
  for (const p of v.providers) {
    if (typeof p !== 'object' || p === null) return false;
    const pv = p as Record<string, unknown>;
    if (typeof pv.kind !== 'string' || typeof pv.name !== 'string' || typeof pv.status !== 'string') return false;
    if (!Array.isArray(pv.models) || !pv.models.every((m) => typeof m === 'string')) return false;
    if (typeof pv.reason !== 'string') return false;
    if (!PROVIDED_STATUS.has(pv.status)) return false;
  }
  if (typeof v.queue !== 'object' || v.queue === null) return false;
  const q = v.queue as Record<string, unknown>;
  for (const key of ['pending', 'running', 'capacity'] as const) {
    if (typeof q[key] !== 'number' || !Number.isFinite(q[key] as number) || (q[key] as number) < 0) return false;
  }
  if (q.backend !== null && typeof q.backend !== 'string') return false;
  if (q.note !== null && typeof q.note !== 'string') return false;
  return true;
}

/** 问 capability；fail-open 全部返回 null。 */
export async function fetchAiServiceCapability(url: string = process.env.NEXUS_AI_CAPABILITIES_URL?.trim() || DEFAULT_URL): Promise<AiServiceCapability | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3_000), cache: 'no-store' });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    if (!isAiServiceCapability(body)) return null;
    return body;
  } catch {
    return null;
  }
}
