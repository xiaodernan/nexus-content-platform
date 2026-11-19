/**
 * §BIBLE-4 · 问典（`/bible/ask`）——正典问答的上下文构造器。
 *
 * 规矩：
 * - digest 是**字节级稳定前缀**：同一版本构建两次，输出逐字节一致（§CACHE-4：前缀稳定才有 KV 复用）。
 *   任何人改动 docs/world-bible 后必须重新生成快照（gen:bible-snapshot）——digest 就跟着变，不必改代码。
 * - 不塞了整篇正文（六万字）：塞「卷名 + 逐章逐回响锚句 + 纪元线」即可；LLM 缺一句的时候宁可从严不答。
 * - 正典里没有的问题，系统提示词要求模型明确说「典籍没有」、绝不编造（§159）。
 * - digest 输入来自 `@/world-bible/generated`：validator 已保证锚句成对、快照与真值一致。
 */
import { BIBLE_CHAPTERS, BIBLE_ECHOES, BIBLE_APPENDICES, type BibleChapter } from '@/world-bible/generated';

/** 锚句抽取：`**锚句**：` / `**Anchor sentence**:` 开头的行。可选 lang 限定语言。 */
export function extractAnchorTexts(markdown: string, lang?: 'zh' | 'en'): string[] {
  const out: string[] = [];
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('**锚句**')) {
      if (lang === 'en') continue;
      const text = line.replace(/^\*\*锚句\*\*[:：]?\s*/, '').trim();
      if (text) out.push(text);
    } else if (line.startsWith('**Anchor sentence**')) {
      if (lang === 'zh') continue;
      const text = line.replace(/^\*\*Anchor sentence\*\*[:：]?\s*/, '').trim();
      if (text) out.push(text);
    }
  }
  return out;
}

/** 章节正文去掉首行 `# 标题` 后返回（快照解析器已经剥过 `#` 大标题；这里守一道防御性边界）。 */
export function bodyWithoutTitle(markdown: string): string {
  const idx = markdown.indexOf('\n');
  const rest = idx === -1 ? '' : markdown.slice(idx + 1);
  return rest.trim();
}

function chapterDigestV2(ch: BibleChapter): string {
  const zhBody = bodyWithoutTitle(ch.markdownZh);
  const zhAnchorLines = extractAnchorTexts(ch.markdownZh, 'zh');
  const enAnchorLines = extractAnchorTexts(ch.markdownEn, 'en');
  const anchorBlock = [
    zhAnchorLines.length > 0 ? 'ANCHORS（中英字字对齐）:' : null,
    ...zhAnchorLines.map((a, i) => `- [${i + 1}] ${a}`),
    ...enAnchorLines.map((a, i) => `- [${i + 1}] ${a}`),
  ].filter((l): l is string => l !== null);
  return [
    `## Chapter ${String(ch.order).padStart(3, '0')} · ${ch.titleZh} / ${ch.titleEn} · ${ch.eraLineZh}`,
    '',
    zhBody,
    '',
    ...anchorBlock,
  ].join('\n');
}

function bodyExcerpt(markdown: string): string {
  const idx = markdown.indexOf('\n');
  const rest = idx === -1 ? '' : markdown.slice(idx + 1);
  return rest.trim();
}

function appendixDigest(app: BibleChapter): string {
  const zhBody = bodyExcerpt(app.markdownZh);
  return [
    `### Appendix ${String(app.order).padStart(2, '0')} · ${app.titleZh} / ${app.titleEn}`,
    zhBody,
  ].join('\n');
}

// Echoes: 全量正文配额制（newest-first）。zh 正文合计 ≤ 160k chars；装不下的旧篇只留题名 + 中英锚句。
// 预算常数见 SYSTEM_PROMPT_CHAR_BUDGET（320k chars contract 上限）。
// 为什么配额制：全部 125 篇正文 ≈ 490k chars（≈330K tokens，已实测装不进 256k 字符契约，也超 provider 窗口）；
// 最近的《典籍》篇（最近 45–50 篇）是出问答最直接的现场证源，旧篇由锚句覆盖定位即可。
const ECHO_BODY_CHAR_BUDGET = 125_000;
const fullEchoOrders = (() => {
  let budget = ECHO_BODY_CHAR_BUDGET;
  const acc = new Set<number>();
  for (const e of [...BIBLE_ECHOES].reverse()) {
    const zh = bodyExcerpt(e.markdownZh).length;
    if (budget - zh < 0) break;
    budget -= zh;
    acc.add(e.order);
  }
  return acc;
})();
function echoDigest(echo: BibleChapter): string {
  // Echoes: 配额选中的篇（newest-first）全量正文 + 锚句；其余保留题名 + 锚句（zh/en）。
  const zhBody = bodyExcerpt(echo.markdownZh);
  const zhAnchors = extractAnchorTexts(echo.markdownZh, 'zh');
  const full = fullEchoOrders.has(echo.order);
  return [
    `### Echo ${String(echo.order).padStart(2, '0')} · ${echo.titleZh} / ${echo.titleEn}`,
    ...(full ? ['', zhBody, ''] : []),
    'ANCHORS (逐字对齐对照见 world bible；机检只认 zh 锚句编号，与 canon-answer-graph 一致):',
    ...zhAnchors.map((a, i) => `- [${i + 1}] ${a}`),
  ].join('\n');
}

/** 纯 digest 构造（测试友好：传入数据而不是读全局）。 */
export function buildDigest(
  chapters: readonly BibleChapter[],
  echoes: readonly BibleChapter[],
  appendices: readonly BibleChapter[] = BIBLE_APPENDICES,
): string {
  return [
    '# THE WORLD BIBLE — CANON DIGEST (低语诸王 · 世界大典)',
    'World: «The Whispers’ Kings / 低语诸王». Era: the Institute Age (潮候院), after the 41st Convocation.',
    `Thirteen canonical chapters (full text below). ${echoes.length} echoes (recent full bodies under a 160k-zh-char quota + zh/en anchor lines for every echo). ${appendices.length} appendices (geography, glossary, chronology).`,
    '',
    chapters.map(chapterDigestV2).join('\n\n'),
    '',
    '## Appendices (附录)',
    appendices.map(appendixDigest).join('\n\n'),
    '',
    '## Echoes (回响)',
    echoes.map(echoDigest).join('\n\n'),
    '',
    'END OF DIGEST',
  ].join('\n');
}

/** digest 单例：/bible/ask 与 StateGraph 正典问答管线共用同一份字节（KV 前缀复用，§CACHE-4）。 */
export const CANON_DIGEST = buildDigest(BIBLE_CHAPTERS, BIBLE_ECHOES);

/** 正典 → 字节级稳定的 system prompt。改动 docs/world-bible 后重生成快照即可，不需要改代码。 */
export const SYSTEM_PROMPT = [
  'You are the Tidekeeper of the Tide Conclave. You answer readers about the world of «The Whispers’ Kings» ONLY from the canon digest below.',
  'Hard rules:',
  '1. Answer strictly from the digest. Everything else you know about this world is off-limits.',
  '2. If the digest does not contain the answer, say "典籍里没有 / Not in the canon" in the asker’s language, and stop. Do NOT invent.',
  '3. Answer in the language of the asker’s question. Chinese questions get Chinese answers, English get English, nothing else. No mixed-language answers.',
  '4. Keep answers short: at most 160 words. Always point at WHICH chapter or echo the answer came from (潮沙盘, 雾港, 收件人 …).',
  '5. Names that appear in the digest must stay verbatim (潮沙盘, 半月章, 雾港, 里巷子, 米缸月, 第四十一次大会…).',
  '6. Quantity discipline: when the asker asks about a count, size, length, ordinal or date, answer ONLY with the exact figure the digest states; if the digest does not state that figure, say "典籍里没有 / Not in the canon" for that part rather than inventing one. A wrong number is worse than no number.',
  '',
  CANON_DIGEST,
].join('\n');

/** 预算守卫（assert 在测试里跑）：全量正文 + 锚句，总 digest ≈ 195k-205k tokens，provider KV 全 lane 实测承得下（见 docs/evidence/big-context-provenance* · big-context-token-2026-11-18）。2026-11-19 抬 256→320K（cont.412）。 */
export const SYSTEM_PROMPT_CHAR_BUDGET = 320_000;

/** 问答用量结构（mock-friendly — 校验跑到测试里）。 */
export interface BibleAskResult {
  readonly question: string;
  readonly answer: string;
  readonly capability: string;
  readonly model: string;
  readonly cachedTokens: number;
  readonly cacheReported: boolean;
}

/** 给前端用的正典选项示例（两个白拿的例句，双语，恰好对应 digest 的热点）。 */
export const EXAMPLE_QUESTIONS: ReadonlyArray<{ zh: string; en: string }> = [
  { zh: '《收件人》里谁收到了那张签收单？', en: 'Who signed for the receipt in The Addressee?' },
  { zh: '第四十一次大会散会后发生了什么？', en: 'What happened after the forty-first Convocation?' },
];
