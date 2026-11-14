import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-47 `DesignSystemPanel.tsx` `.ds-` 门面化（§12/§13 设计系统面板）——**静态那一寸**。
 *
 * token 真值 → 改一处全线跟着动；走 studio.execute 所以是可撤销事务（§148）。
 * 面板上同时显示"有几个节点引用它"——删除还在引用的 token 断链太狠了，直接不让删（与旧 lint 策略对齐）。
 * 本片只换皮：token/component CRUD 路径、parseInput/resolveColor/usage="tokenUsage" 的数据链——一字不动。
 *
 * **零行为恒等门**（redact = EOL+空白归一 + className 任意形态归一 @ + cn()整体归一 + `className=@` 归一）：
 * `9fb3d0540e7b1c2b8dbdab46053fd3bea0d6c920a53c6f7e36bb3b66ce02247a` 与 HEAD 字节一致。
 *
 * 判据不变式（12 门）：
 *  1. 'use client' 保留 + studio(execute/addComponent/addToken/setToken/removeToken) 进门；
 *  2. 字面 className 全 `.ds-*`（含 cn 三元分支）；3. 零裸 Tailwind；4. 用到的每个类都在 globals.css 有基础定义；
 *  5. `.ds-` 段成规模（≥ 55 条）；6. 零 hex；7. chip/字号缺档位字面量均 ≤ 0.625rem；
 *  8. 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过；9. 零新增颜色 token；
 * 10. 零 transition/@media/@keyframes；11. `ds-iconSmReady/:focus-visible`、usage/data-token-* 钩子守恒；
 * 12. SHA256 守恒。
 */
const ROOT = process.cwd();
const MAIN = join(ROOT, 'apps/web/src/studio/DesignSystemPanel.tsx');
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

/** `.ds-` 视觉段：`.ds-root {` 起，到下一个 §FE 段头止。 */
function dsSegment(css: string): string {
  const start = findOutsideComments(css, /\.ds-root \{/);
  if (start < 0) throw new Error('globals.css 找不到 .ds- 段（.ds-root {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return m > 0 ? rest.slice(0, m) : rest;
}

const segment = dsSegment(globals);

/** redact：EOL+空白归一 + className 任意形态归一 @ + cn()整体归一 + `className=@` 归一。 */
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

function dsClassesDefined(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of strip(css).split('\n')) {
    // 基础定义或带伪类/组合器的定义（如 .ds-iconSmReady:hover）都算数
    for (const m of line.matchAll(/\.(ds-[A-Za-z0-9-]+)(?=[,{:\s])/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-47 /studio DesignSystemPanel 设计系统面板', () => {
  it("'use client' 保留 + studio.execute/addComponent/setToken 存在", () => {
    expect(main.slice(0, 40)).toContain("'use client'");
    expect(code).toContain('studio.execute(');
    expect(code).toContain("studio.execute(`删除 token ${token.key}`");
    expect(code).toContain("studio.execute(`新增 token ${key}`");
    expect(code).toContain("studio.execute(`存为组件 ${root.name}`");
  });

  it('数据钩子守恒：data-design-system-root/data-token-count/data-token-add-*/data-components-*/data-token-remove 派系', () => {
    for (const hook of [
      'data-design-system-root',
      'data-token-count',
      'data-token-add-open',
      'data-components-section',
      'data-components-empty',
      'data-component-save',
      'data-token-remove=',
    ]) {
      expect(code, `DesignSystemPanel 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('字面 className 只认 .ds-*（含 cn 三元分支）', () => {
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    expect(literals.length).toBeGreaterThanOrEqual(28);
    for (const cls of literals) {
      for (const tok of cls.split(/\s+/).filter(Boolean)) {
        expect(tok, `${cls} 里出现了非门面类`).toMatch(/^ds-[A-Za-z0-9-]+$/);
      }
    }
    const templates = [...code.matchAll(/className=\{[^}]*\}/g)].map((m) => m[0]);
    for (const tpl of templates) {
      for (const m of tpl.matchAll(/'ds-[A-Za-z0-9-]+'/g)) {
        for (const t of m[0].split(' ').filter(Boolean)) {
          expect(t).toMatch(/^'ds-[A-Za-z0-9-]+'$/);
        }
      }
    }
  });

  it('零裸 Tailwind（ds- 之外）', () => {
    for (const re of ['text-[', 'px-', 'py-', 'gap-[', 'tracking-', 'w-[', 'h-[', 'ml-auto', 'bg-bg-', 'text-fg-', 'border-[', 'rounded-[']) {
      expect(code, `DesignSystemPanel 仍出现 ${re}`).not.toContain(re);
    }
  });

  it('className 用到的每个类都在 globals.css 有基础定义', () => {
    const used = new Set([...code.matchAll(/\bds-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(40);
    const defined = dsClassesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.ds- 视觉段成规模（≥ 55 定义）且零 @media / @keyframes / transition', () => {
    expect(segment.length).toBeGreaterThan(6500);
    expect((segment.match(/\.ds-[A-Za-z0-9-]+/g) ?? []).length).toBeGreaterThanOrEqual(60);
    expect(segment).not.toContain('@media');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toContain('transition');
  });

  it('零写死 hex；ds-mono10/ds-modeInput72 仅用字面量 0.625rem；ds-iconSmReady/:focus-visible 有定义', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).toContain('#7c5cff'); // 新 token 默认色值（用户数据，不是样式）
    expect(segment).toContain('font-size: 0.625rem');
    expect(segment).toContain('.ds-iconSmReady {');
    expect(segment).toContain('.ds-iconSm:focus-visible {');
    expect(segment).toContain('.ds-iconSmIdle {');
  });

  it('.ds- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(14);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('零新增颜色 token；.ds-componentCard/.ds-rowCard/.ds-accentBtnSm 定义齐全', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
    for (const sel of ['.ds-componentCard {', '.ds-rowCard {', '.ds-accentBtnSm {', '.ds-growInput:focus {']) {
      expect(segment).toContain(sel);
    }
  });

  it('剥 className/cn 后全文 SHA256 守恒（零行为：9fb3d0540e7b1c2b8dbdab46053fd3bea0d6c920a53c6f7e36bb3b66ce02247a）', () => {
    expect(createHash('sha256').update(redactClasses(main)).digest('hex')).toBe(
      '9fb3d0540e7b1c2b8dbdab46053fd3bea0d6c920a53c6f7e36bb3b66ce02247a',
    );
  });
});
