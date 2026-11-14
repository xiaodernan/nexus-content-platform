import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-25 `/preview/[projectId]` 只读模型投影（§124 / ADR-0063）——**静态那一寸**。
 *
 * 与公开页同一渲染管线的作者视角只读投影：没有选择框、没有编辑控件；
 * 只有靠 `data-state` 兑现的 loading/error/success 三态能当场演示（hover/active/focus 不假装）。
 * 本片只换 className；鉴权（requireUser + projectVisibleTo + notFound）、断点/缩放解析、
 * paintOrder、stateStyleSheetFor、内联 style（nodeStyle/scale transform）一字不改。
 *
 * **剥 className 后全文 SHA256 守恒**：改后与改前（git HEAD）逐字节一致（`1d8e84b5…`）——
 * 内联 style 与 ViewerControls 挂载点不属于 className，redact 天然覆盖。
 *
 * 判据不变式（12 门）：
 *  1. server 组件 + force-dynamic + requireUser + projectVisibleTo + notFound 三处守卫；
 *  2. 字面 className 全 `.pv-*`（含三元模板分支 pv-stateOption/pv-stateOptionActive）；3. 零裸 Tailwind 原子类；
 *  4. .pv-* 每个都在 globals.css 有基础定义；5. `.pv-` 视觉段 ≥ 8 条视觉类；
 *  6. 零写死 hex；7. 视觉段 var(--nexus-*) 全在 tokens.css 声明；8. 零新增颜色 token；
 *  9. 零 transition / animation / @keyframes（零动效）；10. 零 @media；
 *     sticky bar + backdrop-blur 与基线逐字平移（定位/z-index/模糊半径守恒）；
 * 11. focus-visible 覆盖 back/stateOption/stateOptionActive；12. SHA256 守恒 + 数据钩子守恒。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/app/preview/[projectId]/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const src = readFileSync(MAIN, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const cssNoComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** raw 文本里找首个 `re` 匹配，跳过注释。 */
function findOutsideComments(css: string, re: RegExp): number {
  const comments = [...css.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const global = new RegExp(re.source, 'g');
  for (let m = global.exec(css); m !== null; m = global.exec(css)) {
    if (!comments.some(([a, b]) => m.index! >= a && m.index! < b)) return m.index!;
  }
  return -1;
}

/** `.pv-` 视觉段：`.pv-page {` 起，到下一个 §FE 段头止。 */
function pvSegment(css: string): string {
  const start = findOutsideComments(css, /\.pv-page \{/);
  if (start < 0) throw new Error('globals.css 找不到 .pv- 段（.pv-page {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return cssNoComments(m > 0 ? rest.slice(0, m) : rest);
}

const segment = pvSegment(globals);

/** redact：所有 className 字面值/模板值 → @（顺序三步与钉死常量的那次一致）。 */
function redactClasses(source: string): string {
  return source
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}');
}

function pvClassesDefined(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of cssNoComments(css).split('\n')) {
    for (const m of line.matchAll(/\.(pv-[A-Za-z0-9-]+)\s*{/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-25 /preview/[projectId] 只读模型投影', () => {
  it('server 组件 + force-dynamic + requireUser + projectVisibleTo + 两处 notFound + ViewerControls 挂载', () => {
    expect(code).not.toContain('use client');
    expect(code).toContain("export const dynamic = 'force-dynamic'");
    expect(code).toContain('requireUser()');
    expect(code).toContain('projectVisibleTo(');
    expect((code.match(/notFound\(\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(code).toContain('<ViewerControls');
    expect(code).not.toContain('onClick=');
  });

  it('数据钩子守恒：root/page/state-preview ×2/option ×N/note/scale-box/frame', () => {
    for (const hook of [
      'data-preview-root',
      'data-page=',
      'data-state-preview',
      'data-state-preview-option=',
      'data-state-preview-note',
      'data-preview-scale-box',
      'data-preview-frame',
    ]) {
      expect(code, `preview 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className（含三元模板）只认 .pv-*', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(6);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `${cls} 里出现了非门面类`).toMatch(/^pv-[A-Za-z0-9-]+$/);
      }
    }
    const templates = [...code.matchAll(/className=\{[^}]*\}/g)].map((m) => m[0]);
    for (const tpl of templates) {
      for (const m of tpl.matchAll(/'([^']+)'/g)) {
        for (const t of m[1]!.split(/\s+/).filter(Boolean)) {
          expect(t).toMatch(/^pv-[A-Za-z0-9-]+$/);
        }
      }
    }
  });

  it('零裸 Tailwind 原子类', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    const all = [...literals, ...[...code.matchAll(/className=\{[^}]*\}/g)].flatMap((m) => [...m[0].matchAll(/'([^']+)'/g)].map((g) => g[1]!))];
    for (const cls of all) {
      expect(cls).not.toMatch(
        /\b(mt-|mb-|mx-|px-|py-|my-|text-\d|text-\[|text-fg-|bg-|flex\b|grid\b|gap-|items-|min-h-|w-full|sticky|top-|z-|rounded-\[|border-|hover:|font-mono|overflow-)\b/,
      );
    }
  });

  it('className 用到的每个 pv-* 都在 globals.css 里有 .pv- 基础定义', () => {
    const used = new Set([...code.matchAll(/\bpv-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(6);
    const defined = pvClassesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.pv- 视觉段成规模（≥ 8 条视觉类）', () => {
    expect(pvClassesDefined(globals).size).toBeGreaterThanOrEqual(8);
    expect(segment.length).toBeGreaterThan(400);
  });

  it('零写死 hex（视觉段 + page 都不许）', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.pv- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(10);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('零新增颜色 token（视觉段内不许出现 --nexus-*: 定义）', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('零 transition / animation / @keyframes / @media；sticky bar 与 backdrop-blur 逐字平移', () => {
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('animation');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toContain('@media');
    expect(segment).toMatch(/\.pv-bar \{[^}]*position: sticky/);
    expect(segment).toMatch(/\.pv-bar \{[^}]*top: 0/);
    expect(segment).toMatch(/\.pv-bar \{[^}]*z-index: 10/);
    expect(segment).toMatch(/\.pv-bar \{[^}]*backdrop-filter: blur\(8px\)/);
  });

  it('focus-visible 覆盖 back / stateOption / stateOptionActive', () => {
    for (const sel of ['.pv-back:focus-visible', '.pv-stateOption:focus-visible', '.pv-stateOptionActive:focus-visible']) {
      expect(segment).toContain(sel);
    }
  });

  it('剥 className 后全文 SHA256 守恒（零行为：1d8e84b52ecc176f737719a222aadfd57de78ae6e1f72f8b23472b349431fde2）', () => {
    // 常量在改前（git HEAD）由真实产物 redact 算出并钉死；此门保证除 className 外一字节未动。
    expect(createHash('sha256').update(redactClasses(src)).digest('hex')).toBe(
      '1d8e84b52ecc176f737719a222aadfd57de78ae6e1f72f8b23472b349431fde2',
    );
  });
});
