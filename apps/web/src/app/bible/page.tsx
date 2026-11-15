import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, type Locale } from '@/lib/i18n';
import { BibleSearch } from '@/components/BibleSearch';
import { BIBLE_CHAPTERS, BIBLE_ECHOES } from '@/world-bible/generated';
import { extractAnchors } from '@/components/BibleMarkdown';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '典籍室 · World Bible — NEXUS',
  description: '《低语诸王》世界大典 · 全四章正典，锚句中英字字对齐。/ Four canonical chapters of The Whispers’ Kings, anchor sentences verbatim in both languages.',
};

/**
 * §BIBLE-1 低语诸王 · 典籍室（`/bible` 目录页）。
 *
 * 与 `/guide` 分工：手册教用户怎么玩平台，典籍室陈列这个宇宙自己的正典文字。
 * 正典原文一字不改（`docs/world-bible/` 是唯一真值），本页只是它的门面。
 */

const COPY: Record<Locale, {
  kicker: string;
  title: string;
  lede: string;
  echoLabel: (order: number) => string;
  echoTitle: string;
  echoLede: string;
  threeDoors: string;
  playLink: string;
  chapterLabel: (order: number) => string;
  anchorsLine: (count: number) => string;
  readLink: string;
  discipline: string;
  backGuide: string;
  backDiscover: string;
}> = {
  zh: {
    kicker: '低语诸王 · 典籍室',
    title: '世界大典 · 四扇门',
    lede: '《低语诸王》自己的正典——四章，四扇门：第三章之后，第四盏灯终于亮回来了。',
    threeDoors: '第一扇问：海叫什么？ · 第二扇问：谁在还？ · 第三扇问：还完之后？ · 第四扇：灯已经点过了。',
    playLink: '接受潮汐挑战 →',
    chapterLabel: (order) => `第${['一', '二', '三', '四'][order - 1] ?? order}章`,
    echoLabel: (order) => `回响 · 其${['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][order - 1] ?? order}`,
    echoTitle: '回响 · Echoes',
    echoLede: '正典之外的侧写——不是续篇，不是错的，只是同一块盐加了另一层纹理。',
    anchorsLine: (count) => `${count} 句锚 · 中英字字对齐`,
    readLink: '开始阅读',
    discipline: '正典由 docs/world-bible/ 维护，任何一句都不经过机器改写；正文原文如下，英译本只是同一故事的另一副嘴。',
    backGuide: '← 用户指南',
    backDiscover: '去广场 →',
  },
  en: {
    kicker: 'The Whispers’ Kings · Canon',
    title: 'The World Bible · four doors',
    lede: 'The Whispers’ Kings’ own canon. Four doors — and at the fourth, at last, the lamp is lit.',
    threeDoors: 'First door: what is the sea called? · Second: who pays? · Third: after the ending? · Fourth: the lamp has been lit.',
    playLink: 'I accept the Tidal Trial →',
    chapterLabel: (order) => `Chapter ${['I', 'II', 'III', 'IV'][order - 1] ?? order}`,
    echoLabel: (order) => `Echo ${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][order - 1] ?? order}`,
    echoTitle: 'Echoes',
    echoLede: 'Side-lights beyond the canon — not a sequel, not an error, just another layer of grain on the same salt.',
    anchorsLine: (count) => `${count} anchor sentences · verbatim in both languages`,
    readLink: 'Start reading',
    discipline: 'The canon is maintained in docs/world-bible/; not a single sentence passes through a machine unasked. The English is the same story with the same anchors — no other rephrasing.',
    backGuide: '← User guide',
    backDiscover: 'Go to the plaza →',
  },
};

export default async function BiblePage() {
  const locale = await getLocale();
  const c = COPY[locale];

  return (
    <main className="bb-root" data-bible-root data-bible-locale={locale}>
      <header className="bb-hero">
        <p className="bb-kicker">{c.kicker}</p>
        <h1 className="bb-title">{c.title}</h1>
        <p className="bb-lede">{c.lede}</p>
        <p className="bb-threeDoors" data-bible-doors>{c.threeDoors}</p>
        <p className="bb-playTrial">
          <Link href="/bible/quiz" className="bb-playLink" data-bible-open-quiz>{c.playLink}</Link>
        </p>
        <BibleSearch locale={locale} />
      </header>

      <ol className="bb-chapterList" data-bible-chapters>
        {BIBLE_CHAPTERS.map((chapter) => {
          const title = locale === 'en' ? chapter.titleEn : chapter.titleZh;
          const era = locale === 'en' ? chapter.eraLineEn : chapter.eraLineZh;
          const anchors = extractAnchors(chapter.markdownZh, chapter.markdownEn).length;
          return (
            <li key={chapter.slug} className="bb-card" data-bible-card={chapter.slug}>
              <span className="bb-cardNum" aria-hidden="true">{['壹', '贰', '叁', '肆'][chapter.order - 1] ?? chapter.order}</span>
              <div className="bb-cardBody">
                <p className="bb-cardChapter">{c.chapterLabel(chapter.order)}</p>
                <h2 className="bb-cardTitle">{title}</h2>
                <p className="bb-cardEra">{era}</p>
                <p className="bb-cardAnchors" data-bible-anchor-count>
                  {c.anchorsLine(anchors)}
                </p>
              </div>
              <Link href={`/bible/${chapter.slug}`} className="bb-cardLink" data-bible-open={chapter.slug}>
                {c.readLink} <span aria-hidden="true">→</span>
              </Link>
            </li>
          );
        })}
      </ol>

      {BIBLE_ECHOES.length > 0 ? (
        <>
          <header className="bb-echoHead">
            <h2 className="bb-echoTitle">{c.echoTitle}</h2>
            <p className="bb-echoLede">{c.echoLede}</p>
          </header>
          <ol className="bb-chapterList" data-bible-echoes>
            {BIBLE_ECHOES.map((echo) => {
              const title = locale === 'en' ? echo.titleEn : echo.titleZh;
              const era = locale === 'en' ? echo.eraLineEn : echo.eraLineZh;
              const anchors = extractAnchors(echo.markdownZh, echo.markdownEn).length;
              return (
                <li key={echo.slug} className="bb-card" data-bible-echo={echo.slug}>
                  <span className="bb-cardNum" aria-hidden="true">{['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][echo.order - 1] ?? echo.order}</span>
                  <div className="bb-cardBody">
                    <p className="bb-cardChapter">{c.echoLabel(echo.order)}</p>
                    <h2 className="bb-cardTitle">{title}</h2>
                    <p className="bb-cardEra">{era}</p>
                    <p className="bb-cardAnchors" data-bible-anchor-count>
                      {c.anchorsLine(anchors)}
                    </p>
                  </div>
                  <Link href={`/bible/${echo.slug}`} className="bb-cardLink" data-bible-open-echo={echo.slug}>
                    {c.readLink} <span aria-hidden="true">→</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </>
      ) : null}

      <footer className="bb-foot">
        <p className="bb-footNote">{c.discipline}</p>
        <div className="bb-footLinks">
          <Link href="/guide" className="bb-footLink" data-bible-back-guide>{c.backGuide}</Link>
          <Link href="/discover" className="bb-footLink" data-bible-back-discover>{c.backDiscover}</Link>
        </div>
      </footer>
    </main>
  );
}
