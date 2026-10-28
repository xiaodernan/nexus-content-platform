import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../src/server/db/client';
import { auditEvents } from '../src/server/db/schema';
import { recordAudit } from '../src/server/domain/audit';
import { clampWindowHours, readLedger } from '../src/server/domain/metrics';
import { resetMetrics, snapshot } from '../src/server/observability';

/**
 * 观测的**库那半**跑一次真环路：写一条审计 → 进程内计数器涨 → 库账读得出同一件事。
 *
 * 为什么值得单独一张：`observability.ts` 的计数器与 `metrics.ts` 的库账是两套读法，
 * 中间只隔着 `recordAudit` 一个函数。它们各自都能自测通过而**互相说不出同一件事**
 * （比如 detail 合并把 traceId 吞了，或者分组条件写错导致窗口里永远是空表）。
 * 这一张钉的就是"同一行审计，两处都看得见"。
 */

const PROBE = 'probe.ledger';

beforeAll(async () => {
  await getDb().delete(auditEvents).where(eq(auditEvents.action, PROBE));
  resetMetrics();
});

afterAll(async () => {
  await getDb().delete(auditEvents).where(eq(auditEvents.action, PROBE));
});

describe('clampWindowHours', () => {
  it('把 0、负数、小数、NaN 与离谱的大数都收进 1..720 小时', () => {
    expect(clampWindowHours(0)).toBe(1);
    expect(clampWindowHours(-5)).toBe(1);
    expect(clampWindowHours(2.9)).toBe(2);
    expect(clampWindowHours(Number.NaN)).toBe(24);
    expect(clampWindowHours(1e9)).toBe(24 * 30);
    expect(clampWindowHours()).toBe(24);
  });
});

describe('同一行审计，两处都看得见', () => {
  it('recordAudit 记一次拒绝 → 计数器 +1 → 库账里同一 (动作, 结果) 有行', async () => {
    const ok = await recordAudit({
      actorId: null,
      action: PROBE,
      targetType: 'probe',
      allowed: false,
      detail: { reason: 'integration-probe' },
    });
    expect(ok, '审计行没写上，这一张的读侧就没有东西可验').toBe(true);

    const decisions = snapshot().find((m) => m.name === 'nexus_audit_decisions_total');
    if (decisions?.kind !== 'counter') throw new Error('写路径没有把决定记到进程内');
    const probeSeries = decisions.series.find((s) => s.labels.action === PROBE && s.labels.allowed === 'false');
    expect(probeSeries?.value, '计数器里读不到这次拒绝').toBe(1);

    const ledger = await readLedger(24);
    const row = ledger.audit.find((r) => r.action === PROBE && !r.allowed);
    expect(row?.n, '库账窗口里读不到这条动作').toBeGreaterThanOrEqual(1);
    expect(ledger.windowHours).toBe(24);
    expect(new Date(ledger.since).getTime()).toBeLessThanOrEqual(Date.now());
    // 排序也是判据：这一张表给审核员看的是"哪一类决定最多"，乱序的读数会被当成两组事实
    const counts = ledger.audit.map((r) => r.n);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });

  it('请求作用域之外不编造 traceId——宁缺毋滥', async () => {
    await recordAudit({ actorId: null, action: PROBE, allowed: true, detail: { reason: 'no-request-scope' } });
    const rows = await getDb()
      .select({ detail: auditEvents.detail })
      .from(auditEvents)
      .where(and(eq(auditEvents.action, PROBE)));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const row of rows) {
      const detail = row.detail as Record<string, unknown> | null;
      expect(detail && 'traceId' in detail, `不在请求里却写进了 traceId：${JSON.stringify(detail)}`).toBe(false);
    }
  });

  it('任务与凭据两本账读得出形状（哪怕这台机器上今天没有行）', async () => {
    const ledger = await readLedger(24);
    for (const task of ledger.tasks) {
      expect(typeof task.status).toBe('string');
      expect(task.n).toBeGreaterThan(0);
      // 均耗时要么是 null（这一组里全是没跑完的行），要么是非负数；把 null 当 0 是最容易撒的谎
      expect(task.avgMs === null || (Number.isFinite(task.avgMs) && task.avgMs >= 0)).toBe(true);
    }
    for (const call of ledger.apiCalls) {
      expect(call.calls).toBeGreaterThan(0);
    }
    expect(ledger.apiCalls.length).toBeLessThanOrEqual(20);
  });
});
