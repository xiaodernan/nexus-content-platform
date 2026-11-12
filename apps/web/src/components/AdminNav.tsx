import Link from 'next/link';

/**
 * 管理台的导航：一份名单、一个下限
 *
 * 2026-10-30 第二十五片的读数：七个 `/admin/*` 页面各抄了一份这个 `<nav>`，
 * 每份都是自己那几个链接、自己的 `data-*` 前缀，每个链接高 **21px**——
 * 低于 WCAG 2.5.8 的 24×24 下限（同一遍读数在 390 与 1280 下都量到 7 个）。
 *
 * 抄七份的后果不只是"多一行 CSS"：`/admin/realtime` 那份少了三个入口，
 * `/admin/users` 那份没有"市场工单"，所以从哪一页进管理台，能看见的路不一样。
 * 这里把**名单**收到一处（`LINKS`），把**下限**也收到一处（`ITEM`）。
 *
 * 当前页渲染成 `<span aria-current="page">`：一页不该链到自己，读屏也靠它说"你在这"。
 *
 * §A11Y-3（本轮升维）：极简文字链接 → **磨砂胶囊长航格**。名单不变、入口不变、
 * aria 语义不变（aria-current / aria-label / data-admin-link 全保留）；变化的只有皮相：
 * 玻璃质感容器（border-subtle + bg-2 半透 + backdrop-blur + shadow-sm），当前页用
 * accent-2→info 渐变实底 + accent-fg 墨字（两主题皆 ≥10.9:1，token 出处 tokens.css），
 * 非当前页 hover 才亮 bg-3 底；可见聚焦环沿用 accent-2-ink（style-tokens 钉住 AA）。
 * 下限仍是 WCAG 2.5.8：`min-h-7` = 28px，比 24px 下限更高。`prefers-reduced-motion`
 * 里所有过渡自动归零（--nexus-motion-* 已归零，transition-colors 用其时长）。
 */
const LINKS = [
  { key: 'home', href: '/admin', label: '管理台' },
  { key: 'users', href: '/admin/users', label: '账号与角色' },
  { key: 'moderation', href: '/admin/moderation', label: '复核台' },
  { key: 'marketplace', href: '/admin/marketplace', label: '市场工单' },
  { key: 'audit', href: '/admin/audit', label: '审计事件' },
  { key: 'realtime', href: '/admin/realtime', label: '实时总线' },
  { key: 'rate-limit', href: '/admin/rate-limit', label: '限流闸' },
  { key: 'access', href: '/admin/access', label: '访问账' },
  { key: 'observability', href: '/admin/observability', label: '观测' },
  { key: 'gateway', href: '/admin/gateway', label: '网关态势' },
  { key: 'discover-cache', href: '/admin/discover-cache', label: '发现页缓存' },
] as const;

export type AdminSection = (typeof LINKS)[number]['key'];

/** `min-h-7` = 28px：比 WCAG 2.5.8 的 24px 下限更积极的一条；rounded-full 胶囊；聚焦环永远可见 */
const ITEM =
  'inline-flex min-h-7 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-11 ' +
  'transition-colors duration-[var(--nexus-motion-fast)] outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-[var(--nexus-color-accent-2-ink)]';

export function AdminNav({ current }: { current: AdminSection }) {
  return (
    <nav
      className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-full border border-[var(--nexus-color-border-subtle)] bg-[var(--nexus-color-bg-2)]/70 p-1 shadow-[var(--nexus-shadow-sm)] backdrop-blur-md"
      aria-label="管理台"
      data-admin-nav
    >
      {LINKS.map((link) =>
        link.key === current ? (
          <span
            key={link.key}
            aria-current="page"
            data-admin-link={link.key}
            className={`${ITEM} bg-[linear-gradient(135deg,var(--nexus-color-accent-2),var(--nexus-color-info))] font-semibold text-[var(--nexus-color-accent-fg)] shadow-[var(--nexus-shadow-sm)]`}
          >
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-[var(--nexus-color-accent-fg)]"
              data-admin-dot={link.key}
            />
            {link.label}
          </span>
        ) : (
          <Link
            key={link.key}
            href={link.href}
            data-admin-link={link.key}
            className={`${ITEM} text-fg-2 no-underline hover:bg-[var(--nexus-color-bg-3)] hover:text-fg-1`}
          >
            {link.label}
          </Link>
        ),
      )}
    </nav>
  );
}
