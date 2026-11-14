import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  probeAllTiers,
} from '@/server/admin/health-aggregate';

/**
 * §SC-81 / ADR-0192 · /admin/health 聚合层判据（零浏览器、零真库、零时钟、零网络）。
 *
 * 每层给定"fetch outcome"，判据只验 probeAllTiers 怎么把它译成 tier readout：
 *  - ok 的一层记 detail；
 *  - 拿不到的一层一定带 "未测到"/"异常" 前缀，绝不改写成 down 也绝不画成 0；
 *  - overall = 每层全 ok 才是 ok，否则 degraded；
 *  - measuredAt 非空，页面拿得到手。
 */
describe('/admin/health probeAllTiers 聚合判据', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // 默认一切全灭——每个用例自己按需桩正确档
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('not found', { status: 404 })) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('五个 detail 全部带记号：ok 层 detail 描述通过；未测到的话带"未测到"前缀，不改写成 0', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'UP', app: {} }), { status: 200 })) as unknown as typeof fetch;
    const snap = await probeAllTiers();
    expect(snap.tiers).toHaveLength(5);
    for (const tier of snap.tiers) {
      expect(tier.measuredAt).toBeTruthy();
      expect(tier.detail.length).toBeGreaterThan(0);
      // ✓ 断言"未测到"前缀只在失败情形出现——ok 层这句不会出现
      if (tier.ok) expect(tier.detail).not.toMatch(/^未测到/);
      else expect(tier.detail).toMatch(/未测到|异常|非 UP/);
    }
    expect(['ok', 'degraded']).toContain(snap.overall);
  });

  it('有一层失败整体不再是 ok', async () => {
    // fetch 总败 → ai/java/gateway 都为未测到；redis/postgres 的失败路径由 JS fetch 不介入；
    // 所以整体必然 degraded、细节里至少三层提到未测到
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    const snap = await probeAllTiers();
    expect(snap.overall).toBe('degraded');
    const notOkTiers = snap.tiers.filter((t) => !t.ok);
    expect(notOkTiers.length).toBeGreaterThanOrEqual(3);
  });

  it('形状错误（非 JSON 或非 UP）java/gateway 不被判 healthy', async () => {
    const res = new Response('not json', { status: 200 });
    globalThis.fetch = vi.fn().mockResolvedValue(res) as unknown as typeof fetch;
    const snap = await probeAllTiers();
    const java = snap.tiers.find((t) => t.name === 'java')!;
    const gateway = snap.tiers.find((t) => t.name === 'gateway')!;
    expect(java.ok).toBe(false);
    expect(gateway.ok).toBe(false);
  });

  it('非 UP 的 actuator 响应 Java 报告"非 UP"而不是健康', async () => {
    const res = new Response(JSON.stringify({ status: 'DOWN' }), { status: 200 });
    globalThis.fetch = vi.fn().mockResolvedValue(res) as unknown as typeof fetch;
    const snap = await probeAllTiers();
    const java = snap.tiers.find((t) => t.name === 'java')!;
    expect(java.ok).toBe(false);
    expect(java.detail).toMatch(/非 UP|DOWN/);
  });
});
