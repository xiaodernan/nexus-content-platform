import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildDigest, SYSTEM_PROMPT, SYSTEM_PROMPT_CHAR_BUDGET, extractAnchorTexts } from '../src/lib/bibleAsk';
import { BIBLE_CHAPTERS, BIBLE_ECHOES } from '../src/world-bible/generated';

/**
 * 合同对账（2026-11-19 · cont.449 · ADR-0294）：
 * web 的 `SYSTEM_PROMPT_CHAR_BUDGET`、TS zod `AiChatRequestSchema.system.max`、
 * 以及 ai-service 真实读取的 `contracts/ai-chat-request.schema.json`
 * （Python 侧运行期校验的事实源）——三处必须同一个字。
 * 任何单边漂移到此为止：digest 长到顶，所有 bible-ask 在 Python 门 400。
 */
const wire = JSON.parse(
  readFileSync(new URL('../../../contracts/ai-chat-request.schema.json', import.meta.url), 'utf8'),
) as { properties: { system: { maxLength: number } } };
const WIRE_SYSTEM_MAX = wire.properties.system.maxLength;

/**
 * §BIBLE-4 · 问典 digest 契约门：
 * - digest 是 KV 前缀复用的物质基础——它必须是「字节级稳定前缀常量」；
 * - SYSTEM_PROMPT 全中文/英文混入最少量规则；所有锚句必须在里面；
 * - 长度预算守卫（≈ 30k chars ≈ 8k token）——少了模型没地可引，多了前缀越来越重。
 */
describe('§BIBLE-4 问典 digest 契约', () => {
  it('章节锚句抽取只挑出 zh+en 行，一章一组（不与正文其他行泄漏 @fn）', () => {
    const all = [...BIBLE_CHAPTERS, ...BIBLE_ECHOES];
    let zh = 0;
    let en = 0;
    for (const chapter of all) {
      zh += extractAnchorTexts(chapter.markdownZh, 'zh').length;
      en += extractAnchorTexts(chapter.markdownEn, 'en').length;
    }
    expect(zh).toBe(1291);
    expect(en).toBe(1291);
  });

  it('SYSTEM_PROMPT 长度 < 预算（≈30k chars）', () => {
    expect(SYSTEM_PROMPT.length).toBeLessThanOrEqual(SYSTEM_PROMPT_CHAR_BUDGET);
  });

  it('digest 预算与 wire 合同同一个字（ADR-0294 · 越顶则 /v1/ai/chat 全 400）', () => {
    expect(SYSTEM_PROMPT_CHAR_BUDGET).toBe(320_000);
    expect(WIRE_SYSTEM_MAX).toBe(320_000);
    expect(SYSTEM_PROMPT.length).toBeLessThanOrEqual(WIRE_SYSTEM_MAX);
  });

  it('五章卷名都在摘要里（canon 基准点）', () => {
    for (const chapter of BIBLE_CHAPTERS) {
      expect(SYSTEM_PROMPT).toContain(chapter.titleZh);
    }
  });

  it('buildDigest 是确定性的（同输入同输出，KV 前缀可重现）', () => {
    const a = buildDigest(BIBLE_CHAPTERS, BIBLE_ECHOES);
    const b = buildDigest(BIBLE_CHAPTERS, BIBLE_ECHOES);
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(1_000);
    expect(a).toContain('END OF DIGEST');
  });

  it('规则要求中文问句用中文回答、英文问句用英文回答（不夹杂）', () => {
    expect(SYSTEM_PROMPT).toContain('Chinese questions get Chinese answers');
    expect(SYSTEM_PROMPT).toContain('典籍里没有 / Not in the canon');
  });
});
