import { describe, expect, it } from 'vitest';
import { parseJsx } from '../src/code-parse';

/**
 * §17-19 Code → Design 的受限 JSX 解析器：**病态深嵌套不能让递归栈溢出**。
 *
 * `parseElement ↔ parseChildren` 是互相递归的下钻。代码视图里粘贴一段几万层的 `<div>`
 * （或从别处拷来的畸形组件）会让递归栈直接 RangeError——那是"用户输入把解析器打崩"，
 * 应该回一条可读的 issue，而不是抛异常。生成器产出的结构个位数层，128 层是极宽裕的上界。
 *
 * 变异探针：把 MAX_JSX_DEPTH 抬到极大（等于关掉守卫），下面"2 万层不崩"那条会因栈溢出变红。
 */

function nested(depth: number): string {
  return `export function Home() { return (${'<div>'.repeat(depth)}${'</div>'.repeat(depth)}); }`;
}

describe('parseJsx：病态深嵌套不崩', () => {
  it('2 万层嵌套 → 回 issue 而不是 RangeError 栈溢出', () => {
    // 修复前：2 万层 ⇒ 约 4 万个递归帧 ⇒ Maximum call stack size exceeded。
    // 修复后：递归停在 MAX_JSX_DEPTH，交回一条"嵌套超过…层"的 issue。
    const res = parseJsx(nested(20_000));
    expect(res.issues.some((i) => i.message.includes('嵌套超过'))).toBe(true);
  });

  it('正常浅结构不误报、能解出根节点', () => {
    const res = parseJsx(nested(3));
    expect(res.root).not.toBeNull();
    expect(res.issues.some((i) => i.message.includes('嵌套超过'))).toBe(false);
  });
});
