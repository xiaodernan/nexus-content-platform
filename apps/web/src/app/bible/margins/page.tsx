import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, type Locale } from '@/lib/i18n';
import { BibleMargins } from '@/components/BibleMargins';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '页边批注 · Margins of the Canon — 低语诸王',
  description:
    '抄本师写在页边的话：不属于正文、不进名册、也不算进任何一道。Words the copyists left in the margins — not the body, not the register, not counted into any mark.',
};

const COPY: Record<Locale, { crumb: string; back: string }> = {
  zh: { crumb: '低语诸王 · 典籍室', back: '← 回典籍室' },
  en: { crumb: 'The Whispers’ Kings · The shelf', back: '← The shelf' },
};

/** 典籍室第四个角落：页边批注（正文之外、名册之外的话）。 */
export default async function BibleMarginsPage() {
  const locale = await getLocale();
  const c = COPY[locale];
  return (
    <main className="bb-root" data-bible-margins-page data-bible-margins-page-locale={locale}>
      <nav className="bb-breadcrumb" aria-label={c.crumb}>
        <Link href="/bible" className="bb-footLink" data-bible-margins-page-back>{c.back}</Link>
      </nav>
      <BibleMargins locale={locale} />
    </main>
  );
}