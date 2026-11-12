import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-26 `/admin` 入口总览 + `AdminNav` 磨砂胶囊导航——**静态那一寸**（零浏览器、零真库、零时钟）。
 *
 * 两份文件平移：
 *  - `app/admin/page.tsx`：denied×2（anonymous/not-admin）+ 十卡矩阵（`data-admin-home-card` 全集 10 个，
 *    一卡一句「这一格是干嘛的」，**不读库、不发请求、不填占位百分比**）；
 *  - `components/AdminNav.tsx`：管理台导航名单一份（11 入口）+ WCAG 2.5.8 的 28px 下限一处。
 * 本片只换皮（arbitrary atom → `.adm-*`）；文案、AREAS 常量、LINKS、aria-current、
 * data 钩子、鉴权对照（`user.role !== 'admin'`）一字不改。
 *
 * **零行为门（两条，pipeline 一致）**：redact = `className="…"`→`"@"`、`className={\`…\`}`→`{@}`、
 * 其余 `className={…}`→`{@}`、`"@"|{@}`→`className=@`、注释→占位。
 *  - page.tsx：`2731ed49…` 恒等于 HEAD 改前原样；
 *  - AdminNav.tsx：`a1c6b390…` 恒等于「HEAD 原样删除那段未再使用的 `ITEM` 模板常量」之后的值——
 *    全片唯一删除是 `ITEM`（其语义全部并入 `.adm-navItem`/`.adm-navItemActive`）。
 *
 * 判据不变式（13 门）：
 *  1. denied×2 分支 + `role !== 'admin'` 闸门 + 未登录 `currentUserOrNull` 判据；
 *  2. AdminNav：`LINKS` 11 入口 + `aria-current="page"` + `data-admin-link` 全集恒等于 LINKS 键集；
 *  3. 字面 className 全 `.adm-*`；4. 零裸 Tailwind 原子类；
 *  5. .adm-* 每个都在 globals.css 有基础定义；6. `.adm-` 段 ≥ 18 条视觉类；
 *  7. 零写死 hex；8. 视觉段 var(--nexus-*) 全在 tokens.css 声明；9. 零新增颜色 token；
 * 10. transition 时长一律 `var(--nexus-motion-fast)`（reduced-motion 由 tokens.css 归零）；
 *     两条 @media（40rem/64rem）逐字平移；backdrop-filter blur(12px) 守恒；
 * 11. focus-visible 覆盖 card/navItem；`.adm-navItemActive` 有渐变实底 + accent-fg 墨字；
 * 12. 双文件 SHA256 双门（含 ITEM 常量精确雕刻断言）；
 * 13. 数据钩子守恒（page：denied×2/home-root/kicker/cards/home-card×10；nav：nav/link×11/dot×11/current）。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/admin/page.tsx');
const NAV = join(ROOT, 'apps/web/src/components/AdminNav.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const page = readFileSync(PAGE, 'utf8');
const nav = readFileSync(NAV, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

const cssNoComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const pageCode = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const navCode = nav.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** raw 文本里找首个 `re` 匹配，跳过注释。 */
function findOutsideComments(css: string, re: RegExp): number {
  const comments = [...css.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const global = new RegExp(re.source, 'g');
  for (let m = global.exec(css); m !== null; m = global.exec(css)) {
    if (!comments.some(([a, b]) => m.index! >= a && m.index! < b)) return m.index!;
  }
  return -1;
}

/** `.adm-` 视觉段：`.adm-denied {` 起，到下一个 §FE 段头止。 */
function admSegment(css: string): string {
  const start = findOutsideComments(css, /\.adm-denied \{/);
  if (start < 0) throw new Error('globals.css 找不到 .adm- 段（.adm-denied {）');
  const rest = css.slice(start);
  const m = rest.search(/\/\* ── §/);
  return cssNoComments(m > 0 ? rest.slice(0, m) : rest);
}

const segment = admSegment(globals);

/** redact：className 任意形态归一 @；注释占位；与钉死常量那次完全一致。 */
function redactClasses(source: string): string {
  return source
    .replace(/className="[^"]*"/g, 'className="@"')
    .replace(/className=\{`[^`]*`\}/g, 'className={@}')
    .replace(/className=\{[^}]*\}/g, 'className={@}')
    .replace(/className=("@"|\{@\})/g, 'className=@')
    .replace(/\/\*[\s\S]*?\*\//g, '/*c*/')
    .replace(/^\s*\/\/.*$/gm, '//c');
}

/** HEAD 原样删除 §A11Y-3 遗留的 `ITEM` 模板常量（本片唯一删除，见 ADR-0178）。 */
const HEAD_ITEM_BLOCK = `/** \`min-h-7\` = 28px：比 WCAG 2.5.8 的 24px 下限更积极的一条；rounded-full 胶囊；聚焦环永远可见 */
const ITEM =
  'inline-flex min-h-7 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-11 ' +
  'transition-colors duration-[var(--nexus-motion-fast)] outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-[var(--nexus-color-accent-2-ink)]';

`;
const navHead = execSync('git show HEAD:apps/web/src/components/AdminNav.tsx').toString('utf8');
const navCarved = navHead.replace(HEAD_ITEM_BLOCK, '');

function admClassesDefined(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of cssNoComments(css).split('\n')) {
    for (const m of line.matchAll(/\.(adm-[A-Za-z0-9-]+)\s*{/g)) out.add(m[1]!);
  }
  return out;
}

describe('§FE-26 /admin 入口总览 + AdminNav', () => {
  it('denied×2 分支恒在 + role !== admin 闸门 + currentUserOrNull', () => {
    expect(pageCode).toContain('data-admin-denied="anonymous"');
    expect(pageCode).toContain('data-admin-denied="not-admin"');
    expect(pageCode).toContain("user.role !== 'admin'");
    expect(pageCode).toContain('currentUserOrNull()');
    expect(pageCode).not.toContain('fetch(');
    expect(pageCode).not.toContain('use client');
  });

  it('AdminNav：LINKS 11 入口 · aria-current="page" · data-admin-link 全集恒等于 LINKS 键集', () => {
    expect(navCode).toContain('aria-current="page"');
    expect(navCode).toContain('aria-label="管理台"');
    expect(navCode).toContain('data-admin-nav');
    const keys = [...navCode.matchAll(/\{ key: '([a-z-]+)', href: '\/admin/g)].map((m) => m[1]!);
    expect(keys).toHaveLength(11);
    expect(keys).toEqual(['home', 'users', 'moderation', 'marketplace', 'audit', 'realtime', 'rate-limit', 'access', 'observability', 'gateway', 'discover-cache']);
    expect(navCode).toContain('data-admin-link={link.key}');
    expect(navCode).toContain('data-admin-dot={link.key}');
  });

  it('门页 data 钩子守恒：home-root/kicker/cards + 十张 home-card', () => {
    for (const hook of ['data-admin-home-root', 'data-admin-home-kicker', 'data-admin-home-cards']) {
      expect(pageCode, `page 丢了钩子 ${hook}`).toContain(hook);
    }
    // 十个 slug 一一对齐：每个 slug 都必须能对上 AREAS 常量里的一项
    for (const _slug of ['users', 'moderation', 'marketplace', 'audit', 'realtime', 'rate-limit', 'access', 'observability', 'gateway', 'discover-cache']) {
      expect(pageCode).toContain(`slug: '${_slug}'`);
    }
    expect(pageCode).toContain('data-admin-home-card={area.slug}');
  });

  it('两个文件字面 className 只认 .adm-*', () => {
    let total = 0;
    for (const src of [pageCode, navCode]) {
      const literals = [...src.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
      total += literals.length;
      for (const cls of literals) {
        for (const tok of cls.split(/\s+/).filter(Boolean)) {
          expect(tok, `${cls} 里出现了非门面类`).toMatch(/^adm-[A-Za-z0-9-]+$/);
        }
      }
    }
    expect(total).toBeGreaterThanOrEqual(20);
  });

  it('零裸 Tailwind 原子类', () => {
    for (const src of [pageCode, navCode]) {
      const literals = [...src.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
      for (const cls of literals) {
        expect(cls).not.toMatch(
          /\b(mt-|mb-|mx-|px-|py-|my-|text-\d|text-\[|text-fg-|bg-|flex\b|grid\b|gap-|items-|min-h-|min-w-|max-w-\[|whitespace-|rounded-|outline-|focus-visible:|hover:|sm:|lg:|font-|tracking-|uppercase|leading-|size-|absolute|right-|top-|no-underline|backdrop-blur|shadow-)\b/,
        );
      }
    }
  });

  it('className 用到的每个 adm-* 都在 globals.css 里有 .adm- 基础定义', () => {
    const used = new Set([...(pageCode + '\n' + navCode).matchAll(/\badm-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThanOrEqual(18);
    const defined = admClassesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('.adm- 视觉段成规模（≥ 18 条视觉类，当前 19）', () => {
    expect(admClassesDefined(globals).size).toBeGreaterThanOrEqual(18);
    expect(segment.length).toBeGreaterThan(900);
  });

  it('零写死 hex（视觉段 + 两个文件都不许）', () => {
    expect(segment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(pageCode).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(navCode).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('渐变实底只准用 var(--nexus-color-accent-2|info)（两主题皆 ≥10.9:1）', () => {
    expect(segment).toMatch(/linear-gradient\(135deg,\s*var\(--nexus-color-accent-2\),\s*var\(--nexus-color-info\)\)/);
    const hexes = [...segment.matchAll(/linear-gradient\(([^)]*)\)/g)].flatMap((m) => [...m[1]!.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((g) => g[0]));
    expect(hexes).toEqual([]);
  });

  it('.adm- 视觉段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const used = [...new Set([...segment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(18);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('零新增颜色 token（视觉段内不许出现 --nexus-*: 定义）', () => {
    expect(segment).not.toMatch(/--nexus-[a-z0-9-]+\s*:/);
  });

  it('transition 时长一律 var(--nexus-motion-fast)；backdrop-filter blur(12px) 逐字平移；@media 两条逐字平移', () => {
    expect(segment).not.toMatch(/transition:[^;}]*\d+(ms|s)\b/);
    expect(segment).not.toMatch(/\bduration-\[/i);
    expect(segment).toContain('backdrop-filter: blur(12px)');
    expect(segment).toContain('@media (min-width: 40rem)');
    expect(segment).toContain('@media (min-width: 64rem)');
  });

  it('HEAD 原始 nav 里确实躺着 ITEM 模板常量（carve 的锚），且雕刻后 redact 与现状相等', () => {
    expect(navHead).toContain(HEAD_ITEM_BLOCK);
    // 全片唯一删除 = 未再使用的 ITEM；任何其他行为改动都会让此等式断开
    expect(createHash('sha256').update(redactClasses(navCarved)).digest('hex')).toBe(
      'a1c6b39079ac62c1149e42e6e3ed514b66a262c6bc890f77049e6e741659a927',
    );
    expect(createHash('sha256').update(redactClasses(nav)).digest('hex')).toBe(
      'a1c6b39079ac62c1149e42e6e3ed514b66a262c6bc890f77049e6e741659a927',
    );
  });

  it('page.tsx redact 恒等于 HEAD 原样（1 字节不外泄）', () => {
    expect(createHash('sha256').update(redactClasses(page)).digest('hex')).toBe(
      '2731ed4964fc3907821da6911acd4d71f4ab290a965828a3d4c77c609583f7fe',
    );
  });

  it('focus-visible 覆盖 card / navItem；.adm-navItemActive 有 accent-fg 墨字', () => {
    expect(segment).toContain('.adm-card:focus-visible');
    expect(segment).toContain('.adm-navItem:focus-visible');
    expect(segment).toMatch(/\.adm-navItemActive \{[^}]*color: var\(--nexus-color-accent-fg\)/);
  });
});
