import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-GE 根级错误边界 `app/error.tsx` `.ge-shell` 一族——合并后门面化，本片是它的视觉判据。
 *
 * 并行线《cont. 74》带入整页并挂 root `error.tsx`；合并后按 §FE 纪律门面化（零裸原子）。
 * 这个页面的职责单一：一次诚实的状态页。判据逐条成文，SHA256 钉合并后的字节。
 *
 * **剥 className 后全文 SHA256 钉死**：`1ed9d6af…`，合并后 2026-11-13 23:37 钉入本线。
 */

const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/app/error.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const main = readFileSync(MAIN, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const strip = (s: string): string => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
const code = strip(main);

const GE_START = globals.indexOf('.ge-shell {');
if (GE_START < 0) throw new Error('globals.css 里没有 .ge- 段（.ge-shell {）');
// §FE-SV（SavingsCard 节）与 §FE-AM（成本账单节）是合并后追加在文件尾部的新段；
// 它们不属于本片 §FE-GE 的视觉族——改按 §FE-AM 切界，保住 ".ge- 段没有渐变墨字" 一门的原始语义。
const nextSection = globals.indexOf('/* §FE-AM', GE_START);
const segment = globals.slice(GE_START, nextSection > 0 ? nextSection : undefined);

function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}');
}

describe('§FE-GE /app/error.tsx 根级错误边界', () => {
  it("'use client' 保留 + GlobalError 唯一导出 + console.error 只走应急人路径", () => {
    expect(code).toContain("'use client'");
    expect(code).toContain('export default function GlobalError');
    expect(code).toContain("console.error('[NEXUS/app-root-error]'");
    expect(code).toContain('reset');
    expect(code).not.toContain('useState');
  });

  it('字面 className 全 .ge-*', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBe(9);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `error.tsx 出现域外类：${tok}`).toMatch(/^ge-/);
      }
    }
  });

  it('零裸 Tailwind（含 min-h/max-w/flex/rounded-lg/hover 变体）', () => {
    for (const re of ['min-h-', 'max-w-', 'flex ', 'flex-col', 'items-center', 'justify-center', 'rounded-', 'hover:', 'focus-visible:', 'absolute', 'inset']) {
      expect(code, `error.tsx 仍出现裸原子 ${re}`).not.toContain(`\`${re}`);
      expect(code, `error.tsx 仍出现裸原子 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有定义', () => {
    const used = new Set([...code.matchAll(/\bge-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBe(9);
    const defined = new Set([...globals.matchAll(/\.(ge-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
  });

  it('.ge- 视觉段零 hex、零新增颜色 token；var(--nexus-*) 全部在 tokens.css 声明', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(segment).not.toMatch(/--nexus-color-ge-/);
    const usedTokens = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of usedTokens) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('.ge- 视觉段没有渐变墨字（纯色 ge-mark，不触发 A11Y-1 forced-colors 联动）', () => {
    expect(segment).not.toContain('background-clip');
    expect(segment).not.toContain('color: transparent');
  });

  it('剥 className 后全文 SHA256 钉死（合并后字节：1ed9d6af6a99e46990adb5900885f1c4c175d231126b454b472cf238cc67f9a7）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '1ed9d6af6a99e46990adb5900885f1c4c175d231126b454b472cf238cc67f9a7',
    );
  });
});
