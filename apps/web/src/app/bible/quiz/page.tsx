import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, type Locale } from '@/lib/i18n';
import { BibleQuiz } from '@/components/BibleQuiz';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '潮汐挑战 · The Tidal Trial — 低语诸王',
  description: '世界大典正典问答 · Fourteen questions on the five canonical chapters of The Whispers’ Kings.',
};

const COPY: Record<Locale, { crumb: string; back: string }> = {
  zh: { crumb: '世界大典 · 潮汐挑战', back: '← 典籍室' },
  en: { crumb: 'The World Bible · The Tidal Trial', back: '← The shelf' },
};

/** §BIBLE-2 低语诸王 · 典籍室「潮汐挑战」（§BIBLE-2 ideas）：正典落地的第一个玩法。 */
export default async function BibleQuizPage() {
  const locale = await getLocale();
  const c = COPY[locale];
  return (
    <main className="bb-root" data-bible-quiz-page data-bible-locale={locale}>
      <nav className="bb-breadcrumb" aria-label={c.crumb}>
        <Link href="/bible" className="bb-footLink" data-bible-quiz-back>{c.back}</Link>
        <span className="bb-crumbSep" aria-hidden="true">/</span>
        <span className="bb-crumbCurrent">{c.crumb}</span>
      </nav>
      <BibleQuiz locale={locale} />
    </main>
  );
}
