'use client';

import { useState } from 'react';
import { useEffect } from 'react';
import Link from 'next/link';
import type { Locale } from '@/lib/i18n';
import { BIBLE_MARGINS } from '@/world-bible/margins.generated';

/** 一局猜几对。页边存量还小（5 条），一局 3 对就够，不硬凑。 */
const ROUND_PAIRS = 3;

type Pair = { top: number; bottom: number };

/** 从现存页边里挑一对出来猜（确定性：同一天同一份数据，先后两局的题一样）。 */
function pickPairs(count: number, total: number): Pair[] {
  if (total < 2) return [];
  const pairs: Pair[] = [];
  let seed = 0x2f6e2b1;
  const next = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed;
  };
  const used = new Set<number>();
  while (pairs.length < Math.min(count, Math.floor(total / 2)) && used.size < total) {
    const a = next() % total;
    const b = next() % total;
    if (a === b || used.has(a) || used.has(b)) continue;
    used.add(a);
    used.add(b);
    pairs.push({ top: a, bottom: b });
  }
  return pairs;
}

/**
 * ──BIBLE-MARGINS · 正典「页边批注」（2026-11-22 新模块）──────────────────
 *
 * 抄本师写在页边的话：不属于正文、不进名册、也不算进任何一道。它们逐字来自
 * `docs/world-bible/echoes/` 里以「> 页边：」开头的行，由 scripts/gen-margins.mts
 * 生成（slug 与 gen-bible-snapshot.mts 的 ECHO_WEB_SLUGS 同源，指向真实存在的回响页）。
 *
 * 玩法有三件：① 先读这句话，再决定要不要知道它出自哪一回响；
 * ② 「猜长短」——按 E214 写的那条次序（放得多的沉底、放得少的浮起；没有日期，
 * 后来的几乎一样短）猜哪张纸条压在哪张上面。猜的是**故事里的次序**，不是真的在量
 * 字符串字节——界面上把这一点写明，不装作在测字节；
 * ③ 「取一张出来」——E217《有人从页边取走了一张》说：取出来可以，放回去要轻；页边不记谁动过它。
 * 所以界面允许把一条页边抽出来看（它从队列里淡出，位置留给空），
 * 也允许原样放回（回到**原来的位置**，不是队列末尾——那正是 E217 第一条纸条做的事）。
 * 纪律：不需要 provider、不需要网络；没有任何计数器冒充"读过的人数"；
 * 抽出来的纸条不删除、不进数据库，刷新页面即归位。
 */

const COPY = {
  zh: {
    kicker: '典籍室 · 第四个角落',
    title: '页边批注',
    lede: '抄本师写在页边的话——不属于正文、不进名册、也不算进任何一道。先读这句话，再决定要不要知道它出自哪里。',
    count: (n: number) => `现存 ${n} 条`,
    reveal: '它出自哪一回响？',
    hide: '收起',
    revealed: (n: number, total: number) => `已翻看 ${n} / ${total}`,
    empty: '还没有人往页边写过什么——等下一道回响。',
    back: '← 回典籍室',
    anchorsLink: '去锚句回放',
    gameKicker: '页边小玩 · 猜长短',
    gameTitle: '哪张纸条压在哪张上面',
    gameLede: 'E214 说：放得多的沉底，放得少的浮起；没有日期，后来的几乎一样短。按故事里的次序猜——不是真的在量字节。',
    gameStart: '开始猜',
    gameAgain: '再来一局',
    gamePick: '哪一张在下面？',
    gameUnder: '在下面（被压住）',
    gameOver: '在上面（浮着）',
    gameRight: '对了。页边自己就是这么排的。',
    gameWrong: '错了。页边自己会排；人排的不算。',
    gameScore: (n: number, total: number) => `猜对 ${n} / ${total}`,
    gameBest: '本机最好成绩',
    takeOut: '取一张出来',
    putBack: '放回原处',
    takenOut: (n: number) => `取出 ${n} 张`,
    takeOutNote: 'E217：取出来可以，放回去要轻；页边不记谁动过它。放回时它回到原来的位置，不是末尾。',
    crumb: '低语诸王 · 典籍室',
  },
  en: {
    kicker: 'The shelf · a fourth corner',
    title: 'Margins of the Canon',
    lede: 'What the copyists wrote in the margins — not the body, not the register, not counted into any mark. Read the line first, then decide whether to learn where it came from.',
    count: (n: number) => `${n} kept`,
    reveal: 'Which echo is this from?',
    hide: 'Fold back',
    revealed: (n: number, total: number) => `${n} of ${total} opened`,
    empty: 'Nobody has written in a margin yet — the next echo may.',
    back: '← The shelf',
    anchorsLink: 'To Anchor Echo',
    gameKicker: 'A small game · guess the order',
    gameTitle: 'Which slip lies under which',
    gameLede: 'E214 says: slips placed often sink, slips placed rarely rise; no dates, and the later slips are nearly all the same shortness. Guess the order the story describes — this is not a byte measurement.',
    gameStart: 'Start guessing',
    gameAgain: 'Play again',
    gamePick: 'Which one lies beneath?',
    gameUnder: 'Beneath (pressed down)',
    gameOver: 'Above (floating)',
    gameRight: 'Right. That is how the margin arranges itself.',
    gameWrong: 'Wrong. The margin arranges itself; what people arrange does not count.',
    gameScore: (n: number, total: number) => `${n} of ${total} right`,
    gameBest: 'Best on this device',
    takeOut: 'Take one out',
    putBack: 'Put it back',
    takenOut: (n: number) => `${n} taken out`,
    takeOutNote: 'E217: you may take one out; put it back lightly. The margin does not record who touched it — and it returns to its own place, not to the end.',
    crumb: 'The Whispers’ Kings · The shelf',
  },
} as const;

export function BibleMargins({ locale }: { locale: Locale }) {
  const c = COPY[locale];
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  const rows = BIBLE_MARGINS;
  // 猜长短：一轮三对；对错只在本机 state 里，不写任何库、不烧任何 token。
  const [round, setRound] = useState<Pair[]>([]);
  const [picked, setPicked] = useState<ReadonlyArray<number | null>>([]);
  const [started, setStarted] = useState(false);
  // 取一张出来：抽走的条目不删除，只是不在队列里；放回时按原索引插回（E217 的"位置一点没动"）。
  const [taken, setTaken] = useState<ReadonlySet<number>>(new Set());
  const takeOut = (index: number): void => {
    setTaken((prev) => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  };
  const putBack = (index: number): void => {
    setTaken((prev) => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  };
  const kept = rows.map((row, index) => ({ row, index })).filter((entry) => !taken.has(entry.index));
  const start = (): void => {
    setRound(pickPairs(ROUND_PAIRS, rows.length));
    setPicked([]);
    setStarted(true);
  };
  const choose = (index: number, which: 'top' | 'bottom'): void => {
    if (picked[index] !== undefined && picked[index] !== null) return;
    setPicked((prev) => {
      const next = [...prev];
      next[index] = which === 'bottom' ? 1 : 0;
      return next;
    });
  };
  const rightCount = round.filter((_, i) => picked[i] === 1).length;
  // 本机最好成绩：与锚句回放同一支 localStorage 家族的纪律（拿不到就放弃记忆，不伪造）。
  const [best, setBest] = useState<number | null>(null);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('nexus.marginOrder.best');
      setBest(raw ? Number(raw) : null);
    } catch {
      setBest(null);
    }
  }, []);
  const settled = picked.filter((p) => p !== undefined && p !== null).length === round.length && round.length > 0;
  useEffect(() => {
    if (!settled) return;
    setBest((b) => {
      const next = b === null || rightCount > b ? rightCount : b;
      try {
        window.localStorage.setItem('nexus.marginOrder.best', String(next));
      } catch {
        /* 记忆不可用时放弃——游戏不强制 */
      }
      return next;
    });
  }, [settled, rightCount]);
  const toggle = (index: number): void => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <section className="bb-root" data-bible-margins data-bible-margins-locale={locale}>
      <nav className="bb-breadcrumb" aria-label={c.crumb}>
        <Link href="/bible" className="bb-footLink" data-bible-margins-back>{c.back}</Link>
      </nav>
      <header className="bm-head">
        <p className="bm-kicker">{c.kicker}</p>
        <h1 className="bm-title">{c.title}</h1>
        <p className="bm-lede">{c.lede}</p>
        <p className="bm-count" data-bible-margins-count>{c.count(rows.length)}</p>
      </header>
      {rows.length === 0 ? (
        <p className="bm-empty" data-bible-margins-empty>{c.empty}</p>
      ) : (
        <ol className="bm-list" data-bible-margins-list>
          {kept.map(({ row, index }) => {
            const shown = open.has(index);
            return (
              <li key={`${row.echo}-${index}`} className="bm-card" data-bible-margins-item>
                <p className="bm-note">{locale === 'en' ? row.en : row.zh}</p>
                <button
                  type="button"
                  className="bm-reveal"
                  onClick={() => takeOut(index)}
                  data-bible-margins-take-out={index}
                >
                  {c.takeOut}
                </button>
                <button
                  type="button"
                  className="bm-reveal"
                  onClick={() => toggle(index)}
                  aria-expanded={shown}
                  data-bible-margins-reveal={shown ? 'open' : 'closed'}
                >
                  {shown ? c.hide : c.reveal}
                </button>
                {shown && (
                  <p className="bm-from" data-bible-margins-from>
                    <Link href={row.slug} className="bb-footLink" data-bible-margins-echo-link>
                      {locale === 'en' ? row.titleEn : row.titleZh}
                    </Link>
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <footer className="bm-foot">
        <p className="bm-tally" data-bible-margins-tally>{c.revealed(open.size, rows.length)}</p>
        <Link href="/bible/anchors" className="bb-footLink" data-bible-margins-anchors-link>{c.anchorsLink}</Link>
      </footer>

      {taken.size > 0 ? (
        <section className="bm-taken" data-bible-margins-taken>
          <p className="bm-takenCount" data-bible-margins-taken-count>{c.takenOut(taken.size)}</p>
          <p className="bm-gameLede">{c.takeOutNote}</p>
          <ul className="bm-list">
            {rows.map((row, index) => (
              taken.has(index) ? (
                <li key={`taken-${row.echo}-${index}`} className="bm-card" data-bible-margins-taken-item={index}>
                  <p className="bm-note">{locale === 'en' ? row.en : row.zh}</p>
                  <button
                    type="button"
                    className="bm-reveal"
                    onClick={() => putBack(index)}
                    data-bible-margins-put-back={index}
                  >
                    {c.putBack}
                  </button>
                </li>
              ) : null
            ))}
          </ul>
        </section>
      ) : null}

      <section className="bm-game" data-bible-margins-game>
        <p className="bm-gameKicker">{c.gameKicker}</p>
        <h2 className="bm-gameTitle">{c.gameTitle}</h2>
        <p className="bm-gameLede">{c.gameLede}</p>
        {!started || round.length === 0 ? (
          <button
            type="button"
            className="bm-reveal"
            onClick={start}
            disabled={rows.length < 2}
            data-bible-margins-game-start
          >
            {c.gameStart}
          </button>
        ) : (
          <>
            <ol className="bm-gameList" data-bible-margins-game-round>
              {round.map((pair, index) => {
                const answer = picked[index];
                return (
                  <li key={`${pair.top}-${pair.bottom}`} className="bm-gamePair" data-bible-margins-game-pair>
                    <p className="bm-gamePick">{c.gamePick}</p>
                    <button
                      type="button"
                      className="bm-reveal"
                      onClick={() => choose(index, 'bottom')}
                      aria-pressed={answer === 1}
                      data-bible-margins-game-choose="bottom"
                    >
                      {rows[pair.bottom] ? (locale === 'en' ? rows[pair.bottom]!.en : rows[pair.bottom]!.zh) : ''}
                    </button>
                    <span className="bm-gameVs" aria-hidden="true">/</span>
                    <button
                      type="button"
                      className="bm-reveal"
                      onClick={() => choose(index, 'top')}
                      aria-pressed={answer === 0}
                      data-bible-margins-game-choose="top"
                    >
                      {rows[pair.top] ? (locale === 'en' ? rows[pair.top]!.en : rows[pair.top]!.zh) : ''}
                    </button>
                    {answer !== undefined && answer !== null ? (
                      <p className="bm-gameVerdict" data-bible-margins-game-verdict>
                        {answer === 1 ? c.gameRight : c.gameWrong}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ol>
            <p className="bm-tally" data-bible-margins-game-score>{c.gameScore(rightCount, round.length)}</p>
            <p className="bm-tally" data-bible-margins-game-best>{c.gameBest}: {best ?? rightCount} / {round.length}</p>
            <button type="button" className="bm-reveal" onClick={start} data-bible-margins-game-again>
              {c.gameAgain}
            </button>
          </>
        )}
      </section>
    </section>
  );
}
