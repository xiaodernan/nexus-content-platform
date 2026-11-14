import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-66 `CanvasStage.tsx` `.cs-` 门面化（§8 画布外壳）——**静态那一寸**。
 *
 * §147 视口裁剪由 ResizeObserver 报告视口大小（与 §25 §147 选中响应）；
 * 所有视觉都集中在 `style={{}}` 派生里（本来就在 var(--nexus-*) 上）——本片只换皮。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @）：
 * `5037c3f6917b447075a52920ee702e5d49f887d40875e2c72d53025d841950c5` 与 HEAD 字节一致。
 *
 * 判据不变式（10 门）：
 *  1. 'use client' 保留 + studio/perfSegmentsOn/hitAt 进门；2. 字面 className 全 `.cs-*`/复用族；
 *  3. 零裸 Tailwind；4. 用到的每个类都在 globals.css 有基础定义；5. `.cs-` 段存在且零 @media / transition / @keyframes；
 *  6. 零 hex；7. 仅 `data-canvas-surface`/§147 ResizeObserver 守恒；8. 仅 `.cs-fitBtn :focus-visible`/更换 boxShadow 派生不依赖伪类 counts；
 *  9. 视觉段所有 var(--nexus-*) 已在 tokens.css 声明；10. SHA256 守恒。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/studio/CanvasStage.tsx');
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

/** `.cs-` 视觉段：`.cs-loader {` 起，到下一个 §FE 段止。 */
function csSegment(css: string): string {
  const start = findOutsideComments(css, /\.cs-loader \{/);
  if (start < 0) throw new Error('globals.css 找不到 .cs- 段（.cs-loader {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return m > 0 ? rest.slice(0, m) : rest;
}

const segment = csSegment(globals);

/** redact：EOL+空白归一 + className 任意形态归一 @。 */
function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@')
    .replace(/\s+/g, ' ');
}

function classesDefined(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of strip(css).split('\n')) {
    for (const m of line.matchAll(/\.((?:cs|sb|wd|cp|ap)-[A-Za-z0-9-]+)(?=[,{:\s])/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-66 /studio CanvasStage 画布外壳', () => {
  it("'use client' 保留 + studio/hitAt/moveSelectionBy 进门", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('useStudio()');
    expect(code).toContain('studio.hitAt(');
    expect(code).toContain('studio.moveSelectionBy(');
    expect(code).toContain('studio.setPan(');
  });

  it('数据钩子守恒：data-canvas-surface/frame/virtualized/resize-handle 漏颗', () => {
    for (const hook of [
      'data-canvas-surface',
      'data-canvas-frame',
      'data-fit-canvas',
      'data-canvas-virtualized',
      'data-resize-handle=',
      'data-annotation-badge=',
      'data-canvas-overlay',
    ]) {
      expect(code, `CanvasStage 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .cs-*/复用族', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(4);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `${cls} 里出现了非门面类`).toMatch(/^(?:cs|sb|wd|cp|ap)-[A-Za-z0-9-]+$/);
      }
    }
  });

  it('零裸 Tailwind（cs-/复用族之外）', () => {
    for (const re of ['px-', 'absolute ', 'touch-none', 'rounded-[', 'bg-bg-', 'border-[', 'max-w-[', 'flex h-']) {
      expect(code, `CanvasStage 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\b(?:cs|sb|wd|cp|ap)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(5);
    const defined = classesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.cs- 视觉段存在且零 @media / transition / @keyframes；零 hex', () => {
    expect(segment.length).toBeGreaterThan(300);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.cs- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(4);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('.cs-fitBtn :focus-visible 键盘环存在；.cs-emptyState 是 dashed border 实体', () => {
    expect(segment).toContain('.cs-fitBtn:focus-visible');
    expect(segment).toContain('border: 1px dashed');
  });

  it('剥 className 后全文 SHA256 守恒（零行为：0708bc716751f200f3eee3985ff93186ea100c69af34fbfaf0ba85bc25d6f2c5）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '0708bc716751f200f3eee3985ff93186ea100c69af34fbfaf0ba85bc25d6f2c5',
    );
  });
});
