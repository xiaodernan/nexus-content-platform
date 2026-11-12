import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-46 `StoryboardPanel.tsx` `.sb-` 门面化（§40-42 分镜面板）——**静态那一寸**。
 *
 * Prompt → Storyboard → Shot list → Timeline 的界面入口。本片只换皮；
 * data 钩子 / drag-reorder / shot 双击分镜 / 渲染请求路径 / `sb.shots.map` 派生——一字不动。
 *
 * **零行为恒等门**（redact = EOL//s 归一 + className 任意形态归一 @ + cn()整体归一 + `className=@` 归一）：
 * `3919d8045dd014960534b03986e6b0200b056ef1765303fb4fb27289aa820082` 与 HEAD 字节一致。
 *
 * 判据不变式（12 门）：
 *  1. 'use client' 保留 + storyboardStore 依赖路径进门；2. 字面 className 全 `.sb-*`（含 cn 三元分支）；
 *  3. 零裸 Tailwind；4. 用到的每个类都在 globals.css 有基础定义；5. `.sb-` 段成规模（≥ 55 条）；
 *  6. 零 hex；7. chip 用 0.625rem 字面量（token 尺度无 10px 档——FE-37/42/44 口径）；
 *  8. 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过；9. 零新增颜色 token；
 * 10. 零 @media / @keyframes / transition；11. focus-visible 锚 .sb-resizeHandle + .sb-timeSeg；
 * 12. SHA256 守恒 + 钩子守恒（data-storyboard- / data-timeline- / shot-linked）。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/studio/StoryboardPanel.tsx');
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

/** `.sb-` 视觉段：`.sb-root {` 起，到下一个 §FE 段止。 */
function sbSegment(css: string): string {
  const start = findOutsideComments(css, /\.sb-root \{/);
  if (start < 0) throw new Error('globals.css 找不到 .sb- 段（.sb-root {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return m > 0 ? rest.slice(0, m) : rest;
}

const segment = sbSegment(globals);

/** redact：EOL+空白归一 + className 任意形态归一 @ + cn() 整体归一 + `className=@`。 */
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

function sbClassesDefined(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of strip(css).split('\n')) {
    // 基础定义或带伪类/组合器的定义都算数（如 .sb-dis40:disabled、.sb-timeSeg:last-child）
    for (const m of line.matchAll(/\.(sb-[A-Za-z0-9-]+)(?=[,{:\s])/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-46 /studio StoryboardPanel 分镜面板', () => {
  it("'use client' 保留 + storyboardStore / splitAtClick / beginReorder 依赖链进门", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('useStoryboard()');
    expect(code).toContain('splitAtClick(');
    expect(code).toContain('beginReorder(');
    expect(code).toContain('storyboardStore');
  });

  it('数据钩子守恒：data-storyboard-*/data-timeline-*/shot-linked/summary', () => {
    for (const hook of [
      'data-storyboard-summary',
      'data-storyboard-save-state',
      'data-storyboard-shot=',
      'data-storyboard-shot-linked=',
      'data-timeline-drop-target=',
    ]) {
      expect(code, `StoryboardPanel 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .sb-*（含 cn 三元分支）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(30);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `${cls} 里出现了非门面类`).toMatch(/^sb-[A-Za-z0-9-]+$/);
      }
    }
    const templates = [...code.matchAll(/className=\{[^}]*\}/g)].map((m) => m[0]);
    for (const tpl of templates) {
      for (const m of tpl.matchAll(/'sb-[A-Za-z0-9-]+'/g)) {
        for (const t of m[0].split(' ').filter(Boolean)) {
          expect(t).toMatch(/^'sb-[A-Za-z0-9-]+'$/);
        }
      }
    }
  });

  it('零裸 Tailwind（sb- 之外）', () => {
    for (const re of ['text-[', 'px-', 'py-', 'max-w-[', 'w-[', 'h-[', 'top-[', 'left-[', 'right-[', 'bottom-[', 'accent-2/', 'bg-bg-', 'text-fg-', 'border-[']) {
      expect(code, `StoryboardPanel 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\bsb-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(50);
    const defined = sbClassesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.sb- 视觉段成规模（≥ 55 定义）且零 @media / @keyframes / transition', () => {
    expect(segment.length).toBeGreaterThan(6500);
    expect((segment.match(/\.sb-[A-Za-z0-9-]+\s*[,{:]/g) ?? []).length).toBeGreaterThanOrEqual(55);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toContain('transition');
  });

  it('零写死 hex；.sb-demoChip 字面量 0.625rem；.sb-timeSeg 有 cursor:grab / :last-child', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(segment).toContain('font-size: 0.625rem');
    expect(segment).toContain('.sb-timeSeg {');
    expect(segment).toContain('.sb-timeSeg:last-child');
    expect(segment).toContain('cursor: grab');
  });

  it('.sb- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(18);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('零新增颜色 token；shot 三态（sb-shotCard/sb-shotLinked/sb-timeSeg 系列）定义齐全', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
    expect(segment).toContain('.sb-shotCard {');
    expect(segment).toContain('.sb-shotLinked {');
    expect(segment).toContain('.sb-timeSegMoving {');
    expect(segment).toContain('.sb-timeSegDropTarget {');
    expect(segment).toContain('.sb-resizeHandle:focus-visible {');
  });

  it('剥 className/cn 后全文 SHA256 守恒（零行为：3919d8045dd014960534b03986e6b0200b056ef1765303fb4fb27289aa820082）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '3919d8045dd014960534b03986e6b0200b056ef1765303fb4fb27289aa820082',
    );
  });
});
