import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, type Locale } from '@/lib/i18n';
import { TideOracle } from '@/components/TideOracle';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return locale === 'zh'
    ? {
        title: '潮语 — NEXUS',
        description: '向潮问一句话——《低语诸王》世界大典里的潮答你两句：真实模型、稳定前缀缓存、不预言、不编造。',
      }
    : {
        title: 'The Tide Oracle — NEXUS',
        description: 'Ask the tide one question — the tide answers in two sentences from the World Bible: a real model, a stable prefix cache, no prophecy, no invention.',
      };
}

/**
 * §TIDE-ORACLE `/tide-oracle`
 *   世界大典唯一面向「问一句」的真模型入口：潮站在典籍室门口，只答正典里写到的事。
 *   解锁与整座潮家族一致（/insight 口令 123）——页面常驻真实/DEMO 标识由 API 诚实回执保证。
 */
export default async function TideOraclePage() {
  const locale = (await getLocale()) as Locale;
  const links = locale === 'zh'
    ? [
        { href: '/bible', label: '← 先去典籍室读两章' },
        { href: '/bible/quiz', label: '潮汐挑战（正典问答）' },
        { href: '/tide-wire', label: '今日潮声 · 公开 aggregates' },
        { href: '/insight', label: '观察坞 · 解锁（口令 123）' },
        { href: '/guide', label: '使用指南' },
      ]
    : [
        { href: '/bible', label: '← Read two chapters first' },
        { href: '/bible/quiz', label: 'Tide quiz (canon questions)' },
        { href: '/tide-wire', label: 'Today’s tide wire · public aggregates' },
        { href: '/insight', label: 'Insight dock · unlock (passphrase 123)' },
        { href: '/guide', label: 'User guide' },
      ];
  return (
    <main className="gd-root" data-tide-oracle-page data-tide-oracle-locale={locale}>
      <TideOracle locale={locale} />
      <footer className="gd-foot" aria-label={locale === 'zh' ? '相关入口' : 'Related links'}>
        {links.map((link) => (
          <Link key={link.href} className="am-linkImplicit" href={link.href}>{link.label}</Link>
        ))}
      </footer>
    </main>
  );
}
