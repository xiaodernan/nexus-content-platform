/**
 * §TIDE-ORACLE-VERIFY · 潮汐预言的引文自检（cont.359，2026-11-19）
 *
 * 为什么存在：潮汐预言（/tide-oracle）只准从正典里答——正典没写的，潮一个字也说不出来。
 * 这个模块把海报上的承诺做成可以机检的一行：**回答里逐字出现了没有出自典籍的锚句**。
 *
 * 不是 LLM 自查 LLM——provider 评估自己的输出不会更诚实，而是确定性字符串对齐：
 * 正典的锚句逐字进 digest，模型若引典、必然原样出现其中。规则：
 * 1. 归一化：去掉所有空白字符 + 去掉所有引号（中英直弯单双）+ 英文小写化；
 * 2. 引用判定：归一化后的回答串包含某条归一化锚句（长度 ≥ 8 个非空白字符）→ cited；
 * 3. declined：回答里出现「典籍里没有」/"not in the canon"/"Not in the canon" → 正典没写的诚实回答本身；
 * 4. 其他 → not-cited（自由作答——不透着进度条就说明模型绕着正典说话了，如实标记）。
 * 不伪造判据：provider 引的若只是近义转述，它会被如实判 not-cited。
 */
import { BIBLE_CHAPTERS, BIBLE_ECHOES } from '@/world-bible/generated';
import { extractAnchorTexts } from '@/lib/bibleAsk';

const QUOTE_MARKS = /[「」“”‘’"'“”‘’⸢⸣〝〞〔〕【】《》]/g;
// 所有引号 + 书名号一并按归一化移除（引号包锚句是最常见的被引方式）

// 归一化后回答是去空白的，所以判据也要用去空白后的模式比较
const DECLINED_PATTERNS = ['典籍里没有', '典籍里没写', '典籍里没有写', '典籍里没有记载', '典籍里没有记', 'notinthecanon', 'canondoesnot', 'canondoesn', 'canondoeshasnot'];

const MIN_ANCHOR = 8;

export type AnchorCitation =
  | { readonly clause: 'cited'; readonly anchors: readonly string[] }
  | { readonly clause: 'declined' }
  | { readonly clause: 'not-cited' };

let _normalizedCache: readonly { normalized: string; original: string }[] | null = null;

function normalizedQuote(source: string): string {
  return source
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(QUOTE_MARKS, '')
    .toLowerCase();
}

function anchorCorpus(): readonly { normalized: string; original: string }[] {
  if (_normalizedCache) return _normalizedCache;
  const all: { normalized: string; original: string }[] = [];
  for (const entry of [...BIBLE_CHAPTERS, ...BIBLE_ECHOES]) {
    all.push(...extractAnchorTexts(entry.markdownZh, 'zh').map((a) => ({ normalized: normalizedQuote(a), original: a })));
    all.push(...extractAnchorTexts(entry.markdownEn, 'en').map((a) => ({ normalized: normalizedQuote(a), original: a })));
  }
  _normalizedCache = all.filter((a) => a.normalized.length >= MIN_ANCHOR);
  return _normalizedCache;
}

/** 判断一段回答是否逐字引了锚句 / 诚实拒答 / 自由作答 */
export function verifyAnchorCitation(answer: string): AnchorCitation {
  const text = normalizedQuote(answer);
  if (!text) return { clause: 'not-cited' };
  if (DECLINED_PATTERNS.some((p) => text.includes(p.toLowerCase()))) {
    return { clause: 'declined' };
  }
  const anchors: string[] = [];
  for (const anchor of anchorCorpus()) {
    if (text.includes(anchor.normalized)) anchors.push(anchor.original);
    if (anchors.length >= 6) break; // 前 6 条足够说明；避免极端长回答 O(N·A)
  }
  return anchors.length > 0 ? { clause: 'cited', anchors } : { clause: 'not-cited' };
}
