/**
 * 「谜灯馆」（v717）—— 从世界文档推出一组"凭记忆点灯"的问答。
 *
 * 规则（与编年同一口径：纯函数、同输入永远同输出、零写库）：
 * - 题面全部来自真实条目——不是编出来的常识题，"考的"是你到底有没有在这个世界里读过书。
 * - 两档题：
 *   A. 回声的归属：题干是某条目的 memory 原文，问它属于哪个纪元（选项 = 本文档出现过的
 *      纪元 ∪ 「未标纪元」，恰好 4 个时刚好一题）；
 *   B. 条目的名字：题干是条目的 body 节选，问它叫什么（选项 = 4 个 story/history 标题）。
 * - 抽屉数量：A 最多 4 题、B 最多 4 题，合起来 ≤ 8 题；题序与选项位置由种子决定性打乱；
 * - 题干去重：同一条目只出一道题；无合格条目就少出题，一个也没有就返回空组（空态交给 UI）。
 * - 无时钟依赖：种子由调用方给出（项目 id 哈希 / 客户端再来一局时的新种子）。
 */

export const UNLABELED_ERA = '未标纪元';
const MAX_ROUNDS = 8;
const A_CAP = 4;
const B_CAP = 4;

/** 确定性种子随机数（与 atlas 同款实现风格，不共享依赖）。 */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 字符串 → 32 位种子（FNV-1a 变体）。 */
export function seedFromString(input: string): number {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export interface QuizNodeInput {
  id: string;
  kind: string;
  title: string;
  body: string;
  updatedAt: string;
  lore?: { era?: string; order?: number; memory?: string };
}

export interface QuizRound {
  id: string;
  family: 'A' | 'B';
  /** 题面（回声正文或 body 节选） */
  prompt: string;
  /** 四个选项，exactly 4 */
  options: [string, string, string, string];
  /** 正确选项在 options 中的下标 */
  answer: 0 | 1 | 2 | 3;
  /** 这道题出自的纪元（'未标纪元' 或空串，仅供展示，不是判分依据） */
  era: string;
  /** 这道题出自的条目标题，仅供结算页展示 */
  sourceTitle: string;
}

const cleanTitle = (n: QuizNodeInput) => (typeof n?.title === 'string' ? n.title.trim() : '');
const cleanBody = (n: QuizNodeInput) => (typeof n?.body === 'string' ? n.body.trim() : '');
const cleanMemory = (n: QuizNodeInput) => (typeof n?.lore?.memory === 'string' ? n.lore.memory.trim() : '');
const cleanEra = (n: QuizNodeInput) => (typeof n?.lore?.era === 'string' ? n.lore.era.trim() : '');

/** Fisher–Yates（返回副本，入参不被改动）。 */
function shuffle<T>(arr: readonly T[], rand: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function familyARounds(nodes: readonly QuizNodeInput[], rand: () => number): QuizRound[] {
  const withMemory = nodes.filter((n) => cleanMemory(n).length > 0);
  if (withMemory.length === 0) return [];
  // 选项池：本文档出现过的纪元 ∪ 「未标纪元」。池子不足 4 个，这本游戏太容易，题族放弃（宁缺毋滥）。
  const eraSet = new Set<string>();
  for (const n of withMemory) eraSet.add(cleanEra(n) || UNLABELED_ERA);
  if (!eraSet.has(UNLABELED_ERA)) eraSet.add(UNLABELED_ERA);
  const pool = Array.from(eraSet);
  if (pool.length < 4) return [];

  const rounds: QuizRound[] = [];
  for (const n of shuffle(withMemory, rand).slice(0, A_CAP)) {
    const correctEra = cleanEra(n) || UNLABELED_ERA;
    const distractors = shuffle(pool.filter((e) => e !== correctEra), rand).slice(0, 3);
    const options = shuffle([correctEra, distractors[0]!, distractors[1]!, distractors[2]!], rand);
    rounds.push({
      id: `a:${n.id}:${rounds.length}`,
      family: 'A',
      prompt: cleanMemory(n),
      options: options as [string, string, string, string],
      answer: options.indexOf(correctEra) as 0 | 1 | 2 | 3,
      era: correctEra,
      sourceTitle: cleanTitle(n),
    });
  }
  return rounds;
}

function familyBRounds(nodes: readonly QuizNodeInput[], rand: () => number): QuizRound[] {
  const candidates = nodes.filter((n) => {
    const t = cleanTitle(n);
    const b = cleanBody(n);
    return (n.kind === 'story' || n.kind === 'history') && t.length > 0 && b.length >= 8;
  });
  if (candidates.length < 4) return [];
  const titles = Array.from(new Set(candidates.map(cleanTitle)));
  if (titles.length < 4) return [];

  const rounds: QuizRound[] = [];
  for (const n of shuffle(candidates, rand)) {
    if (rounds.length >= B_CAP) break;
    const prompt = cleanBody(n);
    const distractors = shuffle(titles.filter((t) => t !== cleanTitle(n)), rand);
    if (distractors.length < 3) continue;
    const options = shuffle([cleanTitle(n), distractors[0]!, distractors[1]!, distractors[2]!], rand);
    rounds.push({
      id: `b:${n.id}:${rounds.length}`,
      family: 'B',
      prompt,
      options: options as [string, string, string, string],
      answer: options.indexOf(cleanTitle(n)) as 0 | 1 | 2 | 3,
      era: cleanEra(n),
      sourceTitle: cleanTitle(n),
    });
  }
  return rounds;
}

export function buildQuiz(nodes: readonly QuizNodeInput[], seed: number): QuizRound[] {
  const usable = nodes.filter((n) => n && typeof n.id === 'string' && n.id);
  const rand = mulberry32(seed >>> 0 || 1);
  const all = shuffle([...familyARounds(usable, rand), ...familyBRounds(usable, rand)], rand);
  // 同一条目只占一盏灯——混搭会让灯廊虚胖，也破坏公平（同题面变体连出两题）。
  const seen = new Set<string>();
  const rounds: QuizRound[] = [];
  for (const round of all) {
    const sourceId = round.id.split(':')[1] ?? round.id;
    if (seen.has(sourceId)) continue;
    seen.add(sourceId);
    rounds.push(round);
    if (rounds.length >= MAX_ROUNDS) break;
  }
  return rounds;
}

/**
 * §FE-CRS verdictFor — the closing lines after a lantern round.
 * Bilingual (v733): zh remains the default (tests pin it); en carries its own dictionary.
 */
const COPY_VERDICTS: Record<'zh' | 'en', Array<{ test: (score: number, total: number) => boolean; title: string; line: string }>> = {
  zh: [
    { test: (s, t) => t === 0, title: '无灯', line: '这座世界还没有题——先写几条 story / history，谜灯馆才会亮。' },
    { test: (s, t) => s / t >= 1, title: '灯海', line: '每一盏灯都应答了你——你记住了这个世界的每一道痕迹。' },
    { test: (s, t) => s / t >= 0.75, title: '整船灯芯', line: '你几乎能蒙着眼走完全程——只差几盏灯别熄。' },
    { test: (s, t) => s / t >= 0.5, title: '半盏灯', line: '你在这个世界里走了几程，还有几盏灯记着别人的名字。' },
    { test: (s, t) => s / t >= 0.25, title: '一枚灯芯', line: '火是真的，只是还不够亮——再来一局。' },
    { test: () => true, title: '初来乍到', line: '雾还没散。先去藏经阁走一圈，再回来点灯。' },
  ],
  en: [
    { test: (s, t) => t === 0, title: 'No Lanterns', line: 'This world has no questions yet — write a few story / history entries first.' },
    { test: (s, t) => s / t >= 1, title: 'Sea of Lanterns', line: 'Every lantern answered back. You are carrying this world in your memory.' },
    { test: (s, t) => s / t >= 0.75, title: 'A Ship of Wicks', line: 'Almost the whole road in the dark — only a few lamps left to stay lit.' },
    { test: (s, t) => s / t >= 0.5, title: 'Half a Lamp', line: 'You have walked some roads in this world; some lamps still remember other names.' },
    { test: (s, t) => s / t >= 0.25, title: 'One Lamp-Flame', line: 'The fire was real, only not yet bright enough — one more round.' },
    { test: () => true, title: 'Just Arrived', line: 'The fog has not cleared. Walk the Almanac once, then come light the lanterns.' },
  ],
};

/** 结算文案：按得分给出北境式判词。 */
export function verdictFor(score: number, total: number, locale: 'zh' | 'en' = 'zh'): { title: string; line: string } {
  for (const row of COPY_VERDICTS[locale]) {
    if (row.test(score, total)) return { title: row.title, line: row.line };
  }
  return { title: '?', line: '' };
}
