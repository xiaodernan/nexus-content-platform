'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  buildQuiz,
  verdictFor,
  type QuizNodeInput,
  type QuizRound,
} from '@/lib/quiz';

/**
 * 「谜灯馆」v717 —— 凭记忆为这座世界点灯。
 * 题目全来自世界文档（见 lib/quiz.ts）：答对的不只是分数，是这座世界的回声你有没有在场。
 * 八盏灯的灯廊，点亮几盏，就是几盏。零写库、全客户端，种子由调用方给（可再来一局）。
 */

const 甲乙丙丁 = ['甲', '乙', '丙', '丁'] as const;

export function QuizArcade({
  nodes,
  worldName,
  projectId,
  initialSeed,
}: {
  nodes: QuizNodeInput[];
  worldName: string;
  projectId: string;
  initialSeed: number;
}) {
  const [seed, setSeed] = useState(initialSeed);
  const rounds = useMemo(() => buildQuiz(nodes, seed >>> 0), [nodes, seed]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [marks, setMarks] = useState<Array<'right' | 'wrong'>>([]);
  const done = index >= rounds.length;

  const total = rounds.length;
  const score = marks.filter((m) => m === 'right').length;
  const verdict = verdictFor(score, total);
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
      <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-[#0a0906] px-6 text-center text-[#e8e3d3]" data-quiz-empty>
        <LampIcon className="h-16 w-16 text-[#c9a86a]/60" />
        <h1 className="text-[var(--nexus-font-size-21)] font-semibold text-[#f0e9d8]">谜灯馆暂时无灯可点</h1>
        <p className="max-w-md text-13 leading-6 text-[#a89f85]">这座世界还没有足够的 story / history 条目与记忆回声。先去 Studio 写几笔，谜灯馆才会亮。</p>
        <Link href={`/world/${projectId}/almanac`} className="rounded-md border border-[#c9a86a]/30 px-4 py-2 text-12 text-[#d8cfb6] transition-colors hover:border-[#c9a86a]/70 hover:text-[#f5edd9]">回藏经阁 →</Link>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-[#0a0906] text-[#e8e3d3]" data-quiz-root>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(720px 420px at 50% -6%, rgba(201,168,106,0.16), transparent 55%), radial-gradient(640px 520px at 50% 112%, rgba(201,168,106,0.08), transparent 55%)' }}
      />
      {/* 灯廊（进度） */}
      <header className="relative flex flex-wrap items-center justify-between gap-3 border-b border-[#c9a86a]/10 px-6 py-4">
        <div>
          <p className="font-mono text-10 uppercase tracking-[0.28em] text-[#c9a86a]">THE LANTERN TRIAL · {worldName}</p>
          <h1 className="mt-1 text-[var(--nexus-font-size-21)] font-semibold text-[#f0e9d8]" data-quiz-title>谜灯馆</h1>
        </div>
        <div className="flex items-center gap-1.5" role="img" aria-label={`已点亮 ${score} 盏，共 ${total} 盏`} data-quiz-lanterns>
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
        <section className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-6 py-10" aria-label="谜灯馆题目">
          <p className="font-mono text-10 uppercase tracking-[0.3em] text-[#c9a86a]/80" data-quiz-family>
            {round.family === 'A' ? '回声 · 哪个纪元' : '条目 · 叫什么'} · 第 {index + 1} / {total} 灯
          </p>
          <blockquote
            className="max-w-2xl border-l-2 border-[#c9a86a]/45 pl-5 text-center text-[19px] leading-9 text-[#efe9d6]"
            style={{ fontFamily: "'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'STSong', serif" }}
            data-quiz-prompt
          >
            {round.family === 'A' ? `“${round.prompt}”` : `“${truncate(round.prompt, 140)}”`}
          </blockquote>
          <fieldset className="w-full max-w-2xl">
            <legend className="sr-only">选项</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="四个选项">
              {round.options.map((option, i) => {
                const isAnswer = i === round.answer;
                const locked = picked !== null;
                const tone = !locked
                  ? 'border-[#3a3424] bg-[#131009] text-[#e8e3d3] hover:border-[#c9a86a]/60 hover:bg-[#1a1610]'
                  : isAnswer
                    ? 'border-[#e8d5a4] bg-[#241f10] text-[#f5edd9] shadow-[0_0_28px_rgba(201,168,106,0.25)]'
                    : picked === i
                      ? 'border-[#5a2b2b] bg-[#1d1010] text-[#c98f8f]'
                      : 'border-[#2c2820] bg-[#100e09] text-[#8f887a]';
                return (
                  <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={picked === i}
                    disabled={locked}
                    onClick={() => choose(i)}
                    data-quiz-option={i}
                    className={`flex items-center gap-4 rounded-xl border px-5 py-4 text-left text-15 leading-7 transition-all duration-200 ${tone}`}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#c9a86a]/30 font-mono text-14 text-[#c9a86a]" style={{ fontFamily: "'Noto Serif SC', 'Songti SC', serif" }}>
                      {甲乙丙丁[i]}
                    </span>
                    <span className="leading-7">{option}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div className="flex h-12 items-center">
            {picked !== null ? (
              <button
                type="button"
                onClick={advance}
                autoFocus
                data-quiz-next
                className="rounded-lg border border-[#c9a86a]/40 bg-[#1d1910] px-6 py-2.5 text-13 text-[#e8d5a4] transition-all hover:border-[#c9a86a]/80 hover:bg-[#262115]"
              >
                {index + 1 >= total ? '结算灯廊' : '点亮下一盏灯'} →
              </button>
            ) : (
              <p className="font-mono text-10 text-[#6f6a58]">回声有自己的年份，只是你没听见。</p>
            )}
          </div>
        </section>
      ) : (
        <section className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-6 py-10 text-center" aria-live="polite" data-quiz-verdict-root>
          <BigLantern lit={score} total={total} />
          <p className="font-mono text-10 uppercase tracking-[0.3em] text-[#c9a86a]/80">FINAL TALLY</p>
          <h2 className="text-[56px] font-semibold leading-none text-[#f5edd9]" style={{ fontFamily: "'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', serif" }} data-quiz-verdict-title>
            {verdict.title}
          </h2>
          <p className="max-w-md text-14 leading-7 text-[#c9c2a8]">{verdict.line}</p>
          <p className="font-mono text-12 text-[#c9a86a]">点亮 {score} / {total} 盏灯</p>
          <ol className="max-h-56 w-full max-w-lg space-y-1.5 overflow-y-auto pr-1 text-left">
            {rounds.map((r, i) => {
              const ok = marks[i] === 'right';
              return (
                <li key={r.id} className="flex items-start gap-3 rounded-lg border border-[#241f14] bg-[#100e09]/80 px-3 py-2" data-quiz-recap={i}>
                  <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-10 ${ok ? 'border-[#c9a86a]/60 text-[#e8d5a4]' : 'border-[#5a2b2b] text-[#c98f8f]'}`}>
                    {ok ? '✓' : '✗'}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-12 text-[#d8cfb6]">{truncate(r.prompt, 64)}</span>
                    <span className="mt-0.5 block font-mono text-10 text-[#6f6a58]">出自「{r.sourceTitle.slice(0, 24)}{r.sourceTitle.length > 24 ? '…' : ''}」 · {ok ? '你记得' : '这盏没认出'}</span>
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={replay} data-quiz-replay className="rounded-lg border border-[#c9a86a]/45 bg-[#1d1910] px-6 py-2.5 text-13 text-[#e8d5a4] transition-colors hover:border-[#c9a86a]/85">再入谜灯馆</button>
            <Link href={`/world/${projectId}/almanac`} className="rounded-lg border border-[#2c2820] px-6 py-2.5 text-13 text-[#a89f85] transition-colors hover:border-[#3a3424] hover:text-[#e8e3d3]">回藏经阁 →</Link>
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
    <svg viewBox="0 0 120 150" width="150" height="188" role="img" aria-label="灯廊结算" data-quiz-lantern>
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
