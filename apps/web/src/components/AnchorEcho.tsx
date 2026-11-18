'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Locale } from '@/lib/i18n';
import { BIBLE_ANCHORS } from '@/world-bible/anchors.generated';

/**
 * ──BIBLE-ANCHOR-ECHO 锚句回放（cont. 181）───────────────────────────────
 *
 * 正典里唯一不翻译、不改写的句子逐字回放。看见锚句，选它出自哪一章 / 哪一回响。
 *
 * 纪律：
 *  1. 111 句锚句中英成对，全部逐字来自正典文件（docs/world-bible），
 *     由 scripts/gen-anchor-echo.mts 生成、npm run verify:anchor-echo 字节验证。
 *  2. 不需要 provider、不需要网络；进度只在本机 localStorage（best streak）。
 *  3. 选择题：正确 1 分，错了不计——锚句不差这一口气。
 */

const ROUNDS = 8;

const COPY = {
  zh: {
    kicker: '锚句回放',
    title: '你认得出这一句是谁说的吗',
    lede: '正典里唯一不翻译、不改写的句子，逐字回放。看见它，选它出自哪一章、哪一回响。',
    questionLabel: (i: number, n: number) => `第 ${i} / ${n} 句`,
    chooseHint: '这一句出自——',
    correct: '对了。它就是这一句。',
    wrong: (ref: string) => `错了。它出自${ref}。`,
    next: '下一句',
    finish: '看成绩',
    score: '本轮得分',
    best: '历史最佳',
    streak: '连对',
    restart: '再来一局',
    shelfLink: '去典籍室读',
    quizLink: '去潮汐挑战',
    streakLabel: (n: number) => `连对 ${n}`,
    verdicts: [
      { at: 0, text: '潮汐边缘', note: '先去读完正典的每一页，再来认这些句子。' },
      { at: 2, text: '半路的守门人', note: '你已经能闻见盐味，但还没记住灯灭的那一页。' },
      { at: 4, text: '巡逻路常客', note: '许多句子你已经认得，剩下的只是记性。' },
      { at: 6, text: '账本之后的人', note: '你读到了账合之后，还知道是谁开的门。' },
      { at: 7, text: '灯前的人', note: '只差一句，你就认得全部。' },
      { at: 8, text: '锚句守门人', note: '每一句锚句都对得上——你，就是正典本身。' },
    ],
    footer: '锚句是正典里唯一不能改写的句子——你选错，就回去精读那一章。',
    scoreLine: (n: number, total: number) => `${n} / ${total}`,
  },
  en: {
    kicker: 'Anchor Echo',
    title: 'Can you tell which page said this?',
    lede: 'The one class of sentence the canon never rephrases, replayed word-for-word. See it; name the chapter or echo it came from.',
    questionLabel: (i: number, n: number) => `Line ${i} / ${n}`,
    chooseHint: 'This one belongs to —',
    correct: 'Correct. It is that one.',
    wrong: (ref: string) => `Wrong. It belongs to ${ref}.`,
    next: 'Next line',
    finish: 'See the tally',
    score: 'Score this round',
    best: 'Best so far',
    streak: 'Streak',
    restart: 'Another round',
    shelfLink: 'Read the shelf',
    quizLink: 'The Tidal Trial',
    streakLabel: (n: number) => `streak ${n}`,
    verdicts: [
      { at: 0, text: 'At the tide’s edge', note: 'Read every page of the canon first — then come back for these lines.' },
      { at: 2, text: 'A doorkeeper halfway in', note: 'You can smell the salt, but not yet the page where the lamp went out.' },
      { at: 4, text: 'A regular of the patrol road', note: 'You already know many lines; the rest is only memory.' },
      { at: 6, text: 'Someone after the ledger closed', note: 'You read past the closing, and you know who opened the door.' },
      { at: 7, text: 'Standing before the lamp', note: 'One line away from knowing them all.' },
      { at: 8, text: 'Keeper of the anchors', note: 'Every anchor sentence came straight back at you — you are the canon.' },
    ],
    footer: 'The anchors are the one class of sentence the canon cannot paraphrase — if you choose wrong, go re-read that chapter.',
    scoreLine: (n: number, total: number) => `${n} / ${total}`,
  },
} as const;

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(arr: readonly T[], seed: number): T[] {
  const a = [...arr];
  const rand = mulberry32(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function AnchorEcho({ locale }: { locale: Locale }) {
  const c = COPY[locale];
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 0xffffffff));
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [done, setDone] = useState(false);
  const [best, setBest] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('nexus.anchorEcho.best');
      setBest(raw ? Number(raw) : null);
    } catch {
      setBest(null);
    }
  }, []);

  const deck = useMemo(() => shuffle(BIBLE_ANCHORS, seed).slice(0, ROUNDS), [seed]);
  const question = deck[index];
  const correctRef = question ? (locale === 'zh' ? question.refZh : question.refEn) : '';

  const options = useMemo(() => {
    if (!question) return [];
    const pool = [...new Set(BIBLE_ANCHORS.map((a) => (locale === 'zh' ? a.refZh : a.refEn)))];
    const distractors = shuffle(pool.filter((r) => r !== correctRef), seed ^ (index + 1) * 7919).slice(0, 3);
    return shuffle([correctRef, ...distractors], seed ^ (index + 1) * 104729);
  }, [question, locale, seed, index, correctRef]);

  const isCorrect = picked !== null && picked === correctRef;
  const last = index + 1 >= deck.length;

  function choose(option: string) {
    if (picked) return;
    setPicked(option);
    if (option === correctRef) {
      setScore((s) => s + 1);
      setStreak((s) => s + 1);
    } else {
      setStreak(0);
    }
  }

  function advance() {
    if (!picked) return;
    if (last) {
      setDone(true);
      setBest((b) => {
        const finalScore = score;
        const next = b === null || finalScore > b ? finalScore : b;
        try {
          window.localStorage.setItem('nexus.anchorEcho.best', String(next));
        } catch {
          /* localStorage 不可用时，放弃记忆——游戏不强制 */
        }
        return next;
      });
      return;
    }
    setIndex((i) => i + 1);
    setPicked(null);
  }

  function restart() {
    setSeed(Math.floor(Math.random() * 0xffffffff));
    setIndex(0);
    setPicked(null);
    setScore(0);
    setStreak(0);
    setDone(false);
  }

  if (done) {
    const verdict = [...c.verdicts].reverse().find((v) => score >= v.at) ?? c.verdicts[0]!;
    return (
      <section className="ae-root" data-anchor-echo-root data-anchor-echo-done>
        <p className="ae-kicker">{c.kicker}</p>
        <h1 className="ae-title">{c.scoreLine(score, ROUNDS)}</h1>
        <p className="ae-verdict" data-anchor-echo-verdict>
          <strong>{verdict.text}</strong> · {verdict.note}
        </p>
        <p className="ae-best" data-anchor-echo-best>
          {c.best}: {best ?? score} / {ROUNDS}
        </p>
        <div className="ae-endRow">
          <button type="button" className="ae-restart" data-anchor-echo-restart onClick={restart}>
            {c.restart}
          </button>
          <Link className="ae-link" href="/bible">{c.shelfLink}</Link>
          <Link className="ae-link" href="/bible/quiz">{c.quizLink}</Link>
        </div>
      </section>
    );
  }

  if (!question) return null;

  return (
    <section className="ae-root" data-anchor-echo-root>
      <header className="ae-head">
        <p className="ae-kicker">{c.kicker}</p>
        <h1 className="ae-title">{c.title}</h1>
        <p className="ae-lede">{c.lede}</p>
        <div className="ae-meta">
          <span className="ae-questionNo">{c.questionLabel(index + 1, ROUNDS)}</span>
          <span className="ae-streak" data-anchor-echo-streak>{c.streakLabel(streak)}</span>
        </div>
      </header>

      <ol className="ae-progress" aria-hidden="true">
        {deck.map((_, i) => (
          <li key={i} className={i < index ? 'ae-dotDone' : i === index ? 'ae-dotCurrent' : 'ae-dot'} />
        ))}
      </ol>

      <blockquote className="ae-line" data-anchor-echo-question>
        <p className="ae-lineText">{locale === 'zh' ? question.zh : question.en}</p>
      </blockquote>

      <p className="ae-chooseHint">{c.chooseHint}</p>
      <ul className="ae-options" data-anchor-echo-options>
        {options.map((option) => {
          const optionCorrect = option === correctRef;
          const chosen = picked === option;
          const cls = picked
            ? optionCorrect
              ? 'ae-option ae-optionCorrect'
              : chosen
                ? 'ae-option ae-optionWrong'
                : 'ae-option ae-optionDim'
            : 'ae-option';
          return (
            <li key={option}>
              <button type="button" className={cls} data-anchor-echo-option={option} disabled={picked !== null} onClick={() => choose(option)}>
                {option}
              </button>
            </li>
          );
        })}
      </ul>

      {picked !== null ? (
        <div className="ae-feedback" data-anchor-echo-feedback>
          <p className={isCorrect ? 'ae-correct' : 'ae-wrong'}>{isCorrect ? c.correct : c.wrong(correctRef)}</p>
          <button type="button" className="ae-next" data-anchor-echo-next onClick={advance}>
            {last ? c.finish : c.next}
          </button>
        </div>
      ) : null}

      <footer className="ae-foot">
        <p className="ae-footNote">{c.footer}</p>
      </footer>
    </section>
  );
}
