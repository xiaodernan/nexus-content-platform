import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-45 `PropertiesPanel.tsx` `.pp-` 门面化（§6 属性面板）——**静态那一寸**。
 *
 * 选中元素的属性分区（尺寸/布局/文字/填充/描边/效果/响应式四档/状态补丁）；每个字段可绑定 token。
 * 本片只换皮：换的是 className，写在脸上的文案/aria/data 钩子/onSet/write/setProps——一字不动。
 * cn ternary 拆成 base + 双态（pp-segOn / pp-segOff[:hover fg-1] / pp-segOffQuiet 无 hover），
 * 上传 label 的 busy 态拆成 pp-uploadLabel + pp-busy（cursor:wait，opacity 再淡一层）。
 * popMenu 的 shadow-panel 复位为 --nexus-shadow-md（原 utility → @theme --shadow-panel → 同 token）。
 *
 * **零行为恒等门**（redact = EOL//s 归一 + className 任意形态归一 @ + cn()整体归一 + `className=@` 归一 + `const cls = '…'` 共享类常量归一）：
 * `c58f8b89f895a09e644dca48f2d6a03822b52a4ed8743ca1eec837d6a8ca779f` 与 HEAD 一致（v756 i18n 重钉）。
 *
 * 判据不变式（13 门）：
 *  1. 'use client' 保留 + studio.write/setProps/setResponsiveValue/write/studio 依赖路径进门；
 *  2. 字面 className 全 `.pp-*`（含 cn 三元分支）；3. 零裸 Tailwind；
 *  4. 用到的每个类都在 globals.css 有基础定义；5. `.pp-` 段成规模（≥ 55 条）；
 *  6. 零 hex；7. chip/popMenu 用了 var(--nexus-shadow-md)（原 `--shadow-panel` 去糖）；
 *  8. 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过；9. 零新增颜色 token；
 * 10. 零 @media / @keyframes / transition；11. focus-visible 锚（.pp-linkDanger/.pp-swatchBtn/.pp-resizeNone 所在行）；
 * 12. SHA256 守恒；13. 钩子守恒（prop / upload / token-bind / responsive 系列 / state 系列 / breakpoint tab）。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/studio/PropertiesPanel.tsx');
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

/** `.pp-` 视觉段：`.pp-flex2 {` 起，到下一个 §FE 段头止。 */
function ppSegment(css: string): string {
  const start = findOutsideComments(css, /\.pp-flex2 \{/);
  if (start < 0) throw new Error('globals.css 找不到 .pp- 段（.pp-flex2 {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return m > 0 ? rest.slice(0, m) : rest;
}

const segment = ppSegment(globals);

/** redact：EOL+空白归一 + className 任意形态归一 @ + cn() 整体归一 + `className=@` + 共享类常量整体归一。 */
function redactClasses(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/const cls = '[^']*';/, "const cls = '@';")
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@')
    .replace(/\bcn\([^)]*\)/gs, 'cn()')
    .replace(/\s+/g, ' ');
}

function ppClassesDefined(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of strip(css).split('\n')) {
    for (const m of line.matchAll(/\.(pp-[A-Za-z0-9-]+)\s*[,{]/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-45 /studio PropertiesPanel 属性面板', () => {
  it("'use client' 保留 + studio(setProps/pasteStates/setResponsiveValue/studio) 依赖链进门", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('useStudioReady()');
    expect(code).toContain('studio.setProps(');
    expect(code).toContain('studio.pasteStates(');
    expect(code).toContain('studio.setResponsiveValue(');
    expect(code).toContain('studio.clearResponsiveChannel(');
    expect(code).toContain('studio.dropResponsiveRule(');
    expect(code).toContain('studio.copyStates(');
  });

  it('数据钩子守恒：asset-upload/state-copy/state-paste-batch/token-bind/responsive-*/breakpoint-tab/prop', () => {
    for (const hook of [
      'data-asset-upload=',
      'data-state-copy=',
      'data-state-paste',
      'data-state-paste-batch=',
      'data-token-bind',
      'data-responsive-editor',
      'data-responsive-breakpoint=',
      'data-responsive-breakpoints',
      'data-responsive-choice=',
      'data-responsive-toggle=',
      'data-responsive-size-kind=',
      'data-responsive-channel=',
      'data-responsive-clear=',
      'data-responsive-drop-rule=',
      'data-breakpoint-tab=',
      'data-breakpoint-impact=',
      'data-prop="text"',
    ]) {
      expect(code, `PropertiesPanel 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .pp-*（含 cn 三元分支）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(40);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `${cls} 里出现了非门面类`).toMatch(/^pp-[A-Za-z0-9-]+$/);
      }
    }
    const templates = [...code.matchAll(/className=\{[^}]*\}/g)].map((m) => m[0]);
    for (const tpl of templates) {
      for (const m of tpl.matchAll(/'pp-[A-Za-z0-9-]+'/g)) {
        for (const t of m[0].split(' ').filter(Boolean)) {
          expect(t).toMatch(/^'pp-[A-Za-z0-9-]+'$/);
        }
      }
    }
  });

  it('零裸 Tailwind（pp- 之外）', () => {
    for (const re of ['text-[', 'px-', 'py-', 'gap-[', 'max-h-[', 'w-[', 'h-[', 'accent-[', 'bg-bg-', 'text-fg-', 'border-[', 'tracking-[']) {
      expect(code, `PropertiesPanel 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\bpp-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(45);
    const defined = ppClassesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.pp- 视觉段成规模（≥ 60 定义）且零 @media / @keyframes / transition', () => {
    expect(segment.length).toBeGreaterThan(6000);
    expect((segment.match(/\.pp-[A-Za-z0-9-]+\s*[,{]/g) ?? []).length).toBeGreaterThanOrEqual(60);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toContain('transition');
  });

  it('零写死 hex（视觉段 CSS 不许；JS 里的色值字面量是用户色数据，原样保留）；popMenu 锚 --nexus-shadow-md', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const classLiterals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!).join(' ');
    expect(classLiterals).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(segment).toContain('var(--nexus-shadow-md)');
    expect(segment).toContain('.pp-linkDanger:focus-visible');
    expect(segment).toContain('.pp-swatchBtn:focus-visible');
  });

  it('.pp- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(20);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('零新增颜色 token；.pp-segOn/.pp-segOff/.pp-segOffQuiet 三态定义齐全（hover 只在 segOff 上；quiet 不带）', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
    expect(segment).toContain('.pp-segOn {');
    expect(segment).toContain('.pp-segOff {');
    expect(segment).toContain('.pp-segOff:hover');
    expect(segment).toContain('.pp-segOffQuiet {');
    expect(segment).toContain('.pp-segOn { background: var(--nexus-color-brand);');
  });

  it('剥 className/cn/共享类常量后全文 SHA256 守恒（零行为：c58f8b89f895a09e644dca48f2d6a03822b52a4ed8743ca1eec837d6a8ca779f）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      'c58f8b89f895a09e644dca48f2d6a03822b52a4ed8743ca1eec837d6a8ca779f',
    );
  });
});
