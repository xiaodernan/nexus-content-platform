import { describe, expect, it } from 'vitest';
import { stableKey } from './stable-key';

/**
 * 规范化字符串：键顺序无关、且与 JSON 序列化语义一致（jsonb 丢掉 undefined）。
 *
 * 这个函数的存在理由写在它自己的注释里：快照的 `documentsMatch` 与增量保存的
 * `diffByKey` 共用它——拿 `JSON.stringify` 直接比会把"没改动"判成"有改动"
 * （jsonb 不保留对象键顺序，重建文档时缺省字段填 undefined 落库即丢）。
 * 这些用例钉的是那条理由的每一半：键序、undefined、嵌套、数组有序、原始值语义。
 */

describe('stableKey：键顺序无关', () => {
  it('同一对象两种拼法 → 同一串', () => {
    expect(stableKey({ a: 1, b: 2 })).toBe(stableKey({ b: 2, a: 1 }));
  });

  it('嵌套对象同样排序（深度不止一层）', () => {
    expect(stableKey({ x: { a: 1, b: 2 }, y: 3 })).toBe(stableKey({ y: 3, x: { b: 2, a: 1 } }));
  });

  it('反向对照：JSON.stringify 确实会把键序不同的同一对象判成不同（函数存在的理由）', () => {
    expect(JSON.stringify({ a: 1, b: 2 })).not.toBe(JSON.stringify({ b: 2, a: 1 }));
  });
});

describe('stableKey：undefined 值跳过（jsonb 落库即丢，判等必须跟着丢）', () => {
  it('顶层 undefined 字段与不写该字段同键', () => {
    expect(stableKey({ a: 1, b: undefined })).toBe(stableKey({ a: 1 }));
  });

  it('嵌套对象的 undefined 字段同样跳过', () => {
    expect(stableKey({ page: { id: 'p1', name: undefined } })).toBe(stableKey({ page: { id: 'p1' } }));
  });

  it('数组元素里的 undefined 也跳过', () => {
    expect(stableKey([{ a: 1, b: undefined }])).toBe(stableKey([{ a: 1 }]));
  });

  it('全部字段都是 undefined 的对象等于空对象', () => {
    expect(stableKey({ a: undefined, b: undefined })).toBe(stableKey({}));
  });
});

describe('stableKey：数组是有序的（与对象相反）', () => {
  it('数组顺序不同 → 不同键（顺序是内容的一部分）', () => {
    expect(stableKey([1, 2])).not.toBe(stableKey([2, 1]));
  });

  it('数组里对象的键序仍然无关', () => {
    expect(stableKey([{ a: 1, b: 2 }])).toBe(stableKey([{ b: 2, a: 1 }]));
  });

  it('空数组与空对象互不相同', () => {
    expect(stableKey([])).not.toBe(stableKey({}));
    expect(stableKey([])).toBe('[]');
    expect(stableKey({})).toBe('{}');
  });
});

describe('stableKey：原始值与顶层 undefined 的语义', () => {
  it('null / 布尔 / 数字按 JSON 语义序列化', () => {
    expect(stableKey(null)).toBe('null');
    expect(stableKey(true)).toBe('true');
    expect(stableKey(false)).toBe('false');
    expect(stableKey(42)).toBe('42');
  });

  it('字符串走 JSON 转义（引号、反斜杠、换行都不会撞上分隔符）', () => {
    expect(stableKey('a"b')).toBe('"a\\"b"');
    expect(stableKey('a\\b')).toBe('"a\\\\b"');
    expect(stableKey('a\nb')).toBe('"a\\nb"');
  });

  it('顶层 undefined → "null"（JSON.stringify(undefined) 是 undefined，这里兜底成 null）', () => {
    expect(stableKey(undefined)).toBe('null');
  });

  it('对象键名本身带特殊字符也能正确包裹（键名也过 JSON 转义）', () => {
    expect(stableKey({ 'a,b': 1 })).toBe(stableKey({ 'a,b': 1 }));
    expect(stableKey({ 'a,b': 1 })).not.toBe(stableKey({ 'a,b ': 1 }));
  });
});

describe('stableKey：真实形状的往返', () => {
  it('带缺省 undefined 的设计文档与补齐后的版本同键（恢复不多写安全快照的那条理由）', () => {
    const withDefaults = {
      pages: [
        { id: 'p1', name: '首页', backgroundColor: undefined },
        { id: 'p2', name: '关于', backgroundColor: undefined },
      ],
      tokens: { 'color.primary': { value: '#ff0000', description: undefined } },
    };
    const withoutDefaults = {
      tokens: { 'color.primary': { value: '#ff0000' } },
      pages: [
        { id: 'p1', name: '首页' },
        { id: 'p2', name: '关于' },
      ],
    };
    expect(stableKey(withDefaults)).toBe(stableKey(withoutDefaults));
  });

  it('内容真的不同 → 键不同（不是"什么都相等"）', () => {
    expect(stableKey({ pages: [{ id: 'p1' }] })).not.toBe(stableKey({ pages: [{ id: 'p2' }] }));
    expect(stableKey({ n: 1 })).not.toBe(stableKey({ n: 2 }));
  });

  it('确定性：同一输入两次调用同输出', () => {
    const doc = { b: [1, { c: null }], a: 'x' };
    expect(stableKey(doc)).toBe(stableKey(doc));
  });
});
