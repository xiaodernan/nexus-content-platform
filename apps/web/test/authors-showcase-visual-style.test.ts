import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-ASH `/u` 作者广场 `.ash-*` 一族——合并后门面化，本片是它的视觉判据。
 *
 * 并行线带入整页（`/u` 作者广场："discovery on the author axis"），合并后按 §FE 纪律门面化
 * （零裸原子、零 hex、全锚 token）。卡片头像有 brand→accent-1→accent-2 的线性渐变背景
 * ——**背景不是渐变墨字**，不触发 A11Y-1/forced-colors 联动。
 *
 * **剥 className 后全文 SHA256 钉死**：`1d270e14…`，合并后 2026-11-13 23:37 钉入本线。
 */

const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/app/u/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const main = readFileSync(MAIN, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const strip = (s: string): string => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
const code = strip(main);

const ASH_START = globals.indexOf('.ash-eyebrow {');
if (ASH_START < 0) throw new Error('globals.css 里没有 .ash- 段（.ash-eyebrow {）');
const nextSection = globals.indexOf('.ash-cardBody {', ASH_START);
const segment = globals.slice(ASH_START, nextSection > 0 ? nextSection : undefined);

function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}');
}

describe('§FE-ASH /u 作者广场', () => {
  it('server 组件 + 作者真实列表 + BrandTitle 门面类（零原子）', () => {
    expect(code).not.toContain('use client');
    expect(code).toContain('listPublicAuthorsForShowcase()');
    expect(code).toContain('<BrandTitle>');
    expect(code).toContain('force-dynamic');
    expect(code).toContain('data-authors-root');
  });

  it('字面 className 全 .ash-*/.adm-*/.am-*（门面族复用轨道）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"|className=\{`([^`]*)`\}/g)].map((m) => m[1] ?? m[2] ?? '');
    expect(literals.length).toBe(20);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `/u 出现域外类：${tok}`).toMatch(/^(ash|adm|am)-/);
      }
    }
  });

  it('零裸 Tailwind（含 hover:/grid-cols/rounded-xl/p-4 变体）', () => {
    for (const re of ['grid-cols', 'gap-', 'rounded-', 'border-', 'hover:', 'p-', 'text-', 'items-', 'flex ']) {
      expect(code, `/u 仍出现裸原子 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有定义；ash 族全部被页面使用', () => {
    const used = new Set([...code.matchAll(/\b(ash|adm|am)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(20);
    const defined = new Set([...globals.matchAll(/\.((?:ash|adm|am)-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    for (const cls of ['.ash-grid', '.ash-card', '.ash-avatarFallback', '.ash-counts']) {
      expect(defined, `缺少基础定义 ${cls}`).toContain(cls.slice(1));
      expect(used, `${cls} 没有被页面用到`).toContain(cls.slice(1));
    }
  });

  it('.ash- 视觉段零 hex、零新增颜色 token；var(--nexus-*) 全部在 tokens.css 声明', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(segment).not.toMatch(/--nexus-color-ash-/);
    const usedTokens = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of usedTokens) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('头像回退渐变是背景不是渐变墨字（不触发 A11Y-1 forced-colors 联动）', () => {
    expect(segment).not.toContain('background-clip');
    expect(segment).not.toContain('color: transparent');
    expect(segment).toContain('.ash-avatarFallback');
  });

  it('data 钩子守恒（广场/空态/卡片/简介/计数）', () => {
    for (const hook of ['data-authors-root', 'data-authors-empty', 'data-authors-grid', 'data-author-name', 'data-author-bio', 'data-author-counts', 'data-author-card']) {
      expect(code, `/u 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('剥 className 后全文 SHA256 钉死（合并后字节：1d270e1450ce5b600446cd006e4b55193581c1b4535e96bf33a0a277d16d521e）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '1d270e1450ce5b600446cd006e4b55193581c1b4535e96bf33a0a277d16d521e',
    );
  });
});
