import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-SV `/tasks/<项目>` AI 节省账单（SavingsCard）—— **并轨 v699 的门面判据**。
 *
 * 并轨产物本身是全裸 arbitrary atoms（rounded-2xl / text-gradient-brand / text-10 / …），
 * 按 §FE 判据不可带入主线：先门面化（.sv-* 族，零 hex、零 raw atom、仅设计系统 token），
 * 钩子守恒（data-savings-*），数字走 font-mono + tabular-nums，强制颜色有回退。
 *
 * 判据不变式：
 *  1. 'use client'；hooks（useCountUp/useEffect）在；savings prop 接受 SavingsSummary；
 *  2. 字面 className 只认 .sv-* 族（sv-chipMuted 也属于 sv- 命名空间）；
 *  3. 零裸 Tailwind 原子类（rounded- / text-[ / px- / py- / mt- / min-h- / font-mono 显式排除——禁裸 atom 不锁行为）；
 *  4. 用到的每个类都在 globals.css 有定义；.sv-* 新增段在 sv-* 段里；
 *  5. 零写死 hex；零新增颜色 token；var() 全在 tokens.css 声明；
 *  6. forced-colors 段有 .sv-* 收口；7. prefers-reduced-motion 保留；
 *  8. data 钩子守恒（card/tokens/share/bar/chips/chip×rate,real,demo,legacy）；
 *  9. SHA256 钉死。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/components/SavingsCard.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const main = readFileSync(MAIN, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const cssNoComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

function findOutsideComments(css: string, re: RegExp): number {
  const comments = [...css.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const global = new RegExp(re.source, 'g');
  for (let m = global.exec(css); m !== null; m = global.exec(css)) {
    if (!comments.some(([a, b]) => m.index! >= a && m.index! < b)) return m.index!;
  }
  return -1;
}

const SV_START = findOutsideComments(globals, /\.sv-root \{/);
if (SV_START < 0) throw new Error('globals.css 里没有 .sv-root 段');
const rest = globals.slice(SV_START);
const SV_END = rest.search(/\/\* ─{5,}/);
const svSegment = cssNoComments(SV_END > 0 ? rest.slice(0, SV_END) : rest);

const code = main.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function redactClasses(source: string): string {
  return source
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

describe('§FE-SV /tasks/<项目> AI 节省账单（SavingsCard）', () => {
  it('use client + SavingsSummary 入参 + 钩子配布', () => {
    expect(code).toContain("'use client'");
    expect(code).toContain('SavingsSummary');
    expect(code).toContain('useCountUp(');
    expect(code).toContain('formatRate(');
    expect(code).toContain('formatTokens(');
  });

  it('字面 className 只认 .sv-* 族（含 sv-chipMuted）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(15);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `SavingsCard 出现域外类：${tok}`).toMatch(/^sv-[A-Za-z0-9][A-Za-z0-9-]*/);
      }
    }
  });

  it('零裸 Tailwind fixture（以及零 text-gradient-brand 残留——并轨产物是经典裸件）', () => {
    for (const re of ['text-gradient-brand', 'rounded-2xl', 'rounded-full', 'tracking-[', 'text-10', 'text-11', 'text-12', 'text-13', 'px-2.5', 'min-h-6', 'mt-2', 'max-w-[', 'shadow-[0_0', 'from-[', 'to-accent-2', "items-end"]) {
      expect(code, `SavingsCard 仍出现裸原子 ${re}`).not.toContain(re);
    }
  });

  it('用到的每个类都在 globals.css 有定义', () => {
    const used = new Set([...code.matchAll(/\bsv-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(12);
    const defined = new Set([...globals.matchAll(/\.(sv-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    expect(svSegment).toContain('.sv-root {');
    for (const cls of ['.sv-tokens {', '.sv-barFill {', '.sv-chip, .sv-chipMuted']) {
      expect(svSegment, `sv 段没有定义 ${cls}`).toContain(cls);
    }
  });

  it('零写死 hex、零新增颜色 token；var(--nexus-*) 全在 tokens.css 声明', () => {
    expect(svSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(svSegment).not.toMatch(/--nexus-color-sv-/);
    const usedTokens = [...new Set([...svSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(usedTokens.length).toBeGreaterThanOrEqual(12);
    for (const token of usedTokens) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('forced-colors 段有 sv-* 收口；prefers-reduced-motion 保留 bar 过渡封印', () => {
    const forced = globals.slice(Math.max(0, globals.indexOf('@media (forced-colors: active) {')));
    expect(forced).toContain('.sv-root');
    expect(forced).toContain('.sv-tokens');
    expect(forced).toContain('.sv-barFill');
    expect(svSegment + globals.slice(Math.max(0, globals.indexOf('@media (prefers-reduced-motion: reduce) {', SV_START)))).toContain('prefers-reduced-motion');
  });

  it('data 钩子守恒（card/tokens/share/bar/chips/chip marker 全集）', () => {
    for (const hook of ['data-savings-card', 'data-savings-tokens', 'data-savings-share', 'data-savings-bar', 'data-savings-chips', 'data-savings-chip={']) {
      expect(code, `SavingsCard 丢了钩子 ${hook}`).toContain(hook);
    }
    expect(code).toMatch(/data-savings-chip=\{marker|data-savings-chip=\{/);
  });

  it('SHA256 钉死（并轨后的本线字节）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      'f13b232f75cb0dcbdb3a2359f93366d1ec0321334921332ae044b599fae5abf0',
    );
  });
});
