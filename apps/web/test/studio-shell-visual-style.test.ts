import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-41 `StudioShell.tsx` `.se-` 门面化——Studio 外壳首片。
 *
 * 唯一的行为面是 `railOpen` / `inspectorOpen` / `inspectorFolded` 三件套（boolean 翻转），
 * 职责：画面 budgets（390 收起、xl 常驻）；只交换皮、文案/强调词/data 钩子止住。
 *
 * **零行为门**：改前（git HEAD）与改后 redact 一致（`fbe62975…`；redact = EOL 归一 +
 * `\s+`→1 + className 任意形态归一 @ + cn(…) 全体 → cn()）。整页只有 `.se-*`、无 cn-only className 分支、
 * 无 arbitrary value。StudioStore 的 load/flush 路径（flushSave×4、beforeunload flush）一字不改。
 *
 * 判据不变式（13 门）：
 *  1. 'use client' + studio.load/flushSave×4/beforeunload 进门；
 *  2. 字面 className 只认 `.se-*`（含 cn ternary se-tabActive/viewBtnActive/demoChip）；
 *  3. 零裸 Tailwind；4. 用到的每个类都在 globals.css 有定义；5. `.se-` 段成规模；
 *  6. 零 hex；7. 扣住 color-mix（se-scrim 只作遮罩、rgba(0,0,0,.4)）；
 *  8. 视觉段 var(--nexus-*) 全在 tokens.css 声明；9. 零新增颜色 token；10. transition 只走 motion-fast（若出现过）；
 *  11. 段零 @keyframes；12. SHA256 守恒（EOL+空白归一）；13. 钩子守恒（root/status/panel tab×14/view×5/zoom/inspector-controls）。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/studio/StudioShell.tsx');
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

/** `.se-` 视觉段：`.se-root {` 起，到下一个 §FE 段头止。 */
function seSegment(css: string): string {
  const start = findOutsideComments(css, /\.se-root \{/);
  if (start < 0) throw new Error('globals.css 找不到 .se- 段（.se-root {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return cssNoComments(m > 0 ? rest.slice(0, m) : rest);
}

const segment = seSegment(globals);

/** redact：EOL//s 空白归一 + className 任意形态归一 @ + cn(...) 整体 → cn()。与钉死常量一致。 */
function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/\bcn\([^)]*\)/gs, 'cn()')
    .replace(/\s+/g, ' ');
}

function seClassesDefined(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of cssNoComments(css).split('\n')) {
    for (const m of line.matchAll(/\.(se-[A-Za-z0-9-]+)\s*[,{]/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-41 /studio StudioShell Studio 外壳', () => {
  it("'use client' 保留：studio.load/flushSave×4/beforeunload 三条持久化线进门", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('studio.load(projectId)');
    expect(code).toContain('studio.flushSave()');
    expect(code).toContain('worldStore.flushSave()');
    expect(code).toContain('gameStore.flushSave()');
    expect(code).toContain('storyboardStore.flushSave()');
    expect(code).toContain("window.addEventListener('beforeunload'");
    expect(code).toContain('<Profiler');
  });

  it('数据钩子守恒：root/status/panel-tab×14/view×5/zoom/demo-mode/inspector 控制钮', () => {
    for (const hook of [
      'data-studio-root',
      'data-project-id=',
      'data-studio-status',
      'data-studio-read-only',
      'data-panel-tab=',
      'data-view=',
      'data-zoom',
      'data-demo-mode=',
      'data-view-switch',
      'data-left-panel',
      'data-right-panel',
      'data-inspector-unfold',
      'data-inspector-fold',
    ]) {
      expect(code, `StudioShell 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .se-*（含 cn ternary 分支）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(16);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `${cls} 里出现了非门面类`).toMatch(/^se-[A-Za-z0-9-]+$/);
      }
    }
    const templates = [...code.matchAll(/className=\{[^}]*\}/g)].map((m) => m[0]);
    for (const tpl of templates) {
      for (const m of tpl.matchAll(/'se-[A-Za-z0-9-]+'/g)) {
        for (const t of m[0].split(' ').filter(Boolean)) {
          expect(t).toMatch(/^'se-[A-Za-z0-9-]+'$/);
        }
      }
    }
  });

  it('零裸 Tailwind（se- 除外）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    for (const cls of literals) {
      const bad = cls.split(/\s+/).filter((t) => t && !/^se-/.test(t));
      expect(bad, `门面类之外还出现了：${bad.join(' ')}`).toEqual([]);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\bse-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(20);
    const defined = seClassesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.se- 视觉段成规模（≥ 30 条）且零 @keyframes', () => {
    expect(segment.length).toBeGreaterThan(800);
    expect((segment.match(/\.se-[A-Za-z0-9-]+\s*{/g) ?? []).length).toBeGreaterThanOrEqual(30);
    expect(segment).not.toContain('@keyframes');
  });

  it('零写死 hex（视觉段 + 文件不许；scrim 的 rgba(0,0,0,44%) 是遮單灰、与 #f/0 同阶，hex 不进段）', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.se- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(10);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('零新增颜色 token（视觉段内不许出现 --nexus-*: 定义）', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('@media 只用 64rem / 63.99rem 两档（逐字平移 lg 断点），没有出现 40/48rem', () => {
    expect(segment).toContain('@media (min-width: 64rem)');
    expect(segment).toContain('@media (max-width: 63.99rem)');
    expect(segment).not.toContain('@media (min-width: 40rem)');
    expect(segment).not.toContain('@media (min-width: 48rem)');
  });

  it(':focus-visible 覆盖 tab/viewBtn/fold/unfold，transition 只走 motion-fast（若有）', () => {
    expect(segment).toContain('.se-tab:focus-visible');
    expect(segment).toContain('.se-viewBtn:focus-visible');
    expect(segment).toContain('.se-foldBtn:focus-visible');
    expect(segment).toContain('.se-unfoldBtn:focus-visible');
    expect(segment).not.toMatch(/transition:[^;}]*\d+(ms|s)\b/);
  });

  it('剥 className/cn 后（EOL+空白归一）全文 SHA256 守恒（v757 CanvasStage 收 locale → 第十六次重钉：46a145ab1b73f49eaa478cdf4953cd3908b61280aff32fbe428af3ea0bc0d39f）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '46a145ab1b73f49eaa478cdf4953cd3908b61280aff32fbe428af3ea0bc0d39f',
    );
  });
});
