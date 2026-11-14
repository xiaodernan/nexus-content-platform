import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-AS `/admin/savings` AI 节省总账 —— **v702 接手的运维视角聚合**。
 *
 * 职责：全部项目的 prompt 前缀缓存复用 SQL 聚合（前 50 行）；只对 role=admin 可见；只读。
 * 本页由并行线以裸 Tailwind 原子量（mx-auto/grid/text-*）写成，按 §FE 判据门面化为
 * `.am-*`/`.tl-*`/`.adm-*` 族（零 hex，零裸 atom）；`.sv-barTrack`/`.sv-barFill` 复用。
 *
 * 判据不变式：
 *  1. server 组件 + denied×2 + role 闸门 + readTopSavingsProjects/聚合（try/catch → data-savings-unavailable）；
 *  2. BrandTitle + AdminNav current="savings"；
 *  3. 字面 className 只认 am/adm/tl/sv 门面族；4. 零裸 Tailwind；
 *  5. 用到的每个类都在 globals.css 有定义；.am-* 新增类全在；
 *  6. am 段零写死 hex；7. 不出现 text-gradient-brand / bg-bg-1 / rounded-2xl / max-w / px- / py- / md:grid-cols 等并轨原子类；
 *  8. data 钩子守恒；9. SHA256 钉死。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/app/admin/savings/page.tsx');
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
const AM_END = rest.search(/\/\* ─{5,}/);
const amSegment = cssNoComments(AM_END > 0 ? rest.slice(0, AM_END) : rest);

function redactClasses(source: string): string {
  return source
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

describe('§FE-AS /admin/savings AI 节省总账（v702 接手）', () => {
  it('server 组件 + denied×2 + role 闸门 + readTopSavingsProjects（try/catch 保底为 null）', () => {
    expect(code).not.toContain('use client');
    expect(code).toContain("user.role !== 'admin'");
    expect(code).toContain('readTopSavingsProjects(');
    expect(code).toMatch(/catch \{[^}]*rows = null/);
    expect(code).toContain('currentUserOrNull()');
    expect(code).toContain('data-admin-denied="anonymous"');
    expect(code).toContain('data-admin-denied="not-admin"');
    expect(code).toContain('weightedHitRate(');
    expect(code).toContain('hitRate(');
    expect(code).toContain('<BrandTitle>');
    expect(code).toContain('<AdminNav current="savings" />');
  });

  it('字面 className 只认 am/adm/tl/sv 门面族', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(16);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        if (tok.startsWith('[')) continue; // style/vars
        expect(tok, `savings 出现域外类：${tok}`).toMatch(/^(am|adm|tl|sv)-[A-Za-z0-9]/);
      }
    }
  });

  it('并轨原子类不复活（mx-auto/grid/max-w/text-13/text-fg-*/px-6/py-16/md:grid-cols/text-gradient-brand）', () => {
    for (const re of ['text-gradient-brand', 'mx-auto', 'max-w-[', 'px-6', 'py-16', 'mt-2', 'text-13', 'text-11', 'text-22', 'md:grid-cols', 'rounded-[var', 'bg-bg-1', 'md:grid-cols-4', 'min-w-[']) {
      expect(code, `savings 仍出现裸原子 ${re}`).not.toContain(re);
    }
  });

  it('用到的每个类都在 globals.css 有定义；sv-barTrack/sv-barFill 在 sv 段', () => {
    const used = new Set([...code.matchAll(/\b(am|adm|tl|sv)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(16);
    const defined = new Set([...globals.matchAll(/\.((?:am|adm|tl|sv)-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    for (const cls of ['.am-statGrid', '.am-statCell', '.am-statValue', '.am-statLabel']) {
      expect(amSegment).toContain(`${cls} {`);
    }
  });

  it('am 段零写死 hex、零新增颜色 token；var(--nexus-*) 全在 tokens.css 声明', () => {
    expect(amSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(amSegment).not.toMatch(/--nexus-color-as-/);
    const usedTokens = [...new Set([...amSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of usedTokens) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('钩子守恒（root/scope/summary/total-projects/total-real/total-cached/total-weighted/table-heading/row/rate/name/unavailable/empty）', () => {
    for (const hook of ['data-savings-root', 'data-savings-scope', 'data-savings-summary', 'data-savings-total-projects', 'data-savings-total-real', 'data-savings-total-cached', 'data-savings-total-weighted', 'data-savings-table-heading', 'data-savings-row=', 'data-savings-rate=', 'data-savings-name', 'data-savings-unavailable', 'data-savings-empty']) {
      expect(code, `savings 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('SHA256 钉死（本线字节）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '1c886ac4d960933f39a9b39ae92ab4f01a6c0a90f1ff83e4e86b29eea5ce7d77',
    );
  });
});
