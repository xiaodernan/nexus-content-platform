import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-39 `CodePanel.tsx` `.cd-` 门面化（§19 Code 视图）——**静态那一寸**。
 *
 * 第二块投影：设计模型→代码（受限 JSX 解析器反向编辑回模型），一次应用 = 一个可撤销事务。
 * 解析器吃不下的片段（mappings 为 0）如实报告 issues，不回写、不假装回写成功（§159）。
 * 本片只换皮；行为/文案/data 钩子/应用三态——一字不动。
 *
 * **剥 className 后全文 SHA256 守恒**：与改前（git HEAD）逐字节一致（`70a1a8b2…`；redact 三步序一致）。
 *
 * 判据不变式（12 门）：
 *  1. 'use client' 保留；`codeToPageOps`/`studio.execute`/`generateProject` 进门；
 *  2. 字面 className 全 `.cd-*`/`.am-lede`；3. 零裸 Tailwind；4. 用到的每个类都在 globals.css 有定义；
 *  5. `.cd-` 段成规模（≥ 18 条）；6. 零写死 hex；7. 视觉段 var(--nexus-*) 全在 tokens.css 声明；
 *  8. 零新增颜色 token；9. 零 transition/@media；10. applyIdle/fileBtn 双态、editor focus-visible；
 * 11. SHA256 守恒；12. 钩子守恒（view/empty/toolbar/file-btn/copy/apply/cancel/edit/report*4/hint）。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/studio/CodePanel.tsx');
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

/** `.cd-` 视觉段：`.cd-root {` 起，到下一个 §FE 段头止。 */
function cdSegment(css: string): string {
  const start = findOutsideComments(css, /\.cd-root \{/);
  if (start < 0) throw new Error('globals.css 找不到 .cd- 段（.cd-root {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return strip(m > 0 ? rest.slice(0, m) : rest);
}

const segment = cdSegment(globals);

/** redact：EOL 归一 + className 任意形态归一 @。与钉死常量一致。 */
function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

function cdClassesDefined(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of strip(css).split('\n')) {
    for (const m of line.matchAll(/\.((?:cd|am|tl)-[A-Za-z0-9-]+)\s*[,{]/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-39 /studio CodePanel Code 视图', () => {
  it("'use client' 保留 + studio.execute/codeToPageOps/generateProject 三条进门", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('codeToPageOps(');
    expect(code).toContain('studio.execute(');
    expect(code).toContain('generateProject(');
    // 一次应用 = 一个可撤销事务（§19/150）；v737 起撤销标签随 locale（zh 原样保留）
    expect(code).toContain('studio.execute(c.undoLabel, result.ops)');
    expect(main).toContain("undoLabel: '代码编辑'");
    // 连根元素都对不上：一行都不回写、issues 如实上屏（§159）
    expect(code).toContain('!result.mappings.length');
  });

  it('数据钩子守恒：view/empty/data-code-file/+custom/editor/report 五组/hint', () => {
    for (const hook of [
      'data-code-view',
      'data-code-empty',
      'data-code-file=',
      'data-code-copy',
      'data-code-apply',
      'data-code-cancel',
      'data-code-edit',
      'data-code-editor',
      'data-code-file-path',
      'data-code-line=',
      'data-code-report',
      'data-code-report-applied',
      'data-code-report-unmapped',
      'data-code-report-issues',
      'data-code-hint',
    ]) {
      expect(code, `CodePanel 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .cd-*/.am-lede（含 ternary lineHit/lineIdle 三元）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(16);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `${cls} 里出现了非门面类`).toMatch(/^(cd|am)-[A-Za-z0-9-]+$/);
      }
    }
    const templates = [...code.matchAll(/className=\{[^}]*\}/g)].map((m) => m[0]);
    for (const tpl of templates) {
      for (const m of tpl.matchAll(/'cd-[A-Za-z0-9-]+'/g)) {
        for (const t of m[0].split(' ').filter(Boolean)) {
          expect(t).toMatch(/^'cd-[A-Za-z0-9-]+'$/);
        }
      }
    }
  });

  it('零裸 Tailwind（cd-/am- 除外）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    for (const cls of literals) {
      const bad = cls.split(/\s+/).filter((t) => t && !/^(cd|am)-/.test(t));
      expect(bad, `门面类之外还出现了：${bad.join(' ')}`).toEqual([]);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\b(?:cd|am)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(17);
    const defined = cdClassesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.cd- 视觉段成规模（≥ 20 条）且零 @media / @keyframes', () => {
    expect(segment.length).toBeGreaterThan(600);
    expect((segment.match(/\.cd-[A-Za-z0-9-]+\s*{/g) ?? []).length).toBeGreaterThanOrEqual(20);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('@keyframes');
  });

  it('零写死 hex（视觉段 + 文件不许）', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.cd- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(14);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('零新增颜色 token；.cd-apply :disabled ↔ .cd-applyIdle / fileBtnActive、disabledForbidden 三态守恒', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
    expect(segment).toContain('.cd-applyIdle {');
    expect(segment).toContain('.cd-fileBtnActive {');
    expect(segment).toContain('.cd-disabledForbidden {');
  });

  it('零 transition / animation / @keyframes（零动效编辑器）', () => {
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('animation');
    expect(segment).not.toContain('@keyframes');
  });

  it('剥 className 后全文 SHA256 守恒（2026-11-14 v737「CodePanel 双语化」重钉：90e8ce0a2848d7d06ce7457a565c3edfe58a3fc8e5bab3fe89e2156ac2413b07）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '90e8ce0a2848d7d06ce7457a565c3edfe58a3fc8e5bab3fe89e2156ac2413b07',
    );
  });
});
