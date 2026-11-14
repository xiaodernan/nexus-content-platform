import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-About `/about-nexus` —— 外向朋友的那一页（品牌/故事/账本三明治）。
 *
 * 本页刻意公开、不连任何 domain、零数据库依赖。判据守门所有公共页这一条共性：
 *  1. RSC-only（零 'use client'）；2. 不 import 任何 server domain；
 *  3. 字面 className 只认 ab-/ash-/am-linkImplicit 门面 + BrandTitle；
 *  4. .ab-* 全部在 globals.css 有定义；零 hex；var() 全在 tokens.css；
 *  5. 正确使用 BrandTitle 组件而非手写 h1/渐变墨字；
 *  6. 无 raw Tailwind；7. SHA256 钉死；
 *  8. 钩子守恒（root/promise/how/numbers/heroKicker）；
 *  9. forced-colors 收口。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/app/about-nexus/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const main = readFileSync(MAIN, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const cssNoComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const code = main.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const AB_START = (() => {
  const comments = [...globals.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const global = /\.ab-shell \{/g;
  for (let m = global.exec(globals); m !== null; m = global.exec(globals)) {
    if (!comments.some(([a, b]) => m.index! >= a && m.index! < b)) return m.index!;
  }
  return -1;
})();
if (AB_START < 0) throw new Error('globals.css 里没有 .ab-shell 段');
const rest = globals.slice(AB_START);
const AB_END = rest.search(/\/\* ─{5,}/);
const abSegment = cssNoComments(AB_END > 0 ? rest.slice(0, AB_END) : rest);

function redactClasses(source: string): string {
  return source
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

describe('§FE-About /about-nexus 品牌页', () => {
  it('RSC-only + 零 server-dom import + BrandTitle', () => {
    expect(code).not.toContain('use client');
    expect(code).not.toMatch(/from '@\/server/);
    expect(code).toContain('BrandTitle');
    expect(code).toContain('/discover');
    expect(code).toContain('<StepTag tag=');
    expect(code).toMatch(/no="01"[\s\S]*no="02"[\s\S]*no="03"/);
    expect(code).toContain('NumberRow');
  });

  it('字面 className 只认 ab-/ash-/am-/adm- 族', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(20);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `about-nexus 出现域外类：${tok}`).toMatch(/^(ab|ash|am|adm)-[A-Za-z0-9][A-Za-z0-9-]*/);
      }
    }
  });

  it('.ab-* 可在 globals.css 找到；.ash-* 由兄弟族提供经过验证', () => {
    const used = new Set([...code.matchAll(/\b(ab|ash)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(18);
    const defined = new Set([...globals.matchAll(/\.((?:ab|ash|am)-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined, `globals.css 没有定义 ${cls}`).toContain(cls);
    expect(abSegment).toContain('.ab-shell');
    expect(abSegment).toContain('.ab-hero');
    expect(abSegment).toContain('.ab-pillar');
    expect(abSegment).toContain('.ab-step');
    expect(abSegment).toContain('.ab-numberRow');
  });

  it('零写死 hex、零新增颜色 token；var(--nexus-*) 全在 tokens.css 声明', () => {
    expect(abSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(abSegment).not.toMatch(/--nexus-color-ab-/);
    const usedTokens = [...new Set([...abSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of usedTokens) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('forced-colors 覆盖 hero + pillar + how + numbers 全部形态', () => {
    const forced = globals.slice(Math.max(0, globals.indexOf('@media (forced-colors: active) {')));
    expect(forced).toContain('.ab-hero');
    expect(forced).toContain('.ab-pillar');
    expect(forced).toContain('.ab-howRow::before');
    expect(forced).toContain('.ab-stepTag');
    expect(forced).toContain('.ab-numbersShell');
  });

  it('钩子守恒（root/promise/how/numbers）', () => {
    for (const hook of ['data-about-root', 'data-about-promise', 'data-about-how', 'data-about-numbers']) {
      expect(code, `about-nexus 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('SHA256 钉死（本线字节）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '1e5a1433d3966aee7b7bbd2282d19a207f0a75c776468218872d1c319ec21374',
    );
  });
});
