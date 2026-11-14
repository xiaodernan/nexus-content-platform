/**
 * §SC-81 · `/admin/health` 的健康聚合（§SC-81 / ADR-0192）。
 *
 * 五层探针：AI Service (healthz + capability) · java-domain-service (actuator/health) ·
 * Gateway (actuator/health) · Redis (PING) · Postgres (SELECT 1)。每一层的 truth 要落在运维的眼前，
 * 拿不到就是"未测到"而不是"down"——与 web `/admin/realtime` 같은 口径。
 *
 * 每一层独立超时（2–3s），一个 hang 不住整轮：5 路并行 + 串行收束。
 * 纯函数段（`evaluateTier`）可单测，fetcher 段只负责把"发出去的请求"翻译成"拿到/没拿到"。
 */
import { fetchAiServiceHealth } from '@/server/ai/client';
import { DATABASE_URL } from '@/server/db/client';

export type TierName = 'ai' | 'java' | 'gateway' | 'redis' | 'postgres';

export interface TierReadout {
  name: TierName;
  ok: boolean;
  /** 一句人类可读的说法；开头一定是"ok/未测到"口径（与 page tier list 对齐） */
  detail: string;
  measuredAt: string;
}

export interface HealthSnapshot {
  measuredAt: string;
  /** 五个 tier 一次成；顺序固定 ai → java → gateway → redis → postgres */
  tiers: TierReadout[];
  overall: 'ok' | 'degraded';
}

export interface ProbeOutcome {
  ok: boolean;
  detail: string;
}

/** 检查 ai-service */
async function probeAi(): Promise<ProbeOutcome> {
  try {
    const health = await fetchAiServiceHealth();
    if (!health) return { ok: false, detail: '未测到（/healthz 不可达或形状不认识）' };
    const llm = health.providers.find((p) => p.kind === 'llm');
    return {
      ok: true,
      detail: `healthz 通过 · capability=${health.capability} · llm=${llm?.status ?? 'unknown'}`,
    };
  } catch (err) {
    return { ok: false, detail: `探针异常：${err instanceof Error ? err.message : String(err)}` };
  }
}

async function probeJava(): Promise<ProbeOutcome> {
  const url = process.env.NEXUS_JAVA_HEALTH_URL?.trim() || 'http://127.0.0.1:8082/actuator/health';
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2_500), cache: 'no-store' });
    if (!res.ok) return { ok: false, detail: `未测到（health=${res.status}）` };
    const body = (await res.json().catch(() => null)) as { status?: string } | null;
    if (body?.status === 'UP') return { ok: true, detail: 'actuator/health UP · db SELECT 1' };
    return { ok: false, detail: `actuator/health 报 ${body?.status ?? 'unknown'}（非 UP）` };
  } catch (err) {
    return { ok: false, detail: `探针异常：${err instanceof Error ? err.message : String(err)}` };
  }
}

async function probeGateway(): Promise<ProbeOutcome> {
  const url = process.env.NEXUS_GATEWAY_HEALTH_URL?.trim() || 'http://127.0.0.1:8091/actuator/health';
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2_500), cache: 'no-store' });
    if (!res.ok) return { ok: false, detail: `未测到（health=${res.status}）` };
    const body = (await res.json().catch(() => null)) as { status?: string } | null;
    if (body?.status === 'UP') return { ok: true, detail: 'actuator/health UP' };
    return { ok: false, detail: `actuator/health 报 ${body?.status ?? 'unknown'}（非 UP）` };
  } catch (err) {
    return { ok: false, detail: `探针异常：${err instanceof Error ? err.message : String(err)}` };
  }
}

async function probeRedis(): Promise<ProbeOutcome> {
  const url = process.env.NEXUS_REDIS_URL?.trim() || 'redis://127.0.0.1:56379';
  let client: import('ioredis').Redis | null = null;
  try {
    const { Redis } = await import('ioredis');
    client = new Redis(url, {
      connectTimeout: 2_000,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      retryStrategy: () => null,
    });
    await client.connect();
    // PING 探测；命中任意返回值即说明线路通
    const pong = await client.ping();
    return { ok: true, detail: `PING ${pong}` };
  } catch (err) {
    return { ok: false, detail: `探针异常：${err instanceof Error ? err.message : String(err)}` };
  } finally {
    client?.disconnect();
  }
}

async function probePostgres(): Promise<ProbeOutcome> {
  let client: import('postgres').Sql | null = null;
  try {
    const postgres = (await import('postgres')).default;
    client = postgres(DATABASE_URL, { max: 1, connect_timeout: 2 });
    const rows = await client`SELECT 1 AS probe_ok`;
    const ok = Array.isArray(rows) && rows.length > 0 && Number(rows[0]?.probe_ok) === 1;
    return ok
      ? { ok: true, detail: 'SELECT 1 ok' }
      : { ok: false, detail: 'SELECT 1 返回形状不认识' };
  } catch (err) {
    return { ok: false, detail: `探针异常：${err instanceof Error ? err.message : String(err)}` };
  } finally {
    await client?.end({ timeout: 2 });
  }
}

function evaluateTier(name: TierName, measuredAt: string, outcome: ProbeOutcome): TierReadout {
  return { name, ok: outcome.ok, detail: outcome.detail, measuredAt };
}

export async function probeAllTiers(): Promise<HealthSnapshot> {
  const measuredAt = new Date().toISOString();
  const [ai, java, gateway, redis, postgres] = await Promise.all([
    probeAi(),
    probeJava(),
    probeGateway(),
    probeRedis(),
    probePostgres(),
  ]);
  const tiers: TierReadout[] = [
    evaluateTier('ai', measuredAt, ai),
    evaluateTier('java', measuredAt, java),
    evaluateTier('gateway', measuredAt, gateway),
    evaluateTier('redis', measuredAt, redis),
    evaluateTier('postgres', measuredAt, postgres),
  ];
  return {
    measuredAt,
    tiers,
    overall: tiers.every((t) => t.ok) ? 'ok' : 'degraded',
  };
}
