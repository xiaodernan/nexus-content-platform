import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-51 `CharacterPanel.tsx` `.cp-` 门面化（§46-47 角色面板）——**静态那一寸**。
 *
 * 角色档案列表 + 选中查看/编辑 + 删除确认 + 生成肖像（真 provider 时才走）。
 * 本片只换皮；STATE_TEXT / save 流程 / 肖像生成的 task 派发——一字不动。cn 三元分支拆三 class：
 * tab（cp-tabOn/Idle）· save（cp-saveReady/Idle）· notice（cp-noticeRow/Error/Idle）。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + INPUT 共享类常量归一（多行）+ className 任意形态归一 @ + cn()整体归一 + `className=@` 归一）：
 * `9b71d077e6423ac336c56b53a201c1bc254a3c40dd699318e9267dd8c3405939` 与 HEAD 字节一致。
 *
 * 判据不变式（12 门）：
 *  1. 'use client' 保留 + studio.save/generatePortrait/delete 依赖链进门；2. 字面 className 全 `.cp-*`/复用 `.wd-*`/复用 `.gp-*`（含 cn 三元分支）；
 *  3. 零裸 Tailwind；4. 用到的每个类都在 globals.css 有基础定义；5. `.cp-` 段成规模（≥ 30 定义）；
 *  6. 零 hex；7. 字面量只出现在 micro 0.625rem 与 2px/5rem；
 *  8. 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过；9. 零新增颜色 token；
 * 10. 零 transition/@media/@keyframes；11. `.cp-growInput:focus`/`.cp-tabOn`/`.cp-saveReady`/`.cp-accentBtnSm:disabled` 定义齐全；
 * 12. SHA256 守恒 + 钩子守恒（data-character-tab/data-character-save/data-character-delete/data-character-notice）。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/studio/CharacterPanel.tsx');
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

/** `.cp-` 视觉段：`.cp-root {` 起，到下一个 §FE 段止。 */
function cpSegment(css: string): string {
  const start = findOutsideComments(css, /\.cp-root \{/);
  if (start < 0) throw new Error('globals.css 找不到 .cp- 段（.cp-root {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return m > 0 ? rest.slice(0, m) : rest;
}

const segment = cpSegment(globals);

/** redact：EOL+空白归一 + INPUT 共享类常量归一（多行声明）+ className 任意形态归一 @ + cn()整体归一 + `className=@`。 */
function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/const INPUT =\s*'[^']*';/, "const INPUT = '@';")
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
    for (const m of line.matchAll(/\.((?:cp|wd|gp|sb|sp|ch|hi)-[A-Za-z0-9-]+)(?=[,{:\s])/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-51 /studio CharacterPanel 角色面板', () => {
  it("'use client' 保留 + studio.saveCharacter/generatePortrait/deleteCharacter 进门", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('useStudioReady()');
    expect(code).toMatch(/data-character-save/);
  });

  it('数据钩子守恒：data-character-tab/save/delete/notice', () => {
    for (const hook of [
      'data-character-tab=',
      'data-character-save',
      'data-character-delete',
      'data-character-notice',
    ]) {
      expect(code, `CharacterPanel 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .cp-* / .wd-* / .gp-*（含 cn 三元分支）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(22);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `${cls} 里出现了非门面类`).toMatch(/^(?:cp|wd|gp)-[A-Za-z0-9-]+$/);
      }
    }
    const templates = [...code.matchAll(/className=\{[^}]*\}/g)].map((m) => m[0]);
    for (const tpl of templates) {
      for (const m of tpl.matchAll(/'(?:cp|wd|gp)-[A-Za-z0-9-]+'/g)) {
        for (const t of m[0].split(' ').filter(Boolean)) {
          expect(t).toMatch(/^'(?:cp|wd|gp)-[A-Za-z0-9-]+'$/);
        }
      }
    }
  });

  it('零裸 Tailwind（cp-/wd-/gp- 之外）', () => {
    for (const re of ['text-[', 'px-', 'py-', 'gap-[', 'mb-[2px]', 'w-[', 'p-3', 'p-2', 'rounded-[', 'bg-bg-', 'text-fg-', 'className="sticky', 'className="mb-1 ', 'className="mb-3 ']) {
      expect(code, `CharacterPanel 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\b(?:cp|gp)-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(25);
    const defined = classesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.cp- 视觉段成规模（≥ 25 定义）且零 @media / @keyframes / transition', () => {
    expect(segment.length).toBeGreaterThan(3000);
    expect((segment.match(/\.cp-[A-Za-z0-9-]+/g) ?? []).length).toBeGreaterThanOrEqual(30);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toContain('transition');
  });

  it('零写死 hex（CSS 视觉段不许；placeholder 文案里的 #1b1205 #f5b451 是写给用户的色板示例，不是样式）；cp-microFaint 单一 0.625rem 档', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const classLiterals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!).join(' ');
    expect(classLiterals).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    // 写给用户看的示例，原样保留（v747 双语后放在 COPY.zh 字典里，任意字面量风格都认）
    expect(code).toContain('色板：#1b1205 #f5b451（空格分隔）');
    expect(segment).toContain('font-size: 0.625rem');
  });

  it('.cp- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(10);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('零新增颜色 token；.cp-noticeError/.cp-saveReady/.cp-tabOn/.cp-accentBtnSm:disabled 定义齐全', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
    for (const sel of ['.cp-noticeError {', '.cp-saveReady {', '.cp-saveIdle {', '.cp-tabOn {', '.cp-tabIdle:hover {', '.cp-accentBtnSm:disabled {']) {
      expect(segment).toContain(sel);
    }
  });

  it('剥 className/cn/INPUT 共享常量后全文 SHA256 守恒（2026-11-16 v747「CharacterPanel 双语化」重钉：9b71d077e6423ac336c56b53a201c1bc254a3c40dd699318e9267dd8c3405939）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '9b71d077e6423ac336c56b53a201c1bc254a3c40dd699318e9267dd8c3405939',
    );
  });
});
