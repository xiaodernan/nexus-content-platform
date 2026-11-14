import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-83 `marketplace/page.tsx` 原子清零——叠加于既有 `.mk-*` 门面——**静态那一寸**。
 * §127/§128：列表只出 public/free 两类；我的物品走所有者视角读路（`listOwnedMarketplaceItems`）——不动谓词。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @）：
 * `7e92d21dea7ffc2cc71ff5d1311be10e32e92c4b06d6e45cc9b6d0c861c273bd` 与 HEAD 字节一致。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/app/marketplace/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const main = readFileSync(MAIN, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const strip = (s: string): string => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
const code = strip(main);

function findOutsideComments(css: string, re: RegExp): number {
  const comments = [...css.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const global = new RegExp(re.source, 'g');
  for (let m = global.exec(css); m !== null; m = global.exec(css)) {
    if (!comments.some(([a, b]) => m.index! >= a && m.index! < b)) return m.index!;
  }
  return -1;
}

const start = findOutsideComments(globals, /\.mk-pageRoot \{/);
if (start < 0) throw new Error('.mk-pageRoot 段缺失');
const rest = globals.slice(start);
const segEnd = rest.search(/\/\* ── §/);
const segment = segEnd > 0 ? rest.slice(0, segEnd) : rest;

function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@')
    .replace(/\s+/g, ' ');
}

describe('§FE-83 /marketplace 创作者市场店面原子清零', () => {
  it('服务端读路进门：listMarketplaceItems/listOwnedMarketplaceItems/listReportedItemIds 守恒', () => {
    expect(code).toContain('listMarketplaceItems(');
    expect(code).toContain('listOwnedMarketplaceItems(');
    expect(code).toContain('listReportedItemIds(');
    expect(code).toContain('MARKETPLACE_DOWNLOAD_LIMIT_PER_HOUR');
  });

  it('数据钩子守恒：data-marketplace-* 全套', () => {
    for (const hook of ['data-marketplace-title', 'data-marketplace-earnings', 'data-marketplace-purchases', 'data-marketplace-reports', 'data-marketplace-back', 'data-marketplace-type-nav', 'data-marketplace-list', 'data-marketplace-mine', 'data-marketplace-signin-hint', 'data-marketplace-limits', 'data-marketplace-empty']) {
      expect(code).toContain(hook);
    }
  });

  it('字面 className 只认 .mk-* / .dv-*（两家族）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(20);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok).toMatch(/^(?:mk|dv)-[A-Za-z0-9-]+$/);
      }
    }
  });

  it('零裸 Tailwind（含 mx-auto/min-h-screen/max-w-[/grid-cols-1/text-[）', () => {
    for (const re of ['mx-auto', 'min-h-screen', 'max-w-[', 'px-6', 'p-[', 'gap-[', 'text-[', 'text-1', 'text-fg-', 'grid-cols-1', 'border-t', 'mt-2', 'flex-col', 'font-medium', 'font-mono']) {
      expect(code, `marketplace page 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\b(?:mk|dv)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(15);
    const defined = new Set([...globals.matchAll(/\.((?:mk|dv)-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined).toContain(cls);
  });

  it('§FE-83 视觉追加段存在且零 @media / transition / @keyframes；零 hex', () => {
    expect(segment.length).toBeGreaterThan(300);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('§FE-83 视觉追加段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of used) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('零新增颜色 token', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('剥 className 后全文 SHA256 守恒（零行为：7e92d21dea7ffc2cc71ff5d1311be10e32e92c4b06d6e45cc9b6d0c861c273bd）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '7e92d21dea7ffc2cc71ff5d1311be10e32e92c4b06d6e45cc9b6d0c861c273bd',
    );
  });
});
