import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, type Locale } from '@/lib/i18n';
import { SevenWells } from '@/components/SevenWells';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return locale === 'zh'
    ? {
        title: '七口井 · 低语诸王',
        description: '盐海边沿的七口井，六口只是看；第七口叫了名字它才肯看回来。',
      }
    : {
        title: 'The Seven Wells · The Whispers’ Kings',
        description: 'At the salt sea’s edge: seven wells. Six are only looking. The seventh looks back if you say the name.',
      };
}

const COPY: Record<Locale, { crumb: string; back: string }> = {
  zh: { crumb: '世界大典 · 七口井', back: '← 典籍室' },
  en: { crumb: 'The World Bible · The Seven Wells', back: '← The shelf' },
};

/** §BIBLE-2 低语诸王 · 典籍室「七口井」：每一口井都是教团余烬里一个席位。 */
export default async function BibleWellPage() {
  const locale = await getLocale();
  const c = COPY[locale];
  return (
    <main className="bb-root" data-bible-well-page data-bible-locale={locale}>
      <nav className="bb-breadcrumb" aria-label={c.crumb}>
        <Link href="/bible" className="bb-footLink" data-bible-well-back>{c.back}</Link>
        <span className="bb-crumbSep" aria-hidden="true">/</span>
        <span className="bb-crumbCurrent">{c.crumb}</span>
      </nav>
      <SevenWells locale={locale} />
    </main>
  );
}
