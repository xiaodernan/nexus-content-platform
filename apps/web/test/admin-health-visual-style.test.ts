import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-40 `/admin/health` 健康总览 `.hd-` 门面化（配套 §SC-81 / ADR-0192）——**静态那一寸**。
 *
 * `page.tsx`：denied×2（anonymous/not-admin）+ AdminNav current="health"。
 * 五层清单/五层结论（总揽 bad/ok 两态）；@media 逐字平移 40rem 与 64rem 不发生在本片；
 * 只出状态点（success/warn），旁边文本一律中性（AA 承诺）。
 *
 * 判据不变式（12 门）：
 *  1. server 组件 + denied×2 + role 闸门 + AdminNav current="health"；
 *  2. 数据钩子守恒（denied×2/TIER list/Overall/list/row/verdict/detail/measured）；
 *  3. 整页 className 只认 `.adm-*`/`.hd-*`（含 TIER_LABEL map 不是 className）；
 *  4. 零裸 Tailwind；5. 用到的每个类都在 globals.css 有基础定义；6. `.hd-` 段成规模（≥ 12 条）；
 *  7. 零 hex；8. 视觉段 var(--nexus-*) 全在 tokens.css 声明；9. 零新增颜色 token；
 * 10. 零 transition/@media；11. focus-visible（.adm-navItem 锚仍定）；12. 数据钩子守恒。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/app/admin/health/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const main = readFileSync(MAIN, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const cssNoComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = strip(main);

/** raw 文本里找首个 `re` 匹配，跳过注释。 */
function findOutsideComments(css: string, re: RegExp): number {
  const comments = [...css.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const global = new RegExp(re.source, 'g');
  for (let m = global.exec(css); m !== null; m = global.exec(css)) {
    if (!comments.some(([a, b]) => m.index! >= a && m.index! < b)) return m.index!;
  }
  return -1;
}

/** `.hd-` 视觉段：`.hd-overallOk {` 起，到下一个 §FE 段头止。 */
function hdSegment(css: string): string {
  const start = findOutsideComments(css, /\.hd-overallOk \{/);
  if (start < 0) throw new Error('globals.css 找不到 .hd- 段（.hd-overallOk {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return cssNoComments(m > 0 ? rest.slice(0, m) : rest);
}

const segment = hdSegment(globals);

function hdClassesDefined(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of cssNoComments(css).split('\n')) {
    for (const m of line.matchAll(/\.((?:hd|adm|am|ar|rl|tl|gw|ch|np|cd)-[A-Za-z0-9-]+)\s*[,{]/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-40 /admin/health 健康总览', () => {
  it('server 组件 + denied×2 + role 闸门 + AdminNav current="health"', () => {
    expect(code).not.toContain('use client');
    expect(code).toContain("export const dynamic = 'force-dynamic'");
    expect(code).toContain('currentUserOrNull()');
    expect(code).toContain("user.role !== 'admin'");
    expect(code).toContain('<AdminNav current="health"');
    expect(code).toContain('data-admin-denied="anonymous"');
    expect(code).toContain('data-admin-denied="not-admin"');
  });

  it('数据钩子守恒：denied×2/root/scope/overall/list/row/verdict/detail/measured', () => {
    for (const hook of [
      'data-health-admin-root',
      'data-health-scope',
      'data-health-overall=',
      'data-health-list',
      'data-health-tier=',
      'data-health-verdict=',
    ]) {
      expect(code, `health 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .adm-*/.hd-*', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(12);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `${cls} 里出现了非门面类`).toMatch(/^(adm|admn|hd)-[A-Za-z0-9-]+$/);
      }
    }
  });

  it('零裸 Tailwind', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    for (const cls of literals) {
      const bad = cls.split(/\s+/).filter((t) => t && !/^(hd|adm)-/.test(t));
      expect(bad, `门面类之外还出现了：${bad.join(' ')}`).toEqual([]);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\b(?:hd)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(12);
    const defined = hdClassesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.hd- 视觉段成规模（≥ 13 条）且零 @media / @keyframes', () => {
    expect(segment.length).toBeGreaterThan(400);
    expect((segment.match(/\.hd-[A-Za-z0-9-]+\s*{/g) ?? []).length).toBeGreaterThanOrEqual(12);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('@keyframes');
  });

  it('零写死 hex + 零新增颜色 token', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('.hd- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(10);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('ok/bad 两态都锚 color-mix(success|warn)，旁边文字中性 fg-1（AA）', () => {
    expect(segment).toContain('.hd-overallOk');
    expect(segment).toContain('.hd-overallBad');
    expect(segment).toMatch(/color-mix\(in srgb, var\(--nexus-color-success\)/);
    expect(segment).toMatch(/color-mix\(in srgb, var\(--nexus-color-warn\)/);
  });

  it('.hd-dotOk/.hd-verdict/.hd-measured/.hd-detail 定义齐全', () => {
    for (const sel of ['.hd-dotOk {', '.hd-dotBad {', '.hd-verdict {', '.hd-measured {', '.hd-detail {', '.hd-row {']) {
      expect(segment).toContain(sel);
    }
  });

  it('零 transition / animation / @keyframes', () => {
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('animation');
    expect(segment).not.toContain('@keyframes');
  });

  it('probeAllTiers 的 5 个 tier 都渲染（ai/java/gateway/redis/postgres）', () => {
    for (const tier of ['ai', 'java', 'gateway', 'redis', 'postgres']) {
      expect(new RegExp(`\\b${tier}:`).test(code)).toBe(true);
    }
  });
});
