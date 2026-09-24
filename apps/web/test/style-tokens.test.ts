import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 界面上写的每一个 `var(--nexus-*)` 都必须真的存在。
 *
 * 为什么单独盯着这件事：一个拼错的 token 不会报错，只会**静默失效**。
 * §45 的世界图就踩到了——选中节点时写的是 `var(--nexus-color-accent)`，
 * 而设计系统里只有 `accent-1` / `accent-2`。结果"选中"这个状态在屏幕上等于把描边去掉，
 * 用户点了半天看不出自己选了谁，测试也照样绿（断言的是文字，不是颜色）。
 * 所以这里不测某个具体颜色，而是把整类错误挡在门禁里。
 */

const SRC = join(process.cwd(), 'apps/web/src');
const TOKENS = join(SRC, 'styles/tokens.css');

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return tsxFiles(p);
    return p.endsWith('.tsx') || p.endsWith('.ts') ? [p] : [];
  });
}

describe('设计 token 引用（§12）', () => {
  const defined = new Set(
    [...readFileSync(TOKENS, 'utf8').matchAll(/(--nexus-[a-z0-9-]+)\s*:/g)].map((m) => m[1]!),
  );

  it('tokens.css 里确实有定义，否则这份检查就是空的', () => {
    expect(defined.size).toBeGreaterThan(30);
    expect(defined.has('--nexus-color-accent-2')).toBe(true);
    // 这一条就是当年那个拼错的名字：它必须仍然不存在，检查才有意义
    expect(defined.has('--nexus-color-accent')).toBe(false);
  });

  it('界面里没有出现指向不存在 token 的 var()', () => {
    const unknown: string[] = [];
    for (const file of tsxFiles(SRC)) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        for (const m of line.matchAll(/var\((--nexus-[a-z0-9-]+)[),]/g)) {
          if (!defined.has(m[1]!)) unknown.push(`${relative(process.cwd(), file)}:${i + 1} ${m[1]}`);
        }
      });
    }
    expect(unknown).toEqual([]);
  });
});
