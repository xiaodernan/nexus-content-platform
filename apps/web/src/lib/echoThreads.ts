import type { BibleChapter } from '@/world-bible/generated';

/**
 * §ECHO-THREAD · 回响线索索引：把 209 篇回响按「同一件东西被多篇写到」串成线。
 *
 * 为什么存在：正典有十三章、回响有二百零九篇——**大**已经有了，但"大"本身不是可探索。
 * 读者站在《低语诸王》门口想知道的是：潮汐历在几篇里出现过？夜钥匙为什么处处提它？
 * 这些答案散在 209 篇正文里，此前没有任何一处把它们摆到一起。
 *
 * 三条纪律（§159）：
 * 1. **只读、纯函数、零 provider、零写库**：同一份 generated.ts 输入永远同一份输出，
 *    所有平局按 echo.order 字典序兜底——索引不许"每次长得不一样"；
 * 2. **命中的证据是逐字锚句**，不是"模型说有关"。每条线索列出带它的锚句原文与所在回响编号，
 *    读者能自己翻回去核；
 * 3. **没说有关的就是无关**：一个线索只在真正出现它的回响里出现，不用"主题相近"凑数。
 *
 * 线索词表是**手写的一份小表**，不是从正文里现抽的：现抽会把「的」「是」也当成线索，
 * 而手写表里每一条都对应一个正典里有名字的东西（盐账、潮印、夜钥匙、不写名的灯……）。
 * 表短不可耻；短而准胜过全自动的一屏噪音。
 */

export interface EchoThreadAnchor {
  /** 回响序号（1-based，与 /bible 列表同序） */
  echo: number;
  /** 锚句中文原文（逐字） */
  zh: string;
  /** 锚句英文原文（逐字） */
  en: string;
}

/** 线索分两类：物件（一件有名字的东西）与地方（一个地名）。混在一张表里，
 *  「潮候院」这种出现在 189 篇里的地名会把所有物件线索压到看不见。 */
export type EchoThreadKind = 'object' | 'place';

export interface EchoThread {
  id: string;
  kind: EchoThreadKind;
  labelZh: string;
  labelEn: string;
  /** 出现过这条线索的回响序号，升序、去重 */
  echoes: number[];
  /** zh+en 合计命中次数 */
  hits: number;
  /** 带这条线索的锚句（按回响序号排序；每条线索最多留 MAX_ANCHORS 条，超出如实计数） */
  anchors: EchoThreadAnchor[];
  /** anchors 之外还有多少条没列出来（短了要说，别默默截断） */
  anchorsOmitted: number;
  /**
   * 线索簇：把 echoes 按"序号相差 ≤ GAP 算同簇"切成连续段。
   * 为什么不是两两配对：一条出现在 189 篇里的线索会炸出 17,766 对，
   * 那是对数不是信息。簇才回答"这条线索在正典里是哪几段时间里连续写的"。
   */
  arcs: { from: number; to: number; size: number }[];
}

export interface EchoThreadIndex {
  motifs: EchoThread[];
  /** 没有命中任何线索的回响序号——它们不是"漏抓"，是这一轮线索表没覆盖到 */
  orphans: number[];
  /** 扫过的回响总数，供界面说清"这是 209 篇里的多少" */
  scanned: number;
  /** 物件线索条数 / 地方线索条数，供界面分组说数 */
  objects: number;
  places: number;
}

/** 一篇回响压在哪些线索上，以及每条线索上还有谁。给阅读页做「顺藤摸瓜」用。 */
export interface EchoThreadNeighbours {
  /** 这篇回响的序号 */
  order: number;
  /** 它命中的线索（按该线索总篇数降序） */
  threads: {
    id: string;
    labelZh: string;
    labelEn: string;
    kind: EchoThreadKind;
    /** 同一条线索上的其它回响（不含本篇） */
    others: { order: number; slug: string; titleZh: string; titleEn: string }[];
  }[];
}

/**
 * 一篇回响的同线索邻居。`echoes` 是全量表，`slugs` 用来把序号翻成可点的链接——
 * 两者是同一批 `BibleChapter`，只是调用方各取所需。
 */
export function echoThreadNeighbours(
  index: EchoThreadIndex,
  order: number,
  echoes: readonly BibleChapter[],
): EchoThreadNeighbours {
  const byOrder = new Map(echoes.map((e) => [e.order, e] as const));
  const threads = index.motifs
    .filter((m) => m.echoes.includes(order))
    .map((m) => ({
      id: m.id,
      labelZh: m.labelZh,
      labelEn: m.labelEn,
      kind: m.kind,
      others: m.echoes
        .filter((o) => o !== order)
        .map((o) => byOrder.get(o))
        .filter((e): e is BibleChapter => Boolean(e))
        .map((e) => ({ order: e.order, slug: e.slug, titleZh: e.titleZh, titleEn: e.titleEn })),
    }))
    // 邻居多的线索排前面：那条最有可能带着读者走到没读过的地方
    .sort((a, b) => b.others.length - a.others.length || a.id.localeCompare(b.id));
  return { order, threads };
}

/** 每条线索最多列几条锚句。再多就成了复述正文，而正文一戳就能打开。 */
const MAX_ANCHORS = 4;

interface MotifSpec {
  id: string;
  kind: EchoThreadKind;
  labelZh: string;
  labelEn: string;
  /** 中文命名词（任一出现即算） */
  zh: string[];
  /** 英文命名词（小写比较） */
  en: string[];
}

/**
 * 手写线索表。每一条都对应正典里一个有名字的东西；放进来的判据是
 * 「它在两篇以上回响里被写到」，单词线索（只出现在一篇里的）不收——
 * 那是篇目，不是线索。
 */
const MOTIFS: readonly MotifSpec[] = [
  { id: 'tide-seal', kind: 'object', labelZh: '潮印', labelEn: 'the tide-seal', zh: ['潮印'], en: ['tide-seal', 'tide seal'] },
  { id: 'salt-ledger', kind: 'object', labelZh: '盐账', labelEn: 'the salt ledger', zh: ['盐账'], en: ['salt ledger'] },
  { id: 'night-key', kind: 'object', labelZh: '夜钥匙', labelEn: 'the night key', zh: ['夜钥匙', '夜钥匙坯'], en: ['night key'] },
  { id: 'unnamed-lamp', kind: 'object', labelZh: '不写名的灯', labelEn: 'the lamp that carries no name', zh: ['不写名的灯', '不写名的'], en: ['never wrote a name', 'carries no name', 'no name'] },
  { id: 'tower-keeper', kind: 'object', labelZh: '守塔人', labelEn: 'the tower keeper', zh: ['守塔人'], en: ['tower keeper', 'keeper of the tidal tower'] },
  { id: 'tide-almanac', kind: 'object', labelZh: '潮汐历', labelEn: 'the tide almanac', zh: ['潮汐历'], en: ['tide almanac', 'almanac'] },
  { id: 'tide-line', kind: 'object', labelZh: '潮脚线', labelEn: 'the tide-line', zh: ['潮脚线'], en: ['tide-line', 'tide line'] },
  { id: 'brass-anchor', kind: 'object', labelZh: '铜锚', labelEn: 'the brass anchor', zh: ['铜锚'], en: ['brass anchor'] },
  { id: 'hourglass', kind: 'object', labelZh: '沙漏', labelEn: 'the hourglass', zh: ['沙漏'], en: ['hourglass'] },
  { id: 'rice-salt-stone', kind: 'object', labelZh: '米盐石', labelEn: 'the rice-and-salt stone', zh: ['米盐石'], en: ['salt stone', 'rice-and-salt'] },
  // 盐井：Echo #4「盐在井里等潮」首写，E226/E227/E228 续写（巡夜人绕井、数盐、放盐人的竖琴）。
  // 它符合"两篇以上写到同一件有名字的东西"的收录判据，补进来让这几篇可被顺藤摸瓜。
  { id: 'salt-well', kind: 'object', labelZh: '盐井', labelEn: 'the salt well', zh: ['盐井', '井里', '井边', '井不'], en: ['salt well', 'the well', 'well rim'] },
  { id: 'paper-boat', kind: 'object', labelZh: '纸船', labelEn: 'the paper boat', zh: ['纸船'], en: ['paper boat'] },
  { id: 'iron-door', kind: 'object', labelZh: '铁门', labelEn: 'the iron door', zh: ['铁门'], en: ['iron door'] },
  { id: 'whalebone-harp', kind: 'object', labelZh: '鲸骨竖琴', labelEn: 'the whalebone harp', zh: ['竖琴', '鲸骨'], en: ['harp'] },
  { id: 'wind-banner', kind: 'object', labelZh: '旧旌', labelEn: 'the wind banner', zh: ['旧旌', '旌'], en: ['banner', 'stele that ledgers the wind'] },
  { id: 'letter-tree', kind: 'object', labelZh: '信树', labelEn: 'the letter tree', zh: ['信树'], en: ['letter tree'] },
  { id: 'river-stele', kind: 'object', labelZh: '河碑', labelEn: 'the river stele', zh: ['河碑'], en: ['river stele'] },
  { id: 'wall-calendar', kind: 'object', labelZh: '挂历', labelEn: 'the wall calendar', zh: ['挂历'], en: ['wall calendar'] },
  { id: 'brass-mirror', kind: 'object', labelZh: '旧铜镜', labelEn: 'the brass mirror', zh: ['铜镜'], en: ['brass mirror'] },
  { id: 'riddle-box', kind: 'object', labelZh: '谜箱', labelEn: 'the riddle box', zh: ['谜箱'], en: ['riddle box'] },
  { id: 'brass-smith', kind: 'object', labelZh: '铜匠', labelEn: 'the brass-maker', zh: ['铜匠'], en: ['brass-maker', 'brass maker'] },
  { id: 'copy-hall', kind: 'place', labelZh: '抄本院', labelEn: 'the copying hall', zh: ['抄本院'], en: ['copying hall', 'chancellery'] },
  { id: 'fog-harbor', kind: 'place', labelZh: '雾港', labelEn: 'Fog Harbor', zh: ['雾港'], en: ['fog harbor'] },
  { id: 'tide-conclave', kind: 'place', labelZh: '潮候院', labelEn: 'the Tide Conclave', zh: ['潮候院'], en: ['tide conclave', 'chapel of the tide'] },
];

/** 锚句行：`**锚句**：…`（zh）与 `**Anchor sentence**: …`（en）。 */
const ANCHOR_ZH = /^\*\*锚句\*\*：(.+)$/;
const ANCHOR_EN = /^\*\*Anchor sentence\*\*:\s*(.+)$/;

function countHits(haystack: string, needles: readonly string[]): number {
  let total = 0;
  for (const needle of needles) {
    if (!needle) continue;
    let from = 0;
    for (;;) {
      const at = haystack.indexOf(needle, from);
      if (at < 0) break;
      total += 1;
      from = at + needle.length;
    }
  }
  return total;
}

/** 抽出每篇回响的锚句对（zh/en 按出现顺序配对；篇内没有英文锚句时 zh 单独成条）。 */
function anchorsOf(echo: BibleChapter): { zh: string; en: string }[] {
  const zh: string[] = [];
  const en: string[] = [];
  for (const line of echo.markdownZh.split('\n')) {
    const m = ANCHOR_ZH.exec(line.trim());
    if (m) zh.push(m[1]!.trim());
  }
  for (const line of echo.markdownEn.split('\n')) {
    const m = ANCHOR_EN.exec(line.trim());
    if (m) en.push(m[1]!.trim());
  }
  const out: { zh: string; en: string }[] = [];
  for (let i = 0; i < Math.max(zh.length, en.length); i += 1) {
    out.push({ zh: zh[i] ?? zh[zh.length - 1] ?? '', en: en[i] ?? en[en.length - 1] ?? '' });
  }
  return out.filter((a) => a.zh || a.en);
}

export function buildEchoThreads(echoes: readonly BibleChapter[]): EchoThreadIndex {
  const perEcho = echoes.map((echo) => {
    const zhText = echo.markdownZh;
    const enText = echo.markdownEn.toLowerCase();
    const anchors = anchorsOf(echo);
    return { order: echo.order, zhText, enText, anchors };
  });

  /** 序号相差不超过这个数，算同一条线索里的连续一段（ narrative arc）。 */
  const ARC_GAP = 3;
  const motifs: EchoThread[] = [];
  for (const spec of MOTIFS) {
    const hitsByEcho: { echo: number; hits: number }[] = [];
    let total = 0;
    for (const e of perEcho) {
      const hits = countHits(e.zhText, spec.zh) + countHits(e.enText, spec.en);
      if (hits > 0) {
        hitsByEcho.push({ echo: e.order, hits });
        total += hits;
      }
    }
    if (hitsByEcho.length < 2) continue; // 只在一篇里出现的是篇目，不是线索
    hitsByEcho.sort((a, b) => a.echo - b.echo);

    const anchorRows: EchoThreadAnchor[] = [];
    for (const e of perEcho) {
      if (!hitsByEcho.some((h) => h.echo === e.order)) continue;
      const needles = [...spec.zh, ...spec.en];
      for (const a of e.anchors) {
        const hay = `${a.zh}\n${a.en.toLowerCase()}`;
        if (needles.some((n) => n && hay.includes(n.toLowerCase()))) {
          anchorRows.push({ echo: e.order, zh: a.zh, en: a.en });
        }
      }
    }
    anchorRows.sort((x, y) => x.echo - y.echo);

    motifs.push({
      id: spec.id,
      kind: spec.kind,
      labelZh: spec.labelZh,
      labelEn: spec.labelEn,
      echoes: hitsByEcho.map((h) => h.echo),
      hits: total,
      anchors: anchorRows.slice(0, MAX_ANCHORS),
      anchorsOmitted: Math.max(0, anchorRows.length - MAX_ANCHORS),
      arcs: arcsOf(hitsByEcho.map((h) => h.echo), ARC_GAP),
    });
  }

  // 物件在前、地方在后；同类里篇数多的在前。平局一律 id 字典序——同输入必须同输出。
  motifs.sort(
    (a, b) =>
      (a.kind === b.kind ? 0 : a.kind === 'object' ? -1 : 1) ||
      b.echoes.length - a.echoes.length ||
      b.hits - a.hits ||
      a.id.localeCompare(b.id),
  );

  const touched = new Set<number>();
  for (const m of motifs) for (const o of m.echoes) touched.add(o);
  const orphans = perEcho
    .map((e) => e.order)
    .filter((o) => !touched.has(o))
    .sort((a, b) => a - b);

  return {
    motifs,
    orphans,
    scanned: perEcho.length,
    objects: motifs.filter((m) => m.kind === 'object').length,
    places: motifs.filter((m) => m.kind === 'place').length,
  };
}

/** 把一串升序序号按 ARC_GAP 切成连续段。 */
function arcsOf(orders: readonly number[], gap: number): { from: number; to: number; size: number }[] {
  const out: { from: number; to: number; size: number }[] = [];
  let from = 0;
  let to = 0;
  for (let i = 1; i <= orders.length; i += 1) {
    const prev = orders[i - 1];
    const cur = orders[i];
    if (cur !== undefined && prev !== undefined && cur - prev <= gap) {
      to = i;
      continue;
    }
    out.push({ from: orders[from]!, to: orders[to]!, size: to - from + 1 });
    from = i;
    to = i;
  }
  return out.filter((a) => a.size > 0);
}
