import type { Metadata } from 'next';
import Link from 'next/link';
import BibleWhisperClient from '@/components/BibleWhisperClient';
import { getLocale, type Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '低语诸王 · 答问者 — Whisper of the Canon',
  description: '挑一卷《低语诸王》世界大典中的正典，问一句它在书里怎么写的；答不出去就直说答不出来。Ask any chapter of the World Bible its own question; questions answered only from the canon.',
  robots: { index: true, follow: true },
};

const COPY: Record<Locale, { crumb: string; back: string }> = {
  zh: { crumb: '世界大典 · 答问者', back: '← 典籍室' },
  en: { crumb: 'The World Bible · Ask the canon', back: '← The shelf' },
};

/** §BIBLE-WHISPER 正典答问者入口 */
export default async function BibleWhisperPage() {
  const locale = await getLocale();
  const c = COPY[locale];
  return (
    <main className="bb-root" data-whisper-page data-bible-locale={locale}>
      <nav className="bb-breadcrumb" aria-label={c.crumb}>
        <Link href="/bible" className="bb-footLink" data-whisper-back>{c.back}</Link>
        <span className="bb-crumbSep" aria-hidden="true">/</span>
        <span className="bb-crumbCurrent">{c.crumb}</span>
      </nav>
      <BibleWhisperClient locale={locale} />
    </main>
  );
}
