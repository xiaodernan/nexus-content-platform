import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §CP-1 全站命令面板——**静态那一寸**（门面类、token、钩子、可访问性属性、挂载点）。
 *
 * 这一片不测"点下去会不会跳"（那要浏览器），它测的是**那四类会静默腐坏的东西**：
 *
 * 1. 门面类纪律：`className` 里只许出现 `cp-*`。插一个裸 Tailwind 原子类不会报错，
 *    只会在某次 token 改色时留下一个不跟随主题的死格。
 * 2. 类名必须都有定义：`cp-` 写在 JSX 里、globals.css 里却没有，页面上就是一条没有样式的裸行，
 *    而浏览器不会为此说一个字。
 * 3. `var(--nexus-*)` 必须在 tokens.css 声明过：拼错一个 token 名，颜色会静默退回继承值。
 * 4. 可访问性属性与钩子：`aria-activedescendant` 指错了不会抛错，只会让读屏念错行。
 *
 * 另外两条与全仓一致的硬红线：**零写死 hex**、**`prefers-reduced-motion` 必须有归零段**。
 */
const ROOT = process.cwd();
const COMPONENT = join(ROOT, 'apps/web/src/components/CommandPalette.tsx');
const LAYOUT = join(ROOT, 'apps/web/src/app/layout.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const component = readFileSync(COMPONENT, 'utf8');
const layout = readFileSync(LAYOUT, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const strip = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = strip(component);

/** globals.css 里 `cp-` 段的定义集合（去掉注释后再收，注释里提到的类名不算定义）。 */
function cpDefined(css: string): Set<string> {
  const out = new Set<string>();
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const line of noComments.split('\n')) {
    for (const match of line.matchAll(/\.(cp-[A-Za-z0-9-]+)\s*[,{:@]/g)) out.add(match[1]!);
  }
  return out;
}

describe('§CP-1 CommandPalette 门面类与 token', () => {
  it('client 组件（键盘/焦点/滚动锁都要浏览器）', () => {
    expect(component.slice(0, 40)).toContain("'use client'");
  });

  it('className 字面量里只出现 cp-* 门面类（零裸 Tailwind 原子类）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(10);
    for (const literal of literals) {
      for (const token of literal.split(/\s+/).filter(Boolean)) {
        expect(token, `出现了非门面类：${token}`).toMatch(/^cp-[A-Za-z0-9-]+$/);
      }
    }
  });

  it('三元表达式里的类名（不是字面量）也只认 cp-*', () => {
    // className={isActive ? 'cp-row cp-rowActive' : 'cp-row'}
    // 只收"整串都由 cp- token 组成"的单引号串，避免跨引号吃到无关代码
    const ternary = [...code.matchAll(/'((?:cp-[A-Za-z0-9-]+)(?: cp-[A-Za-z0-9-]+)*)'/g)].map((m) => m[1]!);
    expect(ternary.length).toBeGreaterThan(0);
    expect(ternary).toContain('cp-row cp-rowActive');
    for (const literal of ternary) {
      for (const token of literal.split(/\s+/).filter(Boolean)) {
        expect(token).toMatch(/^cp-[A-Za-z0-9-]+$/);
      }
    }
  });

  it('用到的每一个 cp-* 都在 globals.css 有定义（DOM id 前缀 cp-opt- 除外）', () => {
    const used = new Set(
      [...code.matchAll(/\bcp-[A-Za-z0-9][A-Za-z0-9-]*/g)]
        .map((m) => m[0])
        .filter((name) => !name.startsWith('cp-opt-'))
        .filter((name) => !name.endsWith('-')),
    );
    expect(used.size).toBeGreaterThanOrEqual(18);
    const defined = cpDefined(globals);
    for (const name of used) {
      expect(defined, `globals.css 没有定义 .${name}`).toContain(name);
    }
  });

  it('零写死 hex（组件 + cp- 段都算）', () => {
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const start = globals.indexOf('.cp-chip {');
    const end = globals.indexOf('@media (forced-colors: active)', start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    expect(globals.slice(start, end)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('cp- 段引用的每个 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const start = globals.indexOf('.cp-chip {');
    const end = globals.indexOf('@media (forced-colors: active)', start);
    const segment = globals.slice(start, end);
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(20);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('prefers-reduced-motion 有归零段；强制高对比度下高亮走 outline（不靠颜色传意）', () => {
    const start = globals.indexOf('.cp-chip {');
    const segment = globals.slice(start);
    expect(segment).toContain('@media (prefers-reduced-motion: reduce)');
    expect(segment).toMatch(/\.cp-backdrop, \.cp-panel \{ animation: none; \}/);
    expect(segment).toContain('@media (forced-colors: active)');
    expect(segment).toMatch(/\.cp-rowActive \{ outline: 2px solid Highlight/);
  });

  it('触发胶囊有可见聚焦环（键盘用户必须看得见自己停在哪）', () => {
    expect(globals).toMatch(/\.cp-chip:focus-visible \{ outline: 2px solid var\(--nexus-color-accent-2-ink\)/);
  });
});

describe('§CP-1 可访问性属性与数据钩子', () => {
  it('对话框三件：role=dialog + aria-modal + aria-label', () => {
    expect(code).toContain('role="dialog"');
    expect(code).toContain('aria-modal="true"');
    expect(code).toContain('aria-label="命令面板"');
  });

  it('combobox 模式：aria-controls / aria-autocomplete / aria-activedescendant', () => {
    expect(code).toContain('role="combobox"');
    expect(code).toContain('aria-expanded="true"');
    expect(code).toContain('aria-controls="cp-list"');
    expect(code).toContain('aria-autocomplete="list"');
    expect(code).toContain('aria-activedescendant={activeId}');
  });

  it('listbox / option / aria-selected 齐全（高亮由 activedescendant 表达）', () => {
    expect(code).toContain('role="listbox"');
    expect(code).toContain('role="option"');
    expect(code).toContain('aria-selected={isActive}');
    expect(code).toContain('role="group"');
  });

  it('activeId 只在合法下标上拼，不拼出 cp-opt-undefined', () => {
    expect(code).toContain('active >= 0 && active < ordered.length');
    expect(code).toContain('cp-opt-${ordered[active]!.item.id}');
  });

  it('数据钩子守恒（e2e / 视觉回归靠它们定位）', () => {
    for (const hook of [
      'data-command-palette-chip',
      'data-command-palette-root',
      'data-command-palette-dialog',
      'data-command-palette-input',
      'data-command-palette-empty',
      'data-command-palette-row=',
      'data-command-palette-active=',
      'data-command-palette-count',
    ]) {
      expect(code, `组件丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('键盘四件：上下 / 回车 / Esc / Tab 就地吃掉', () => {
    expect(code).toContain("event.key === 'ArrowDown'");
    expect(code).toContain("event.key === 'ArrowUp'");
    expect(code).toContain("event.key === 'Enter'");
    expect(code).toContain("event.key === 'Escape'");
    expect(code).toContain("event.key === 'Tab'");
  });

  it('焦点是要还的：开时记住 activeElement，关时还回去', () => {
    expect(code).toContain('restoreRef.current = current instanceof HTMLElement ? current : null');
    expect(code).toContain('window.requestAnimationFrame(() => target.focus())');
  });

  it('打开时锁滚动、关闭时还原成原来的值（不是硬写回空串）', () => {
    expect(code).toContain('const previous = document.body.style.overflow');
    expect(code).toContain('document.body.style.overflow = previous');
  });

  it('最近使用有界且不存查询串（查询串里可能有项目名，那是内容不是偏好）', () => {
    expect(code).toContain('const RECENT_MAX = 8');
    expect(code).toContain("const RECENT_KEY = 'nexus.palette.recent'");
    expect(code).not.toContain('setItem(QUERY_KEY');
  });
});

describe('§CP-1 挂载点', () => {
  it('挂在根 layout，且在 children 之后（浮层不该挡内容流）', () => {
    expect(layout).toContain("import { CommandPalette } from '@/components/CommandPalette'");
    expect(layout).toContain('<CommandPalette />');
    const childrenAt = layout.indexOf('{children}');
    const paletteAt = layout.indexOf('<CommandPalette />');
    const toggleAt = layout.indexOf('<ThemeToggle />');
    expect(childrenAt).toBeGreaterThan(0);
    expect(paletteAt).toBeGreaterThan(childrenAt);
    expect(toggleAt).toBeGreaterThan(paletteAt);
  });

  it('挂载点：胶囊按路由条件渲染（画布页让位给工具位，热键不受影响）', () => {
    expect(code).toContain("import { shouldShowChip } from '@/lib/command-palette/placement'");
    expect(code).toContain('shouldShowChip(pathname) ?');
    // 热键注册在 useEffect 里，与路由无关——不挂在胶囊里面，否则隐藏胶囊就等于废掉热键
    const hotkeyAt = code.indexOf('isPaletteHotkey(event)');
    const chipAt = code.indexOf('shouldShowChip(pathname) ?');
    expect(hotkeyAt).toBeGreaterThan(0);
    expect(chipAt).toBeGreaterThan(0);
    expect(hotkeyAt).toBeLessThan(chipAt);
  });

  it('两个浮层各占一角：胶囊在左下、主题在右下（不叠在一起）', () => {
    expect(globals).toMatch(/\.cp-chip \{[^}]*left: var\(--nexus-space-3\)/);
    expect(globals).toMatch(/\.cp-chip \{[^}]*bottom: var\(--nexus-space-3\)/);
    expect(globals).toMatch(/\.tt-fab \{[^}]*right: var\(--nexus-space-3\)/);
  });
});
