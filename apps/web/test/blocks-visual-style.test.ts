import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-21 `/blocks` 账户黑名单页（§132）——**静态那一寸**（零浏览器、零真库、零时钟）。
 *
 * 入口 `page.tsx` 是纯 server 组件（`requireUser()` 守卫在前，anon 直接抛 / 重定向），
 * 解除关系按钮是唯一的交互面 `UnblockButton.tsx`（'use client'）。
 * 本片只换 className；行为、文案、data 钩子、`listBlocks` 读路径一字不改。
 *
 * **剥 className 后全文 SHA256 守恒门**（本片最强）：改前（git HEAD）与改后 redact
 * 后必须逐字节一致——`page.tsx = 05890c4b…`、`UnblockButton.tsx = 6b50e8c5…`。
 * redact 三步顺序与钉死常量那一次一致（`className="…"` → `@`，`className={\`…\`}` → `{@}`，
 * 其余 `className={…}` → `{@}`）；任何非 className 字节的改动都必须 bump 常量并随 ADR 说明。
 *
 * 判据不变式（13 门）：
 *  1. page.tsx server 组件 + force-dynamic + requireUser 守卫 + data-blocks-root；
 *  2. UnblockButton 保留 'use client'（唯一交互面）；
 *  3. 两个文件字面 className 全 `.bk-*`；4. 零裸 Tailwind 原子类（mt-/mx-/px-/py-/text-N/flex/gap-/…）；
 *  5. .bk-* 每个都在 globals.css 有基础定义；6. `.bk-` 视觉段 ≥ 10 条视觉类；
 *  7. 零写死 hex；8. 视觉段 var(--nexus-*) 全在 tokens.css 声明；9. 零新增颜色 token；
 * 10. 零 transition / animation / @keyframes（零动效页）；11. 零 @media（不引入新断点）；
 * 12. focus-visible 覆盖 backlink/handle/btn；.bk-btn:disabled 真禁用；
 * 13. SHA256 双文件守恒 + data 钩子守恒（page 7 个 + button 2 个）。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/blocks/page.tsx');
const BUTTON = join(ROOT, 'apps/web/src/app/blocks/UnblockButton.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const page = readFileSync(PAGE, 'utf8');
const button = readFileSync(BUTTON, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const cssNoComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const pageCode = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const buttonCode = button.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** raw 文本里找首个 `re` 匹配，跳过注释（注释里长得像门面类的 `.bk-` 不是段起点）。 */
function findOutsideComments(css: string, re: RegExp): number {
  const comments = [...css.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const global = new RegExp(re.source, 'g');
  for (let m = global.exec(css); m !== null; m = global.exec(css)) {
    if (!comments.some(([a, b]) => m.index! >= a && m.index! < b)) return m.index!;
  }
  return -1;
}

/** `.bk-` 视觉段：`.bk-page {` 起，到下一个 §FE 段头止。 */
function bkSegment(css: string): string {
  const start = findOutsideComments(css, /\.bk-page \{/);
  if (start < 0) throw new Error('globals.css 找不到 .bk- 段（.bk-page {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return cssNoComments(m > 0 ? rest.slice(0, m) : rest);
}

const segment = bkSegment(globals);

/** redact：所有 className 字面值/模板值 → @（顺序三步与钉死常量的那次一致）。 */
function redactClasses(source: string): string {
  return source
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}');
}

function bkClassesDefined(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of cssNoComments(css).split('\n')) {
    for (const m of line.matchAll(/\.(bk-[A-Za-z0-9-]+)\s*{/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-21 /blocks 账户黑名单页', () => {
  it('page.tsx 是纯 server 组件：force-dynamic + requireUser 守卫 + data-blocks-root', () => {
    expect(pageCode).not.toContain('use client');
    expect(pageCode).toContain("export const dynamic = 'force-dynamic'");
    expect(pageCode).toContain('requireUser()');
    expect(pageCode).toContain('data-blocks-root');
    expect(pageCode).not.toContain('fetch(');
    expect(pageCode).not.toContain('onClick=');
  });

  it('page 的数据钩子守恒（root/home/explainer/empty×2/list×2/row/row-name）', () => {
    for (const hook of [
      'data-blocks-root',
      'data-blocks-home',
      'data-blocks-explainer',
      'data-blocks-empty="block"',
      'data-blocks-empty="mute"',
      'data-blocks-list="block"',
      'data-blocks-list="mute"',
      'data-block-row=',
      'data-block-row-name',
    ]) {
      expect(pageCode, `page 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('UnblockButton 保留 client 指令（唯一交互面）+ 两个钩子守恒', () => {
    expect(button.slice(0, 40)).toContain("'use client'");
    expect(page).not.toContain("'use client'");
    expect(buttonCode).toContain('data-unblock=');
    expect(buttonCode).toContain('data-unblock-error');
  });

  it('两个文件的字面 className 只认 .bk-*', () => {
    let total = 0;
    for (const src of [pageCode, buttonCode]) {
      const literals = [...src.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
      total += literals.length;
      for (const cls of literals) {
        for (const tok of cls.split(/\s+/).filter(Boolean)) {
          expect(tok, `${cls} 里出现了非门面类`).toMatch(/^bk-[A-Za-z0-9-]+$/);
        }
      }
    }
    expect(total).toBeGreaterThan(8);
  });

  it('零裸 Tailwind 原子类', () => {
    for (const src of [pageCode, buttonCode]) {
      const literals = [...src.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
      for (const cls of literals) {
        expect(cls).not.toMatch(
          /\b(mt-|mb-|mx-|px-|py-|my-|text-\d|text-\[|text-fg-|text-danger-|text-warn-|bg-|flex\b|grid\b|gap-|items-|min-w-|truncate|rounded\b|md:|sm:|hover:|disabled:|font-)\b/,
        );
      }
    }
  });

  it('className 用到的每个 bk-* 都在 globals.css 里有 .bk- 基础定义', () => {
    const used = new Set([...(pageCode + '\n' + buttonCode).matchAll(/\bbk-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThan(8);
    const defined = bkClassesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.bk- 视觉段成规模（≥ 12 条视觉类）', () => {
    expect(bkClassesDefined(globals).size).toBeGreaterThanOrEqual(12);
    expect(segment.length).toBeGreaterThan(500);
  });

  it('零写死 hex（视觉段 + 两个文件都不许）', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(pageCode).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(buttonCode).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.bk- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(12);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('零新增颜色 token（视觉段内不许出现 --nexus-*: 定义）', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('零 transition / animation / @keyframes（零动效页）', () => {
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('animation');
    expect(segment).not.toContain('@keyframes');
  });

  it('零 @media（不引入新响应式断点，行为与基线一致）', () => {
    expect(segment).not.toContain('@media');
  });

  it('focus-visible 覆盖 backlink/handle/btn；.bk-btn:disabled 真禁用', () => {
    for (const sel of ['.bk-backlink:focus-visible', '.bk-handle:focus-visible', '.bk-btn:focus-visible']) {
      expect(segment).toContain(sel);
    }
    expect(segment).toContain('.bk-btn:disabled');
  });

  it('剥 className 后全文 SHA256 守恒（零行为：page=05890c4b… · button=6b50e8c5…）', () => {
    // 常量在改前（git HEAD）由真实产物 redact 算出并钉死；此门保证除 className 外一字节未动。
    expect(createHash('sha256').update(redactClasses(page)).digest('hex')).toBe(
      '05890c4b7cd4b64c6ea74653d62bdd8a8eb499299044a04da526afeeaa383863',
    );
    expect(createHash('sha256').update(redactClasses(button)).digest('hex')).toBe(
      '6b50e8c598a6fa2ad8cae735a7c7f46284ec71aa67107d97c430a0e012ad4a17',
    );
  });
});
