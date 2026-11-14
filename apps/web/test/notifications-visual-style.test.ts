import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §FE-17 `/notifications` 收件箱页——**静态那一寸**（零浏览器、零真库、零时钟）。
 *
 * 通知中心是有登录才看得到、且处处要对得上注册表的一页（§164）。本片只换 className，
 * 文案 / data 钩子 / 注册表读路径 / 组件（NotificationBell/MarkRead/NotificationSettings）一字不改。
 * 浏览器那一寸（真渲染、深/浅主题、markRead 组件 React 真挂载）不在本片范围，见 §FE-17 ADR：
 * NotificationBell/MarkRead/NotificationSettings 均为 client 组件，setContent 离线注入无法真跑；
 * e2e 与 a11y 判定仍归 a11y-internal 体系。
 */
const ROOT = process.cwd();
const PAGE = join(ROOT, 'apps/web/src/app/notifications/page.tsx');
const GLOBALS = join(ROOT, 'apps/web/src/app/globals.css');
const TOKENS = join(ROOT, 'apps/web/src/styles/tokens.css');

const page = readFileSync(PAGE, 'utf8');
const globals = readFileSync(GLOBALS, 'utf8');
const tokens = readFileSync(TOKENS, 'utf8');

/** 去注释后的真代码——所有语义门锚它（ADR-0154 纪律）。 */
const code = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** globals.css 里 `.notif-*` 基础定义选择器（非伪类修饰的那些）。 */
function notifClassesDefined(css: string): Set<string> {
  const out = new Set<string>();
  for (const line of css.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')) {
    for (const m of line.matchAll(/\.(notif-[A-Za-z0-9-]+)\s*{/g)) out.add(m[1]!);
  }
  return out;
}

/** raw 文本里找首个 `re` 匹配，跳过注释（注释里长得像门面类的 `.notif-` 不是段起点）。 */
function findOutsideComments(css: string, re: RegExp): number {
  const comments = [...css.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const global = new RegExp(re.source, 'g');
  for (let m = global.exec(css); m !== null; m = global.exec(css)) {
    if (!comments.some(([a, b]) => m.index! >= a && m.index! < b)) return m.index!;
  }
  return -1;
}

/** 从 globals.css 抽出 .notif- 段（直到下一个 § 段横幅止；保留注释里提及的字段）。 */
function notifSegment(css: string): string {
  const start = findOutsideComments(css, /\.notif-[A-Za-z0-9]/);
  if (start < 0) throw new Error('globals.css 找不到 .notif- 段');
  const marker = css.indexOf('/* ── §', start);
  return marker > start ? css.slice(start, marker) : css.slice(start);
}

describe('§FE-17 notifications 收件箱页', () => {
  it('是纯 server component：零 client 指令、零 fetch、零 mutation、零表单', () => {
    expect(code).not.toContain('use client');
    expect(code).not.toContain('useEffect');
    expect(code).not.toContain('fetch(');
    expect(code).not.toContain('action=');
    expect(code).not.toContain('<form');
    expect(code).not.toContain('onClick=');
    expect(code).toContain('export default async function NotificationsPage');
    expect(code).toContain("export const dynamic = 'force-dynamic'");
  });

  it('门：匿名 denial 一行说清，不给任何收件箱读数；anonymous 分支先 return 不会挂 client 组件', () => {
    expect(code).toContain('currentUserOrNull()');
    expect(code).toContain('!user');
    expect(code).toContain('data-notification-denied="anonymous"');
    expect(code).toContain('notif-anonymousLede');
    // anonymous 分支是在 `if (!user) { return(...) }` 里，client 组件（NotificationBell）之后的第一次出现必须排在 denied 钩子之后
    const deniedIdx = code.indexOf('data-notification-denied="anonymous"');
    const bellIdx = code.indexOf('NotificationBell />');
    expect(deniedIdx).toBeGreaterThan(-1);
    expect(bellIdx).toBeGreaterThanOrEqual(deniedIdx);
  });

  it('page 级钩子：data-notification-page + 空态/翻页/列表渲染一个都不能少', () => {
    for (const hook of ['data-notification-page', 'NotificationBell', 'MarkRead', 'notif-list', 'notif-empty', 'notif-pagination']) {
      expect(code).toContain(hook);
    }
  });

  it('全部 className/模板里的 notif-* 都在 globals.css 基础定义里出现过', () => {
    const used = new Set([...code.matchAll(/\bnotif-[A-Za-z0-9][A-Za-z0-9-]*/g)].map((m) => m[0]));
    expect(used.size).toBeGreaterThan(0);
    const defined = notifClassesDefined(globals);
    for (const cls of used) {
      expect(defined, `globals.css 没有基础定义 ${cls}`).toContain(cls);
    }
  });

  it('零 hex、零写死 px token 漂移（颜色只走 tokens.css 的 --nexus-*）', () => {
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(notifSegment(globals)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('.notif- 段所有 var(--nexus-*) 都在 tokens.css 声明过', () => {
    const seg = notifSegment(globals);
    const used = [...new Set([...seg.matchAll(/var\((--nexus-[a-z0-9-]+)\)/g)].map((m) => m[1]))];
    expect(used.length).toBeGreaterThan(10);
    for (const token of used) {
      expect(tokens, `tokens.css 没有声明 ${token}`).toContain(token);
    }
  });

  it('响应式：grid2 按 Tailwind v4 sm=40rem，不是 .cr- 的 48rem', () => {
    const seg = notifSegment(globals);
    expect(seg).toContain('@media (min-width: 40rem)');
    expect(seg).not.toContain('48rem');
  });

  it('语义色纪律：已读=fg-3（沉没）/ 未读=fg-1（亮起）；链接=accent-2-ink；不可跳转=warn-ink；全是 -ink 双主题色', () => {
    const seg = notifSegment(globals);
    expect(seg).toMatch(/\.notif-titleMuted\s*{[^}]*var\(--nexus-color-fg-3\)/);
    expect(seg).toMatch(/\.notif-titleLive\s*{[^}]*var\(--nexus-color-fg-1\)/);
    expect(seg).toMatch(/\.notif-link\s*{[^}]*var\(--nexus-color-accent-2-ink\)/);
    expect(seg).toMatch(/\.notif-unavail\s*{[^}]*var\(--nexus-color-warn-ink\)/);
  });

  it('纯静态：零 transition / animation / keyframes（无 hover 动效，不需要 reduced-motion 假门）', () => {
    expect(page).not.toContain('transition');
    expect(page).not.toContain('animation');
    expect(notifSegment(globals)).not.toContain('transition');
    expect(notifSegment(globals)).not.toContain('animation');
    expect(notifSegment(globals)).not.toContain('@keyframes');
  });

  it('零行为残留：page 里没有任何裸 Tailwind 原子类（mt-/flex/gap-/text-d/nth 等）', () => {
    const classStrings = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    for (const cls of classStrings) {
      expect(cls).not.toMatch(/\b(mt-|mb-|mx-|px-|py-|my-|text-\d|text-\[|flex\b|grid\b|gap-|items-|border-b\b|md:|sm:|hover:|uppercase|font-semibold)\b/);
    }
  });

  it('HTML 钩子之外没有裸 Tailwind 遗留（只留 .notif-* 或动态模板）', () => {
    // className="..." 的字面值——每个空格分割都必须是 notif-*（或动态模板 notif-title notif-titleMuted|Live）
    const literals = [...code.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!);
    for (const cls of literals) {
      for (const t of cls.split(/\s+/).filter(Boolean)) {
        expect(t).toMatch(/^notif-[A-Za-z0-9-]+$/);
      }
    }
    // className={...} 模板——只认其中的字面 token，全部必须是 notif-title | notif-titleMuted | notif-titleLive
    const templates = [...code.matchAll(/className=\{[^}]*\}/g)].map((m) => m[0]);
    for (const tpl of templates) {
      for (const m of tpl.matchAll(/'([^']+)'/g)) {
        for (const t of m[1]!.split(/\s+/).filter(Boolean)) {
          expect(t).toMatch(/^notif-[A-Za-z0-9-]+$/);
        }
      }
    }
  });

  it('档位/详情翻页：有两个 data-pagination-* 钩子', () => {
    expect(code).toContain('data-pagination-prev');
    expect(code).toContain('data-pagination-next');
  });
});
