import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, type Locale } from '@/lib/i18n';
import { BibleSearch } from '@/components/BibleSearch';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return locale === 'zh'
    ? {
        title: '正典检索 · 低语诸王',
        // 旧文案停在「四章 + 四回响」；真实正典已是十四章 + 二百一十八回响。
        description: '世界大典本地检索：在正典全文里按关键词直达原文（十四章 + 二百一十八回响）。',
      }
    : {
        title: 'The Canon Search · The Whispers’ Kings',
        description: 'The local canon search — keyword hits in the full text of the World Bible (fourteen chapters + two hundred eighteen echoes).',
      };
}

const COPY: Record<Locale, { crumb: string; back: string }> = {
  zh: { crumb: '世界大典 · 正典检索', back: '← 典籍室' },
  en: { crumb: 'The World Bible · Canon Search', back: '← The shelf' },
};

/** §BIBLE-4 低语诸王 · 典籍室「正典检索」：指南承诺 `/bible/search` 直达（正典本地检索），此页兑现该承诺。
    检索本体只做一件事：从快照全文里捞出含关键词的行，按序显示原文，不出 AI、不出库外来源。 */
export default async function BibleSearchPage() {
  const locale = await getLocale();
  const c = COPY[locale];
  return (
    <main className="bb-root" data-bible-search-page data-bible-locale={locale}>
      <nav className="bb-breadcrumb" aria-label={c.crumb}>
        <Link href="/bible" className="bb-footLink" data-bible-search-back>{c.back}</Link>
        <span className="bb-crumbSep" aria-hidden="true">/</span>
        <span className="bb-crumbCurrent">{c.crumb}</span>
      </nav>
      <BibleSearch locale={locale} />
    </main>
  );
}
