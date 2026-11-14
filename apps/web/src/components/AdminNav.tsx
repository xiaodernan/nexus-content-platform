import Link from 'next/link';
import { getLocale, type Locale } from '@/lib/i18n';

/**
 * 管理台的导航：一份名单、一个下限
 *
 * 2026-10-30 第二十五片的读数：七个 `/admin/*` 页面各抄了一份这个 `<nav>`，
 * 每份都是自己那几个链接、自己的 `data-*` 前缀，每个链接高 **21px**——
 * 低于 WCAG 2.5.8 的 24×24 下限（同一遍读数在 390 与 1280 下都量到 7 个）。
 *
 * 抄七份的后果不只是"多一行 CSS"：`/admin/realtime` 那份少了三个入口，
 * `/admin/users` 那份没有"市场工单"，所以从哪一页进管理台，能看见的路不一样。
 * 这里把**名单**收到一处（`LINKS`），把**下限**也收到一处（`.adm-navItem`/`.adm-navItemActive`，globals.css §FE-26）。
 *
 * 当前页渲染成 `<span aria-current="page">`：一页不该链到自己，读屏也靠它说"你在这"。
 *
 * §A11Y-3（本轮升维）：极简文字链接 → **磨砂胶囊长航格**。名单不变、入口不变、
 * aria 语义不变（aria-current / aria-label / data-admin-link 全保留）；变化的只有皮相：
 * 玻璃质感容器（border-subtle + bg-2 半透 + backdrop-blur + shadow-sm），当前页用
 * accent-2→info 渐变实底 + accent-fg 墨字（两主题皆 ≥10.9:1，token 出处 tokens.css），
 * 非当前页 hover 才亮 bg-3 底；可见聚焦环沿用 accent-2-ink（style-tokens 钉住 AA）。
 * 下限仍是 WCAG 2.5.8：`.adm-navItem`/`.adm-navItemActive` 的 `min-height: 1.75rem` = 28px，
 * 比 24px 下限更高。`prefers-reduced-motion` 里所有过渡自动归零（--nexus-motion-* 已归零，transition 用其时长）。
 * §FE-26 / ADR-0178：arbitrary atom → `.adm-*` 门面族（零行为，见 ADR）。
 *
 * v760：名单双语（zh/en 同序同键）。`aria-label` 跟随 locale；链接文本按 locale 取。
 */
const LINKS = [
  { key: 'home', href: '/admin', labelZh: '管理台', labelEn: 'Admin console' },
  { key: 'users', href: '/admin/users', labelZh: '账号与角色', labelEn: 'Accounts & roles' },
  { key: 'moderation', href: '/admin/moderation', labelZh: '复核台', labelEn: 'Moderation' },
  { key: 'marketplace', href: '/admin/marketplace', labelZh: '市场工单', labelEn: 'Marketplace queue' },
  { key: 'audit', href: '/admin/audit', labelZh: '审计事件', labelEn: 'Audit events' },
  { key: 'realtime', href: '/admin/realtime', labelZh: '实时总线', labelEn: 'Realtime bus' },
  { key: 'rate-limit', href: '/admin/rate-limit', labelZh: '限流闸', labelEn: 'Rate limiting' },
  { key: 'access', href: '/admin/access', labelZh: '访问账', labelEn: 'Access log' },
  { key: 'observability', href: '/admin/observability', labelZh: '观测', labelEn: 'Observability' },
  { key: 'gateway', href: '/admin/gateway', labelZh: '网关态势', labelEn: 'Gateway' },
  { key: 'discover-cache', href: '/admin/discover-cache', labelZh: '发现页缓存', labelEn: 'Discover cache' },
  { key: 'ai-cache', href: '/admin/ai-cache', labelZh: '缓存读数', labelEn: 'AI cache' },
  { key: 'savings', href: '/admin/savings', labelZh: 'AI 节省', labelEn: 'AI savings' },
  { key: 'dead-letters', href: '/admin/dead-letters', labelZh: '死信巡检', labelEn: 'Dead letters' },
  { key: 'pricing', href: '/admin/pricing', labelZh: 'AI 成本', labelEn: 'AI costs' },
  { key: 'health', href: '/admin/health', labelZh: '健康总览', labelEn: 'Health' },
] as const;

export type AdminSection = (typeof LINKS)[number]['key'];

const NAV_COPY: Record<Locale, { aria: string }> = {
  zh: { aria: '管理台' },
  en: { aria: 'Admin console' },
};

export async function AdminNav({ current }: { current: AdminSection }) {
  const locale = await getLocale();
  const c = NAV_COPY[locale];
  const labelOf = (link: (typeof LINKS)[number]): string => (locale === 'en' ? link.labelEn : link.labelZh);
  return (
    <nav
      className="adm-nav"
      aria-label={c.aria}
      data-admin-nav
    >
      {LINKS.map((link) =>
        link.key === current ? (
          <span
            key={link.key}
            aria-current="page"
            data-admin-link={link.key}
            className="adm-navItemActive"
          >
            <span
              aria-hidden="true"
              className="adm-navDot"
              data-admin-dot={link.key}
            />
            {labelOf(link)}
          </span>
        ) : (
          <Link
            key={link.key}
            href={link.href}
            data-admin-link={link.key}
            className="adm-navItem"
          >
            {labelOf(link)}
          </Link>
        ),
      )}
    </nav>
  );
}
