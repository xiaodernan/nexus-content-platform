import { describe, expect, it } from 'vitest';
import { resolveOrchestrationLane } from '@/server/ai/orchestrationLane';

/**
 * cont. 170 · 编排车道解析器单测。
 *
 * 纪律：header 优先；非法值（空串 / 别名 / 未来拼写）一律回落 lane-a——
 * 一个拼写错误绝不能把生产流量悄悄换车道。
 */
describe('cont. 170 · resolveOrchestrationLane', () => {
  it('请求头精确 stategraph 时走状态图', () => {
    expect(resolveOrchestrationLane('stategraph', undefined)).toBe('stategraph');
    expect(resolveOrchestrationLane('StateGraph', undefined)).toBe('stategraph');
    expect(resolveOrchestrationLane(' STATEGRAPH ', undefined)).toBe('stategraph');
  });

  it('请求头精确 lane-a 时走顺序执行', () => {
    expect(resolveOrchestrationLane('lane-a', 'stategraph')).toBe('lane-a');
  });

  it('请求头缺省时按 env 走', () => {
    expect(resolveOrchestrationLane(null, 'stategraph')).toBe('stategraph');
    expect(resolveOrchestrationLane(null, 'lane-a')).toBe('lane-a');
    expect(resolveOrchestrationLane(undefined, 'stategraph')).toBe('stategraph');
  });

  it('非法值按优先级回落：header 非法让 env 决定；header 亦非法再回落 lane-a', () => {
    expect(resolveOrchestrationLane('graph', 'stategraph')).toBe('stategraph');
    expect(resolveOrchestrationLane('run', undefined)).toBe('lane-a');
    expect(resolveOrchestrationLane('stategrap', undefined)).toBe('lane-a');
    expect(resolveOrchestrationLane('', 'stategraph')).toBe('stategraph');
    expect(resolveOrchestrationLane('x', 'bogus')).toBe('lane-a');
    expect(resolveOrchestrationLane(null, 'bogus')).toBe('lane-a');
    expect(resolveOrchestrationLane(null, undefined)).toBe('lane-a');
  });
});
