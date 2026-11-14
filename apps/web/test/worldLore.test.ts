import { describe, expect, it } from 'vitest';
import { patchLore } from '../src/lib/worldLore';

describe('patchLore', () => {
  it('空白 era 被摘掉；保留 order', () => {
    expect(patchLore({ era: '灰灯纪', order: 2 }, { era: '   ' })).toEqual({ order: 2 });
  });

  it('order 空白摘掉；保留 era', () => {
    expect(patchLore({ era: '灰灯纪', order: 2 }, { order: '' })).toEqual({ era: '灰灯纪' });
  });

  it('两者都没了 → null（让调用方把整个 lore 摘掉）', () => {
    expect(patchLore({ era: '灰灯纪', order: 2 }, { era: '', order: '' })).toBeNull();
    expect(patchLore(undefined, { era: '', order: '' })).toBeNull();
  });

  it('order 只收有限非负整数；负数 / NaN / 1.9 分别处理', () => {
    expect(patchLore(undefined, { order: '3.7' })).toEqual({ order: 3 });
    expect(patchLore(undefined, { order: '-1' })).toBeNull();
    expect(patchLore(undefined, { order: 'abc' })).toBeNull();
  });

  it('era 超过 80 字截断', () => {
    const long = 'x'.repeat(200);
    expect(patchLore(undefined, { era: long })?.era).toHaveLength(80);
  });

  it('半合并：只补 era 时 order 保留', () => {
    expect(patchLore({ order: 4 }, { era: '灰烬纪' })).toEqual({ era: '灰烬纪', order: 4 });
  });

  it('existing 自带坏 order（负数/小数）会被清掉而不是带病留存', () => {
    expect(patchLore({ order: -3 }, {})).toBeNull();
    expect(patchLore({ order: 1.5 }, {})).toBeNull();
  });

  it('memory：空串摘掉，保留 era/order；超长截断到 240', () => {
    expect(patchLore({ era: '灰灯纪' }, { memory: '' })).toEqual({ era: '灰灯纪' });
    expect(patchLore(undefined, { memory: 'x'.repeat(600) })?.memory).toHaveLength(240);
  });

  it('memory 半合并：只补 memory 时 era/order 保留；全摘 → null', () => {
    expect(patchLore({ era: '灰烬纪', order: 1 }, { memory: '雪停了' })).toEqual({ era: '灰烬纪', order: 1, memory: '雪停了' });
    expect(patchLore({ memory: 'x' }, { memory: '   ' })).toBeNull();
  });
});
