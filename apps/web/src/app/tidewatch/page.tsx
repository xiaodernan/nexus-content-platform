import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, type Locale } from '@/lib/i18n';
import { Tidewatch } from '@/components/Tidewatch';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '潮候 · Tidewatch · 潮记你这一步——NEXUS',
  description:
    '一步世界 = 一张编译后的 StateGraph：读局 → 锚句检索 → 潮回叙事 + 结构化 delta → 逐字核验 → 落账。真实 provider、真流转、真潮账。A real StateGraph for one step of the world: analyze → retrieve → narrate + structured delta → verbatim guard → assemble. Real provider, real state flow, real tide ledger.',
};

/**
 * §WS-1 `/tidewatch` — 潮候步进：大模型不只是"答一句"的接口，而是世界状态机的分析层。
 * 每步真实 StateGraph（analyze → retrieve → narrate → canon_guard → assemble），
 * 引用逐字核验，delta 夹紧后才放行。状态随客户端 localStorage（nexus-tidewatch-v1）。
 */
export default async function TidewatchPage() {
  const locale = (await getLocale()) as Locale;
  const links = locale === 'zh'
    ? [
        { href: '/tide-oracle', label: '先问潮一句' },
        { href: '/bible', label: '典籍室' },
        { href: '/stategraph', label: 'StateGraph 是怎么编译的' },
        { href: '/guide', label: '使用指南' },
      ]
    : [
        { href: '/tide-oracle', label: 'Ask the tide one question' },
        { href: '/bible', label: 'The World Bible' },
        { href: '/stategraph', label: 'How the StateGraph is built' },
        { href: '/guide', label: 'User guide' },
      ];
  return (
    <main className="gd-root" data-tidewatch-page data-tidewatch-locale={locale}>
      <Tidewatch locale={locale} nowIso={new Date().toISOString()} />
      <footer className="gd-foot" aria-label={locale === 'zh' ? '相关入口' : 'Related links'}>
        {links.map((link) => (
          <Link key={link.href} className="am-linkImplicit" href={link.href}>{link.label}</Link>
        ))}
      </footer>
    </main>
  );
}
