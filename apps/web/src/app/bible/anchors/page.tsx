import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, type Locale } from '@/lib/i18n';
import { AnchorEcho } from '@/components/AnchorEcho';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '锚句回放 · 低语诸王',
  description: '正典里唯一不翻译、不改写的句子，逐字回放——看见锚句，说出它出自哪一章、哪一回响。',
};

const COPY: Record<Locale, { crumb: string; back: string; echoCrumb: string }> = {
  zh: { crumb: '低语诸王 · 典籍室', back: '← 回典籍室', echoCrumb: '锚句回放' },
  en: { crumb: 'The Whispers’ Kings · The shelf', back: '← The shelf', echoCrumb: 'Anchor Echo' },
};

/** 《低语诸王》锚句回放 —— 十四章节与全部回响的 1317 句锚句（中英成对）出处竞猜。 */
export default async function AnchorEchoPage() {
  const locale = await getLocale();
  const c = COPY[locale];
  return (
    <main className="bb-root" data-anchor-echo-page data-anchor-echo-locale={locale}>
      <nav className="bb-breadcrumb" aria-label={c.crumb}>
        <Link href="/bible" className="bb-footLink" data-anchor-echo-back>{c.back}</Link>
        <span className="bb-crumbSep" aria-hidden="true">/</span>
        <span className="bb-crumbCurrent">{c.echoCrumb}</span>
      </nav>
      <AnchorEcho locale={locale} />
    </main>
  );
}
