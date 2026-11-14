import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-38 `AnnotationsPanel.tsx` `.np-` 门面化（§111 画布批注）——**静态那一寸**。
 *
 * 钉只钉当前选中的那一个；节点被删批注不消失（标"节点已不在文档里"）；
 * 批注随 AI 请求发模型时走服务端派生路径（见 server/ai/assemble.ts）。
 * 本片只换皮；行为/文案/data 钩子/Three（§159）——一字不动。
 *
 * **剥 className 后全文 SHA256 守恒**：与改前（git HEAD）逐字节一致（`49f6fff9…`；redact 三步序一致）。
 *
 * 判据不变式（12 门）：
 *  1. 'use client' 保留；studio.resolveAnnotation/removeAnnotation/addAnnotation 三条进门；
 *  2. 批注只钉选中一个（state.selection.length === 1）进门；3. 字面 className 全 `.np-*`/`.am-triageError`；
 *  4. 零裸 Tailwind；5. 用到的每个类都在 globals.css 有定义；6. `.np-` 段成规模（≥ 12 条）；
 *  7. 零写死 hex；8. 视觉段 var(--nexus-*) 全在 tokens.css 声明；9. 零新增颜色 token；
 * 10. 零 transition/@media；11. np-submit :disabled/focus-visible、np-input focus-visible；12. SHA256 守恒 + 钩子守恒。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/studio/AnnotationsPanel.tsx');
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

/** `.np-` 视觉段：`.np-root {` 起，到下一个 §FE 段头止。 */
function npSegment(css: string): string {
  const start = findOutsideComments(css, /\.np-root \{/);
  if (start < 0) throw new Error('globals.css 找不到 .np- 段（.np-root {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return strip(m > 0 ? rest.slice(0, m) : rest);
}

const segment = npSegment(globals);

/** redact：EOL 归一 + className 任意形态归一 @。与钉死常量一致。 */
function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

function npClassesDefined(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of strip(css).split('\n')) {
    for (const m of line.matchAll(/\.((?:np|am|ar|tl|gw|rl|adm|ch)-[A-Za-z0-9-]+)\s*[,{]/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-38 /studio AnnotationsPanel 画布批注', () => {
  it("'use client' 保留 + 三段 studio 调用进门（resolve/add/remove）", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('studio.resolveAnnotation(');
    expect(code).toContain('studio.addAnnotation(');
    expect(code).toContain('studio.removeAnnotation(');
    // 批注只钉当前选中的那一个（§111 不糊弄的边界）
    expect(code).toContain('state.selection.length === 1');
  });

  it('数据钩子守恒：-root/-toggle/-panel/-input/-submit/-error/-list/-item 派系', () => {
    for (const hook of [
      'data-annotations-root',
      'data-annotations-toggle=',
      'data-annotations-panel',
      'data-annotation-input',
      'data-annotation-submit',
      'data-annotation-error',
      'data-annotation-hint',
      'data-annotation-list',
      'data-annotation=',
      'data-annotation-resolved=',
      'data-annotation-resolve=',
      'data-annotation-remove=',
    ]) {
      expect(code, `AnnotationsPanel 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .np-*/.am-triageError（含 ternary bodyOff/bodyOn 三元）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(14);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `${cls} 里出现了非门面类`).toMatch(/^(np|am)-[A-Za-z0-9-]+$/);
      }
    }
    const templates = [...code.matchAll(/className=\{[^}]*\}/g)].map((m) => m[0]);
    for (const tpl of templates) {
      for (const m of tpl.matchAll(/'np-[A-Za-z0-9-]+'/g)) {
        for (const t of m[0].split(' ').filter(Boolean)) {
          expect(t).toMatch(/^'np-[A-Za-z0-9-]+'$/);
        }
      }
    }
  });

  it('零裸 Tailwind（np-/am- 除外）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    for (const cls of literals) {
      const bad = cls.split(/\s+/).filter((t) => t && !/^(np|am)-/.test(t));
      expect(bad, `门面类之外还出现了：${bad.join(' ')}`).toEqual([]);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\b(?:np|am)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(14);
    const defined = npClassesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.np- 视觉段成规模（≥ 12 条）且零 @media / @keyframes', () => {
    expect(segment.length).toBeGreaterThan(500);
    expect((segment.match(/\.np-[A-Za-z0-9-]+\s*{/g) ?? []).length).toBeGreaterThanOrEqual(12);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('@keyframes');
  });

  it('零写死 hex（视觉段 + 文件不许）', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.np- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(10);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('零新增颜色 token；.np-submit :disabled/.np-toggle :hover 有定义', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
    expect(segment).toContain('.np-submit:disabled');
    expect(segment).toContain('.np-toggle:hover');
  });

  it('零 transition / animation / @keyframes（零动效批注面板）', () => {
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('animation');
    expect(segment).not.toContain('@keyframes');
  });

  it('剥 className 后全文 SHA256 守恒（零行为：49f6fff9a6e5fe55fcfec76276ef99a6c9d416ec68f83ac443ead3c2decef22f）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '49f6fff9a6e5fe55fcfec76276ef99a6c9d416ec68f83ac443ead3c2decef22f',
    );
  });
});
