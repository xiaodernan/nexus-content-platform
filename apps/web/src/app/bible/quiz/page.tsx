import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, type Locale } from '@/lib/i18n';
import { BibleQuiz } from '@/components/BibleQuiz';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return locale === 'zh'
    ? {
        title: '潮汐挑战 · 低语诸王',
        description: '《低语诸王》世界大典正典问答：十四章正典里的十四道题。',
      }
    : {
        title: 'The Tidal Trial · The Whispers’ Kings',
        description: 'Fourteen questions drawn from the fourteen canonical chapters of The Whispers’ Kings.',
      };
}

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
