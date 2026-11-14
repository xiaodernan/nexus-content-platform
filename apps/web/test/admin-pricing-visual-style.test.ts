import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-PR `/admin/pricing` AI 成本 —— **§COST-1 的账本读侧**。
 *
 * 职责：把 agent_tasks.usage.costBasis 从库里抄进来让人一眼看到——多少行按表计价、
 * 多少行未配表（"unknown"，不是免费）、多少行是老账本（"legacy"，没有这一维）。
 * 页面只读不写不连 provider，价格（NEXUS_LLM_PRICES）不进本页面。
 *
 * 判据不变式：
 *  1. server 组件 + denied×2 + role 闸门 + readCostLedger/clampWindowHours 进门；
 *  2. BrandTitle + AdminNav current="pricing" + am-headRowTight 承载两件旁路（nav + 7 天链接）；
 *  3. 字面 className 只认 am/adm/tl/brand 门面族；
 *  4. 零裸 Tailwind；5. 用到的每个类都在 globals.css 有定义；
 *  6. .am-* 新增类（statGrid/statCell/statValue/statLabel）定义在 am 段；
 *  7. 零写死 hex；8. 零新增颜色 token；9. var() 全在 tokens.css；
 *  10. data 钩子守恒（root/scope/week/summary/total-rows/total-usd/cached-share/
 *      basis-heading/model-heading + basis-row/model-row）；
 *  11. SHA256 钉死。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/app/admin/pricing/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const main = readFileSync(MAIN, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const cssNoComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const code = main.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function findOutsideComments(css: string, re: RegExp): number {
  const comments = [...css.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const global = new RegExp(re.source, 'g');
  for (let m = global.exec(css); m !== null; m = global.exec(css)) {
    if (!comments.some(([a, b]) => m.index! >= a && m.index! < b)) return m.index!;
  }
  return -1;
}

const AM_START = findOutsideComments(globals, /\.am-statGrid \{/);
if (AM_START < 0) throw new Error('globals.css 里没有 .am-statGrid 段');
const rest = globals.slice(AM_START);
const AM_END = rest.search(/\/\* ── §/);
const amSegment = cssNoComments(AM_END > 0 ? rest.slice(0, AM_END) : rest);

function redactClasses(source: string): string {
  return source
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

describe('§FE-PR /admin/pricing AI 成本只读账本', () => {
  it('server 组件 + denied×2 + role 闸门 + readCostLedger / clampWindowHours 进门', () => {
    expect(code).not.toContain('use client');
    expect(code).toContain("user.role !== 'admin'");
    expect(code).toContain('readCostLedger(');
    expect(code).toContain('clampWindowHours(');
    expect(code).toContain('currentUserOrNull()');
    expect(code).toContain('data-admin-denied="anonymous"');
    expect(code).toContain('data-admin-denied="not-admin"');
    expect(code).toContain('<BrandTitle>');
    expect(code).toContain('<AdminNav current="pricing" />');
    expect(code).toContain('am-headRowTight');
  });

  it('字面 className 只用门面族（.am-*/.adm-*/.tl-*/.brand-title/.am-linkImplicit）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(24);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `pricing 出现域外类：${tok}`).toMatch(/^(am|adm|tl|brand)-/);
      }
    }
  });

  it('零裸 Tailwind', () => {
    for (const re of ['rounded-', 'border-', 'px-', 'py-', 'p-', 'text-', 'flex-', 'items-', 'rounded-xl']) {
      expect(code, `pricing 仍出现裸原子 ${re}`).not.toContain(re);
    }
  });

  it('用到的每个类都在 globals.css 有定义', () => {
    const used = new Set([...code.matchAll(/\b(am|adm|tl|brand)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(18);
    const defined = new Set([...globals.matchAll(/\.((?:am|adm|tl|brand)-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    for (const cls of ['.am-statGrid', '.am-statCell', '.am-statValue', '.am-statLabel']) {
      expect(amSegment).toContain(`${cls} {`);
    }
  });

  it('.am-* 新增类（statGrid/statCell/statValue/statLabel）全部定义在 am 段', () => {
    for (const cls of ['.am-statGrid {', '.am-statCell {', '.am-statValue {', '.am-statLabel {']) {
      expect(amSegment, `am 段没有定义 ${cls}`).toContain(cls);
    }
  });

  it('零写死 hex、零新增颜色 token；var(--nexus-*) 全在 tokens.css 声明', () => {
    expect(amSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(amSegment).not.toMatch(/--nexus-color-pr-/);
    const usedTokens = [...new Set([...amSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of usedTokens) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('data 钩子守恒', () => {
    for (const hook of ['data-pricing-root', 'data-pricing-scope', 'data-pricing-week', 'data-pricing-summary', 'data-pricing-total-rows', 'data-pricing-total-usd', 'data-pricing-cached-share', 'data-pricing-basis-heading', 'data-pricing-model-heading', 'data-pricing-basis-row=', 'data-pricing-model-row=']) {
      expect(code, `pricing 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('SHA256 钉死（合并后的当前字节）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      'a90224479eb9cfe8fde8f80a5f0f81ee3919a64f3cedffa72f7f32780e9a3025',
    );
  });
});
