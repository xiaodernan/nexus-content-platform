import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, type Locale } from '@/lib/i18n';
import { DotRoad } from '@/components/DotRoad';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return locale === 'zh'
    ? {
        title: '点路 · 低语诸王',
        description: 'E220《照着点走一遍》的可走版：十九步、六个站、路尽头一格空白——六句原文逐字留在路上。',
      }
    : {
        title: 'The Dot Road · The Whispers’ Kings',
        description: 'Echo 220 made walkable: nineteen steps, six stations, one blank at the end — six verbatim lines kept along the road.',
      };
}

const COPY: Record<Locale, { crumb: string; back: string }> = {
  zh: { crumb: '低语诸王 · 典籍室', back: '← 回典籍室' },
  en: { crumb: 'The Whispers’ Kings · The shelf', back: '← The shelf' },
};

/** 典籍室第五个角落：把 E220 的十九步做成一条可以真的走一遍的点路。 */
export default async function DotRoadPage() {
  const locale = await getLocale();
  const c = COPY[locale];
  return (
    <main className="bb-root" data-dot-road-page data-dot-road-page-locale={locale}>
      <nav className="bb-breadcrumb" aria-label={c.crumb}>
        <Link href="/bible" className="bb-footLink" data-dot-road-page-back>{c.back}</Link>
      </nav>
      <DotRoad locale={locale} />
    </main>
  );
}
