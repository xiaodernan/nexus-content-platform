/**
 * §CANON-REVIEW · 正典合规评审（把 scripts/canon-review.mts 的判断搬进产品）。
 *
 * 为什么要有它：内容流水线的三条纪律——不引入索引之外的新专名、只写既有设定内的细节、
 * 锚句逐字可考且不撞句——过去只靠作者自觉。脚本能审，但只有开发者会跑；做成管理员页面
 * 之后，写新回响的人自己就能在发布前过一遍同一把尺子。
 *
 * 纪律（与脚本一致，不许放宽）：
 *  - 只给模型**紧凑索引**（章名 + 回响题名）与**既有锚句全文**，不给正典正文——所以
 *    "疑似新专名"是疑似，不是定罪，模型也必须这么措辞；
 *  - 没有就写"无"，不为了填满而编；
 *  - 模型只评审，不改写、不落库——这里只产出文本。
 */
import { BIBLE_CHAPTERS, BIBLE_ECHOES } from '@/world-bible/generated';
import { BIBLE_ANCHORS } from '@/world-bible/anchors.generated';

export type ReviewKind = 'echo' | 'chapter';

export const REVIEW_SYSTEM = [
  '你是《低语诸王》世界大典的合规评审。纪律：正典文本不得引入索引之外的新专名（人名/地名/组织名），',
  '只能写既有设定内的细节；不得与既有设定冲突；锚句必须逐字可考且不与既有锚句撞句。',
  '你只收到一份紧凑索引（章名与回响题名），收不到正文——所以"疑似新专名"是疑似，不是定罪。',
].join('\n');

/** 紧凑索引：章名 + 全部回响的编号与题名（不带正文）。模块级常量：正典是静态的，只算一次。 */
export const CANON_INDEX: string = (() => {
  const chapters = BIBLE_CHAPTERS.map((c) => `${String(c.order).padStart(3, '0')}-${c.titleZh}`);
  const echoes = BIBLE_ECHOES.map((e) => `E${String(e.order).padStart(2, '0')}-${e.titleZh}`);
  return [
    `正典章节（${chapters.length}）：`,
    ...chapters.map((c) => `- ${c}`),
    '',
    `回响（${echoes.length}，编号即顺序）：`,
    ...echoes.map((e) => `- ${e}`),
  ].join('\n');
})();

/** 既有锚句全文（zh，逐字）——撞句检查的唯一依据；没有它，模型只能猜。 */
export const ALL_ANCHORS: string = BIBLE_ANCHORS.map((a, i) => `${i + 1}. ${a.zh}`).join('\n');

/** 从候选正文里取它自己的锚句（`**锚句**：` 开头）。 */
export function extractCandidateAnchors(markdown: string): string[] {
  const out: string[] = [];
  for (const m of markdown.matchAll(/^\*\*锚句\*\*[:：]\s*(.+)$/gm)) {
    const text = m[1]!.trim();
    if (text) out.push(text);
  }
  return out;
}

/** 拼出完整评审请求。kind 决定多问哪两问（章节问纪元线与重复叙事）。 */
export function buildReviewPrompt(candidate: string, kind: ReviewKind): string {
  const isChapter = kind === 'chapter';
  const anchors = extractCandidateAnchors(candidate);
  return [
    `待评审${isChapter ? '正典章节' : '回响'}（中文原文）：`,
    '',
    candidate.trim(),
    '',
    '---',
    '',
    '正典紧凑索引：',
    '',
    CANON_INDEX,
    '',
    '---',
    '',
    `既有锚句全文（${BIBLE_ANCHORS.length} 条，逐字来自正典，用于 C 项撞句检查）：`,
    '',
    ALL_ANCHORS,
    '',
    '---',
    '',
    '请逐条回答（没有就说"无"，不要为了填满而编）：',
    'A. 疑似新专名：列出索引里找不到的人名/地名/组织名，各一句理由。',
    'B. 与既有设定冲突的陈述：列出与纪元/潮印数/已发生事件矛盾的句子，各一句理由。',
    `C. 锚句风险：${anchors.length} 条锚句里，哪几条看起来像在改写既有锚句（撞句）？`,
    `D. 一句话总结：这份${isChapter ? '章节' : '回响'}能不能按现状进正典。`,
    ...(isChapter
      ? [
          'E. 纪元线：这一章的纪元接在哪一章之后？索引里接得上吗？',
          'F. 重复叙事：有没有哪一章已经在写同一件事（同一场景/同一转折写两遍）？',
        ]
      : []),
  ].join('\n');
}

/** 候选文本的硬上界：一篇回响约 3–6KB，超过这个数说明贴错了东西（整卷/整章集合）。 */
export const MAX_CANDIDATE_CHARS = 24_000;
