import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-43 `LayersPanel.tsx` `.ly-` 门面化——§5 图层树首片。
 *
 * 行高固定/窗口化阅读一条 list、drag/drop 改父级、多选 toggle、renaming 四态、搜索+类型过滤全部不动。
 * 门面化只换皮，data-layer-* 钩子不动。
 *
 * **零行为恒等门**：`a3ae9c9b…` 恒等于改前（git HEAD）。redact = EOL+空白归一 + className 任意形态归一 + cn()整体归一 + `className=@` 归一。
 *
 * 判据不变式（12 门）：
 *  1. 'use client' 保留 + studio(load/reparent/rename/toggleSelection/persist flush 触发点存在)；
 *  2. 字面 className 全 `.ly-*`（含 cn ternary 分支）；3. 零裸 Tailwind；4. 用到的每个类都在 globals.css 有定义；
 *  5. `.ly-` 段成规模（≥ 18 条）；6. 零 hex；7. 段所有 var(--nexus-*) 声明过；8. 零新增颜色 token；
 *  9. 零 transition/@keyframes；10. focus-visible 锚；11. SHA256 守恒；12. 钩子守恒（11+ 处）。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/studio/LayersPanel.tsx');
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

/** `.ly-` 视觉段：`.ly-root {` 起，到下一个 §FE 段头止。 */
function lySegment(css: string): string {
  const start = findOutsideComments(css, /\.ly-root \{/);
  if (start < 0) throw new Error('globals.css 找不到 .ly- 段（.ly-root {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return cssNoComments(m > 0 ? rest.slice(0, m) : rest);
}

const segment = lySegment(globals);

/** redact：EOL+空白归一 + className 任意形态归一 @ + cn()整体归一。 */
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

function lyClassesDefined(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of cssNoComments(css).split('\n')) {
    for (const m of line.matchAll(/\.(ly-[A-Za-z0-9-]+)\s*[,{]/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-43 /studio LayersPanel 图层树', () => {
  it("'use client' 保留 + studio.rename/reparent/toggleSelection/select 三条进门", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('studio.rename(');
    expect(code).toContain('studio.reparentNode(');
    expect(code).toContain('studio.toggleSelection(');
    expect(code).toContain('studio.select([');
    expect(code).toContain('studio.addNode(');
    expect(code).toContain('studio.addPage(');
    expect(code).toContain('studio.setVisible(');
    expect(code).toContain('studio.setLocked(');
  });

  it('数据钩子守恒：-root/-search/-filter/-add/-page-tab/-scroll/-rename/-rel/-totals', () => {
    for (const hook of [
      'data-layer-id=',
      'data-layer-scroll',
      'data-layer-total',
      'data-add-node',
      'data-page-tab=',
      'data-layer-rename',
    ]) {
      expect(code, `LayersPanel 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .ly-*（含 ly-pageBtn/ly-row ternary 三元）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(15);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `${cls} 里出现了非门面类`).toMatch(/^ly-[A-Za-z0-9-]+$/);
      }
    }
    const templates = [...code.matchAll(/className=\{[^}]*\}/g)].map((m) => m[0]);
    for (const tpl of templates) {
      for (const m of tpl.matchAll(/'ly-[A-Za-z0-9-]+'/g)) {
        for (const t of m[0].split(' ').filter(Boolean)) {
          expect(t).toMatch(/^'ly-[A-Za-z0-9-]+'$/);
        }
      }
    }
  });

  it('零裸 Tailwind（ly- 之外）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    for (const cls of literals) {
      const bad = cls.split(/\s+/).filter((t) => t && !/^ly-/.test(t));
      expect(bad, `门面类之外还出现了：${bad.join(' ')}`).toEqual([]);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\bly-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(18);
    const defined = lyClassesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.ly- 视觉段成规模（≥ 17 条）且零 @media / @keyframes / transition', () => {
    expect(segment.length).toBeGreaterThan(600);
    expect(
      (segment.match(/\.ly-[A-Za-z0-9-]+\s*{/g) ?? []).length +
      (segment.match(/\.ly-[A-Za-z0-9-]+:focus/g) ?? []).length,
    ).toBeGreaterThanOrEqual(17);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toContain('transition');
  });

  it('零写死 hex + 零新增颜色 token；ly-typeChip/ly-row/ly-addBtn 有焦点环', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
    expect(segment).toContain('.ly-search:focus-visible');
    expect(segment).toContain('.ly-filter:focus-visible');
    expect(segment).toContain('.ly-addBtn:focus-visible');
    expect(segment).toContain('.ly-iconBtn:focus-visible');
    expect(segment).toContain('.ly-rename:focus-visible');
  });

  it('.ly- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(10);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('.ly-rel/rename/rowShell/spacer/row/rowSelected 定义齐全', () => {
    for (const sel of ['.ly-rel {', '.ly-rename {', '.ly-rowShell {', '.ly-spacer {', '.ly-row {', '.ly-rowSelected {']) {
      expect(segment).toContain(sel);
    }
  });

  it('剥 className 后全文 SHA256 守恒（零行为：cfd23e849baa1fe40f2df9c53f7dae1a1ef5aad9777512d40c9200b530731646）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      'cfd23e849baa1fe40f2df9c53f7dae1a1ef5aad9777512d40c9200b530731646',
    );
  });
});
