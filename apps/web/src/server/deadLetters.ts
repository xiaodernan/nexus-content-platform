import { Redis } from 'ioredis';

/**
 * 死信的有界巡检（v689；ADR 0121 仍欠#1，v685 诊断面）
 *
 * 作业平面（ai-service）把毒消息 LPUSH 到 Redis 的 `nexus:ai:dead`，耗尽重试后到死信就查得见。
 * 但查得见 ≠ 运维看得见：UI 面前是一堵 500 条的 JSON 壁。这一页给它一具只读的巡检器：
 *
 * - **只读**：`LLEN` + 有界 `LRANGE`。永远不写、不 BLPOP、不 BRPOP、不触发 worker、不走 send('del')。
 * - **cursor-based**：不把列表物化进内存；每次只读一页。cursor = base64url({s, e})（快照长度+尾部下标）。
 *   读的时候线程回 `LPUSH` 头部新条目会让尾部相对下标**整体平移**——所以读到 cursor 且
 *   `LLEN` 与 cursor 里的 `s` 不一致时直接回 `snapshot-stale`，让人刷新而不是静默读到错位数据。
 * - **limit 上界**：`MAX_LIMIT`（100，默认 20）；超界不截断静默，而是收尾到上界——属 guardrail 不是错。
 * - **entries 极度耐毒**：任何一行 JSON 解析失败都渲染成 malformed 行而不是让整页 500。
 */

export const DL_URL_ENV = 'NEXUS_REDIS_URL';
export const DEAD_LETTER_KEY = 'nexus:ai:dead';

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
const COMMAND_TIMEOUT_MS = 400;

export interface DeadLetterPublic {
  job: {
    jobId: string | null;
    requestId: string | null;
    backend: string | null;
    status: string | null;
    queuedAt: string | null;
  };
  attempts: number;
  reason: string;
  malformed: boolean;
}

export function parseEntry(raw: string): DeadLetterPublic {
  try {
    const obj = JSON.parse(raw) as unknown;
    const o = obj as Record<string, unknown>;
    const j = (o && typeof o === 'object' && o.job && typeof o.job === 'object' ? o.job : {}) as Record<string, unknown>;
    const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
    const attempts =
      typeof o?.attempts === 'number' && Number.isFinite(o.attempts) && o.attempts >= 0
        ? Math.floor(o.attempts)
        : 0;
    const reason = typeof o?.reason === 'string' ? o.reason : '';
    return {
      job: {
        jobId: str(j.jobId),
        requestId: str(j.requestId),
        backend: str(j.backend),
        status: str(j.status),
        queuedAt: str(j.queuedAt),
      },
      attempts,
      reason: reason || '(无 reason)',
      malformed: false,
    };
  } catch {
    return {
      job: { jobId: null, requestId: null, backend: null, status: null, queuedAt: null },
      attempts: 0,
      reason: 'malformed entry（无法解析的死信字节；保留现场，不删除）',
      malformed: true,
    };
  }
}

export interface Cursor {
  s: number;
  e: number;
}

export function encodeCursor(snapshotSize: number, nextEnd: number): string {
  return Buffer.from(JSON.stringify({ s: snapshotSize, e: nextEnd })).toString('base64url');
}

export function decodeCursor(raw: string): Cursor | null {
  if (!raw || raw.length > 256) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as unknown;
    const p = parsed as Record<string, unknown>;
    const s = typeof p?.s === 'number' && Number.isInteger(p.s) && p.s >= 0 ? p.s : null;
    const e = typeof p?.e === 'number' && Number.isInteger(p.e) && p.e >= 0 ? p.e : null;
    if (s === null || e === null || e >= s) return null;
    return { s, e };
  } catch {
    return null;
  }
}

export function clampLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(n)));
}

export type ReadDeadLettersResult =
  | { kind: 'unavailable'; note: string }
  | { kind: 'ok'; snapshotSize: number; entries: DeadLetterPublic[]; nextCursor: string | null }
  | { kind: 'invalid-cursor' }
  | { kind: 'snapshot-stale' }
  | { kind: 'read-error'; note: string };

/** 任何失败都是如实降级，绝不返回编造/空集冒充"没有死信"。测试注入 client；生产不传 → 环境变量。 */
export async function readDeadLettersPage(opts: {
  cursor?: string | null;
  limit?: number | null;
  client?: Redis;
  /** 测试缝：换 key；route 从不传——发布面固定 nexus:ai:dead */
  key?: string;
}): Promise<ReadDeadLettersResult> {
  const limit = clampLimit(opts.limit);
  let client = opts.client;
  let owns = false;
  if (!client) {
    const url = process.env[DL_URL_ENV]?.trim();
    if (!url) {
      return { kind: 'unavailable', note: '未配置 NEXUS_REDIS_URL（或连接串为空）：无法到达 dead 列表；页面如实说"看不到"，不伪造空表' };
    }
    client = new Redis(url, {
      lazyConnect: true,
      enableOfflineQueue: false,
      connectTimeout: COMMAND_TIMEOUT_MS,
      commandTimeout: COMMAND_TIMEOUT_MS,
      maxRetriesPerRequest: 1,
    });
    try {
      await client.connect();
    } catch {
      client.disconnect();
      return { kind: 'unavailable', note: 'Redis 连接失败（红线：这里只读；失败如实显示）' };
    }
    owns = true;
  }
  try {
    const key = opts.key ?? DEAD_LETTER_KEY;
    const snapshotSize = await client.llen(key);
    if (snapshotSize === 0) {
      return { kind: 'ok', snapshotSize: 0, entries: [], nextCursor: null };
    }
    let start = 0;
    if (opts.cursor) {
      const cur = decodeCursor(opts.cursor);
      if (!cur) return { kind: 'invalid-cursor' };
      if (cur.s !== snapshotSize) return { kind: 'snapshot-stale' };
      start = cur.e;
      if (start >= snapshotSize) return { kind: 'snapshot-stale' };
    }
    // head-relative window：从最新的一端开始；LPUSH 只动头部一端，窗口相对下标只会越界到过早页面，守护过界即 stale
    const end = Math.min(snapshotSize - 1, start + limit - 1);
    const raws = await client.lrange(key, start, end);
    const entries = raws.map(parseEntry); // LPUSH 头=最新；LRANGE 按序从新到旧（不反转）
    return {
      kind: 'ok',
      snapshotSize,
      entries,
      nextCursor: end + 1 < snapshotSize ? encodeCursor(snapshotSize, end + 1) : null,
    };
  } catch (e) {
    return { kind: 'read-error', note: `读取失败：${(e as Error)?.message?.slice(0, 160) ?? 'unknown'}` };
  } finally {
    if (owns && client) client.disconnect();
  }
}

export async function exportDeadLettersJsonl(opts: { client?: Redis; maxItems?: number; key?: string }): Promise<{ items: DeadLetterPublic[]; snapshotSize: number } | { kind: 'unavailable' }> {
  let client = opts.client;
  let owns = false;
  if (!client) {
    const url = process.env[DL_URL_ENV]?.trim();
    if (!url) return { kind: 'unavailable' };
    client = new Redis(url, { lazyConnect: true, enableOfflineQueue: false, connectTimeout: COMMAND_TIMEOUT_MS });
    await client.connect();
    owns = true;
  }
  try {
    const maxItems = Math.min(1000, Math.max(1, Math.floor(opts.maxItems ?? 500)));
    const key = opts.key ?? DEAD_LETTER_KEY;
    const snapshotSize = await client.llen(key);
    // head-relative window：LPUSH 头=最新，导出最新的 maxItems 条
    const n = Math.min(snapshotSize, maxItems);
    const raws = n > 0 ? await client.lrange(key, 0, n - 1) : [];
    return { items: raws.map(parseEntry), snapshotSize };
  } finally {
    if (owns) client.disconnect();
  }
}
