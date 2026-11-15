import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, type Locale } from '@/lib/i18n';
import { BIBLE_CHAPTERS, BIBLE_ECHOES } from '@/world-bible/generated';
import { BibleMarkdown, extractAnchors } from '@/components/BibleMarkdown';

export const dynamic = 'force-dynamic';

/**
 * §BIBLE-1 低语诸王 · 典籍室（`/bible/[slug]` 阅读页）。
 * 正典原文一字不改；锚句中英并排展示（锚句是逐字对齐的那一格，故意不翻译）。
 */

const COPY: Record<Locale, {
  kicker: string;
  breadcrumbAria: string;
  backIndex: string;
  chapterLabel: (order: number) => string;
  echoLabel: (order: number) => string;
  tableRegionAria: string;
  anchorShelfTitle: string;
  anchorShelfNote: string;
  prev: string;
  next: string;
  backIndexFoot: string;
}> = {
  zh: {
    kicker: '低语诸王 · 世界大典',
    breadcrumbAria: '典籍室导航',
    backIndex: '典籍室',
    chapterLabel: (order) => `第${['一', '二', '三', '四'][order - 1] ?? order}章`,
    echoLabel: (order) => `回响 · 其${['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][order - 1] ?? order}`,
    tableRegionAria: '数据表（可横向滚动）',
    anchorShelfTitle: '锚句速览 · 中英并排',
    anchorShelfNote: '锚句是正典里唯一不翻译、不改写、只能逐字对齐的那一格——检索、评测锚、读者定位都靠它。',
    prev: '上一章',
    next: '下一章',
    backIndexFoot: '← 回目录',
  },
  en: {
    kicker: 'The Whispers’ Kings · World Bible',
    breadcrumbAria: 'Canon breadcrumb',
    backIndex: 'The shelf',
    chapterLabel: (order) => `Chapter ${['I', 'II', 'III', 'IV'][order - 1] ?? order}`,
    echoLabel: (order) => `Echo ${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][order - 1] ?? order}`,
    tableRegionAria: 'Data table (horizontally scrollable)',
    anchorShelfTitle: 'Anchor shelf · line by line',
    anchorShelfNote: 'Anchor sentences are the one part of the canon that is never rephrased or paraphrased — retrieval, evaluation and reader bookmarks all stand on them.',
    prev: 'Previous',
    next: 'Next',
    backIndexFoot: '← Back to shelf',
  },
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const chapter = BIBLE_CHAPTERS.find((ch) => ch.slug === slug) ?? BIBLE_ECHOES.find((ch) => ch.slug === slug);
  if (!chapter) return {};
  const isEcho = BIBLE_ECHOES.some((ch) => ch.slug === chapter.slug);
  return {
    title: `${chapter.titleZh} · ${chapter.titleEn} — ${isEcho ? '低语诸王 · 回响' : '低语诸王'}`,
    description: isEcho
      ? '低语诸王 · 世界大典回响篇。/ A Whispers’ Kings echo.'
      : '低语诸王 · 世界大典正典篇章。/ A canonical chapter of The Whispers’ Kings.',
  };
}

export default async function BibleChapterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const locale = await getLocale();
  const c = COPY[locale];
  const { slug } = await params;
  const chapter = BIBLE_CHAPTERS.find((ch) => ch.slug === slug) ?? BIBLE_ECHOES.find((ch) => ch.slug === slug);
  if (!chapter) notFound();

  const isEcho = BIBLE_ECHOES.some((ch) => ch.slug === chapter.slug);
  const realm = isEcho ? BIBLE_ECHOES : BIBLE_CHAPTERS;
  const indexInto = realm.findIndex((ch) => ch.slug === chapter.slug);
  const previous = realm[indexInto - 1] ?? null;
  const next = realm[indexInto + 1] ?? null;
  const title = locale === 'en' ? chapter.titleEn : chapter.titleZh;
  const era = locale === 'en' ? chapter.eraLineEn : chapter.eraLineZh;
  const markdown = locale === 'en' ? chapter.markdownEn : chapter.markdownZh;
  const anchors = extractAnchors(chapter.markdownZh, chapter.markdownEn);
  const label = isEcho ? c.echoLabel(chapter.order) : c.chapterLabel(chapter.order);

  return (
    <main className="bb-root" data-bible-root data-bible-locale={locale}>
      <nav className="bb-breadcrumb" aria-label={c.breadcrumbAria}>
        <Link href="/bible" className="bb-footLink" data-bible-back-index>{c.backIndex}</Link>
        <span className="bb-crumbSep" aria-hidden="true">/</span>
        <span className="bb-crumbCurrent">{label}</span>
      </nav>

      <article data-bible-reader={chapter.slug}>
        <header className="bb-chapterHead">
          <p className="bb-kicker">{c.kicker}</p>
          <h1 className="bb-title">{title}</h1>
          <p className="bb-era" data-bible-era>{era}</p>
        </header>

        <BibleMarkdown markdown={markdown} tableRegionAria={c.tableRegionAria} />

        <section className="bb-anchorShelf" aria-label={c.anchorShelfTitle} data-bible-anchors>
          <h2 className="bb-anchorTitle">{c.anchorShelfTitle}</h2>
          <ol className="bb-anchorList">
            {anchors.map((pair, i) => (
              <li key={i} className="bb-anchorRow">
                <span className="bb-anchorIdx" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                <span className="bb-anchorZh" lang="zh">{pair.zh}</span>
                <span className="bb-anchorEn" lang="en">{pair.en}</span>
              </li>
            ))}
          </ol>
          <p className="bb-anchorNote">{c.anchorShelfNote}</p>
        </section>
      </article>

      <footer className="bb-foot">
        <Link href="/bible" className="bb-footLink" data-bible-back-foot>{c.backIndexFoot}</Link>
        <div className="bb-prevNext">
          {previous ? (
            <Link href={`/bible/${previous.slug}`} className="bb-prevNextLink" data-bible-prev>
              <span aria-hidden="true">←</span> {locale === 'en' ? previous.titleEn.split(':')[0]!.trim() : previous.titleZh} · {c.prev}
            </Link>
          ) : null}
          {next ? (
            <Link href={`/bible/${next.slug}`} className="bb-prevNextLink" data-bible-next>
              {c.next} · {locale === 'en' ? next.titleEn.split(':')[0]!.trim() : next.titleZh} <span aria-hidden="true">→</span>
            </Link>
          ) : null}
        </div>
      </footer>
    </main>
  );
}
