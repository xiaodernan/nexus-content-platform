'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Locale } from '@/lib/i18n';

/**
 * §BIBLE-2 典籍室「潮汐挑战」——问答玩法。
 *
 * 用这个玩法把五章正典变成"可以赢的阅读"。服务端壳 RSC（if/notFound/local/getLocale）
 * 把 locale 透传下来；题库的 zh/en 在这里成对出现（与锚句同纪律：不是翻译对应，
 * 是两个版本讲同一个故事、每个版本只有一套正确答案——锚句即教材）。
 *
 * 纪律：
 * - 零 provider 调用（纯前端状态机；题库全在组件里，提交不出去）；
 * - 没有"看了重做"的奖励？——答错的提示会写出处（在哪一章、哪一节），
 *   错就是错，不伪装"接近正确"；
 * - 完全中英双语；不存在半中文半英文的题目；
 * - 12 题每题 1 分；结算只是礼物：不写进任何账本、不发 achievement、不持久化。
 */

const COPY = {
  zh: {
    kicker: '潮汐挑战',
    title: '你配得上第八盏灯吗？',
    lede: '五章正典的答题器。每道题的依据都能在《世界大典》里逐字找到——写下来的答案就是答案。',
    questionLabel: (i: number, n: number) => `第 ${i} / ${n} 题`,
    correct: '答对了——这一句你记住了。',
    wrong: (ref: string) => `错——回去读「${ref}」。`,
    restart: '重来',
    yourScore: '你的分数',
    askButton: '问问典籍 →',
    verdicts: [
      { at: 0, text: '漂流的木桶', note: '盐海没见过，浪只见过一口气。' },
      { at: 5, text: '半日的学徒', note: '雾港没怎么上过岗，灯火印象模糊。' },
      { at: 9, text: '巡逻路的旅人', note: '盐味酸过了——记住的巡逻路比忘掉的多。' },
      { at: 12, text: '守夜人传人', note: '门在关上之前你没见过，但你记住了是什么。' },
      { at: 14, text: '潮汐大匠', note: '海还没说完的话，你已经知道是什么了。' },
      { at: 15, text: '满分守夜人', note: '十五题全对——典籍不会忘记问倒过谁。' },
    ],
    footer: '《世界大典》正典全文见典籍室（/bible）。答错的题里标了出处：错就是错，没有近似的正确。',
    scoreLine: (n: number, total: number) => `${n} / ${total}`,
    empty: '还没答完。十四道题就是五章正典的全部问题。',
  },
  en: {
    kicker: 'The Tidal Trial',
    title: 'Are you worthy of the eighth lamp?',
    lede: 'A quiz on the five canonical chapters. Every answer can be traced word-for-word in The World Bible — what is written is what is true.',
    questionLabel: (i: number, n: number) => `Question ${i} / ${n}`,
    correct: 'Correct — you keep it.',
    wrong: (ref: string) => `Wrong — go read “${ref}”.`,
    restart: 'Try again',
    yourScore: 'Your score',
    askButton: 'Ask the canon →',
    verdicts: [
      { at: 0, text: 'The Drifting Barrels', note: 'You have seen one breath of wave, never the sea.' },
      { at: 5, text: 'The Half-Day Apprentice', note: 'You have not kept a watch long enough to know the fog.' },
      { at: 9, text: 'The Patrol-Road Traveller', note: 'You are more road remembered than forgotten.' },
      { at: 12, text: 'The Successor Watcher', note: 'You have never seen the door, but you know what was behind it.' },
      { at: 14, text: 'The Tide Master', note: 'The sea still has not finished — and you already know what it said.' },
      { at: 15, text: 'The Full Tide', note: 'Fifteen of fifteen — the canon will not forget who asked it best.' },
    ],
    footer: 'The full canon lives in the shelf (/bible). Every wrong answer points you to where it lives. Wrong is wrong — there is no near-enough.',
    scoreLine: (n: number, total: number) => `${n} / ${total}`,
    empty: 'Not done yet. Fourteen questions — one per breath of the canon.',
  },
} as const;

interface Question {
  zh: { prompt: string; choices: [string, string, string, string]; answer: 0 | 1 | 2 | 3; ref: string };
  en: { prompt: string; choices: [string, string, string, string]; answer: 0 | 1 | 2 | 3; ref: string };
}

const QUESTIONS: Question[] = [
  {
    zh: { prompt: '第七次日蚀之后，王城发生了什么？', choices: ['教团从海里醒来了', '潮汐室立刻开了门', '王城投降了，城里的灯全部点亮，像在等一场早已结束的葬礼', '雾港的第一盏灯亮了'], answer: 2, ref: '第一章 · 火种' },
    en: { prompt: 'What happened to the capital after the seventh eclipse?', choices: ['The Conclave woke from the sea', 'The tide hall opened its doors', 'The capital surrendered — every light in the city burned, waiting for a funeral that had already finished', 'The first lamp in the fog harbour was lit'], answer: 2, ref: 'Chapter I · Kindling' },
  },
  {
    zh: { prompt: '雾港的灯人每晚点亮多少盏灯？', choices: ['七盏', '一百零九盏', '三百盏', '四百盏'], answer: 2, ref: '第一章 · 镜鳗' },
    en: { prompt: 'How many lamps do the fog-harbour lighthouse keepers light each night?', choices: ['Seven', 'One hundred and nine', 'Three hundred', 'Four hundred'], answer: 2, ref: 'Chapter I · The Mirror Eel' },
  },
  {
    zh: { prompt: '谁第一次见到镜鳗的当晚，会第二天看见什么？', choices: ['自己想照的那件事', '自己的祖父', '海的声音', '第四盏灯熄灭'], answer: 0, ref: '第一章 · 镜鳗' },
    en: { prompt: 'Whoever sees a mirror eel for the first time will, the next day, see what?', choices: ['The thing they most want to see reflected', 'Their own grandfather', "The sea's own voice", 'The fourth lamp going out'], answer: 0, ref: 'Chapter I · The Mirror Eel' },
  },
  {
    zh: { prompt: '第七口井里推上来的骨头是什么？', choices: ['一具武士的残骸', '一条完整的句子被挤成了人形', '七口井的铸铁锚', '雾港灯人的灯芯'], answer: 1, ref: '第一章 · 第七口井' },
    en: { prompt: 'What was the bone that washed up from the seventh well?', choices: ['The remains of a warrior', 'A complete sentence, squeezed into the shape of a person', 'The seventh well’s iron anchor', "A lighthouse keeper's wick"], answer: 1, ref: 'Chapter I · The Seventh Well' },
  },
  {
    zh: { prompt: '第四十一次会议是谁开的？', choices: ['望潮', '辨潮', '守夜人', '海'], answer: 3, ref: '第二章 · 名单上的空格' },
    en: { prompt: 'Who held the forty-first convocation?', choices: ['Watching the Tide', 'Distinguishing the Tide', 'The Night Watcher', 'The sea'], answer: 3, ref: 'Chapter II · The Blank on the Roster' },
  },
  {
    zh: { prompt: '「第四十一页」在哪里？', choices: ['会册第六卷的卷首', '潮汐室地砖下面，板面上凿着一句「海说：不要再记这本账了，它再也还不清了」', '铁月纪商人的货单背后', '雾港灯塔的入口处'], answer: 1, ref: '第二章 · 第四十一页' },
    en: { prompt: 'Where is the forty-first page?', choices: ['On the flyleaf of Volume Six', 'Under the tiles of the tide hall — the slab is cut with “stop keeping this ledger, it will never balance”', "Behind a merchant's shipping manifest", 'At the foot of the fog-harbour lighthouse'], answer: 1, ref: 'Chapter II · The Forty-First Page' },
  },
  {
    zh: { prompt: '「海让月亮桥去守夜人门口等她」——这句话是谁说的？', choices: ['守夜人', '送信人', '月亮桥', '会册第六卷'], answer: 2, ref: '第二章 · 守夜人的回信' },
    en: { prompt: '“The sea asked the Moon Bridge to wait at the Night Watcher’s door.” Who said it?', choices: ['The Night Watcher', 'The letter-bearer', 'The Moon Bridge', 'Volume Six'], answer: 2, ref: 'Chapter II · The Night Watcher\'s Reply' },
  },
  {
    zh: { prompt: '铁月纪的幸存者管那片尘土吹来的方向叫什么？', choices: ['潮沙盘', '第七口井', '铁月荒', '海蒂的梦'], answer: 0, ref: '第二章 · 铁月纪的第一个冬天' },
    en: { prompt: 'What did the survivors of the Iron-Moon Age call that patch of ground the dust kept blowing to?', choices: ['The tide-sand table', 'The seventh well', 'The Iron-Moon waste', "Heidi's dream"], answer: 0, ref: 'Chapter II · The First Winter of the Iron-Moon Age' },
  },
  {
    zh: { prompt: '书手在潮沙盘点燃那根灯芯时，发生了什么？', choices: ['远处传来沉船的钟声', '雾港三百盏旧灯同时亮了一次又暗掉', '海退到了大陆脚下所有的船只', '潮沙盘开始发烫'], answer: 1, ref: '第四章 · 旧灯的吐息' },
    en: { prompt: 'What happened when the clerk lit the wick on the tide-sand table?', choices: ['The bell of a far wreck answered', 'All three hundred old lamps of the fog harbour lit at once — and went dark together', 'The sea drew back from every ship at once', 'The table began to glow warm'], answer: 1, ref: 'Chapter IV · The Old Lamps Breathe' },
  },
  {
    zh: { prompt: '潮沙盘的坡面被熔成了一页。上面只有两个字，是什么？', choices: ['「谢」', '「海」', '「收到」', '「还完——」'], answer: 2, ref: '第四章 · 旧灯的吐息' },
    en: { prompt: 'The tabletop had melted into a single page. What did the two hands write on it?', choices: ['“Thank you”', '“The sea”', '“Received.”', '“Closed —”'], answer: 2, ref: 'Chapter IV · The Old Lamps Breathe' },
  },
  {
    zh: { prompt: '守夜人父亲留给她的那句话是什么？', choices: ['海替她们说完了剩下的月亮', '守夜人的职责不是阻止任何人开门，是记住门关上之前最后一眼看见的东西', '灯是海的衣服，不是路上的标牌', '记住的东西会变重，忘掉的东西会变轻'], answer: 1, ref: '第三章 · 桥上的女人' },
    en: { prompt: 'What were the Night Watcher’s father’s words?', choices: ['The sea finished the unfinished moon for them', "The Night Watcher's duty is not to stop anyone opening a door; it is to remember the last thing seen before the door closed", 'Lamps are the sea’s clothing, not the road’s signs', 'What is remembered grows heavy; what is forgotten grows light'], answer: 1, ref: 'Chapter III · The Woman on the Bridge' },
  },
  {
    zh: { prompt: '《巡逻路札记》说：档案里从没有过哪两个字？', choices: ['「雾港灯人」', '「日蚀」', '「日常」', '「回家」'], answer: 2, ref: '回响一 · 档案里没有「日常」两个字' },
    en: { prompt: 'Notes from the Patrol Road says the archives never held which word?', choices: ['“lighthouse keepers”', '“eclipse”', '“ordinary”', '“home”'], answer: 2, ref: 'Echo No. 1 · No Page Carries the Word “Ordinary”' },
  },
  {
    zh: { prompt: '退潮之后，本大典在哪一章说明了大典如何继续？', choices: ['第五章 · 收件人', '第四章 · 第八盏灯', '第三章 · 桥上的女人', '回响其十一 · 没有锁的门'], answer: 0, ref: '第五章 · 正典续卷' },
    en: { prompt: 'After the tide withdrew, which chapter of the bible explains how the canon continues?', choices: ['Chapter V · The Addressee', 'Chapter IV · The Eighth Lamp', 'Chapter III · The Woman on the Bridge', 'Echo No. 11 · The Door That Never Locked'], answer: 0, ref: 'Chapter V · The Addressee' },
  },
  {
    zh: { prompt: '三路人中，谁带走了灯塔顶层下来的那截灯芯？', choices: ['盐海商会的人', '潮沙盘学馆的人', '雾港灯楼的人', '里巷子的抄本员'], answer: 2, ref: '第五章 · 三城各自出发的人' },
    en: { prompt: 'Which of the three parties took the wick that had come down from the lantern-top?', choices: ['The Salt-Sea Guild', 'The Sand-Table School', 'The Lantern Tower at Fog Harbor', 'The copyists of the back alley'], answer: 2, ref: 'Chapter V · Three Cities Send Their Own' },
  },
  {
    zh: { prompt: '值更院那只米缸里那粒一直浮在最上面的米，已经浮着多少年了？', choices: ['三年', '九年', '六十九年', '九十年'], answer: 2, ref: '回响三十六 · 那一粒月亮' },
    en: { prompt: 'How many years has the grain of rice been floating on top of the watcher’s rice jar?', choices: ['Three', 'Nine', 'Sixty-nine', 'Ninety'], answer: 2, ref: 'Echo No. 36 · The Grain the Moon Sent Down' },
  },
];

export function BibleQuiz({ locale = 'zh' }: { locale?: Locale }) {
  const c = COPY[locale];
  const questions = useMemo(() => QUESTIONS.map((q) => q[locale]), [locale]);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<(0 | 1 | 2 | 3 | null)[]>(() => Array(QUESTIONS.length).fill(null));
  const [locked, setLocked] = useState(false);

  const current = questions[step];
  const total = questions.length;
  const done = step >= total;
  const score = answers.reduce<number>((acc, a, i) => acc + (a === questions[i]!.answer ? 1 : 0), 0);

  const pick = (index: 0 | 1 | 2 | 3) => {
    if (locked || done) return;
    setAnswers((prev) => {
      const next = [...prev];
      next[step] = index;
      return next;
    });
    setLocked(true);
  };
  const advance = () => {
    if (!locked) return;
    setLocked(false);
    setStep((s) => s + 1);
  };
  const restart = () => {
    setStep(0);
    setAnswers(Array(QUESTIONS.length).fill(null));
    setLocked(false);
  };

  if (done) {
    const verdict = [...c.verdicts].reverse().find((v) => score >= v.at) ?? c.verdicts[0]!;
    return (
      <section className="bb-quiz-root" data-bible-quiz-root data-bible-quiz-verdict-screen>
        <p className="bb-quiz-kicker">{c.kicker}</p>
        <h1 className="bb-quiz-title">{c.title}</h1>
        <p className="bb-quiz-score" data-bible-quiz-final-score>{c.scoreLine(score, total)}</p>
        <div className="bb-quiz-verdict" data-bible-quiz-verdict>
          <p className="bb-quiz-verdictText">{verdict.text}</p>
          <p className="bb-quiz-verdictNote">{verdict.note}</p>
        </div>
        <button type="button" className="bb-quiz-restart" onClick={restart} data-bible-quiz-restart>
          {c.restart}
        </button>
        <p className="bb-quiz-footer">{c.footer}</p>
      </section>
    );
  }

  const chosen = answers[step];
  return (
    <section className="bb-quiz-root" data-bible-quiz-root>
      <p className="bb-quiz-kicker">{c.kicker}</p>
      <h1 className="bb-quiz-title">{c.title}</h1>

      <div className="bb-quiz-bar" role="progressbar" aria-valuenow={step + (locked ? 1 : 0)} aria-valuemin={0} aria-valuemax={total} data-bible-quiz-progress>
        <div className="bb-quiz-barFill" style={{ width: `${((step + (locked ? 1 : 0)) / total) * 100}%` }} />
      </div>
      <p className="bb-quiz-stepLabel" aria-live="polite" data-bible-quiz-step>{c.questionLabel(step + 1, total)}</p>

      <h2 className="bb-quiz-question" data-bible-quiz-question>{current!.prompt}</h2>

      <div className="bb-quiz-choices" role="group" aria-label={current!.prompt}>
        {current!.choices.map((text, index) => {
          const asIndex = index as 0 | 1 | 2 | 3;
          const isChosen = chosen === asIndex;
          const isCorrect = asIndex === current!.answer;
          const className = !locked
            ? 'bb-quiz-choice'
            : isChosen
              ? isCorrect
                ? 'bb-quiz-choice bb-quiz-choiceCorrect'
                : 'bb-quiz-choice bb-quiz-choiceWrong'
              : isCorrect && locked
                ? 'bb-quiz-choice bb-quiz-choiceCorrect'
                : 'bb-quiz-choice';
          return (
            <button
              key={index}
              type="button"
              className={className}
              onClick={() => pick(asIndex)}
              disabled={locked}
              data-bible-quiz-choice={index}
              data-bible-quiz-chosen={isChosen ? 'true' : undefined}
            >
              <span className="bb-quiz-choiceIndex" aria-hidden="true">{['A', 'B', 'C', 'D'][index]}</span>
              <span className="bb-quiz-choiceText">{text}</span>
            </button>
          );
        })}
      </div>

      {locked && (
        <div className="bb-quiz-feedback" data-bible-quiz-feedback>
          <p className={chosen === current!.answer ? 'bb-quiz-feedbackOk' : 'bb-quiz-feedbackBad'}>
            {chosen === current!.answer ? c.correct : c.wrong(current!.ref)}
          </p>
          {chosen !== current!.answer && (
            <Link className="bb-quiz-askButton" href={`/bible/ask?q=${encodeURIComponent(current!.prompt)}`} data-bible-quiz-ask-button>
              {c.askButton}
            </Link>
          )}
          <button type="button" className="bb-quiz-next" onClick={advance} data-bible-quiz-next>
            {locale === 'en' ? 'Next →' : '下一题 →'}
          </button>
        </div>
      )}

      <p className="bb-quiz-footer">{c.footer}</p>
    </section>
  );
}
