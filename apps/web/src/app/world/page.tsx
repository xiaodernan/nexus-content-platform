import type { Metadata } from 'next';
import Link from 'next/link';
import { publicWorlds } from '@/server/domain/publicWorlds';
import { getLocale, type Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return locale === 'zh'
    ? {
        title: '世界 — NEXUS',
        description: '浏览其他创作者公开发布的世界：浏览器里可以直接读，也能直接进去走。',
        robots: { index: false, follow: false },
      }
    : {
        title: 'Worlds — NEXUS',
        description: 'Browse open worlds published by other creators — readable in the browser, walkable straight away.',
        robots: { index: false, follow: false },
      };
}

const COPY: Record<Locale, {
  kicker: string;
  title: string;
  lede: string;
  emptyTitle: string;
  emptyBody: string;
  ctaCreate: string;
  ctaDiscover: string;
  entriesHeading: string;
}> = {
  zh: {
    kicker: '§WORLD-INDEX',
    title: '开放世界 · 公开廊',
    lede: '只有把作品设为「公开」的项目才出现在这里——按发布时间倒序。进到 /preview 以后，画布就是网页；有些可直接玩、有些只是设计稿。',
    emptyTitle: '还没人公开发过世界',
    emptyBody: '你是第一个。在 /studio 画出一个人·天凉快的场景：丢一棵树、一个对话、一个出口，就够发这一刻了。',
    ctaCreate: '→ 进入 Studio 开干',
    ctaDiscover: '← /discover 看看市面',
    entriesHeading: '已公开的世界',
  },
  en: {
    kicker: '§WORLD-INDEX',
    title: 'The open gallery · Worlds',
    lede: 'Only projects set to public appear here, newest first. Inside /preview the canvas IS the web — some are playable, some are just design mockups.',
    emptyTitle: 'No world is public yet',
    emptyBody: 'You could be the first. In /studio, sketch one unforgettable scene: one tree, one conversation, one exit — that is enough to ship this moment.',
    ctaCreate: '→ Open Studio and build',
    ctaDiscover: '← Browse /discover',
    entriesHeading: 'Public worlds',
  },
};

/** §WORLD-INDEX `/world`：公开世界廊。还没人公开的哨子也给一张站。 */
export default async function WorldsIndexPage() {
  const locale = await getLocale();
  const c = COPY[locale];
  const rows = await publicWorlds(24).catch(() => []);

  return (
    <main className="wv-shell" data-worlds-root data-worlds-locale={locale}>
      <header className="wv-head">
        <p className="wv-kicker" data-worlds-kicker>{c.kicker}</p>
        <h1 className="wv-title" data-worlds-title>{c.title}</h1>
        <p className="wv-lede" data-worlds-lede>{c.lede}</p>
      </header>

      {rows.length === 0 ? (
        <section className="wv-empty" data-worlds-empty>
          <h2 className="wv-emptyTitle" data-worlds-empty-title>{c.emptyTitle}</h2>
          <p className="wv-emptyBody" data-worlds-empty-body>{c.emptyBody}</p>
          <div className="wv-ctaRow">
            <Link href="/studio" className="wv-cta" data-worlds-cta="studio">{c.ctaCreate}</Link>
            <Link href="/discover" className="wv-ctaAlt" data-worlds-cta="discover">{c.ctaDiscover}</Link>
          </div>
        </section>
      ) : (
        <section className="wv-grid" aria-label={c.entriesHeading} data-worlds-grid>
          <ol className="wv-list">
            {rows.map((row) => (
              <li key={row.projectId} className="wv-card" data-worlds-card={row.projectId}>
                <Link href={`/preview/${row.projectId}`} className="wv-cardLink" data-worlds-card-link={row.projectId}>
                  <h2 className="wv-cardTitle" data-worlds-card-title>{row.projectName}</h2>
                  {row.summary ? <p className="wv-cardSummary" data-worlds-card-summary>{row.summary}</p> : null}
                  {row.ownerHandle ? <p className="wv-cardByline" data-worlds-card-byline>@{row.ownerHandle}</p> : null}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}
