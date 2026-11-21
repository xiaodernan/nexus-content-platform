import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, type Locale } from '@/lib/i18n';
import { BibleSearch } from '@/components/BibleSearch';
import { BIBLE_CHAPTERS, BIBLE_ECHOES } from '@/world-bible/generated';
import { extractAnchors } from '@/components/BibleMarkdown';
const CN_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
function _cnTwoDigit(n: number): string {
  if (n < 10) return CN_DIGITS[n]!;
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  const tensChar = tens === 1 ? '十' : `${CN_DIGITS[tens]}十`;
  return ones === 0 ? tensChar : `${tensChar}${CN_DIGITS[ones]}`;
}
function _cn(n: number): string {
  if (n < 100) return _cnTwoDigit(n);
  const rest = n - 100;
  return rest === 0 ? '一百' : `一百${rest < 10 ? '零' : ''}${_cnTwoDigit(rest)}`;
}

const ROMAN_PAIRS: ReadonlyArray<[number, string]> = [
  [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];
function _roman(n: number): string {
  let out = '';
  let remaining = n;
  for (const [value, symbol] of ROMAN_PAIRS) {
    while (remaining >= value) {
      out += symbol;
      remaining -= value;
    }
  }
  return out;
}

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '典籍室 · World Bible — NEXUS',
  description: '《低语诸王》世界大典 · 全十三章正典，锚句中英字字对齐。/ The thirteen canonical chapters of The Whispers’ Kings, anchor sentences verbatim in both languages.',
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
  askLink: string;
  wellLink: string;
  whisperLink: string;
  oracleLink: string;
  anchorsLink: string;
  chapterLabel: (order: number) => string;
  anchorsLine: (count: number) => string;
  readLink: string;
  discipline: string;
  backGuide: string;
  backDiscover: string;
  threadsLink: string;
}> = {
  zh: {
    kicker: '低语诸王 · 典籍室',
    title: '世界大典 · 十三扇门',
    lede: '《低语诸王》自己的正典——十三章，十三扇门：第五章之后的信路，还留在第十三章里。',
    threeDoors: '第一扇问：海叫什么？ · 第五扇问：谁替潮收下那口气？ · 第八扇问：谁在灰后？ · 第十一扇问：灯下的账？ · 第十三扇问：谁来誊写？',
    playLink: '接受潮汐挑战 →',
    askLink: '问典 →',
    wellLink: '七口井',
    whisperLink: '答问者 · 问点书里的事',
    oracleLink: '问潮 · 潮汐预言',
    anchorsLink: '锚句回放',
    chapterLabel: (order) => `第${['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三'][order - 1] ?? order}章`,
    echoLabel: (order) => `回响 · 其${_cn(order)}`,
    echoTitle: '回响 · Echoes',
    echoLede: '正典之外的侧写——不是续篇，不是错的，只是同一块盐加了另一层纹理。',
    anchorsLine: (count) => `${count} 句锚 · 中英字字对齐`,
    readLink: '开始阅读',
    discipline: '正典由 docs/world-bible/ 维护，任何一句都不经过机器改写；正文原文如下，英译本只是同一故事的另一副嘴。',
    backGuide: '← 用户指南',
    backDiscover: '去广场 →',
    threadsLink: '回响线索索引 →',
  },
  en: {
    kicker: 'The Whispers’ Kings · Canon',
    title: 'The World Bible · thirteen doors',
    lede: 'The Whispers’ Kings’ own canon. Thirteen doors — and at the thirteenth, someone is about to copy the whole thing out, word for word.',
    threeDoors: 'First door: what is the sea called? · Fifth door: who keeps the breath the tide drew in? · Eighth: who walks through the grey? · Eleventh: what is the ledger under the lamp? · Thirteenth: who copies it all out?',
    playLink: 'I accept the Tidal Trial →',
    askLink: 'Ask the Canon →',
    wellLink: 'The Seven Wells',
    whisperLink: 'The Answerer · ask one question of the book',
    oracleLink: 'Ask the tide · The Tide Oracle',
    anchorsLink: 'Anchor Echo',
    chapterLabel: (order) => `Chapter ${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII'][order - 1] ?? order}`,
    echoLabel: (order) => `Echo ${_roman(order)}`,
    echoTitle: 'Echoes',
    echoLede: 'Side-lights beyond the canon — not a sequel, not an error, just another layer of grain on the same salt.',
    anchorsLine: (count) => `${count} anchor sentences · verbatim in both languages`,
    readLink: 'Start reading',
    discipline: 'The canon is maintained in docs/world-bible/; not a single sentence passes through a machine unasked. The English is the same story with the same anchors — no other rephrasing.',
    backGuide: '← User guide',
    backDiscover: 'Go to the plaza →',
    threadsLink: 'Echo threads →',
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
          <span className="bb-playTrialSep" aria-hidden="true">·</span>
          <Link href="/bible/whisper" className="bb-playLink" data-bible-open-whisper>{c.whisperLink}</Link>
          <Link href="/bible/anchors" className="bb-playLink" data-bible-open-anchors>{c.anchorsLink}</Link>
          <Link href="/tide-oracle" className="bb-playLink" data-bible-open-oracle>{c.oracleLink}</Link>
          <Link href="/bible/ask" className="bb-playLink" data-bible-open-ask>{c.askLink}</Link>
          <span className="bb-playTrialSep" aria-hidden="true">·</span>
          <Link href="/bible/well" className="bb-playLink" data-bible-open-well>{c.wellLink}</Link>
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
              <span className="bb-cardNum" aria-hidden="true">{locale === 'en' ? ['I', 'II', 'III', 'IV', 'V'][chapter.order - 1] ?? chapter.order : ['壹', '贰', '叁', '肆', '伍'][chapter.order - 1] ?? chapter.order}</span>
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
                  <span className="bb-cardNum" aria-hidden="true">{locale === 'en' ? _roman(echo.order) : _cn(echo.order)}</span>
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
          <Link href="/bible/threads" className="bb-footLink" data-bible-threads>{c.threadsLink}</Link>
        </div>
      </footer>
    </main>
  );
}
