import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-22 `/invites/[token]` 兑现邀请落地页（§133 teamCollaboration #201-203）——**静态那一寸**。
 *
 * 入口 `page.tsx` 是纯 server 组件（未登录只渲染一句话 + 回首页链接），交互面是
 * `InviteAcceptPanel.tsx`（'use client'：busy/error/joinedProjectId 三态）。
 * 本片只换 className；文案、data 钩子（data-invite-accept-page / -accepted / -accept / -error）、
 * csrfHeaders、POST 路径、`!res.ok || !body?.ok` 拒绝路径、router 三态一字不改。
 *
 * **剥 className 后全文 SHA256 守恒**（本片最强）：两个文件均逐字节恒等于改前（git HEAD）。
 * redact 三步序与钉死常量那一次一致：page=`00703da0…`，panel=`40a82b13…`。
 *
 * 判据不变式（12 门）：
 *  1. page.tsx server 组件 + force-dynamic + currentUserOrNull + data-invite-accept-page；
 *  2. InviteAcceptPanel 保留 'use client'（唯一交互面）；
 *  3. 两个文件字面 className 全 `.iv-*`；4. 零裸 Tailwind 原子类；
 *  5. .iv-* 每个都在 globals.css 有基础定义；6. `.iv-` 视觉段 ≥ 8 条视觉类；
 *  7. 零写死 hex；8. 视觉段 var(--nexus-*) 全在 tokens.css 声明；9. 零新增颜色 token；
 * 10. 零 transition / animation / @keyframes（零动效页）+ 零 @media；
 * 11. focus-visible 覆盖 backlink/btn/successLink；.iv-btn:disabled 真禁用；
 * 12. SHA256 双文件守恒 + 数据钩子守恒。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/invites/[token]/page.tsx');
const PANEL = join(ROOT, 'apps/web/src/app/invites/[token]/InviteAcceptPanel.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const page = readFileSync(PAGE, 'utf8');
const panel = readFileSync(PANEL, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const cssNoComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const pageCode = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const panelCode = panel.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** raw 文本里找首个 `re` 匹配，跳过注释（注释里长得像门面类的 `.iv-` 不是段起点）。 */
function findOutsideComments(css: string, re: RegExp): number {
  const comments = [...css.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const global = new RegExp(re.source, 'g');
  for (let m = global.exec(css); m !== null; m = global.exec(css)) {
    if (!comments.some(([a, b]) => m.index! >= a && m.index! < b)) return m.index!;
  }
  return -1;
}

/** `.iv-` 视觉段：`.iv-page {` 起，到下一个 §FE 段头止。 */
function ivSegment(css: string): string {
  const start = findOutsideComments(css, /\.iv-page \{/);
  if (start < 0) throw new Error('globals.css 找不到 .iv- 段（.iv-page {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return cssNoComments(m > 0 ? rest.slice(0, m) : rest);
}

const segment = ivSegment(globals);

/** redact：所有 className 字面值/模板值 → @（顺序三步与钉死常量的那次一致）。 */
function redactClasses(source: string): string {
  return source
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}');
}

function ivClassesDefined(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of cssNoComments(css).split('\n')) {
    for (const m of line.matchAll(/\.(iv-[A-Za-z0-9-]+)\s*{/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-22 /invites/[token] 兑现邀请落地页', () => {
  it('page.tsx 是纯 server 组件：force-dynamic + currentUserOrNull + data-invite-accept-page', () => {
    expect(pageCode).not.toContain('use client');
    expect(pageCode).toContain("export const dynamic = 'force-dynamic'");
    expect(pageCode).toContain('currentUserOrNull()');
    expect(pageCode).toContain('data-invite-accept-page');
    expect(pageCode).toContain('<InviteAcceptPanel');
    expect(pageCode).not.toContain('fetch(');
    expect(pageCode).not.toContain('onClick=');
  });

  it('panel 保留 client 指令（三态交互面）；未登录分支只有回首页链接、没有接受按钮', () => {
    expect(panel.slice(0, 40)).toContain("'use client'");
    expect(page).not.toContain("'use client'");
    // 接受动作只能来自登录用户：true 分支挂 InviteAcceptPanel，false 分支挂 iv-backlink
    expect(pageCode).toContain('InviteAcceptPanel token={token}');
    expect(pageCode).toContain('iv-backlink');
    expect(pageCode).not.toContain('data-invite-accept"');
  });

  it('数据钩子守恒：page 1 个 + panel 3 个（accepted/accept/error）', () => {
    expect(pageCode).toContain('data-invite-accept-page');
    for (const hook of ['data-invite-accepted', 'data-invite-accept', 'data-invite-error']) {
      expect(panelCode, `panel 丢了钩子 ${hook}`).toContain(hook);
    }
  });

  it('两个文件的字面 className 只认 .iv-*', () => {
    let total = 0;
    for (const src of [pageCode, panelCode]) {
      const literals = [...src.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
      total += literals.length;
      for (const cls of literals) {
        for (const tok of cls.split(/\s+/).filter(Boolean)) {
          expect(tok, `${cls} 里出现了非门面类`).toMatch(/^iv-[A-Za-z0-9-]+$/);
        }
      }
    }
    expect(total).toBeGreaterThan(10);
  });

  it('零裸 Tailwind 原子类', () => {
    for (const src of [pageCode, panelCode]) {
      const literals = [...src.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
      for (const cls of literals) {
        expect(cls).not.toMatch(
          /\b(mt-|mb-|mx-|px-|py-|my-|text-\d|text-\[|text-fg-|text-danger-|text-warn-|bg-|flex\b|grid\b|gap-|items-|self-|rounded-\[|md:|sm:|hover:|disabled:|font-)\b/,
        );
      }
    }
  });

  it('className 用到的每个 iv-* 都在 globals.css 里有 .iv- 基础定义', () => {
    const used = new Set([...(pageCode + '\n' + panelCode).matchAll(/\biv-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThan(8);
    const defined = ivClassesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.iv- 视觉段成规模（≥ 8 条视觉类）', () => {
    expect(ivClassesDefined(globals).size).toBeGreaterThanOrEqual(8);
    expect(segment.length).toBeGreaterThan(400);
  });

  it('零写死 hex（视觉段 + 两个文件都不许）', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(pageCode).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(panelCode).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.iv- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(10);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('零新增颜色 token（视觉段内不许出现 --nexus-*: 定义）', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('零 transition / animation / @keyframes（零动效页）+ 零 @media', () => {
    expect(segment).not.toContain('transition');
    expect(segment).not.toContain('animation');
    expect(segment).not.toContain('@keyframes');
    expect(segment).not.toContain('@media');
  });

  it('focus-visible 覆盖 backlink/btn/successLink；.iv-btn:disabled 真禁用', () => {
    for (const sel of ['.iv-backlink:focus-visible', '.iv-btn:focus-visible', '.iv-successLink:focus-visible']) {
      expect(segment).toContain(sel);
    }
    expect(segment).toContain('.iv-btn:disabled');
  });

  it('剥 className 后全文 SHA256 守恒（零行为：page=00703da0… · panel=40a82b13…）', () => {
    // 常量在改前（git HEAD）由真实产物 redact 算出并钉死；此门保证除 className 外一字节未动。
    expect(createHash('sha256').update(redactClasses(page)).digest('hex')).toBe(
      '00703da0233829f0e44d428811a27cc0f4d8c53dffe3da0ceb1ceaafaa01955b',
    );
    expect(createHash('sha256').update(redactClasses(panel)).digest('hex')).toBe(
      '40a82b13a097d342f11762de5137f1108d23e9d96bdf43e7fe2e201e651b0c9f',
    );
  });
});
