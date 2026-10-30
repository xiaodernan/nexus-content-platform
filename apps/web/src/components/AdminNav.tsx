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
 */
const LINKS = [
  { key: 'users', href: '/admin/users', label: '账号与角色' },
  { key: 'moderation', href: '/admin/moderation', label: '复核台' },
  { key: 'marketplace', href: '/admin/marketplace', label: '市场工单' },
  { key: 'audit', href: '/admin/audit', label: '审计事件' },
  { key: 'realtime', href: '/admin/realtime', label: '实时总线' },
  { key: 'access', href: '/admin/access', label: '访问账' },
  { key: 'observability', href: '/admin/observability', label: '观测' },
] as const;

export type AdminSection = (typeof LINKS)[number]['key'];

/** `min-h-6` = 24px：不是装饰，是 2.5.8 的下限；横向 padding 让相邻链接之间也隔得开 */
const ITEM = 'inline-flex min-h-6 items-center rounded px-1';

export function AdminNav({ current }: { current: AdminSection }) {
  return (
    <nav className="flex flex-wrap items-center gap-x-3 gap-y-1 text-11" aria-label="管理台" data-admin-nav>
      {LINKS.map((link) =>
        link.key === current ? (
          <span
            key={link.key}
            aria-current="page"
            data-admin-link={link.key}
            className={`${ITEM} font-semibold text-fg-1`}
          >
            {link.label}
          </span>
        ) : (
          <Link
            key={link.key}
            href={link.href}
            data-admin-link={link.key}
            className={`${ITEM} text-accent-2-ink underline`}
          >
            {link.label}
          </Link>
        ),
      )}
    </nav>
  );
}
