import type { Metadata } from 'next';
import Link from 'next/link';
import { publicWorlds } from '@/server/domain/publicWorlds';
import { getLocale, type Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '预览 · Preview — NEXUS',
  description: '预览和某个具体项目的作品页面——需要 /preview/<projectId> 来访问。Open the preview URL of a specific project via /preview/<projectId>.',
  robots: { index: false, follow: false },
};

const COPY: Record<Locale, {
  kicker: string;
  title: string;
  lede: string;
  know: string;
  cards: readonly { href: string; label: string; note: string }[];
}> = {
  zh: {
    kicker: '§PREVIEW-AS-INDEX',
    title: '这里是预览端点',
    lede: '预览需要一个 projectId——形如 /preview/<projectId>。你是偶然点进来的，几条可走：',
    know: '如果你在找一个世界 →',
    cards: [
      { href: '/world', label: '看公开世界廊', note: '所有已发布世界按时间排' },
      { href: '/discover', label: '看作品榜', note: '/discover 有归类的公开作品' },
      { href: '/studio', label: '进入 Studio', note: '画自己的世界——从这里开始' },
    ],
  },
  en: {
    kicker: '§PREVIEW-AS-INDEX',
    title: 'This is the preview endpoint',
    lede: 'Preview needs a projectId — /preview/<projectId>. You landed here by accident; few ways out:',
    know: 'If you were looking for worlds →',
    cards: [
      { href: '/world', label: 'Open the public gallery', note: 'Every public world, newest first' },
      { href: '/discover', label: 'Browse /discover', note: 'Categorised public works' },
      { href: '/studio', label: 'Open Studio', note: 'Build your own world — start here' },
    ],
  },
};

export default async function PreviewIndexPage() {
  const locale = await getLocale();
  const c = COPY[locale];
  const rows = await publicWorlds(3).catch(() => []);
  return (
    <main className="wv-shell" data-preview-root data-preview-locale={locale}>
      <header className="wv-head">
        <p className="wv-kicker" data-preview-kicker>{c.kicker}</p>
        <h1 className="wv-title" data-preview-title>{c.title}</h1>
        <p className="wv-lede" data-preview-lede>{c.lede}</p>
      </header>
      <section className="wv-grid" data-preview-cards>
        <ol className="wv-list">
          {c.cards.map((card) => (
            <li key={card.href} className="wv-card" data-preview-card>
              <Link href={card.href} className="wv-cardLink" data-preview-card-link={card.href}>
                <h2 className="wv-cardTitle">{card.label}</h2>
                <p className="wv-cardSummary">{card.note}</p>
              </Link>
            </li>
          ))}
        </ol>
      </section>
      {rows.length > 0 ? (
        <section className="wv-grid" data-preview-featured>
          <ol className="wv-list">
            {rows.slice(0, 3).map((row) => (
              <li key={row.projectId} className="wv-card" data-preview-featured-card>
                <Link href={`/preview/${row.projectId}`} className="wv-cardLink">
                  <h2 className="wv-cardTitle">{row.projectName}</h2>
                  {row.summary ? <p className="wv-cardSummary">{row.summary}</p> : null}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </main>
  );
}
