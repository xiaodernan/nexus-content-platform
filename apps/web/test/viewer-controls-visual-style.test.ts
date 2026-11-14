import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-65 `ViewerControls.tsx` `.vc-` 门面化——§14 查看器控件行——**静态那一寸**。
 *
 * 公开页与预览页同一排、同一套参数名；全是服务端渲染的 `<a>`：零 JS 也生效、可收藏、可分享，
 * 且与页面本体共用同一份 `resolveLayout`，不存在"第二条渲染路径"（§16）。
 * 本片只换皮；`liveBreakpoints`、`viewerHref`、`ZOOM_STEPS` 派生全部一字不动；`pill/active/idle` 三常量就地换 facade 命名。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @ + 三组模板字符串常量雕刻 @；HEAD 雕刻 pill 一行后 byte 一致）：
 * `f5a04b02f5ec4be8d51b4dae628f3e55b9ba552f875f2ccd44145202678ddb03` 与 HEAD 雕刻字节一致。
 *
 * 判据不变式（10 门）：
 *  1. 'use client' 保留 + viewer params 路径进门；2. 字面 className 全 `.vc-*`/复用族（含 cn 模板分支）；
 *  3. 零裸 Tailwind；4. 用到的每个类都在 globals.css 有基础定义；5. `.vc-` 段存在且零 @media / transition / @keyframes；
 *  6. `min-height` 落在 token/rc 字面量 `1.5rem`（=24px，WCAG 2.5.8 下限）；
 *  7. 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过；8. 零新增颜色 token；
 *  9. WCAG 2.5.8 min-height 守恒（`.vc-pill` 含 line `min-height: 1.5rem`）；10. SHA256 守恒 + 钩子守恒（data-viewer-*）。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/studio/ViewerControls.tsx');
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

/** `.vc-` 视觉段：`.vc-row {` 起，到下一个 §FE 段止。 */
function vcSegment(css: string): string {
  const start = findOutsideComments(css, /\.vc-row \{/);
  if (start < 0) throw new Error('globals.css 找不到 .vc- 段（.vc-row {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return m > 0 ? rest.slice(0, m) : rest;
}

const segment = vcSegment(globals);

/** redact：EOL+空白归一 + pill/active/idle 三组常量雕刻 @ + className 任意形态归一 @ + cn()整体归一 + `className=@`。 */
function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/const pill = '[^']*';/, 'const pill = @;')
    .replace(/const active = `[^`]*`;/, 'const active = @;')
    .replace(/const idle = `[^`]*`;/, 'const idle = @;')
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
    for (const m of line.matchAll(/\.((?:vc|sb|wd|cp|ap)-[A-Za-z0-9-]+)(?=[,{:\s])/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-65 /studio ViewerControls 查看器控件行', () => {
  it('server 组件（无 use client）+ liveBreakpoints/viewerHref 进门（§14 ADR-0069：所有控件是服务端渲染 <a>）', () => {
    expect(main.slice(0, 40)).not.toContain("'use client'");
    expect(code).toContain('liveBreakpoints(');
    expect(code).toContain('viewerHref(');
  });

  it('数据钩子守恒：data-viewer-controls/design-width/resolved-width/zoom-option/viewport-option/zoom/auto', () => {
    for (const hook of [
      'data-viewer-controls',
      'data-viewer-design-width=',
      'data-viewer-resolved-width=',
      'data-viewer-resolved-height=',
      'data-viewer-breakpoint=',
      'data-viewer-zoom=',
      'data-viewer-auto=',
      'data-viewer-reading',
      'data-viewer-zoom-options',
      'data-viewer-zoom-option=',
      'data-viewer-viewport-options',
      'data-viewer-viewport-option=',
      'data-viewer-live-breakpoints=',
    ]) {
      expect(code, `ViewerControls 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .vc-*/复用族', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(4);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `${cls} 里出现了非门面类`).toMatch(/^(?:vc|sb|wd|cp|ap)-[A-Za-z0-9-]+$/);
      }
    }
    const templates = [...code.matchAll(/className=\{[^}]*\}/g)].map((m) => m[0]);
    for (const tpl of templates) {
      for (const m of tpl.matchAll(/'(?:vc|sb|wd|cp|ap)-[A-Za-z0-9-]+'/g)) {
        for (const t of m[0].split(' ').filter(Boolean)) {
          expect(t).toMatch(/^'(?:vc|sb|wd|cp|ap)-[A-Za-z0-9-]+'$/);
        }
      }
    }
  });

  it('零裸 Tailwind（vc-/复用族之外）', () => {
    for (const re of ['px-', 'py-', 'items-center', 'flex items', 'text-[', 'rounded-[', 'min-h-[', 'pt-[', 'bg-bg-', 'text-fg-', 'hover:bg-']) {
      expect(code, `ViewerControls 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\b(?:vc|sb|wd|cp|ap)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(6);
    const defined = classesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.vc- 视觉段存在且零 @media / transition / @keyframes；零 hex', () => {
    expect(segment.length).toBeGreaterThan(380);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.vc- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(5);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('WCAG 2.5.8：.vc-pill 的 min-height 是字面量 1.5rem（24px）；.vc-pillIdle:hover 有定义；.vc-pillOn 有定义', () => {
    expect(segment).toContain('min-height: 1.5rem');
    expect(segment).toContain('.vc-pillIdle:hover');
    expect(segment).toContain('.vc-pillOn {');
  });

  it('剥 className/pill 雕刻后 SHA256 守恒（零行为：f5a04b02f5ec4be8d51b4dae628f3e55b9ba552f875f2ccd44145202678ddb03）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      'f5a04b02f5ec4be8d51b4dae628f3e55b9ba552f875f2ccd44145202678ddb03',
    );
  });
});
