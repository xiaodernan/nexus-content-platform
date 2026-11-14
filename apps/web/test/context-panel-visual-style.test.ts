import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-42 `ContextPanel.tsx` `.cx-` 门面化（§66-71 Context Engine 面板）——**静态那一寸**。
 *
 * 把"Agent 每次该知道的那些事"摊开给人看；局部算 pinned selection、服务端算 context。
 * 零行为：行为/文案/data 钩子/CSRF/deny 未动一字；只换白底低 alpha atom → `.cx-*` 门面族。
 * 原本这一面是 Studio 里唯一白底低 alpha/白字 raw Tailwind 的面板——现在与矩阵同源。
 *
 * **零行为门**：改前（git HEAD）与改后 redact 字节一致（`9a24d764…`；redact = EOL//s 归一 + cn(…)整体归一）。
 *
 * 判据不变式（13 门）：
 *  1. 'use client' 保留 + useStudioReady/ContextLoad 装载路径进门；
 *  2. 字面 className 全 `.cx-*`（含 cn ternary pill 分支）；3. 零裸 Tailwind/arbitrary value；
 *  4. 用到的每个类都在 globals.css 有基础定义；5. `.cx-` 段成规模（≥ 30 条）；
 *  6. 零 hex；7. 无 `@media`、无 `@keyframes`、transition 零处；
 *  8. 段所有 var(--nexus-*) 声明过；9. 零新增颜色 token（tinted mixes ok）；
 * 10. 三态 pill（Indexed/Partial/Unset）定义齐全 + focus-visible 锚；
 * 11. SHA256 守恒（EOL+空白+cn 归一）；12. 钩子守恒（16+ 处）；13. 原本写的「白底低 alpha」一律不准复活。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/studio/ContextPanel.tsx');
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

/** `.cx-` 视觉段：`.cx-root {` 起，到下一个 §FE 段头止。 */
function cxSegment(css: string): string {
  const start = findOutsideComments(css, /\.cx-root \{/);
  if (start < 0) throw new Error('globals.css 找不到 .cx- 段（.cx-root {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return strip(m > 0 ? rest.slice(0, m) : rest);
}

const segment = cxSegment(globals);

/** redact：EOL//s 归一 + className 任意形态归一 @ + cn() 整体 → cn()。与钉死常量一致。 */
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

function cxClassesDefined(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of strip(css).split('\n')) {
    for (const m of line.matchAll(/\.(cx-[A-Za-z0-9-]+)\s*[,{]/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-42 /studio ContextPanel Context Engine', () => {
  it("'use client' 保留：useStudioReady/useEffect/load(null) 三条装载线进门", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('useStudioReady()');
    expect(code).toContain("useEffect(() =>");
    expect(code).toContain('void load(null)');
  });

  it('数据钩子守恒：-panel/-local/-chars/-budget/-apply-budget/-trimmed/-totals/-warn/-page/-corpus系列', () => {
    for (const hook of [
      'data-context-panel',
      'data-context-reload',
      'data-context-local',
      'data-context-chars',
      'data-context-code',
      'data-context-budget',
      'data-context-apply-budget',
      'data-context-trimmed',
      'data-context-page=',
      'data-context-corpus',
      'data-context-corpus-input',
      'data-context-corpus-run',
      'data-context-corpus-summary',
      'data-context-corpus-none',
      'data-context-corpus-item=',
      'data-context-corpus-empty',
      'data-context-block-run=',
      'data-context-block',
      'data-context-block-text=',
      'data-context-block-empty',
      'data-context-block-error',
      'data-context-branch=',
      'data-context-unavailable',
    ]) {
      expect(code, `ContextPanel 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .cx-*（含 ternary pill/list 三元）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(22);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `${cls} 里出现了非门面类`).toMatch(/^cx-[A-Za-z0-9-]+$/);
      }
    }
    const templates = [...code.matchAll(/className=\{[^}]*\}/g)].map((m) => m[0]);
    for (const tpl of templates) {
      for (const m of tpl.matchAll(/'cx-[A-Za-z0-9-]+'/g)) {
        for (const t of m[0].split(' ').filter(Boolean)) {
          expect(t).toMatch(/^'cx-[A-Za-z0-9-]+'$/);
        }
      }
    }
  });

  it('零裸 Tailwind（cx- 之外）；零白底低 alpha atom（`text-white/` `bg-white/` `border-white/` `bg-black/` `red-` `emerald-` `amber-`）', () => {
    for (const re of ['text-white/', 'bg-white/', 'border-white/', 'bg-black/', 'text-red-', 'bg-red-', 'emerald-', 'amber-']) {
      expect(code, `ContextPanel 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\bcx-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(25);
    const defined = cxClassesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.cx- 视觉段成规模（≥ 40 条）且零 @media / @keyframes / transition', () => {
    expect(segment.length).toBeGreaterThan(1500);
    expect((segment.match(/\.cx-[A-Za-z0-9-]+\s*{/g) ?? []).length).toBeGreaterThanOrEqual(40);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toContain('transition');
  });

  it('三态 pill 定义齐全 + focus-visible（.cx-ghost / .cx-btn）', () => {
    expect(segment).toContain('.cx-pillIndexed {');
    expect(segment).toContain('.cx-pillPartial {');
    expect(segment).toContain('.cx-pillUnset {');
    expect(segment).toContain('.cx-ghost:focus-visible');
    expect(segment).toContain('.cx-btn:focus-visible');
    expect(segment).toContain('.cx-input:focus-visible');
  });

  it('零写死 hex + 零新增颜色 token', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('.cx- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(14);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('剥 className/cn 后（EOL+空白归一）全文 SHA256 守恒（2026-11-14 v736「ContextPanel 双语化」重钉：5652d211536f04dd731b8d045ca0dc6b62d0ff257358b2597d69b9fabaeeab91）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '5652d211536f04dd731b8d045ca0dc6b62d0ff257358b2597d69b9fabaeeab91',
    );
  });
});
