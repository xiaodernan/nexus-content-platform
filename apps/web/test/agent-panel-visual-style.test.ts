import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-62 `AgentPanel.tsx` `.ag-` 门面化（§29/§112 Agent 作业 facade）——**静态那一寸**。
 *
 * 「上架前检查」这份多步作业的计划、每步的状态与结论；只读；DEMO 规划；库是权威（刷新读 `GET /api/projects/<id>/agent`）。
 * 本片只换皮；plan/agent 派发、POST acceptStep/applyStep 链路、§160 轮式披露——一字不动。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @ + cn()整体归一 + `const …TONE = @TONE;` 雕刻两组 tone Map）：
 * `2903b96cf86b79aceb0cbe9bc214d1a44e21836df1594d25b408b8f926006183`（当前与 HEAD redact 逐字节一致）。
 *
 * 判据不变式（12 门）：
 *  1. 'use client' 保留 + studio execute 进门；
 *  2. STATUS_TONE/REAL_TIME_TONE 全 facade（gate 枚举：pending/xxx/done 等 facade 命名）；
 *  3. 字面 className 全 `.ag-*`/复用族（含 cn 三元分支）；4. 零裸 Tailwind；5. 用到的每个类都在 globals.css 有基础定义；
 *  6. `.ag-` 段成规模（≥ 18 条）；7. 零 hex；8. 视觉段 var(--nexus-*) 全在 tokens.css 声明过；
 *  9. 零新增颜色 token；10. 零 transition/@media/@keyframes；11. `.ag-runBtn :disabled`/`.ag-stepDot`/`.ag-dangerCallout :focus-visible` 定义齐全；
 * 12. SHA256 守恒 + 钩子守恒（data-agent-* 系列，含 data-agent-accept-note/data-agent-goal-echo/data-agent-step）。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/studio/AgentPanel.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const main = readFileSync(MAIN, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

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

/** `.ag-` 视觉段：`.ag-accent2Ink {` 起，到下一个 §FE 段止。 */
function agSegment(css: string): string {
  const start = findOutsideComments(css, /\.ag-accent2Ink \{/);
  if (start < 0) throw new Error('globals.css 找不到 .ag- 段（.ag-accent2Ink {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return m > 0 ? rest.slice(0, m) : rest;
}

const segment = agSegment(globals);

/** redact：EOL+空白归一 + className 任意形态归一 @ + cn()整体归一 + `const …TONE = @TONE;` 雕刻两组 tone Map + `className=@`。 */
function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/const STATUS_TONE: Record<string, string> = \{[\s\S]*?\};/, 'const STATUS_TONE = @TONE;')
    .replace(/const REAL_TIME_TONE: Record<string, string> = \{[\s\S]*?\};/, 'const REAL_TIME_TONE = @TONE;')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@')
    .replace(/\bcn\([^)]*\)/gs, 'cn()')
    .replace(/\s+/g, ' ');
}

function classesDefined(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of strip(css).split('\n')) {
    for (const m of line.matchAll(/\.((?:ag|sb|wd|cp|gp|ds|hi|cb|ap|pb|vb)-[A-Za-z0-9-]+)(?=[,{:\s])/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-62 /studio AgentPanel Agent 面板', () => {
  it("'use client' 保留 + useStudioReady/csrfHeaders 进门", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('useStudioReady(');
    expect(code).toContain('csrfHeaders()');
  });

  it('STATUS_TONE/REAL_TIME_TONE 全部是 facade 类（pending/done/failed/skipped/running + idle/connecting/open/closed）', () => {
    const pairs: Array<[RegExp, RegExp]> = [
      [/pending: 'ap-faint',/, /pending: 'text-/],
      [/running: 'ag-accent2Ink',/, /running: 'text-/],
      [/done: 'hi-ink',/, /done: 'text-/],
      [/failed: 'wd-danger11',/, /failed: 'text-/],
      [/skipped: 'cp-warn11',/, /skipped: 'text-/],
      [/idle: 'ap-faint',/, /idle: 'text-/],
      [/connecting: 'cp-warn11',/, /connecting: 'text-/],
      [/closed: 'wd-danger11',/, /closed: 'text-/],
    ];
    for (const [fac, bad] of pairs) {
      expect(code, `tone 映射里仍出现 raw Tailwind：${bad}`).not.toMatch(bad);
      expect(code).toMatch(fac);
    }
  });

  it('数据钩子守恒：data-agent-*/data-agent-step-*/data-accept-step/data-agent-accept-note', () => {
    for (const hook of [
      'data-agent-panel',
      'data-agent-realtime=',
      'data-agent-planner',
      'data-agent-status',
      'data-agent-empty',
      'data-agent-goal',
      'data-agent-goal-echo',
      'data-agent-kind-echo',
      'data-agent-accept-step=',
      'data-agent-accept-note=',
      'data-agent-step=',
    ]) {
      expect(code, `AgentPanel 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .ag-*/复用族（含 cn 三元分支）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(18);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `${cls} 里出现了非门面类`).toMatch(/^(?:ag|sb|wd|cp|gp|ds|hi|cb|ap|pb|vb)-[A-Za-z0-9-]+$/);
      }
    }
    const templates = [...code.matchAll(/className=\{[^}]*\}/g)].map((m) => m[0]);
    for (const tpl of templates) {
      for (const m of tpl.matchAll(/'(?:ag|sb|wd|cp|gp|ds|hi|cb|ap|pb|vb)-[A-Za-z0-9-]+'/g)) {
        for (const t of m[0].split(' ').filter(Boolean)) {
          expect(t).toMatch(/^'(?:ag|sb|wd|cp|gp|ds|hi|cb|ap|pb|vb)-[A-Za-z0-9-]+'$/);
        }
      }
    }
  });

  it('零裸 Tailwind（ag-/复用族 之外；hex 不合法）', () => {
    for (const re of ['text-[', 'px-', 'py-', 'rounded-[', 'bg-bg-', 'text-fg-', 'items-center', 'flex items', 'hover:bg-', 'hover:text-', 'w-[', 'gap-[', 'p-[', 'm-[']) {
      expect(code, `AgentPanel 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\b(?:ag|sb|wd|cp|gp|ds|hi|cb|ap|pb|vb)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(20);
    const defined = classesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.ag- 视觉段成规模（≥ 18 条）且零 @media / @keyframes / transition', () => {
    expect(segment.length).toBeGreaterThan(1100);
    expect((segment.match(/\.ag-[A-Za-z0-9-]+/g) ?? []).length).toBeGreaterThanOrEqual(18);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toContain('transition');
  });

  it('零写死 hex；token 全声明', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(10);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('零新增颜色 token；.ag-runBtn :disabled/.ag-stepDot/.ag-dangerCallout :focus-visible 定义齐全', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
    for (const sel of ['.ag-runBtn:disabled', '.ag-stepDot {', '.ag-dangerCallout:focus-visible', '.ag-acceptBusy {']) {
      expect(segment).toContain(sel);
    }
  });

  it('剥 className/cn/两组 tone Map 后全文 SHA256 守恒（零行为：2903b96cf86b79aceb0cbe9bc214d1a44e21836df1594d25b408b8f926006183）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '2903b96cf86b79aceb0cbe9bc214d1a44e21836df1594d25b408b8f926006183',
    );
  });
});
