'use client';

import { useState, type FormEvent } from 'react';
import type { Locale } from '@/lib/i18n';

/**
 * §BIBLE-2 低语诸王 · 典籍室「七口井」——第八盏灯之后的实验性玩法。
 *
 * 第七章的情节是盐海深处的镜鳗：它只是浮，不要命也不夺命；你第一次见它的当晚，
 * 第二天你就能照见自己想照见的那件事。
 *
 * 七口井是正典里的修辞装置——教团余烬里七个人的每一席，各守着一口「只是看」的井。
 * 这一页让读者自己挑一口看；看的过程里不赋予任何神秘能力，只是给正典一副新的外壳。
 *
 * 精神（§159）：
 * - 零 LLM 调用、零网络请求、零持久化——状态在 useState，提交就是关掉浏览器；
 * - 每口井的「井的问题」和正典里的内容对齐（望潮=七席、辨潮/引潮/留潮/定潮/验潮/迎潮 = 教团七席）；
 * - 只有第七口接受输入，但写的答案永远不会被发给远端、不会被存盘、不会被再瞥见；
 * - 读者自己输入什么，就只读者自己知道——正典的力量来自"接受"，不来自"揭露"。
 *
 * v787：双语 COPY；零网络；全客户端。
 */

const COPY = {
  zh: {
    kicker: '第八席之后',
    title: '七口井',
    lede: '盐海边沿有七口井，各替教团七席守了一口气。六口只是看——只有第七口你主动喊了名字，它才肯看见你。',
    awaken: '你要看的是哪一口？',
    backToShelf: '← 回典籍室',
    theWellSpeaks: '井答你一件事：',
    questionLabel: '它问你',
    restart: '把灯灭掉再生一遍',
    seventh: {
      name: '迎潮 · 七口井里',
      callout: '你已经站在海边了——只有迎潮不站了。站得久了有没有?七口口井里最殷勤的那一口，问题最薄：',
      question: '你想照见什么？',
      submit: '放进去一句话',
      answerPlaceholder: '比如：我想照见我父亲、我母亲、一条不存在的巡逻路……',
      afterAnswer: '井答你一件事：',
      echoLine: '盐海其实是一片打翻的镜子。',
      echoRef: '回潮汐室盐墙上被海吃过的字',
      closing: (sentence: string) => `今晚没有变什么；但你浮在水面上了。「${sentence}」——海带回了你。`,
      restartHint: '（井里不留答案——刷新就是放手。）',
    },
    wells: [
      { name: '一 · 望潮', question: '潮不看脸，看形。你抬起头去看的时候，你自己换了几副脸？', echo: '站在汐台上数到第九十六次潮的人，还没问过一次潮汐室主人的名字；她没有问，她只记住了灰灯纪把教堂烧完了的人群。' },
      { name: '二 · 辨潮', question: '怎么分得出一份被海盐吃过的真账上，和一份盐霜勾出来的假账——这两者你都会拿在手上。', echo: '教团的账不改良亦不改减，账上只多一角——他们信的字值一教之间的盐，所以账值与全图值了一整吊。' },
      { name: '三 · 引潮', question: '如果一条指引是从浪尖来的，它变成直路的时候被沙吃完了，你才发现那不是指引——那叫「就是送」。', echo: '引潮的人不在海里，在盐海与人间的薄薄一层——「不被」里一起走的人不知道自己也在引潮，人间已经把他变成了井里的影子。' },
      { name: '四 · 留潮', question: '你最舍不得扔掉的那条线，是不是其实你把它攥得太久了？', echo: '留潮席位留下的不是船，是被海泡得沉了的海船——船主想留的东西有念名字的人；盐问船主只念一次，念完该交了。' },
      { name: '五 · 定潮', question: '书写规则的时候，假装你在替未来的人省力，其实你在用「规矩」挡住自己；不变不seamnă海。', echo: '定潮就是让账本的每一页都能翻开——页页之间的盐霜闸是翻页的，所以没有哪一页可以不翻开。' },
      { name: '六 · 验潮', question: '你说你要验证，你需要一万个字，还是需要十年？', echo: '验潮不需要证明，需要站——站得够久的人遇见一百个根本不错的假面，自然就认得出来了：那些脸一个比一个先点火。' },
    ],
  },
  en: {
    kicker: 'After the eighth lamp',
    title: 'The Seven Wells',
    lede: 'Seven wells along the salt sea’s edge, one per seat the Conclave used to hold. Six are only looking. The seventh looks back — if you say the name she asks for first.',
    awaken: 'Which well do you want to look into?',
    backToShelf: '← Back to the shelf',
    theWellSpeaks: 'The well answers:',
    questionLabel: 'It asks you',
    restart: 'Put out the lamp and light another',
    seventh: {
      name: 'Welcoming the Tide · the seventh well',
      callout: 'You are already at the water’s edge — only welcoming no longer stands up. How long have you been standing? The most attentive of the seven wells asks the thinnest question:',
      question: 'What would you like to see reflected?',
      submit: 'Place a sentence here',
      answerPlaceholder: 'For example: I want to see my father, my mother, a patrol road that does not exist…',
      afterAnswer: 'The well answers:',
      echoLine: 'The salt sea is in fact one great overturned mirror.',
      echoRef: 'after the chalky tide-speckled wall inside the tide hall',
      closing: (sentence: string) => `Nothing changed tonight; but you floated. “${sentence}” — the sea carried it back.`,
      restartHint: '(The well keeps nothing. Refresh to let go.)',
    },
    wells: [
      { name: 'Watching the Tide', question: 'Tides watch faces, not shapes. When you look up, how many faces have you changed?', echo: 'There is a night every year when the whole Grey-Lamp cohort sits waiting on the tide platform, eyes open, counting the windows where the lamps are lit. She does not ask the tide hall’s owner’s name; she only remembers the crowd that burned the church.' },
      { name: 'Distinguishing the Tide', question: 'How do you tell apart a ledger eaten by salt from an invented one drawn in frost? You hold both in your hands first.', echo: 'The Conclave account never improves or shrinks; the ledger only ever gained a corner — because a word they trusted was worth a school of salt, so the ledger was worth an entire map.' },
      { name: 'Guiding the Tide', question: 'If guidance comes from the crest of a wave, and the sand eats it by the time it is a straight path, you only realize it was not guidance — it was “just seeing them off.”', echo: 'The guider is not in the sea — only in the thin layer between salt sea and men. “Don’t you go” — and the people who walk with them never realise they are being guided; the world has already made them shadows in the well.' },
      { name: 'Keeping the Tide', question: 'The thing you cannot throw away — is it, in truth, only that you squeezed it too long?', echo: 'The seat of keeping never left a ship; she left only a ship the sea had sunk deep. The owner wants to keep what she can name. The salt asks the owner to name it once; once named, the deed is done.' },
      { name: 'Fixing the Tide', question: 'When you write the rule, you think you are helping future men; really you are hiding behind “regulations,” and will not change. The sea never does that.', echo: 'Fixing the tide is making sure every page of the ledger opens — the salt-frost tabs between pages are meant to flip; no page is allowed to stay shut.' },
      { name: 'Verifying the Tide', question: 'You say you need proof. Do you need a hundred pages, or ten years?', echo: 'Verification needs no proof — it needs to stay. Stay long enough, you have met a hundred perfect masks; the one who ignites first is found under the person.' },
    ],
  },
} as const;

export function SevenWells({ locale = 'zh' }: { locale?: Locale }) {
  const c = COPY[locale];
  const [active, setActive] = useState<number | null>(null);
  const [sentence, setSentence] = useState('');
  const [answered, setAnswered] = useState<string | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = sentence.trim();
    if (trimmed) setAnswered(trimmed);
  };

  const resetSeventh = () => {
    setActive(null);
    setSentence('');
    setAnswered(null);
  };

  return (
    <main className="bb-well-root" data-bible-well-root data-bible-locale={locale}>
      <header className="bb-well-hero">
        <p className="bb-well-kicker">{c.kicker}</p>
        <h1 className="bb-well-title">{c.title}</h1>
        <p className="bb-well-lede">{c.lede}</p>
      </header>

      <nav aria-label={c.awaken} className="bb-well-nav">
        <p className="bb-well-navTitle" data-bible-well-navtitle>{c.awaken}</p>
        <div className="bb-well-list">
          {c.wells.map((well, i) => (
            <button
              key={well.name}
              type="button"
              className={`bb-well-btn${active === i ? ' bb-well-btnActive' : ''}`}
              aria-pressed={active === i}
              data-bible-well-open={i}
              onClick={() => {
                setActive(active === i ? null : i);
                setAnswered(null);
              }}
            >
              {well.name}
            </button>
          ))}
          <button
            type="button"
            className={`bb-well-btn bb-well-btnSeventh${active === 6 ? ' bb-well-btnActive' : ''}`}
            aria-pressed={active === 6}
            data-bible-well-open={6}
            onClick={() => setActive(active === 6 ? null : 6)}
          >
            {c.seventh.name}
          </button>
        </div>
      </nav>

      {active !== null && active < 6 ? (
        <section className="bb-well-panel" role="article" data-bible-well-panel>
          <h2 className="bb-well-panelName">{c.wells[active]!.name}</h2>
          <p className="bb-well-panelLabel">{c.questionLabel}</p>
          <p className="bb-well-panelQuestion">{c.wells[active]!.question}</p>
          <p className="bb-well-panelLabel">{c.theWellSpeaks}</p>
          <p className="bb-well-panelVerse">{c.wells[active]!.echo}</p>
        </section>
      ) : null}

      {active === 6 ? (
        <section className="bb-well-panel bb-well-panelSeventh" role="article" data-bible-well-panel-seventh>
          <h2 className="bb-well-panelName">{c.seventh.name}</h2>
          <p className="bb-well-panelCallout">{c.seventh.callout}</p>
          {answered ? (
            <>
              <p className="bb-well-panelLabel">{c.seventh.afterAnswer}</p>
              <blockquote className="bb-well-quote" data-bible-well-answer>{answered}</blockquote>
              <p className="bb-well-panelVerse">{c.seventh.echoLine}
                <span className="bb-well-verseRef">{c.seventh.echoRef}</span>
              </p>
              <p className="bb-well-closing">{c.seventh.closing(answered)}</p>
              <button type="button" className="bb-well-restart" onClick={resetSeventh} data-bible-well-restart>
                {c.restart}
              </button>
              <p className="bb-well-restartHint">{c.seventh.restartHint}</p>
            </>
          ) : (
            <form className="bb-well-form" onSubmit={submit} data-bible-well-form>
              <p className="bb-well-panelQuestion">{c.seventh.question}</p>
              <textarea
                className="bb-well-input"
                rows={3}
                maxLength={240}
                required
                value={sentence}
                onChange={(e) => setSentence(e.target.value)}
                placeholder={c.seventh.answerPlaceholder}
                aria-label={c.seventh.question}
                data-bible-well-input
              />
              <button type="submit" className="bb-well-submit" data-bible-well-submit>
                {c.seventh.submit}
              </button>
            </form>
          )}
        </section>
      ) : null}
    </main>
  );
}
