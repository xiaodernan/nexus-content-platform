import { describe, expect, it } from 'vitest';
import { resolveOrchestrationLane } from '@/server/ai/orchestrationLane';

/**
 * cont. 222 · 编排车道解析器单测（默认已翻转：stategraph 为默认，lane-a 为显式逃生门）。
 *
 * 纪律：header 优先；非法值（空串 / 别名 / 未来拼写）一律回落默认（stategraph）——
 * 一个拼写错误绝不能把生产流量悄悄换回旧通路。
 */
describe('cont. 222 · resolveOrchestrationLane（默认 stategraph）', () => {
  it('请求头精确 stategraph 时走状态图', () => {
    expect(resolveOrchestrationLane('stategraph', undefined)).toBe('stategraph');
    expect(resolveOrchestrationLane('StateGraph', undefined)).toBe('stategraph');
    expect(resolveOrchestrationLane(' STATEGRAPH ', undefined)).toBe('stategraph');
  });

  it('请求头精确 lane-a 时走顺序执行（逃生门）', () => {
    expect(resolveOrchestrationLane('lane-a', 'stategraph')).toBe('lane-a');
  });

  it('请求头缺省时按 env 走', () => {
    expect(resolveOrchestrationLane(null, 'stategraph')).toBe('stategraph');
    expect(resolveOrchestrationLane(null, 'lane-a')).toBe('lane-a');
    expect(resolveOrchestrationLane(undefined, 'stategraph')).toBe('stategraph');
  });

  it('非法值按优先级回落：header 非法让 env 决定；header 亦非法再回落默认 stategraph', () => {
    expect(resolveOrchestrationLane('graph', 'stategraph')).toBe('stategraph');
    expect(resolveOrchestrationLane('run', undefined)).toBe('stategraph');
    expect(resolveOrchestrationLane('stategrap', undefined)).toBe('stategraph');
    expect(resolveOrchestrationLane('', 'stategraph')).toBe('stategraph');
    expect(resolveOrchestrationLane('x', 'bogus')).toBe('stategraph');
    expect(resolveOrchestrationLane(null, 'bogus')).toBe('stategraph');
    expect(resolveOrchestrationLane(null, undefined)).toBe('stategraph');
    // 显式逃生门仍然有效：哪怕 header 给了 bogus，env=lane-a 也必须把车道降下来
    expect(resolveOrchestrationLane('x', 'lane-a')).toBe('lane-a');
  });
});
