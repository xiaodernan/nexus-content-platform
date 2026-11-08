import { beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_SERIES_PER_METRIC,
  METRICS,
  TRACE_HEADER,
  currentTraceId,
  exposition,
  increment,
  newTraceId,
  observe,
  resetMetrics,
  sanitizeTraceId,
  snapshot,
  traceIdFor,
} from '../src/server/observability';

/**
 * `server/observability.ts` 的门。这片代码的全部风险都在"数错"与"数到无界的东西"两件事上，
 * 所以钉的是算术与封顶，不是"看起来有输出"。
 */

beforeEach(() => resetMetrics());

describe('追踪 id', () => {
  it('发的是 16 个 hex，且两次不一样', () => {
    const a = newTraceId();
    const b = newTraceId();
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(b).toMatch(/^[0-9a-f]{16}$/);
    expect(a).not.toBe(b);
  });

  it('进来的头形状不对就当没有——外部头是不可信输入', () => {
    expect(sanitizeTraceId('deadbeef00000000')).toBe('deadbeef00000000');
    expect(sanitizeTraceId('DEADBEEF00000000')).toBe('deadbeef00000000');
    for (const junk of [null, undefined, '', 'zz'.padEnd(16, 'z'), 'x'.repeat(7), 'y'.repeat(33), 'a'.repeat(15) + 'g']) {
      expect(sanitizeTraceId(junk), `应当拒收：${String(junk)}`).toBeNull();
    }
  });

  it('traceIdFor：带上来的合法头就沿用（跨进程要能接上），没有或不对就发新的', () => {
    const inbound = new Request('http://x/y', { headers: { [TRACE_HEADER]: 'abcdef0123456789' } });
    expect(traceIdFor(inbound)).toBe('abcdef0123456789');
    const junk = new Request('http://x/y', { headers: { [TRACE_HEADER]: '../../etc/passwd' } });
    expect(traceIdFor(junk)).toMatch(/^[0-9a-f]{16}$/);
    expect(traceIdFor(new Request('http://x/y'))).toMatch(/^[0-9a-f]{16}$/);
  });

  it('请求作用域之外读不到追踪 id，但也不抛——审计写入的 catch 旁边要用它', async () => {
    // 实测：next/headers 在 vitest 里能 import，调用时抛 "outside a request scope"。
    // 这一格钉的就是"那个抛必须被吞成 null"，否则一次日志标签能把业务请求带崩。
    expect(await currentTraceId()).toBeNull();
  });
});

describe('counter 的算术', () => {
  it('同一组标签累加，不同标签分开记', () => {
    increment('nexus_audit_decisions_total', { action: 'auth.login', allowed: 'true' });
    increment('nexus_audit_decisions_total', { action: 'auth.login', allowed: 'true' });
    increment('nexus_audit_decisions_total', { action: 'auth.login', allowed: 'false' });
    const [metric] = snapshot();
    expect(metric?.name).toBe('nexus_audit_decisions_total');
    if (metric?.kind !== 'counter') throw new Error('应当是 counter');
    expect(metric.series.length).toBe(2);
    // 序列按标签键值排序后再不固定顺序断言：读的是"这一组标签的值是几"，不是"它排在第几行"
    const valueOf = (allowed: string) => metric.series.find((s) => s.labels.allowed === allowed)?.value;
    expect(valueOf('true')).toBe(2);
    expect(valueOf('false')).toBe(1);
  });

  it('不带标签的指标只有一条序列', () => {
    increment('nexus_audit_write_failures_total');
    increment('nexus_audit_write_failures_total');
    const metric = snapshot().find((m) => m.name === 'nexus_audit_write_failures_total');
    expect(metric?.kind === 'counter' && metric.series).toEqual([{ labels: {}, value: 2 }]);
  });

  it('没声明的标签名直接抛——基数失控就是这样开出来的', () => {
    expect(() => increment('nexus_audit_decisions_total', { action: 'auth.login', allowed: 'true', userId: 'u1' } as never)).toThrow(
      /没声明标签 userId/,
    );
  });

  it('少给声明过的标签也抛——静默少一格比抛错更难查', () => {
    expect(() => increment('nexus_audit_decisions_total', { action: 'auth.login' } as never)).toThrow(/缺声明过的标签 allowed/);
  });

  it('枚举标签落在名单外抛：capability 只能是我们真能分辨的那三档', () => {
    expect(() => increment('nexus_ai_runs_total', { capability: 'maybe', outcome: 'ok' } as never)).toThrow(/落在枚举外/);
    expect(() => increment('nexus_ai_runs_total', { capability: 'real', outcome: 'ok' })).not.toThrow();
  });

  it('counter 名字用在一个 histogram 上抛（反之亦然）', () => {
    expect(() => increment('nexus_ai_run_duration_ms', { capability: 'real', outcome: 'ok' } as never)).toThrow(/不是 counter/);
    expect(() => observe('nexus_audit_decisions_total', 10, { action: 'x', allowed: 'true' })).toThrow(/不是 histogram/);
  });
});

describe('histogram 的桶', () => {
  it('桶是累计的：一个 300ms 的样本同时进 25/50/100/250 之外的那一档起每一档', () => {
    observe('nexus_ai_run_duration_ms', 300, { capability: 'demo', outcome: 'ok' });
    const metric = snapshot().find((m) => m.name === 'nexus_ai_run_duration_ms');
    expect(metric?.kind).toBe('histogram');
    if (metric?.kind !== 'histogram') return;
    const s = metric.series[0]!;
    expect(s.count).toBe(1);
    expect(s.sum).toBe(300);
    // 桶上界 [25,50,100,250,500,...]：300 只进 ≤500 及更大的那些档
    expect(s.bucketCounts.slice(0, 4)).toEqual([0, 0, 0, 0]);
    expect(s.bucketCounts.slice(4, 6)).toEqual([1, 1]);
  });

  it('0 / 负数 / NaN 记成 0 毫秒而不是丢掉这一次', () => {
    observe('nexus_ai_run_duration_ms', -5, { capability: 'demo', outcome: 'failed' });
    observe('nexus_ai_run_duration_ms', Number.NaN, { capability: 'demo', outcome: 'failed' });
    const metric = snapshot().find((m) => m.name === 'nexus_ai_run_duration_ms');
    if (metric?.kind !== 'histogram') throw new Error('应当有一条序列');
    expect(metric.series[0]!.count).toBe(2);
    expect(metric.series[0]!.sum).toBe(0);
  });
});

describe('基数封顶（这是防御，不是装饰）', () => {
  it('超过 64 条序列后不再新增，折进一条溢出账', () => {
    for (let i = 0; i < MAX_SERIES_PER_METRIC + 6; i += 1) {
      increment('nexus_audit_decisions_total', { action: `act${i}`, allowed: 'true' });
    }
    const decisions = snapshot().find((m) => m.name === 'nexus_audit_decisions_total');
    const overflow = snapshot().find((m) => m.name === 'nexus_metric_cardinality_overflow_total');
    if (decisions?.kind !== 'counter' || overflow?.kind !== 'counter') throw new Error('两条账都该在');
    expect(decisions.series.length).toBe(MAX_SERIES_PER_METRIC);
    expect(overflow.series).toEqual([{ labels: { metric: 'nexus_audit_decisions_total' }, value: 6 }]);
  });

  it('自由标签值形状不对（太长／带中文／带空格）也折叠，不进序列', () => {
    increment('nexus_rate_limit_decisions_total', { gate: '登录'.repeat(30), allowed: 'false' });
    increment('nexus_rate_limit_decisions_total', { gate: 'auth login', allowed: 'false' });
    const rate = snapshot().find((m) => m.name === 'nexus_rate_limit_decisions_total');
    const overflow = snapshot().find((m) => m.name === 'nexus_metric_cardinality_overflow_total');
    expect(rate === undefined || (rate.kind === 'counter' && rate.series.length === 0)).toBe(true);
    expect(overflow?.kind === 'counter' && overflow.series[0]!.value).toBe(2);
  });
});

describe('exposition 文本', () => {
  it('counter 与 histogram 各按格式出：HELP / TYPE / 样本行，histogram 带累计桶与 +Inf', () => {
    increment('nexus_audit_decisions_total', { action: 'auth.login', allowed: 'false' }, 3);
    observe('nexus_ai_run_duration_ms', 300, { capability: 'demo', outcome: 'ok' });
    const text = exposition();
    const lines = text.split('\n');
    expect(lines).toContain('# HELP nexus_audit_decisions_total 落进审计的决定数（放行与拒绝都算一次）');
    expect(lines).toContain('# TYPE nexus_audit_decisions_total counter');
    expect(lines).toContain('nexus_audit_decisions_total{action="auth.login",allowed="false"} 3');
    expect(lines).toContain('# TYPE nexus_ai_run_duration_ms histogram');
    // 标签块按字母序：`le` 排在 capability 与 outcome 之间，不是缀在最后——格式只要求键稳定，不要求顺序好看
    expect(lines).toContain('nexus_ai_run_duration_ms_bucket{capability="demo",le="250",outcome="ok"} 0');
    expect(lines).toContain('nexus_ai_run_duration_ms_bucket{capability="demo",le="500",outcome="ok"} 1');
    expect(lines).toContain('nexus_ai_run_duration_ms_bucket{capability="demo",le="+Inf",outcome="ok"} 1');
    expect(lines).toContain('nexus_ai_run_duration_ms_count{capability="demo",outcome="ok"} 1');
    expect(lines).toContain('nexus_ai_run_duration_ms_sum{capability="demo",outcome="ok"} 300');
  });

  it('同一份状态每次读出同一串：排序是判据的一部分', () => {
    increment('nexus_audit_decisions_total', { action: 'zeta', allowed: 'true' });
    increment('nexus_audit_decisions_total', { action: 'alpha', allowed: 'true' });
    increment('nexus_rate_limit_decisions_total', { gate: 'blocks', allowed: 'false' });
    const first = exposition();
    expect(exposition()).toBe(first);
    expect(first.indexOf('action="alpha"')).toBeLessThan(first.indexOf('action="zeta"'));
  });

  it('每个声明出来的指标名都真的能被读到（名单与实现不两回事）', () => {
    expect(Object.keys(METRICS).length).toBeGreaterThanOrEqual(6);
    for (const [name, spec] of Object.entries(METRICS)) {
      expect(['counter', 'histogram'], `${name} 的类型`).toContain(spec.kind);
      expect(spec.help.length, `${name} 没有 help`).toBeGreaterThan(0);
      if (spec.kind === 'histogram') {
        expect(spec.buckets.length).toBeGreaterThan(0);
        expect([...spec.buckets].sort((a, b) => a - b)).toEqual([...spec.buckets]);
      }
    }
  });
});
