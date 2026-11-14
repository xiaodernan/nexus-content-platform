import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §A11Y-4 `/admin` 管理台首页——静态那一寸（零浏览器、零真库、零时钟）。
 *
 * 这一页补的是"访客打开 /admin 被根 not-found 打回"的缺口——十一处真实入口此前没有任何一张脸。
 * 全是纯导航：没有任何数据读取、没有 fetch、没有 mutation，每个钩子都是锚点给人看的。
 * 浏览器那一寸（真的渲染、深/浅主题、focus 环、forced-colors）靠 `scripts/capture-admin-home.mts`
 * 的头less-Chrome 截图 + 人工读图；axe 归既有 `a11y-internal.spec.ts` 体系。
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

/** 去注释后的真代码——所有语义门锚它（ADR-0154 纪律），注释里的示例不算数。 */
const code = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** `.adm-` 视觉段：`.adm-denied {` 起，到下一个 §FE 段头止（`.adm-` 注释含段头）。 */
const admSegment = ((): string => {
  const start = globals.indexOf('.adm-denied {');
  if (start < 0) throw new Error('globals.css 找不到 .adm- 段');
  const rest = globals.slice(start);
  const m = rest.search(/\/\* ── §/);
  return (m > 0 ? rest.slice(0, m) : rest).replace(/\/\*[\s\S]*?\*\//g, '');
})();

describe('§A11Y-4 admin home', () => {
  it('是纯导航 server component：零 client 指令、零 fetch、零 mutation、零表单', () => {
    expect(code).not.toContain('use client');
    expect(code).not.toContain('useEffect');
    expect(code).not.toContain('fetch(');
    expect(code).not.toContain('action=');
    expect(code).not.toContain('<form');
    expect(code).not.toContain('onClick=');
    expect(code).toContain('export default async function AdminHomePage');
    expect(code).toContain("export const dynamic = 'force-dynamic'");
  });

  it('门与 /admin/* 其余几张一致：先 session，再 role；两种拒绝都给姓名、不外泄任何读数', () => {
    expect(code).toContain('currentUserOrNull()');
    expect(code).toContain('!user');
    expect(code).toContain('data-admin-denied="anonymous"');
    expect(code).toContain('user.role !== \'admin\'');
    expect(code).toContain('data-admin-denied="not-admin"');
    expect(code).toContain('user.displayName');
  });

  it('AdminNav 是 home 态：current="home" 且组件名单里有 /admin 自链接', () => {
    expect(code).toContain('AdminNav');
    expect(code).toContain('current="home"');
    expect(nav).toContain("{ key: 'home', href: '/admin', label: '管理台' }");
    expect(nav).toContain("export type AdminSection = (typeof LINKS)[number]['key']");
  });

  it('十一张卡全在且唯一：href 与 slug 一一对齐，没有多出第十二处 phantom 入口', () => {
    // 来源于 page.tsx 的 AREAS 常量；写下计数而不是"包含这些字串"，杜绝静默多加了一处
    const slugs = [...code.matchAll(/slug: '([a-z-]+)'/g)].map((m) => m[1]);
    expect(slugs).toEqual([
      'users', 'moderation', 'marketplace', 'audit', 'realtime',
      'rate-limit', 'access', 'observability', 'gateway', 'discover-cache', 'health',
    ]);
    const hrefs = [...code.matchAll(/href: '(\/admin\/[a-z-]+)'/g)].map((m) => m[1]);
    expect(hrefs).toEqual([
      '/admin/users', '/admin/moderation', '/admin/marketplace', '/admin/audit', '/admin/realtime',
      '/admin/rate-limit', '/admin/access', '/admin/observability', '/admin/gateway', '/admin/discover-cache', '/admin/health',
    ]);
    expect([...code.matchAll(/data-admin-home-card=/g)].length).toBeGreaterThanOrEqual(1);
  });

  it('钩子：root / kicker / cards / 卡位四个 data-admin-home-* 一个都不能少', () => {
    for (const hook of ['data-admin-home-root', 'data-admin-home-kicker', 'data-admin-home-cards', 'data-admin-home-card=']) {
      expect(code).toContain(hook);
    }
  });

  it('零写死颜色：没有 hex 字面量，每个 var(--nexus-*) 都在 tokens.css 声明过', () => {
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(admSegment).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    // §FE-26 后皮线在 .adm- 段：段里的 var(--nexus-*) 也必须每个都在 tokens.css 声明过
    const used = [...new Set([...admSegment.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]))];
    expect(used.length).toBeGreaterThan(0);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('动效收口：transition 只用 --nexus-motion-fast，没有 animation/帧循环', () => {
    expect(code).not.toContain('transition-all');
    expect(code).not.toContain('animation');
    expect(admSegment).not.toContain('animation');
    expect(admSegment).not.toMatch(/transition:[^;}]*\d+(ms|s)\b/);
    const transitions = (admSegment.match(/transition:/g) ?? []).length;
    const motion = (admSegment.match(/--nexus-motion-fast/g) ?? []).length;
    expect(transitions).toBeGreaterThan(0);
    expect(motion).toBeGreaterThanOrEqual(transitions);
  });

  it('键盘可达：每张卡都可 focus 并带可见 focus-visible 环（不是只有 hover）', () => {
    expect(admSegment).toMatch(/\.adm-card:focus-visible\s*{[^}]*outline: 2px solid var\(--nexus-color-accent-2-ink\)/);
    expect(admSegment).toContain('.adm-navItem:focus-visible');
  });

  it('面向用户的字符串诚实：十张卡的一句话都不画饼、不虚构百分比、不含 TODO/占位', () => {
    expect(code).not.toContain('TODO');
    expect(code).not.toContain('占位');
    expect(code).not.toMatch(/\d+%[\s\S]{0,24}(?:成功|好用|命中)/);
    expect(code).not.toContain('100% 成功');
    expect(code).not.toContain('全部正常');
  });

  it('tokens.css 里本片引用的 accent/shadow/motion 至少声明过一次（不引用幽灵 token）', () => {
    for (const token of ['--nexus-font-size-28', '--nexus-motion-fast', '--nexus-shadow-sm', '--nexus-color-accent-2-ink']) {
      expect(tokens).toContain(token);
    }
  });
});
