/**
 * §CANON-REVIEW 正典评审门（2026-11-22）。
 *
 * 守三件事：
 * 1. 评审提示词真的把「候选 + 紧凑索引 + 全部既有锚句」都带上了——缺一样，模型就只能猜；
 * 2. 章节多问的两问（纪元线/重复叙事）只在 chapter 出现，回响不夹带；
 * 3. 面板用的每个 cr-* 类在 globals.css 都有定义，双语键齐全——否则页面会裸奔。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  REVIEW_SYSTEM,
  CANON_INDEX,
  ALL_ANCHORS,
  buildReviewPrompt,
  extractCandidateAnchors,
  MAX_CANDIDATE_CHARS,
} from '../src/server/domain/canonReview';
import { BIBLE_ANCHORS } from '@/world-bible/anchors.generated';
import { BIBLE_ECHOES, BIBLE_CHAPTERS } from '@/world-bible/generated';

const ROOT = join(__dirname, '..');
const CANDIDATE = [
  '# 低语诸王 · 世界大典 · 回响（其二百一十六）：「试刀」',
  '',
  '**锚句**：那把刀第一次开口，是在没有人磨它的时候。',
  '',
  '正文一段，用于长度与包含性检查。',
].join('\n');

describe('§CANON-REVIEW 提示词构造', () => {
  it('紧凑索引覆盖全部章节与回响，但不带正文', () => {
    expect(CANON_INDEX).toContain(`正典章节（${BIBLE_CHAPTERS.length}）`);
    expect(CANON_INDEX).toContain(`回响（${BIBLE_ECHOES.length}`);
    expect(CANON_INDEX).toContain(BIBLE_CHAPTERS[0]!.titleZh);
    expect(CANON_INDEX).toContain(BIBLE_ECHOES[0]!.titleZh);
    // 索引是「题名级」，不该出现锚句那种整句
    expect(CANON_INDEX).not.toContain(BIBLE_ANCHORS[0]!.zh);
  });

  it('既有锚句全文逐条在场（撞句检查的唯一依据）', () => {
    const lines = ALL_ANCHORS.split('\n').filter(Boolean);
    expect(lines).toHaveLength(BIBLE_ANCHORS.length);
    expect(lines[0]).toBe(`1. ${BIBLE_ANCHORS[0]!.zh}`);
    expect(lines[lines.length - 1]).toBe(`${BIBLE_ANCHORS.length}. ${BIBLE_ANCHORS[BIBLE_ANCHORS.length - 1]!.zh}`);
  });

  it('候选锚句提取只认 `**锚句**：` 行', () => {
    expect(extractCandidateAnchors(CANDIDATE)).toEqual(['那把刀第一次开口，是在没有人磨它的时候。']);
    expect(extractCandidateAnchors('没有锚句的正文')).toEqual([]);
  });

  it('回响提示词带候选/索引/锚句与 A–D 四问，不带章节专属两问', () => {
    const p = buildReviewPrompt(CANDIDATE, 'echo');
    expect(p).toContain('那把刀第一次开口');
    expect(p).toContain(CANON_INDEX);
    expect(p).toContain(ALL_ANCHORS.slice(0, 80));
    for (const q of ['A. 疑似新专名', 'B. 与既有设定冲突', 'C. 锚句风险', 'D. 一句话总结']) {
      expect(p).toContain(q);
    }
    expect(p).not.toContain('E. 纪元线');
    expect(p).not.toContain('F. 重复叙事');
  });

  it('章节提示词多问纪元线与重复叙事', () => {
    const p = buildReviewPrompt(CANDIDATE, 'chapter');
    expect(p).toContain('待评审正典章节');
    expect(p).toContain('E. 纪元线');
    expect(p).toContain('F. 重复叙事');
  });

  it('system 明说「疑似不是定罪」——只给索引，不许当判决', () => {
    expect(REVIEW_SYSTEM).toContain('疑似');
    expect(REVIEW_SYSTEM).toContain('不是定罪');
  });

  it('候选上限是个有限数，防贴整卷', () => {
    expect(MAX_CANDIDATE_CHARS).toBeGreaterThan(4000);
    expect(MAX_CANDIDATE_CHARS).toBeLessThan(100_000);
  });
});

describe('§CANON-REVIEW 面板静态门', () => {
  const panel = readFileSync(join(ROOT, 'src/app/admin/canon-review/CanonReviewPanel.tsx'), 'utf-8');
  const page = readFileSync(join(ROOT, 'src/app/admin/canon-review/page.tsx'), 'utf-8');
  const css = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf-8');

  it('面板每个 cr-* 类在 globals.css 都有定义', () => {
    const used = [...new Set([...panel.matchAll(/className="(cr-[A-Za-z]+)"/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThanOrEqual(10);
    for (const cls of used) {
      expect(css, `缺样式 .${cls}`).toContain(`.${cls} {`);
    }
  });

  it('页面与面板双语键同序同量（zh/en 不偏科）', () => {
    for (const src of [panel, page]) {
      const zh = src.indexOf('zh: {');
      const en = src.indexOf('en: {');
      expect(zh).toBeGreaterThan(-1);
      expect(en).toBeGreaterThan(zh);
    }
    // 面板里 zh/en 的键名集合必须一致
    const zhBlock = panel.slice(panel.indexOf('zh: {'), panel.indexOf('en: {'));
    const enBlock = panel.slice(panel.indexOf('en: {'));
    const keys = (b: string) => [...new Set([...b.matchAll(/^\s{4}([a-zA-Z]+):/gm)].map((m) => m[1]!))].sort();
    expect(keys(zhBlock)).toEqual(keys(enBlock));
  });

  it('页面与面板都有可机检的 data 钩子，且面板只读（无接受/拒绝按钮）', () => {
    expect(page).toContain('data-canon-review-root');
    expect(panel).toContain('data-canon-review-panel');
    expect(panel).toContain('data-canon-review-input');
    expect(panel).toContain('data-canon-review-submit');
    expect(panel).toContain('data-canon-review-result');
    // 只读承诺：代码（不含注释）里不该出现「接受/驳回/写入正典」这类动作。
    // 注释里那句「没有接受/拒绝按钮」正是在陈述这条承诺，不能算违规。
    const code = panel.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code).not.toMatch(/接受|驳回|写入正典|accept|reject/i);
  });
});
