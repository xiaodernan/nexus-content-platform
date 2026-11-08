import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 审计**写不上**时的那一格账。
 *
 * `recordAudit` 的纪律是"写失败不改变请求结果"（审计是旁证，不是业务前提），
 * 而这条纪律有个副作用：失败了只剩一行 stderr，没人会在日志里数它涨了几次。
 * `nexus_audit_write_failures_total` 就是为那条路准备的——所以这一张必须把"库抖一下"真的造出来，
 * 而不是指望生产里出事才发现这一格从来没被写过。
 */

vi.mock('../src/server/db/client', () => ({
  getDb: () => {
    throw new Error('连接池断了（本测试造的）');
  },
}));

const { recordAudit } = await import('../src/server/domain/audit');
const { increment, resetMetrics, snapshot } = await import('../src/server/observability');

beforeEach(() => resetMetrics());

describe('审计写入失败', () => {
  it('返回 false（请求结论不变），但溢出到 stderr 的那件事会记一笔账', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ok = await recordAudit({ actorId: null, action: 'probe.db-down', allowed: true, detail: { why: 'arm' } });
    expect(ok).toBe(false);
    // 决定本身仍然被数到：这一条记的是"发生过一次判定"，与写库成不成败是两个问题
    const decisions = snapshot().find((m) => m.name === 'nexus_audit_decisions_total');
    expect(decisions?.kind === 'counter' && decisions.series[0]?.value).toBe(1);
    const failures = snapshot().find((m) => m.name === 'nexus_audit_write_failures_total');
    expect(failures?.kind === 'counter' && failures.series[0]?.value).toBe(1);
    // 那一行 stderr 要带上决定与失败原因——不然"有一条审计写失败了"这句话没人能回答是哪一条。
    // `trace=-` 是**这里**该写的：不在请求作用域里就没有 id，用一个假 id 把两次失败拼成"同一次"更糟
    expect(spy.mock.calls[0]?.[0]).toContain('[audit] 写入失败 trace=- probe.db-down allowed=true');
    spy.mockRestore();
  });

  it('溢出账不会把自己也算成一次溢出（不带标签的内部通道）', () => {
    increment('nexus_metric_cardinality_overflow_total', { metric: 'nexus_audit_decisions_total' });
    increment('nexus_metric_cardinality_overflow_total', { metric: 'nexus_rate_limit_decisions_total' });
    const overflow = snapshot().find((m) => m.name === 'nexus_metric_cardinality_overflow_total');
    if (overflow?.kind !== 'counter') throw new Error('溢出账没记上');
    expect(overflow.series.length).toBe(2);
    expect(overflow.series.map((s) => s.value)).toEqual([1, 1]);
  });
});
