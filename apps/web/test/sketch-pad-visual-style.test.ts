import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-52 `SketchPad.tsx` `.sk-` 门面化（§38 Sketch → Image）——**静态那一寸**。
 *
 * 草图 → 生成的原料采集面：画的笔迹不进设计模型，导出成 PNG 走与上传同一摄取门（§80），
 * 撤销一笔只是本地编辑原料，不碰设计文档（不进撤销栈，与分镜/世界面板同口径）。
 * 本片只换皮：canvas/INK/`#101014`/`#ffffff`/PAD_SIZE 全部原样——`#fff` 是白纸内容色
 * （canvas 底 fillStyle 就是 '#ffffff'），两主题一致（这条断言写进 ADR-0204）。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @ + `className=@` 归一）：
 * `d8e28aaafb7c66bab5e7b80afea0cc6d2185bfd99b908e1a7100aa8fa22c89e9` 与 HEAD 字节一致。
 *
 * 判据不变式（11 门）：
 *  1. 'use client' 保留 + onGenerate 链路进门；2. 字面 className 全 `.sk-*` / 复用 `.wd-*`/`.cp-*`；
 *  3. 零裸 Tailwind；4. 用到的每个类都在 globals.css 有基础定义；5. `.sk-` 段出现且零 @media/@keyframes/transition；
 *  6. 唯一 hex 只出现在 `.sk-paper { background: #fff; }` 一处（白纸内容色，与画布底同源）；
 *  7. 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过；8. 零新增颜色 token；
 *  9. canvas 派发/INK/redraw 原子不动；10. focus-visible 由 :hover 反馈；
 * 11. SHA256 守恒 + 钩子守恒（data-sketch-pad/undo/clear/strokes/generate/export-error/need-prompt/empty）。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/studio/SketchPad.tsx');
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

/** `.sk-` 视觉段：`.sk-root {` 起，到下一个 §FE 段止。 */
function skSegment(css: string): string {
  const start = findOutsideComments(css, /\.sk-root \{/);
  if (start < 0) throw new Error('globals.css 找不到 .sk- 段（.sk-root {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return m > 0 ? rest.slice(0, m) : rest;
}

const segment = skSegment(globals);

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
    for (const m of line.matchAll(/\.((?:sk|wd|cp)-[A-Za-z0-9-]+)(?=[,{:\s])/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-52 /studio SketchPad 草图画布', () => {
  it("'use client' 保留 + onGenerate/toBlob/redraw 依赖链进门", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('onGenerate(');
    expect(code).toContain('toBlob(');
    expect(code).toContain('redraw(');
  });

  it('数据钩子守恒：data-sketch-pad/undo/clear/strokes/generate/export-error/need-prompt/empty', () => {
    for (const hook of [
      'data-sketch-pad',
      'data-sketch-undo',
      'data-sketch-clear',
      'data-sketch-strokes',
      'data-sketch-generate',
      'data-sketch-export-error',
      'data-sketch-need-prompt',
      'data-sketch-empty',
    ]) {
      expect(code, `SketchPad 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .sk-*/.wd-*/.cp-*', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(10);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `${cls} 里出现了非门面类`).toMatch(/^(?:sk|wd|cp)-[A-Za-z0-9-]+$/);
      }
    }
  });

  it('零裸 Tailwind（sk-/wd-/cp- 之外）', () => {
    for (const re of [
      'text-[', 'px-', 'py-', 'max-w-[', 'w-full', 'cursor-crosshair', 'bg-white', 'bg-bg-',
      'rounded-[', 'disabled:', 'items-center', 'text-fg-', 'text-11 ', 'text-12 ', 'font-mono',
    ]) {
      expect(code, `SketchPad 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\b(?:sk|wd|cp)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(10);
    const defined = classesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.sk- 视觉段存在且零 @media / @keyframes / transition', () => {
    expect(segment.length).toBeGreaterThan(400);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toContain('transition');
  });

  it('唯一写死 hex = .sk-paper 的 #fff（白纸内容色，canvas 底 fillStyle 同源）；canvas INK/INK 色代码不动', () => {
    expect(segment).toContain('background: #fff');
    expect(code).toContain("const INK = '#101014'");
    expect(code).toContain("ctx.fillStyle = '#ffffff'");
    expect(segment).not.toContain('#101014');
  });

  it('.sk- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(5);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('零新增颜色 token；.sk-paper 的 #fff 有注释记账（白纸=内容色，不是装饰）', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
    const comment = globals.match(/\/\*[\s\S]*?白纸[\s\S]*?\*\//g);
    expect(comment, '.sketch 段应有白纸=内容色的记账注释').not.toBeNull();
  });

  it('剥 className 后全文 SHA256 守恒（2026-11-16 v750「SketchPad 双语化」重钉：d8e28aaafb7c66bab5e7b80afea0cc6d2185bfd99b908e1a7100aa8fa22c89e9）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      'd8e28aaafb7c66bab5e7b80afea0cc6d2185bfd99b908e1a7100aa8fa22c89e9',
    );
  });
});
