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
    restartBible: '回典籍室 →',
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
    empty: '还没答完。十五道题就是五章正典的全部问题。',
  },
  en: {
    kicker: 'The Tidal Trial',
    title: 'Are you worthy of the eighth lamp?',
    lede: 'A quiz on the five canonical chapters. Every answer can be traced word-for-word in The World Bible — what is written is what is true.',
    questionLabel: (i: number, n: number) => `Question ${i} / ${n}`,
    correct: 'Correct — you keep it.',
    wrong: (ref: string) => `Wrong — go read “${ref}”.`,
    restart: 'Try again',
    restartBible: 'Back to the shelf →',
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
    empty: 'Not done yet. Fifteen questions — one per breath of the canon.',
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
    zh: { prompt: '《灯芯札记》里，印章经过四只手——每只手都以为什么？', choices: ['自己拿到了死神的契书', '自己报完了账', '自己打开了第八盏灯', '自己找到了国王'], answer: 1, ref: '回响二 · 印章经过四只手' },
    en: { prompt: 'In “Notes from the Lamp Wick”, the stamp passed through four hands — what did each hand believe?', choices: ['that they had received a death contract', 'that they had closed the books', 'that they had lit the Eighth Lamp', 'that they had found the King'], answer: 1, ref: 'Echo No. 2 · The Stamp Passed Through Four Hands' },
  },
  {
    zh: { prompt: '《盐灯守灵日记》里，守灵人数什么？', choices: ['年', '灯油的斤两', '夜', '灯芯的根数'], answer: 2, ref: '回响三 · 守灵人不数年，他数夜' },
    en: { prompt: 'In “The Salt-Lamp Vigil Diary”, what does the vigil-keeper count?', choices: ['years', 'the weight of lamp oil', 'nights', 'the strands of wick'], answer: 2, ref: 'Echo No. 3 · He does not count years — he counts nights' },
  },
  {
    zh: { prompt: '《第九叩》里，沙盘借出栏的指印压在什么之上？', choices: ['一页报纸', '一个空白的日期', '一本没写完的货单', '一枚收件章'], answer: 1, ref: '回响四 · 沙盘上的第九个旋钮' },
    en: { prompt: 'In “The Ninth Knock”, what does the loan-column fingerprint on the stores ledger stamp over?', choices: ['a newspaper proof', 'a blank date', 'an unwritten invoice', 'a receipt stamp'], answer: 1, ref: 'Echo No. 4 · The Ninth Dial on the Sand Table' },
  },
  {
    zh: { prompt: '《第九叩》里，报纸上的第九个脚注写的是什么？', choices: ['雾港失踪的第九人', '灯罩内侧的九道叩痕', '第四十二次会议的日期', '圆角印章的来历'], answer: 1, ref: '回响四 · 被印圆角擦掉的第九个脚注' },
    en: { prompt: 'In “The Ninth Knock”, what does the ninth footnote in the newspaper describe?', choices: ['the ninth missing person of the mist harbor', 'nine knock-marks on the inside of a lamp shade', 'the date of the forty-second meeting', 'the origin of the corner-round seal'], answer: 1, ref: 'Echo No. 4 · The Ninth Footnote the Printer’s Corner-Seal Erased' },
  },
  {
    zh: { prompt: '《灯绳记》里，巡检页末页空格下方盖着什么？', choices: ['一枚黑印', '一枚边缘缺角的圆印', '一枚收件章', '一把锁'], answer: 1, ref: '回响五 · 末页空位' },
    en: { prompt: 'In "The Lamp-Rope Memoir", what sits beneath the blank cell on the last page of the inspection roll?', choices: ['a black seal', 'a round seal with a worn corner', 'a receipt stamp', 'a lock'], answer: 1, ref: 'Echo No. 5 · The Empty Cell at the End of the Page' },
  },
  {
    zh: { prompt: '《灯绳记》里，渔人少报了什么？', choices: ['一段网绳', '一袋鱼鳞', '一抹湿纸', '一盏灯'], answer: 0, ref: '回响五 · 一抹湿纸' },
    en: { prompt: 'In "The Lamp-Rope Memoir", what did the fisherman under-report?', choices: ['a length of net', 'a bag of fish scales', 'a sheet of wet paper', 'a lamp'], answer: 0, ref: 'Echo No. 5 · A Smear of Wet Paper' },
  },
  {
    zh: { prompt: '《远信》里，第八盏灯最终收到了什么？', choices: ['没有寄出的名字', '四道印章的来信', '一张只有一个字的纸', '一封信'], answer: 3, ref: '第五章 · 二' },
    en: { prompt: 'In “Letters Never Posted”, what did the Eighth Lamp finally receive?', choices: ['a name that never shipped', 'four sealed wax marks', 'a single-glyph sheet', 'a letter'], answer: 3, ref: 'Chapter V · II' },
  },
  {
    zh: { prompt: '《远信》里，账房怎样记录未出匣的信？', choices: ['记作"在匣"', '记作"未成"', '两格分开、栏目之间没有路', '记作"收讫"'], answer: 2, ref: '第五章 · 一' },
    en: { prompt: 'In “Letters Never Posted”, how does the bursar record letters never dropped?', choices: ['under “in box”', 'under “never”', 'two cells apart, no road between', 'under “received”'], answer: 2, ref: 'Chapter V · I' },
  },
  {
    zh: { prompt: '《最后的签收》里，守夜人用什么在盐痕上按了一下？', choices: ['他的拇指', '他的食指', '一枚教团旧印', '一根羽毛'], answer: 1, ref: '末章 · 五' },
    en: { prompt: 'In “The Final Seal”, what did the watchman press into the salt crust?', choices: ['his thumb', 'his index finger', 'an old Congregation seal', 'a feather'], answer: 1, ref: 'Final chapter · V' },
  },
  {
    zh: { prompt: '《最后的签收》里，书记员在最后一栏写下了什么？', choices: ['已收 · 含收件人名', '已收 · 收件人名空白', '未收', '无人签收'], answer: 1, ref: '末章 · 六' },
    en: { prompt: 'In “The Final Seal”, what does the clerk write in the last column?', choices: ['received, with the recipient’s name', 'received, the recipient’s name left blank', 'unreceived', 'no one signed'], answer: 1, ref: 'Final chapter · VI' },
  },
  {
    zh: { prompt: '《传灯记》里，守夜人替商队让路时塔楼上亮的是什么灯？', choices: ['海警灯', '一盏旧灯', '一口油灯', '无灯（靠手电让路）'], answer: 1, ref: '回响六 · 商队遇上北端守夜人' },
    en: { prompt: 'In “Echo No. 6”, what did the watchman hold for the caravan?', choices: ['a signal lamp', 'an old lamp', 'an oil lamp', 'no lamp — he walked them bare-handed'], answer: 1, ref: 'Echo No. 6 · The Caravan and the Northern Night-Watchman' },
  },
  {
    zh: { prompt: '《传灯记》里，撒贝儿往食谱上撒了几粒盐？', choices: ['八粒', '九粒', '三粒', '无数粒'], answer: 1, ref: '回响六 · 撒贝儿' },
    en: { prompt: 'In “Echo No. 6”, how many salt grains did Saer drop onto the recipe?', choices: ['eight', 'nine', 'three', 'as many as she wanted'], answer: 1, ref: 'Echo No. 6 · The Salt Grains on the Recipe' },
  },
  {
    zh: { prompt: '《灯前灰》里，守门的人扫灰时孩子……？', choices: ['醒了', '依然睡着', '跑开了', '哭了'], answer: 1, ref: '第七章 · 一' },
    en: { prompt: 'In “Ashes Before the Lamp”, what does the child do when the sweeper comes?', choices: ['wakes up', 'stays asleep', 'runs away', 'cries'], answer: 1, ref: 'Chapter VII · I' },
  },
  {
    zh: { prompt: '《灯前灰》最后，账房在封面写了什么？', choices: ['没写任何东西', '"第八盏灯"', '"三百年"', '"潮先行"'], answer: 1, ref: '第七章 · 六' },
    en: { prompt: 'In “Ashes Before the Lamp”, what does the bursar write on the cover?', choices: ['nothing', '"The Eighth Lamp"', '"three hundred years"', '"the tide went first"'], answer: 1, ref: 'Chapter VII · VI' },
  },
  {
    zh: { prompt: '《那一针》里，孩子的针扎进哪只手？', choices: ['食指', '小指', '手掌', '拇指'], answer: 1, ref: '回响七 · 二' },
    en: { prompt: 'In “The Needle”, where the Pin stuck at the child?', choices: ['index', 'pinkie', 'palm', 'thumb'], answer: 1, ref: 'Echo No. 7 · II' },
  },
  {
    zh: { prompt: '《那一针》里，守门人说的字是?', choices: ['"终"', '"未"', '"账"', '"已收"'], answer: 1, ref: '回响七 · 五' },
    en: { prompt: 'In “The Needle”, what word did the watchman write?', choices: ['done', 'unfinished', 'the ledger', 'received'], answer: 1, ref: 'Echo No. 7 · V' },
  },
  {
    zh: { prompt: '《封面四字》里，账房在封面写下了什么？', choices: ['"第八盏灯"', '"三百年"', '"潮先行"', '"灯尽"'], answer: 0, ref: '回响八 · 一' },
    en: { prompt: 'In “The Four Characters”, what does the bursar write on the cover?', choices: ['“The Eighth Lamp”', '“three hundred years”', '“the tide went first”', '“the lamp is done”'], answer: 0, ref: 'Echo No. 8 · I' },
  },
  {
    zh: { prompt: '《封面四字》里，沙盘一直少响哪一下？', choices: ['第三下', '第六下', '第九下', '第七下'], answer: 2, ref: '回响八 · 五' },
    en: { prompt: 'In “The Four Characters”, which knock never comes?', choices: ['the third', 'the sixth', 'the ninth', 'the seventh'], answer: 2, ref: 'Echo No. 8 · V' },
  },
  {
    zh: { prompt: '《灰后》里，账合上的第三天，有人敲了一次门——里面……？', choices: ['开了门', '没有答复', '传出音乐', '放出了水'], answer: 1, ref: '第八章 · 一' },
    en: { prompt: 'In “After the Ash”, on the third day after the ledger closed, someone knocked — and?', choices: ['the door opened', 'no answer came', 'music came out', 'water was poured'], answer: 1, ref: 'Chapter VIII · I' },
  },
  {
    zh: { prompt: '《灰后》里，孩子的第八处名字是怎么念完的？', choices: ['有人替他写了上去', '他自己还是念完了', '纸被风吹走了', '守门人告诉了他'], answer: 1, ref: '第八章 · 三' },
    en: { prompt: 'In “After the Ash”, how does the eighth name get finished?', choices: ['someone wrote it in for him', 'he read it himself', 'the wind took the paper', 'the doorkeeper told him'], answer: 1, ref: 'Chapter VIII · III' },
  },
  {
    zh: { prompt: '《红绳》里，红绳是从哪里拆下来的？', choices: ['灯篓的衬布', '一件童衣的襟口', '账房的腰带', '渔网角落'], answer: 1, ref: '回响九 · 一' },
    en: { prompt: 'In “The Red Cord”, where was the red cord unpicked from?', choices: ['the basket liner', 'a child garment\u2019s collar', 'the bursar\u2019s belt', 'a corner of the fishing net'], answer: 1, ref: 'Echo No. 9 · I' },
  },
  {
    zh: { prompt: '《红绳》里，外来官员命人剪断红绳时……？', choices: ['剪了两下，结散了', '执剪的人停了手', '陆守灯当场答应了', '官员剪开了，但绳没断'], answer: 1, ref: '回响九 · 五' },
    en: { prompt: 'In “The Red Cord”, when the official ordered the cord cut…?', choices: ['it was cut, the knot fell apart', 'the scissors stopped before the handle', 'Lu Shousheng agreed on the spot', 'the official cut it, but the cord did not snap'], answer: 1, ref: 'Echo No. 9 · V' },
  },
  {
    zh: { prompt: '《钥匙》里，守门老人数钥匙，每次数的数目……？', choices: ['都一样', '不一样', '总是二十把', '总是十七把'], answer: 1, ref: '回响十 · 二' },
    en: { prompt: 'In “The Keys”, the old man counts the keys — each time the count…?', choices: ['is the same', 'is different', 'is always twenty', 'is always seventeen'], answer: 1, ref: 'Echo No. 10 · II' },
  },
  {
    zh: { prompt: '《钥匙》里，守门人不试钥匙的原因是……？', choices: ['怕钥匙断了', '试了就是开门=旧账重开', '钥匙太久没用了', '上级命令'], answer: 1, ref: '回响十 · 三' },
    en: { prompt: 'In “The Keys”, why must the doorkeeper never try the keys?', choices: ['they might snap', 'trying is the first step of reopening the old ledger', 'they have been unused too long', 'orders from above'], answer: 1, ref: 'Echo No. 10 · III' },
  },
  {
    zh: { prompt: '《带灰回家》里，灰被称成几份，每份多少？', choices: ['七份，每份一斤', '三份，每份半斤', '五份，每份一斤', '两份，每份十两'], answer: 0, ref: '第九章 · 三' },
    en: { prompt: 'In “Ash Carried Home”, how many portions were weighed, and how much each?', choices: ['seven, one jin each', 'three, half a jin each', 'five, one jin each', 'two, ten taels each'], answer: 0, ref: 'Chapter IX · III' },
  },
  {
    zh: { prompt: '《带灰回家》里，孩子第二次摸袋子，掌心……？', choices: ['是干的', '是湿的', '在发烫', '沾了盐'], answer: 1, ref: '第九章 · 四' },
    en: { prompt: 'In “Ash Carried Home”, the second time the boy touches the bag, his palm is…?', choices: ['dry', 'wet', 'burning', 'salted'], answer: 1, ref: 'Chapter IX · IV' },
  },
  {
    zh: { prompt: '《秤》里，秤砣每次停在第几道刻线？', choices: ['第二道', '第三道', '第四道', '第五道'], answer: 2, ref: '回响十一 · 三' },
    en: { prompt: 'In “The Scale”, where does the weight come to rest each time?', choices: ['the second line', 'the third line', 'the fourth line', 'the fifth line'], answer: 2, ref: 'Echo No. 11 · III' },
  },
  {
    zh: { prompt: '《秤》里，孩子在桌沿上划了几条浅痕？', choices: ['五条', '六条', '七条', '八条'], answer: 2, ref: '回响十一 · 五' },
    en: { prompt: 'In “The Scale”, how many grooves did the boy mark along the table’s edge?', choices: ['five', 'six', 'seven', 'eight'], answer: 2, ref: 'Echo No. 11 · V' },
  },
  {
    zh: { prompt: '《碗》里，妻子盛灰时，灰……？', choices: ['扬起了烟', '没有扬起烟，只在碗沿落下一圈暗痕', '烧焦了', '散落一地'], answer: 1, ref: '回响十二 · 三' },
    en: { prompt: 'In “The Bowl”, as she serves the ash, the ash…?', choices: ['rises as smoke', 'rises not at all, leaving only a dark ring along the rim', 'scorches', 'falls everywhere'], answer: 1, ref: 'Echo No. 12 · III' },
  },
  {
    zh: { prompt: '《碗》里，孩子摸碗沿时，手……？', choices: ['掀开了碗', '停在旧缺处，没敢掀开', '把灰倒出去了', '打破了碗'], answer: 1, ref: '回响十二 · 五' },
    en: { prompt: 'In “The Bowl”, when the boy touches the rim, his hand…?', choices: ['lifts the bowl open', 'stops at the old chip; it never lifts the bowl', 'pours the ash out', 'breaks the bowl'], answer: 1, ref: 'Echo No. 12 · V' },
  },
  {
    zh: { prompt: '《谁守灯》里，第一个进门的人……？', choices: ['答应了守灯', '没答应，只是没走出来', '开始打扫灯下', '熄灭了那盏灯'], answer: 1, ref: '第十章 · 二' },
    en: { prompt: 'In “Who Tends the Lamp”, the first one to enter…?', choices: ['agreed to keep the lamp', 'never agreed — they simply did not leave', 'began to sweep under it', 'put the lamp out'], answer: 1, ref: 'Chapter X · II' },
  },
  {
    zh: { prompt: '《谁守灯》里，守灯的人送进屋里的，是一天里没说出口的……？', choices: ['火', '话', '油', '水'], answer: 1, ref: '第十章 · 四' },
    en: { prompt: 'In “Who Tends the Lamp”, what feeds the lamp?', choices: ['fire', 'what goes unsaid', 'oil', 'water'], answer: 1, ref: 'Chapter X · IV' },
  },
  {
    zh: { prompt: '《门槛》里，柴总是放在哪里？', choices: ['门内桌上', '门槛外', '梁上', '窗台上'], answer: 1, ref: '回响十三 · 三' },
    en: { prompt: 'In “The Threshold”, where is the firewood always set?', choices: ['on the table inside', 'beyond the threshold', 'up on the beam', 'on the sill'], answer: 1, ref: 'Echo No. 13 · III' },
  },
  {
    zh: { prompt: '《门槛》里，守门人跨出门的时候……？', choices: ['有人送他', '门槛拦他', '无人送他，也没人问', '门开不了'], answer: 2, ref: '回响十三 · 五' },
    en: { prompt: 'In “The Threshold”, when someone crosses from inside out…?', choices: ['someone sees them off', 'the threshold stops them', 'no one sees them off, no one asks', 'the door will not open'], answer: 2, ref: 'Echo No. 13 · V' },
  },
  {
    zh: { prompt: '《柴》里，送柴的人敲门吗？', choices: ['敲，等有人应', '不敲，放下柴就走', '敲三下离开', '隔门报数'], answer: 1, ref: '回响十四 · 三' },
    en: { prompt: 'In “The Firewood”, does the bearer knock?', choices: ['yes, and waits for an answer', 'no — he sets the wood down and leaves', 'three knocks, then leaves', 'he calls the tally through the door'], answer: 1, ref: 'Echo No. 14 · III' },
  },
  {
    zh: { prompt: '《柴》里，柴在门槛外放几天才算归屋？', choices: ['一天', '两天', '三天', '五天'], answer: 2, ref: '回响十四 · 四' },
    en: { prompt: 'In “The Firewood”, how many days does the wood wait beyond the threshold before it counts as brought inside?', choices: ['one day', 'two days', 'three days', 'five days'], answer: 2, ref: 'Echo No. 14 · IV' },
  },
  {
    zh: { prompt: '《灰坑》里，灰坑在哪里，离门槛几步？', choices: ['门外东墙下，三步', '门内西墙下，六步', '门外西墙下，六步', '灶边，两步'], answer: 1, ref: '回响十五 · 一' },
    en: { prompt: 'In “The Ash-Pit”, where does the ash-pit lie — and how many paces from the door?', choices: ['outside, by the eastern wall, three paces', 'inside, by the western wall, six paces', 'outside, by the western wall, six paces', 'beside the stove, two paces'], answer: 1, ref: 'Echo No. 15 · I' },
  },
  {
    zh: { prompt: '《灰坑》里，压坑口的旧砖有几块？', choices: ['一块', '两块', '三块', '四块'], answer: 1, ref: '回响十五 · 五' },
    en: { prompt: 'In “The Ash-Pit”, how many old bricks cover the pit’s mouth?', choices: ['one', 'two', 'three', 'four'], answer: 1, ref: 'Echo No. 15 · V' },
  },
  {
    zh: { prompt: '《灯下的账》里，账房的人不记哪三个字？', choices: ['欠 · 应还 · 认领', '灯下 · 门外 · 封', '水 · 柴 · 油', '来过 · 出去 · 还留'], answer: 0, ref: '第十一章 · 三' },
    en: { prompt: 'In “The Ledger Beneath the Lamp”, which three words does the keeper never record?', choices: ['debt · to be repaid · to be claimed', 'beneath the lamp · beyond the door · sealed', 'water · firewood · oil', 'came · went · still here'], answer: 0, ref: 'Chapter XI · III' },
  },
  {
    zh: { prompt: '《灯下的账》里，账上最上面那行字……？', choices: ['写着交账的人的姓名', '无人认领，像一根钉在旧木里的铁钉', '是空的，后面才开始', '被磨掉了，只剩纸纹'], answer: 1, ref: '第十一章 · 二' },
    en: { prompt: 'In “The Ledger Beneath the Lamp”, the line at the very top of the ledger…?', choices: ['carries the name of the one who handed it over', 'belongs to no one — like an iron nail in old timber', 'is blank; the writing starts below it', 'has worn away to blank paper'], answer: 1, ref: 'Chapter XI · II' },
  },
  {
    zh: { prompt: '《潮来的时候》里，潮头先撞到门槛的是……？', choices: ['一支旧笔', '一枚坏船钉', '一片褪色布', '一捆柴'], answer: 1, ref: '第十二章 · 二' },
    en: { prompt: 'In “When the Tide Came Up”, the first thing struck against the threshold was…?', choices: ['an old pen', 'a broken ship’s nail', 'a faded cloth', 'a bundle of firewood'], answer: 1, ref: 'Chapter XII · II' },
  },
  {
    zh: { prompt: '《潮来的时候》里，潮水带走了什么？', choices: ['桌椅都没了', '一张旧名单不见了', '账本没了', '门没了'], answer: 1, ref: '第十二章 · 五' },
    en: { prompt: 'In “When the Tide Came Up”, what did the tide take?', choices: ['the table and chairs were gone', 'an old list went missing', 'the ledger disappeared', 'the door was gone'], answer: 1, ref: 'Chapter XII · V' },
  },
  {
    zh: { prompt: '《誊写》里，水吃掉了某些字，抄账人定下的规矩是……？', choices: ['猜一个补一个', '誊不准的，留白', '让孩子背出来补写', '整页作废'], answer: 1, ref: '第十三章 · 四' },
    en: { prompt: 'In “The Copying”, what rule did the keeper set after the water ate certain characters?', choices: ['guess one, write one', 'what cannot be copied for certain leaves its space blank', 'have the child recite and fill them in', 'discard the whole page'], answer: 1, ref: 'Chapter XIII · IV' },
  },
  {
    zh: { prompt: '《誊写》誊完之后，人们才知道丢了什么——丢的是什么？', choices: ['与第七口井对应的整页', '那支咸壳笔', '门槛上的船钉', '木面上的盐'], answer: 0, ref: '第十三章 · 七' },
    en: { prompt: 'In “The Copying”, only once the copying was done did anyone know what was lost — what was lost?', choices: ['the whole page tied to the seventh well', 'the salt-crusted brush-pen', 'the ship’s nail on the threshold', 'the salt on the wood'], answer: 0, ref: 'Chapter XIII · VII' },
  },
  {
    zh: { prompt: '《最后一栏》里，誊抄员核对誊清的页后发现……？', choices: ['第七页少了一行', '第七口井对应的那一页没有落款', '账簿被水吃掉了', '盐袋漏了'], answer: 1, ref: '回响（其十六） · 二' },
    en: { prompt: 'In “The Last Column”, after the copyist checked the freshly copied pages…?', choices: ['the seventh page was missing a line', 'the page tied to the seventh well bore no signature', 'the ledger had been eaten by water', 'the salt sack had torn'], answer: 1, ref: 'Echo No. 16 · II' },
  },
  {
    zh: { prompt: '《最后一栏》里，谁来到灯边，只能数出六口井？', choices: ['账簿的守护者', '巡路人', '能背诵潮汐教团往事的孩子', '铁月纪的使者'], answer: 2, ref: '回响（其十六） · 四' },
    en: { prompt: 'In “The Last Column”, who came to the lamp and could count only six wells?', choices: ['the keeper of the ledger', 'the patrolman', 'the child who could recite the Tide Conclave’s past', 'the envoy of the Iron-Moon Age'], answer: 2, ref: 'Echo No. 16 · IV' },
  },
  {
    zh: { prompt: '《蜡封》里，六口井封完之后，第七口的情形是……？', choices: ['蜡倒下去就封住了', '蜡倒了，井没有接住', '有人代封了', '改天再封也行'], answer: 1, ref: '回响（其十七） · 四' },
    en: { prompt: 'In “The Wax Seal”, after the six wells were sealed, what happened at the seventh?', choices: ['the wax set and sealed it', 'the wax was poured but the well did not take it', 'someone sealed it in their place', 'it could wait for another day'], answer: 1, ref: 'Echo No. 17 · IV' },
  },
  {
    zh: { prompt: '《蜡封》里，封井的人走石板街时，街上的人谁也没有……？', choices: ['看他们一眼', '问封井是为什么', '问封第几口', '帮他们搬蜡'], answer: 1, ref: '回响（其十七） · 一' },
    en: { prompt: 'In “The Wax Seal”, as the team walked the flagstone street, no one…?', choices: ['looked at them', 'asked why the wells were being sealed', 'asked which well was to be sealed', 'helped carry the wax'], answer: 1, ref: 'Echo No. 17 · I' },
  },
  {
    zh: { prompt: '《最后一夜》里，值夜的门吏听到海来到门口时，井是……？', choices: ['全都封着', '全都开着', '只有第一口开着', '第七口开着'], answer: 1, ref: '回响（其十八） · 一' },
    en: { prompt: 'In “The Last Night”, when the doorman heard the sea reach the door, the wells were…?', choices: ['all sealed', 'all open', 'only the first open', 'only the seventh open'], answer: 1, ref: 'Echo No. 18 · I' },
  },
  {
    zh: { prompt: '《最后一夜》里，天快亮时，报到的人是……？', choices: ['七盏灯报到了', '第七席的老人报到了', '没有人报到', '门吏报到了'], answer: 2, ref: '回响（其十八） · 四' },
    en: { prompt: 'In “The Last Night”, at near-dawn, who answered to the roll?', choices: ['the seven lamps answered', 'the elder of the seventh seat answered', 'no one answered', 'the doorman answered'], answer: 2, ref: 'Echo No. 18 · IV' },
  },
  {
    zh: { prompt: '《雨从东边来》里，风向倒转那一天，灯的火苗弯向……？', choices: ['向海的方向', '向内陆的方向', '笔直朝上', '熄灭了'], answer: 1, ref: '回响（其十九） · 一' },
    en: { prompt: 'In “The Rain Comes from the East”, on the day the wind turned, the lamp flame leaned…?', choices: ['towards the sea', 'towards the inland', 'straight upward', 'went out'], answer: 1, ref: 'Echo No. 19 · I' },
  },
  {
    zh: { prompt: '《雨从东边来》里，账簿的守护者在干页末尾落下哪六个字？', choices: ['东风 · 雨 · 灯未灭', '西风 · 雨 · 灯未灭', '盐尽 · 灯灭', '东风 · 灰 · 灯灭'], answer: 0, ref: '回响（其十九） · 五' },
    en: { prompt: 'In “The Rain Comes from the East”, what six characters did the Keeper of the Ledger set down at the end of the dry page?', choices: ['east wind · rain · the lamps were not out', 'west wind · rain · the lamps were not out', 'the salt was spent · the lamps went out', 'east wind · grey · the lamps went out'], answer: 0, ref: 'Echo No. 19 · V' },
  },
  {
    zh: { prompt: '《第一个名字》里，灰以前，报到簿上的名字用几种手迹写？', choices: ['一种', '两种', '三种', '七种'], answer: 2, ref: '回响（其二十） · 二' },
    en: { prompt: 'In “The First Name”, before the grey, in how many hands were the names written?', choices: ['one hand', 'two hands', 'three hands', 'seven hands'], answer: 2, ref: 'Echo No. 20 · II' },
  },
  {
    zh: { prompt: '《第一个名字》里，最后一页多出来的那一行字……？', choices: ['属于誊账人的手迹', '属于值夜人的手迹', '不属于灰以前任何一种手迹', '是页码'], answer: 2, ref: '回响（其二十） · 三' },
    en: { prompt: 'In “The First Name”, the line that appeared on the last page…?', choices: ['was in the copyist’s hand', 'was in the night watch’s hand', 'was not in any hand that had lived here before the grey', 'was a folio number'], answer: 2, ref: 'Echo No. 20 · III' },
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
        <Link className="bb-quiz-askButton" href="/bible" data-bible-quiz-verdict-bible>
          {c.restartBible}
        </Link>
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
