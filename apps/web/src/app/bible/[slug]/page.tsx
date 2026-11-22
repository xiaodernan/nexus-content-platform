import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, type Locale } from '@/lib/i18n';
import { BIBLE_CHAPTERS, BIBLE_ECHOES } from '@/world-bible/generated';
import { BibleMarkdown, extractAnchors } from '@/components/BibleMarkdown';
import { ChapterDigest } from '@/components/ChapterDigest';
import { TideWitness } from '@/components/TideWitness';
import { buildEchoThreads, echoThreadNeighbours } from '@/lib/echoThreads';

export const dynamic = 'force-dynamic';

/** 每条线索在阅读页最多列几篇邻居。潮候院那种 189 篇的线索列全了会把正文挤到看不见。 */
const MAX_THREAD_ECHOES = 12;

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
  threadsTitle: string;
  threadsLede: (n: number) => string;
  threadsEmpty: string;
  othersLabel: (n: number) => string;
  moreOthers: (n: number) => string;
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
    threadsTitle: '顺藤摸瓜 · 同线索的回响',
    threadsLede: (n) => `这一篇压在 ${n} 条线索上。每条线索上的其它回响都在下面——读完一篇不必回目录，顺着一条线就能走到没读过的地方。`,
    threadsEmpty: '这一篇没有命中任何一条线索（不是无关，是线索表还没覆盖到它）。',
    othersLabel: (n) => `另有 ${n} 篇`,
    moreOthers: (n) => `还有 ${n} 篇没列全`,
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
    threadsTitle: 'Follow the thread · echoes on the same line',
    threadsLede: (n) => `This echo sits on ${n} threads. The other echoes on each one are below — you do not have to go back to the shelf; a thread carries you somewhere unread.`,
    threadsEmpty: 'This echo matches no thread (not unrelated — the motif table simply does not cover it yet).',
    othersLabel: (n) => `${n} more`,
    moreOthers: (n) => `${n} more not listed`,
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
  // 同线索邻居：全量表现算一次（纯函数，零 provider），只给回响页用
  const neighbours = echoThreadNeighbours(buildEchoThreads(BIBLE_ECHOES), chapter.order, BIBLE_ECHOES);

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

        <TideWitness slug={chapter.slug} locale={locale} order={chapter.order} />

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

        <ChapterDigest slug={chapter.slug} locale={locale} />
      </article>

      {isEcho ? (
        <section className="bb-threads" aria-label={c.threadsTitle} data-bible-threads>
          <h2 className="bb-threadsTitle">{c.threadsTitle}</h2>
          {neighbours.threads.length === 0 ? (
            <p className="bb-threadsEmpty">{c.threadsEmpty}</p>
          ) : (
            <>
              <p className="bb-threadsLede">{c.threadsLede(neighbours.threads.length)}</p>
              <ul className="bb-threadList">
                {neighbours.threads.map((t) => (
                  <li key={t.id} className="bb-thread" data-bible-thread={t.id}>
                    <p className="bb-threadHead">
                      <span className="bb-threadLabel">{locale === 'en' ? t.labelEn : t.labelZh}</span>
                      <span className="bb-threadOthers">{c.othersLabel(t.others.length)}</span>
                    </p>
                    <ul className="bb-threadEchoes">
                      {t.others.slice(0, MAX_THREAD_ECHOES).map((o) => (
                        <li key={o.order} className="bb-threadEcho">
                          <Link href={`/bible/${o.slug}`} className="bb-threadEchoLink" data-bible-thread-open={o.order}>
                            <span className="bb-threadEchoNum">{c.echoLabel(o.order)}</span>
                            <span className="bb-threadEchoName">{locale === 'en' ? o.titleEn : o.titleZh}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                    {t.others.length > MAX_THREAD_ECHOES ? (
                      <p className="bb-threadMore">{c.moreOthers(t.others.length - MAX_THREAD_ECHOES)}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      ) : null}

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
