/**
 * §CP-1 命令面板的匹配与排序：**纯函数，不碰 DOM**。
 *
 * ## 为什么要自己写，而不是引一个模糊搜索库
 *
 * 候选集是**我们自己的命令表**，上限几十条，不是用户的任意数据。为它引一个 fzf 移植版
 * （或 Fuse.js）会同时买进三样不需要的东西：几 KB 的 bundle、一套没法解释的分数、
 * 以及"调不出结果时不知道为什么不匹配"的黑箱。这一片只有一条判据要满足：
 * **输进去的字符必须按顺序出现在标题里，且分数要能一眼看出为什么高**。
 *
 * ## 算法（两趟贪心，O(n·m) 上界，n=查询长度、m=标题长度）
 *
 * 单趟「最左优先」贪心有一个人所共知的坏例子：查询 `ab`、标题 `a_x_ab`——
 * 它会拿 `a(0) b(4)`，于是丢掉 `ab` 连续命中的加成，把一条本该排前的候选择到后面。
 * 反过来「最右优先」又会把 `ab_x_ab` 拿成后者，丢掉「从开头命中」的加成。
 *
 * 所以这里**两趟都跑，取分高者**（同分取正扫，视觉上更"从开头命中"）。代价是 2×O(n·m)，
 * 但 m 是我们的标题长度（十几个字符），n 是用户刚敲的几个字符——这个代价在按键之间
 * 完全不可见，而它换掉的是"偶尔排在很奇怪的位置"。
 *
 * 分数构成（全部是整数、可复算、写进测试）：
 * - 每命中一个字符 `+10`；
 * - 词边界（标题开头、空格/连字符/下划线/斜杠/句点/冒号之后，或小驼峰转折处）`+12`；
 * - 与上一个命中字符**相邻** `+14`（连续命中最值钱：`an` 命中 `Analytics` 比 `A…n…y` 强）；
 * - 整条标题以查询开头 `+40`；否则首个命中落在词边界 `+22`；
 * - 空隙总数按 `×2` 扣，最多扣 `24`（防止长标题只因"字多"永远垫底）。
 *
 * ## 中日韩
 *
 * 中文字符串没有"词边界"这个概念，`isBoundary` 对它们基本返回 false，于是中文命令只吃
 * 命中分 + 连续分 + 前缀分。这是**如实的结果而不是补偿**：对一个中文标题假装有词边界，
 * 只会让排序变成玄学。CJK 也没有大小写，`toLowerCase` 对它是恒等变换，不产生额外开销。
 *
 * ## 复杂度写在明处
 *
 * - 单个候选：`2 × O(n·m)`，n、m 都是个位数到十几；
 * - 整个候选集：`O(C · n · m)`，C 是命令数（本片 16 条）；键盘每敲一次全量重算，
 *   实测远低于一帧预算。**故意不做增量索引/前缀树**：C 这么小，为它建树是拿复杂度
 *   换不存在的性能（ADR-0104 的"摊还复杂度要能算出来"反过来用）。
 * - 只对**进入渲染的前 N 条**算高亮区间，不为全量算。
 */

/** 半开区间 `[start, end)`，单位是 UTF-16 码元（`slice` 直接用）。 */
export interface MatchRange {
  start: number;
  end: number;
}

export interface TextMatch {
  score: number;
  /** 按顺序合并后的命中区间；用了关键词命中而没有标题命中时是空数组。 */
  ranges: MatchRange[];
}

const BASE = 10;
const BOUNDARY = 12;
const CONSECUTIVE = 14;
const PREFIX = 40;
const WORD_START = 22;
const GAP_UNIT = 2;
const GAP_CAP = 24;

const SEPARATORS = ' -_/.:';

function isSeparator(ch: string | undefined): boolean {
  return ch !== undefined && SEPARATORS.includes(ch);
}

/** 真 = 这个位置是"词的开始"：分隔符之后，或小驼峰的大写字母。 */
function isWordStart(original: string, index: number): boolean {
  if (index === 0) return true;
  const prev = original[index - 1];
  if (isSeparator(prev)) return true;
  const cur = original[index];
  if (cur === undefined || prev === undefined) return false;
  return cur >= 'A' && cur <= 'Z' && prev >= 'a' && prev <= 'z';
}

/**
 * 一趟贪心扫描。`fromRight` 为真时从尾部倒着匹配（解决"最左优先把连续命中拆散"）。
 * 返回的是**升序**命中下标；匹配不上返回 null。
 */
function scan(query: string, text: string, fromRight: boolean): number[] | null {
  const hits: number[] = [];
  const n = query.length;
  const m = text.length;
  if (fromRight) {
    let j = m - 1;
    for (let i = n - 1; i >= 0; i -= 1) {
      const ch = query[i];
      while (j >= 0 && text[j] !== ch) j -= 1;
      if (j < 0) return null;
      hits.push(j);
      j -= 1;
    }
    hits.reverse();
    return hits;
  }
  let j = 0;
  for (let i = 0; i < n; i += 1) {
    const ch = query[i];
    while (j < m && text[j] !== ch) j += 1;
    if (j >= m) return null;
    hits.push(j);
    j += 1;
  }
  return hits;
}

/** 把命中下标折成区间（相邻的合成一段，渲染时少几个 `<mark>`）。 */
function toRanges(hits: readonly number[]): MatchRange[] {
  const ranges: MatchRange[] = [];
  for (const index of hits) {
    const last = ranges[ranges.length - 1];
    if (last && last.end === index) last.end = index + 1;
    else ranges.push({ start: index, end: index + 1 });
  }
  return ranges;
}

/** 给一组命中下标打分。`original` 用来判词边界（大小写与分隔符在原串上）。 */
function scoreHits(hits: readonly number[], original: string): TextMatch {
  let score = 0;
  let gap = 0;
  for (let k = 0; k < hits.length; k += 1) {
    const index = hits[k]!;
    score += BASE;
    if (isWordStart(original, index)) score += BOUNDARY;
    const prev = k > 0 ? hits[k - 1]! : -1;
    if (prev >= 0) {
      if (prev + 1 === index) score += CONSECUTIVE;
      else gap += index - prev - 1;
    }
  }
  const first = hits[0];
  if (first !== undefined) {
    if (first === 0) score += PREFIX;
    else if (isWordStart(original, first)) score += WORD_START;
  }
  score -= Math.min(GAP_CAP, gap) * GAP_UNIT;
  return { score, ranges: toRanges(hits) };
}

/**
 * 给一条标题打分。空查询返回 `{score:0, ranges:[]}`（不过滤，保留声明顺序）。
 * 匹配不上返回 `null`——**不是 0 分**，0 分会被排进列表里。
 */
export function scoreText(query: string, text: string): TextMatch | null {
  const q = query.trim().toLowerCase();
  if (!q) return { score: 0, ranges: [] };
  const lower = text.toLowerCase();
  const forward = scan(q, lower, false);
  const backward = scan(q, lower, true);
  if (!forward && !backward) return null;
  const a = forward ? scoreHits(forward, text) : null;
  const b = backward ? scoreHits(backward, text) : null;
  if (a && b) return b.score > a.score ? b : a;
  return (a ?? b)!;
}

/** 面板要排的东西的最小形状。组件侧的 `PaletteCommand` 结构上满足它。 */
export interface Rankable {
  id: string;
  label: string;
  /** 关键词（同义词、路径片段）。命中关键词**不产生高亮区间**——它在标题里找不到。 */
  keywords?: readonly string[];
}

export interface Ranked<T> {
  item: T;
  score: number;
  ranges: MatchRange[];
  /** true = 这一条是靠关键词命中的，标题里没有可高亮的字符。 */
  viaKeyword: boolean;
}

/**
 * 关键词命中的折扣：标题命中永远比"藏在 keywords 里的同义词"更该排前面。
 * 折扣取固定值而不是百分比的理由——百分比会让一条恰好很长的关键词反超标题命中。
 */
const KEYWORD_PENALTY = 20;

export interface RankOptions<T> {
  limit?: number;
  /** 额外加权（例如"最近用过"）。只影响同分次序，不改变匹配与否。 */
  boost?: (item: T) => number;
}

/** 默认最多渲染多少条。键盘跳转 + 视觉扫描的可用上限大约就是这个量级。 */
export const DEFAULT_RESULT_LIMIT = 40;

/**
 * 排序。**全序**，没有并列：分数 → 加权 → 标题长度（短的更贴近意图）→ 声明的 id。
 * 保成全序是为了键盘上下键的落点稳定——同分随实现顺序抖动，用户会以为是 bug。
 */
export function rank<T extends Rankable>(
  items: readonly T[],
  query: string,
  options: RankOptions<T> = {},
): Ranked<T>[] {
  const limit = options.limit ?? DEFAULT_RESULT_LIMIT;
  const boost = options.boost;
  const trimmed = query.trim();
  if (!trimmed) {
    return items.slice(0, limit).map((item) => ({ item, score: 0, ranges: [], viaKeyword: false }));
  }
  const out: Ranked<T>[] = [];
  for (const item of items) {
    const direct = scoreText(trimmed, item.label);
    let best: Ranked<T> | null = direct
      ? { item, score: direct.score, ranges: direct.ranges, viaKeyword: false }
      : null;
    if (!best && item.keywords && item.keywords.length) {
      let bestKeyword = 0;
      for (const keyword of item.keywords) {
        const match = scoreText(trimmed, keyword);
        if (match && match.score > bestKeyword) bestKeyword = match.score;
      }
      if (bestKeyword > 0) {
        best = { item, score: bestKeyword - KEYWORD_PENALTY, ranges: [], viaKeyword: true };
      }
    }
    if (best) out.push(best);
  }
  const boostOf = boost ?? (() => 0);
  out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ab = boostOf(b.item) - boostOf(a.item);
    if (ab !== 0) return ab;
    if (a.item.label.length !== b.item.label.length) return a.item.label.length - b.item.label.length;
    return a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0;
  });
  return out.slice(0, limit);
}
