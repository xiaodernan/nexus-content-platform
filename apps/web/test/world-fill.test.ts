import { describe, expect, it } from 'vitest';
import { parseWorldFillReply } from '../src/lib/worldFill';

/**
 * §44 世界填料的入口门。宁可少收一条，也不把模型话术当设定写进用户的世界文档：
 * 这里只判形状，任何"看起来像但不可用"的回话都必须空手回去，由界面照实说没拿到。
 */
describe('worldFill · 填料回话解析', () => {
  it('接受顶层数组与 {entries} 两种合法形状，最多两条', () => {
    const two = '[{"title":"盐道","body":"路面永远有一层薄盐。"},{"title":"老石磨","body":"磨盘转起来没有声音。"}]';
    expect(parseWorldFillReply(two)).toEqual([
      { title: '盐道', body: '路面永远有一层薄盐。' },
      { title: '老石磨', body: '磨盘转起来没有声音。' },
    ]);
    expect(parseWorldFillReply('```json\n' + two + '\n```')).toHaveLength(2);
    expect(parseWorldFillReply('{"entries":' + two + '}')).toHaveLength(2);
  });

  it('超过两条截断，不把模型的"再给你三条"塞进世界', () => {
    const three = Array.from({ length: 3 }, (_, i) => ({ title: `条目${i}`, body: `细节${i}` }));
    expect(parseWorldFillReply(JSON.stringify(three))).toHaveLength(2);
  });

  it('非 JSON / 空标题 / 空正文 / 字段不是字符串 一律空手', () => {
    expect(parseWorldFillReply('好的，这是两条设定：')).toEqual([]);
    expect(parseWorldFillReply('{"title":"x","body":"y"}')).toEqual([]); // 不是数组
    expect(parseWorldFillReply(JSON.stringify([{ title: '', body: '有正文' }]))).toEqual([]);
    expect(parseWorldFillReply(JSON.stringify([{ title: '有标题', body: 42 }]))).toEqual([]);
    expect(parseWorldFillReply(JSON.stringify([null, 3, 'x']))).toEqual([]);
  });

  it('超长字段拒绝，不把一整本书塞进一个节点', () => {
    const long = JSON.stringify([{ title: 't'.repeat(121), body: 'b' }]);
    expect(parseWorldFillReply(long)).toEqual([]);
  });
});
