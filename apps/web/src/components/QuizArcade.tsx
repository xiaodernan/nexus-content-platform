'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  buildQuiz,
  verdictFor,
  type QuizNodeInput,
  type QuizRound,
} from '@/lib/quiz';
import type { Locale } from '@/lib/i18n';

/**
 * 「谜灯馆」v717 —— 凭记忆为这座世界点灯。
 * 题目全来自世界文档（见 lib/quiz.ts）：答对的不只是分数，是这座世界的回声你有没有在场。
 * 八盏灯的灯廊，点亮几盏，就是几盏。零写库、全客户端，种子由调用方给（可再来一局）。
 * 全站双语（v733）：locale 由 RSC 透传，COPY 中英一辞两字面，不夹杂。
 */

const COPY: Record<Locale, {
  emptyTitle: string;
  emptyCopy: string;
  backToAlmanac: string;
  kicker: (worldName: string) => string;
  title: string;
  familyA: string;
  familyB: string;
  lanternUnit: (index: number, total: number) => string;
  letters: readonly string[];
  optionsLegend: string;
  optionsAria: string;
  nextButton: (index: number, total: number) => string;
  waitingHint: string;
  finalTally: string;
  litCount: (score: number, total: number) => string;
  recapSource: (sourceTitle: string, ok: boolean) => string;
  replay: string;
  almanacBack: string;
  litAria: (score: number, total: number) => string;
}> = {
  zh: {
    emptyTitle: '谜灯馆暂时无灯可点',
    emptyCopy: '这座世界还没有足够的 story / history 条目与记忆回声。先去 Studio 写几笔，谜灯馆才会亮。',
    backToAlmanac: '回藏经阁 →',
    kicker: (worldName) => `THE LANTERN TRIAL · ${worldName}`,
    title: '谜灯馆',
    familyA: '回声 · 哪个纪元',
    familyB: '条目 · 叫什么',
    lanternUnit: (index, total) => ` · 第 ${index + 1} / ${total} 灯`,
    letters: ['甲', '乙', '丙', '丁'],
    optionsLegend: '选项',
    optionsAria: '四个选项',
    nextButton: (index, total) => (index + 1 >= total ? '结算灯廊' : '点亮下一盏灯') + ' →',
    waitingHint: '回声有自己的年份，只是你没听见。',
    finalTally: 'FINAL TALLY',
    litCount: (score, total) => `点亮 ${score} / ${total} 盏灯`,
    recapSource: (sourceTitle, ok) => `出自「${sourceTitle}」 · ${ok ? '你记得' : '这盏没认出'}`,
    replay: '再入谜灯馆',
    almanacBack: '回藏经阁 →',
    litAria: (score, total) => `已点亮 ${score} 盏，共 ${total} 盏`,
  },
  en: {
    emptyTitle: 'No lanterns to light yet',
    emptyCopy: 'This world does not have enough story / history entries and memory echoes yet. Write a few in Studio, and the Lantern House will light.',
    backToAlmanac: 'Back to the Almanac →',
    kicker: (worldName) => `THE LANTERN TRIAL · ${worldName}`,
    title: 'Lantern House',
    familyA: 'Echo · which era',
    familyB: 'Entry · what is it called',
    lanternUnit: (index, total) => ` · lantern ${index + 1} of ${total}`,
    letters: ['A', 'B', 'C', 'D'],
    optionsLegend: 'Options',
    optionsAria: 'Four options',
    nextButton: (index, total) => (index + 1 >= total ? 'Final Tally' : 'Light the next lantern') + ' →',
    waitingHint: 'Echoes keep their own years — you just never heard them.',
    finalTally: 'FINAL TALLY',
    litCount: (score, total) => `${score} of ${total} lanterns lit`,
    recapSource: (sourceTitle, ok) => `from “${sourceTitle}” · ${ok ? 'you remembered' : 'this one slipped past you'}`,
    replay: 'Re-enter the Lantern House',
    almanacBack: 'Back to the Almanac →',
    litAria: (score, total) => `${score} of ${total} lanterns lit`,
  },
};

export function QuizArcade({
  nodes,
  worldName,
  projectId,
  initialSeed,
  locale = 'zh',
}: {
  nodes: QuizNodeInput[];
  worldName: string;
  projectId: string;
  initialSeed: number;
  locale?: Locale;
}) {
  const c = COPY[locale];
  const [seed, setSeed] = useState(initialSeed);
  const rounds = useMemo(() => buildQuiz(nodes, seed >>> 0), [nodes, seed]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [marks, setMarks] = useState<Array<'right' | 'wrong'>>([]);
  const done = index >= rounds.length;

  const total = rounds.length;
  const score = marks.filter((m) => m === 'right').length;
  const verdict = verdictFor(score, total, locale);
  const round: QuizRound | undefined = done ? undefined : rounds[index];

  const choose = (i: number) => {
    if (!round || picked !== null) return;
    setPicked(i);
  };
  const advance = () => {
    if (!round || picked === null) return;
    setMarks((m) => [...m, picked === round.answer ? 'right' : 'wrong']);
    setPicked(null);
    setIndex((n) => n + 1);
  };
  const replay = () => {
    setSeed((Date.now() % 0xffffffff) >>> 0);
    setIndex(0);
    setPicked(null);
    setMarks([]);
  };

  if (total === 0) {
    return (
      <main className="qaz-empty" data-quiz-empty>
        <LampIcon className="qaz-lampIcon" />
        <h1 className="qaz-emptyTitle">{c.emptyTitle}</h1>
        <p className="qaz-emptyCopy">{c.emptyCopy}</p>
        <Link href={`/world/${projectId}/almanac`} className="qaz-backLink">{c.backToAlmanac}</Link>
      </main>
    );
  }

  return (
    <main className="qaz-root" data-quiz-root>
      <div
        aria-hidden="true"
        className="qaz-glow"
        style={{ background: 'radial-gradient(720px 420px at 50% -6%, rgba(201,168,106,0.16), transparent 55%), radial-gradient(640px 520px at 50% 112%, rgba(201,168,106,0.08), transparent 55%)' }}
      />
      <header className="qaz-head">
        <div>
          <p className="qaz-kicker">{c.kicker(worldName)}</p>
          <h1 className="qaz-title" data-quiz-title>{c.title}</h1>
        </div>
        <div className="qaz-lanterns" role="img" aria-label={c.litAria(score, total)} data-quiz-lanterns>
          {Array.from({ length: total }, (_, i) => (
            <LampMini
              key={i}
              lit={marks[i] === 'right'}
              failed={marks[i] === 'wrong'}
              current={i === index && !done}
            />
          ))}
        </div>
      </header>

      {!done && round ? (
        <section className="qaz-stage" aria-label={c.title}>
          <p className="qaz-family" data-quiz-family>
            {round.family === 'A' ? c.familyA : c.familyB}{c.lanternUnit(index, total)}
          </p>
          <blockquote
            className="qaz-prompt"
            style={{ fontFamily: "'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'STSong', serif" }}
            data-quiz-prompt
          >
            {round.family === 'A' ? `“${round.prompt}”` : `“${truncate(round.prompt, 140)}”`}
          </blockquote>
          <fieldset className="qaz-options">
            <legend className="qaz-srOnly">{c.optionsLegend}</legend>
            <div className="qaz-optionGrid" role="radiogroup" aria-label={c.optionsAria}>
              {round.options.map((option, i) => {
                const isAnswer = i === round.answer;
                const locked = picked !== null;
                const tone = !locked
                  ? 'qaz-optionIdle'
                  : isAnswer
                    ? 'qaz-optionRight'
                    : picked === i
                      ? 'qaz-optionPicked'
                      : 'qaz-optionDim';
                return (
                  <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={picked === i}
                    disabled={locked}
                    onClick={() => choose(i)}
                    data-quiz-option={i}
                    className={`qaz-option ${tone}`}
                  >
                    <span className="qaz-seal" style={{ fontFamily: "'Noto Serif SC', 'Songti SC', serif" }}>
                      {c.letters[i]}
                    </span>
                    <span className="qaz-optionText">{option}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div className="qaz-footer">
            {picked !== null ? (
              <button
                type="button"
                onClick={advance}
                autoFocus
                data-quiz-next
                className="qaz-next"
              >
                {c.nextButton(index, total)}
              </button>
            ) : (
              <p className="qaz-hint">{c.waitingHint}</p>
            )}
          </div>
        </section>
      ) : (
        <section className="qaz-verdict" aria-live="polite" data-quiz-verdict-root>
          <BigLantern lit={score} total={total} />
          <p className="qaz-family">{c.finalTally}</p>
          <h2 className="qaz-verdictTitle" style={{ fontFamily: "'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', serif" }} data-quiz-verdict-title>
            {verdict.title}
          </h2>
          <p className="qaz-verdictLine">{verdict.line}</p>
          <p className="qaz-tally">{c.litCount(score, total)}</p>
          <ol className="qaz-recap">
            {rounds.map((r, i) => {
              const ok = marks[i] === 'right';
              return (
                <li key={r.id} className="qaz-recapItem" data-quiz-recap={i}>
                  <span className={`qaz-recapMark ${ok ? 'qaz-recapMarkRight' : 'qaz-recapMarkWrong'}`}>
                    {ok ? '✓' : '✗'}
                  </span>
                  <span className="qaz-recapBody">
                    <span className="qaz-recapPrompt">{truncate(r.prompt, 64)}</span>
                    <span className="qaz-recapSource">{c.recapSource(`${r.sourceTitle.slice(0, 24)}${r.sourceTitle.length > 24 ? '…' : ''}`, ok)}</span>
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="qaz-actions">
            <button type="button" onClick={replay} data-quiz-replay className="qaz-next">{c.replay}</button>
            <Link href={`/world/${projectId}/almanac`} className="qaz-ghostLink">{c.almanacBack}</Link>
          </div>
        </section>
      )}
    </main>
  );
}

const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}…` : s);

function LampMini({ lit, failed, current }: { lit: boolean; failed?: boolean; current: boolean }) {
  const stroke = failed ? '#6b3a3a' : '#c9a86a';
  return (
    <svg viewBox="0 0 20 26" width="20" height="26" aria-hidden="true" className={current ? 'animate-pulse' : undefined}>
      <g fill={lit ? '#e8d5a4' : '#221f14'} stroke={stroke} strokeOpacity={lit ? 1 : 0.5} strokeWidth="1.1">
        <path d="M7 2 h6 v2 h-6 z M5.5 5 h9 l1.2 3.5 a6.2 6.2 0 0 1 1.3 3.9 7 7 0 0 1 -14 0 6.2 6.2 0 0 1 1.3 -3.9 z M6.5 22.5 h7 v1.5 h-7 z" />
      </g>
      {lit ? <circle cx="10" cy="13.2" r="2.1" fill="#f5edd9" /> : null}
    </svg>
  );
}

function BigLantern({ lit, total }: { lit: number; total: number }) {
  const ratio = total === 0 ? 0 : lit / total;
  const glow = 0.25 + ratio * 0.75;
  return (
    <svg viewBox="0 0 120 150" width="150" height="188" role="img" aria-label="Lantern tally" data-quiz-lantern>
      <defs>
        <radialGradient id="quiz-glow" cx="50%" cy="44%" r="55%">
          <stop offset="0%" stopColor="#f5edd9" stopOpacity={glow} />
          <stop offset="100%" stopColor="#f5edd9" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="66" r="58" fill="url(#quiz-glow)" />
      <g stroke="#c9a86a" strokeOpacity="0.85" strokeWidth="2.4" fill="#14110a" strokeLinejoin="round">
        <path d="M46 12 h28 v8 h-28 z" />
        <path d="M38 24 h44 l7 12 v44 a29 29 0 0 1 -58 0 v-44 z" />
        <path d="M44 134 h32 v6 h-32 z" />
      </g>
      <g stroke="#e8d5a4" strokeOpacity="0.9" strokeWidth="1.6" fill="none">
        <path d="M60 60 c-6 7 -6 14 0 20 c6 -6 6 -13 0 -20 z" />
        <path d="M60 66 c-3.4 4 -3.4 8.4 0 12 c3.4 -3.6 3.4 -8 0 -12 z" fill="#e8d5a4" fillOpacity={0.5 + ratio * 0.5} stroke="none" />
      </g>
    </svg>
  );
}

function LampIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 56" className={className} fill="none" aria-hidden="true">
      <path d="M17 4 h14 M20 4 v6 M28 4 v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M13 12 h22 l4 8 v16 a15 15 0 0 1 -30 0 v-16 z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M18 48 h12 v4 h-12 z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
