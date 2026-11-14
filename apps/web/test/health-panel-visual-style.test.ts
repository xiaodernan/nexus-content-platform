import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-44 `HealthPanel.tsx` `.hp-` 门面化（§178 项目健康 / §180 发布门禁）——**静态那一寸**。
 *
 * HealingPanel 与发布弹层共用同一份渲染，数字由 `analyzeHealth` 算——发布门禁是同一个函数（§179）。
 * 没测行不显示绿勾：fail / not-run 两种行公开可见（§159）。
 * 本片只换皮：只换了 className，写在脸上的文案/aria/data 钩子全部不动。
 *
 * **零行为恒等门**（redact = EOL//s 归一 + className 任意形态归一 @ + cn()整体归一 + `className=@` 归一）：
 * `d3a649c245bc0ca89cbd30ca52e3c1983ce6568221fefe492739419bd69df54d` 与 HEAD 字节一致。
 *
 * 判据不变式（12 门）：
 *  1. 'use client' 保留 + analyzeHealth/studio 依赖链未动；2. 字面 className 只认 `.hp-*`（含 cn ternary 分支）；
 *  3. 零裸 Tailwind；4. 用到的每个类都在 globals.css 有基础定义；5. `.hp-` 段成规模（≥ 28 条）；
 *  6. 零 hex；7. chip 用字面量 0.625rem（token 尺度无 10px 档——FE-42/FE-37 记账口径）；
 *  8. 视觉段 var(--nexus-*) 全在 tokens.css 声明；9. 零新增颜色 token；
 * 10. 零 @media / transition / @keyframes；11. focus-visible 锚（.hp-summaryRow / .hp-railState / 按钮底载）；
 * 12. SHA256 守恒（cn() 整体 → cn()，与 HEAD 字节一致）。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/studio/HealthPanel.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const main = readFileSync(MAIN, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const cssNoComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const strip = (s: string): string => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
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

/** `.hp-` 视觉段：`.hp-root {` 起，到下一个 §FE 段头止。 */
function hpSegment(css: string): string {
  const start = findOutsideComments(css, /\.hp-root \{/);
  if (start < 0) throw new Error('globals.css 找不到 .hp- 段（.hp-root {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return cssNoComments(m > 0 ? rest.slice(0, m) : rest);
}

const segment = hpSegment(globals);

/** redact：EOL+空白归一 + className 任意形态归一 @ + cn()整体归一 + `className=@`。 */
function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@')
    .replace(/\bcn\([^)]*\)/gs, 'cn()')
    .replace(/\s+/g, ' ');
}

function hpClassesDefined(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of cssNoComments(css).split('\n')) {
    for (const m of line.matchAll(/\.(hp-[A-Za-z0-9-]+)\s*[,{]/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-44 /studio HealthPanel 项目健康面板', () => {
  it("'use client' 保留 + studio/health-client 依赖链未动", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain("from './health-client'");
    expect(code).toContain('useHealthReport(');
    expect(code).toContain('useStudioReady()');
    expect(code).toContain('useDeferredValue(');
  });

  it('数据钩子守恒：panel/source/pending/seq/compute-ms/recomputing/row/state/score/findings/toggle/rail', () => {
    for (const hook of [
      'data-health-panel',
      'data-health-source=',
      'data-health-pending=',
      'data-health-seq=',
      'data-health-compute-ms=',
      'data-health-recomputing',
      'data-health-rail',
      'data-health-rail-state=',
      'data-health-rail-pending',
      'data-health-rail-wait',
      'data-health-row=',
      'data-health-state=',
      'data-health-score=',
      'data-health-findings=',
      'data-health-findings-list=',
      'data-health-toggle=',
      'data-health-static=',
      'data-health-blockers',
      'data-health-omitted=',
      'data-health-summary',
      'data-gate-not-run',
    ]) {
      expect(code, `HealthPanel 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .hp-*（含 cn ternary 分支）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(20);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `${cls} 里出现了非门面类`).toMatch(/^hp-[A-Za-z0-9-]+$/);
      }
    }
    const templates = [...code.matchAll(/className=\{[^}]*\}/g)].map((m) => m[0]);
    for (const tpl of templates) {
      for (const m of tpl.matchAll(/'hp-[A-Za-z0-9-]+'/g)) {
        for (const t of m[0].split(' ').filter(Boolean)) {
          expect(t).toMatch(/^'hp-[A-Za-z0-9-]+'$/);
        }
      }
    }
  });

  it('零裸 Tailwind（hp- 之外）', () => {
    for (const re of ['text-fg-', 'bg-bg-', 'border-[', 'rounded-[', 'gap-[', 'px-', 'py-', 'w-[', 'min-w-', 'max-w-']) {
      expect(code, `HealthPanel 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\bhp-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(28);
    const defined = hpClassesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.hp- 视觉段成规模（≥ 28 条）且零 @media / @keyframes / transition', () => {
    expect(segment.length).toBeGreaterThan(1100);
    expect((segment.match(/\.hp-[A-Za-z0-9-]+\s*{/g) ?? []).length).toBeGreaterThanOrEqual(28);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toContain('transition');
  });

  it('零写死 hex：chip 字面量 0.625rem（token 尺度无 10px）；其余尺寸全走 var(--nexus-*)', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(segment).toContain('font-size: 0.625rem');
  });

  it('.hp- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(10);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('零新增颜色 token；focus-visible 锚 .hp-summaryRow；hp-sevError/Warn 有定义', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
    expect(segment).toContain('.hp-summaryRow:focus-visible');
    expect(segment).toContain('.hp-sevError {');
    expect(segment).toContain('.hp-sevWarn {');
    expect(segment).toContain('.hp-inkPass {');
    expect(segment).toContain('.hp-rowFail {');
  });

  it('剥 className/cn 后全文 SHA256 守恒（零行为：d3a649c245bc0ca89cbd30ca52e3c1983ce6568221fefe492739419bd69df54d）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      'd3a649c245bc0ca89cbd30ca52e3c1983ce6568221fefe492739419bd69df54d',
    );
  });
});
