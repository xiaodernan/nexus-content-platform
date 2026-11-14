import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-KB 「?快速键速览」（components/KeyboardCheatsheet.tsx）面板门面判据。
 *
 * 特色是"内容是真的"——每条快捷键在组件里有一个不另编造的出处：
 * 本门在原代码文件中逐条查 keydown 分支，消失就 fail。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/components/KeyboardCheatsheet.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');
const LAYOUT = join(ROOT, 'apps/web/src/app/layout.tsx');

const main = readFileSync(MAIN, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');
const layout = readFileSync(LAYOUT, 'utf8');
const code = main.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const cssNoComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const KB_START = (() => {
  const comments = [...globals.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const global = /\.kb-fab \{/g;
  for (let m = global.exec(globals); m !== null; m = global.exec(globals)) {
    if (!comments.some(([a, b]) => m.index! >= a && m.index! < b)) return m.index!;
  }
  return -1;
})();
if (KB_START < 0) throw new Error('globals.css 里没有 .kb-fab 段');
const rest = globals.slice(KB_START);
const restNoComments = cssNoComments(rest);
const KB_END = restNoComments.search(/\/\* ─{5,}/);
const kbSegment = KB_END > 0 ? restNoComments.slice(0, KB_END) : restNoComments;

function redactClasses(source: string): string {
  return source
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@');
}

describe('§FE-KB 快捷键速览', () => {
  it('客户端组件 + 全局挂载 + 无 server-domain import', () => {
    expect(code).toContain("'use client'");
    expect(code).not.toMatch(/from '@\/server/);
    const normalizedLayout = layout.replace(/\s+/g, '');
    expect(normalizedLayout).toContain('<KeyboardCheatsheet/>');
    expect(normalizedLayout).toContain('<CommandPalette/>');
  });

  it('字面 className 只认 .kb-* 族', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(10);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `KeyboardCheatsheet 出现域外类：${tok}`).toMatch(/^kb-[A-Za-z0-9][A-Za-z0-9-]*/);
      }
    }
  });

  it('零裸 Tailwind 原子', () => {
    for (const re of ['text-11', 'text-12', 'text-13', 'bg-brand', 'rounded-full', 'fixed', 'inset-0', 'grid-cols', 'px-', 'py-', 'gap-', 'flex']) {
      expect(code, `KB 速览出现裸 atom ${re}`).not.toContain(re);
    }
  });

  it('键位守恒（data-kb-* 全量钩子 + aria 契约）', () => {
    for (const hook of ['data-kb-fab', 'data-kb-backdrop', 'data-kb-sheet', 'data-kb-groups', 'data-kb-group=', 'data-kb-key', 'data-kb-row']) {
      expect(code, `KB 速览丢了钩子 ${hook}`).toContain(hook);
    }
    expect(code).toContain('aria-modal="true"');
    expect(code).toContain('aria-label="快捷键速览"');
    expect(code).toContain("role=\"dialog\"");
    expect(code).toContain("'Escape'");
    expect(code).toContain("'?'");
    expect(code).toContain('isEditableTarget');
    expect(code).toContain('isControlTarget');
    expect(code).toContain('[data-command-palette-root]');
    expect(code).toContain("document.body.style.overflow");
  });

  it('面板列出的键来自真实代码（5 条出处逐项钉死）', () => {
    const canvas = readFileSync(join(ROOT, 'apps/web/src/studio/CanvasStage.tsx'), 'utf8');
    for (const branch of ["meta && key === 'z'", "meta && key === 'y'", "meta && key === 's'", "meta && key === 'a'", "meta && key === 'g'"]) {
      expect(canvas, `CanvasStage 缺 ${branch}`).toContain(branch);
    }
    const paletteInput = readFileSync(join(ROOT, 'apps/web/src/lib/command-palette/input.ts'), 'utf8');
    expect(paletteInput).toContain("const PALETTE_KEY = 'k'");
    const commandBar = readFileSync(join(ROOT, 'apps/web/src/studio/CommandBar.tsx'), 'utf8');
    expect(commandBar).toContain("event.key === '/'");
    const palette = readFileSync(join(ROOT, 'apps/web/src/components/CommandPalette.tsx'), 'utf8');
    expect(palette).toContain('data-command-palette-root');
    const constellation = readFileSync(join(ROOT, 'apps/web/src/components/ConstellationPanel.tsx'), 'utf8');
    expect(constellation).toContain("e.key === 'Enter' || e.key === ' '");
    // 反向：面板里出现的每个组标题都是上面给过出处的那几组
    for (const group of ["'全局'", "'Studio 画布'", "'命令面板内'", "'提示词命令条'", "'人物关系星图'", "'世界编年'"]) {
      expect(code, `KB 速览多出/缺少分组 ${group}`).toContain(group);
    }
  });

  it('.kb-* 全部在 globals.css 有定义；forced-colors 收口', () => {
    const used = new Set([...code.matchAll(/\bkb-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(12);
    const defined = new Set([...globals.matchAll(/\.(kb-[A-Za-z0-9-]+)(?=[,{:\s])/g)].map((m) => m[1]!));
    for (const cls of used) expect(defined, `globals.css 没有定义 ${cls}`).toContain(cls);
    expect(kbSegment).toContain('.kb-fab');
    expect(kbSegment).toContain('.kb-backdrop');
    expect(kbSegment).toContain('.kb-sheet');
    expect(kbSegment).toContain('.kb-key');
    const forced = globals.slice(Math.max(0, globals.indexOf('@media (forced-colors: active) {')));
    expect(forced).toContain('.kb-fab');
    expect(forced).toContain('.kb-sheet');
    expect(forced).toContain('.kb-key');
  });

  it('零写死 hex；var(--nexus-*) 全在 tokens.css 声明', () => {
    expect(kbSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const usedTokens = [...new Set([...kbSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    for (const token of usedTokens) expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
  });

  it('SHA256 钉死（本线字节）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '57a0033fe3239f22c675bfa5ce232ca4f3df9ef4f8298abd6f483a8989095ce3',
    );
  });
});
