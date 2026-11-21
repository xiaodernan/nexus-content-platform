import { describe, expect, it } from 'vitest';
import {
  MODERATION_LLM_SYSTEM,
  buildModerationPrompt,
  parseModerationReply,
  augmentScan,
} from '../src/lib/llm-moderation';
import type { ModerationScan, ModerationFinding } from '@nexus/schemas';

/**
 * §MOD-1 · LLM 上下文研判的纯规则层判据。
 * 核心纪律：模型只能"补一条 review 线索"，它碰不到 blocked 判定、碰不到approved，
 * 也编不出不在原文里的 quote。
 */

const baseScan = (decision: 'clear' | 'review' | 'blocked' = 'clear', findings: ModerationFinding[] = []): ModerationScan => ({
  rulesVersion: 'rules-2026-09-24.1',
  decision,
  findings,
  limits: ['词表只挡最露骨的措辞…'],
  scanned: { pages: 1, textNodes: 3, assetRefs: 0 },
});

const TEXTS = [
  '欢迎来到我们的小店',
  '客服会帮你核对银行卡密码和短信验证码', // 词表没命中，但语境可疑
  '点击这里领取免费礼品',
];

describe('§MOD-1 审核 LLM 研判纯规则层', () => {
  describe('提示词', () => {
    it('system 明确只下 review 线索、不下结论、quote 必须逐字来自原文', () => {
      expect(MODERATION_LLM_SYSTEM).toContain('review');
      expect(MODERATION_LLM_SYSTEM).toContain('不要下结论');
      expect(MODERATION_LLM_SYSTEM).toContain('逐字');
      expect(MODERATION_LLM_SYSTEM).toContain('JSON');
    });

    it('user 逐段编号列出可见文本，并说明只找漏网的上下文', () => {
      const p = buildModerationPrompt(TEXTS);
      expect(p).toContain('[0] 欢迎来到我们的小店');
      expect(p).toContain('[1] 客服会帮你核对银行卡密码和短信验证码');
      expect(p).toContain('[2] 点击这里领取免费礼品');
      expect(p).toContain('词表');
    });

    it('空文本列表给出诚实提示，不编造可扫内容', () => {
      expect(buildModerationPrompt([])).toMatch(/没有|无可见文本|空/);
    });
  });

  describe('回执解析：quote 必须是原文子串', () => {
    it('合法回执产出一条 review finding', () => {
      const reply = JSON.stringify({
        findings: [{ textIndex: 1, quote: '核对银行卡密码和短信验证码', why: '索要银行凭证的语境' }],
      });
      const out = parseModerationReply(reply, TEXTS);
      expect(out).toHaveLength(1);
      expect(out[0]!.rule).toBe('llm.context_review');
      expect(out[0]!.level).toBe('review');
      expect(out[0]!.quote).toBe('核对银行卡密码和短信验证码');
      expect(out[0]!.where).toContain('text[1]');
      expect(out[0]!.why).toContain('索要银行凭证');
    });

    it('模型编造的 quote（不在任何原文里）被丢弃', () => {
      const reply = JSON.stringify({ findings: [{ textIndex: 1, quote: '这段文字根本不存在', why: 'x' }] });
      expect(parseModerationReply(reply, TEXTS)).toHaveLength(0);
    });

    it('textIndex 越界或 quote 与 textIndex 不匹配的被丢弃', () => {
      const bad1 = JSON.stringify({ findings: [{ textIndex: 99, quote: '欢迎', why: 'x' }] });
      const bad2 = JSON.stringify({ findings: [{ textIndex: 0, quote: '银行卡密码', why: 'x' }] }); // 这句在 [1] 不在 [0]
      expect(parseModerationReply(bad1, TEXTS)).toHaveLength(0);
      expect(parseModerationReply(bad2, TEXTS)).toHaveLength(0);
    });

    it('模型即使写了 level=blocked 也强制降为 review——机检之外不许自动挡', () => {
      const reply = JSON.stringify({ findings: [{ textIndex: 1, quote: '银行卡密码', why: 'x', level: 'blocked' }] });
      const out = parseModerationReply(reply, TEXTS);
      expect(out[0]!.level).toBe('review');
    });

    it('空 why / 空 quote / 空 findings / 垃圾文本都产出空数组', () => {
      expect(parseModerationReply('not json', TEXTS)).toHaveLength(0);
      expect(parseModerationReply('{"findings":[]}', TEXTS)).toHaveLength(0);
      expect(parseModerationReply('{"findings":[{"textIndex":1,"quote":"银行卡密码","why":"  "}]}', TEXTS)).toHaveLength(0);
    });

    it('markdown fence 也能解析', () => {
      const reply = '```json\n{"findings":[{"textIndex":0,"quote":"欢迎","why":"中性"}]}\n```';
      expect(parseModerationReply(reply, TEXTS)).toHaveLength(1);
    });

    it('至多 4 条，防止模型刷屏', () => {
      const findings = TEXTS.flatMap((_, i) => [
        { textIndex: i, quote: ['欢迎', '银行卡密码', '点击这里'][i], why: 'x' },
      ]);
      const reply = JSON.stringify({ findings: [...findings, ...findings] });
      expect(parseModerationReply(reply, TEXTS).length).toBeLessThanOrEqual(4);
    });
  });

  describe('合并进机检结果', () => {
    it('clear + 一条 LLM review → review（挂人工，不自动挡）', () => {
      const llm = parseModerationReply(JSON.stringify({ findings: [{ textIndex: 1, quote: '银行卡密码', why: '索要凭证' }] }), TEXTS);
      const merged = augmentScan(baseScan('clear'), llm);
      expect(merged.decision).toBe('review');
      expect(merged.findings).toHaveLength(1);
    });

    it('blocked 机检保持 blocked，LLM 线索只是附加，不会降级', () => {
      const blockedFinding: ModerationFinding = { rule: 'redline.minor_safety', level: 'blocked', quote: 'x', where: 'n1', why: 'y' };
      const llm = parseModerationReply(JSON.stringify({ findings: [{ textIndex: 1, quote: '银行卡密码', why: '索要凭证' }] }), TEXTS);
      const merged = augmentScan(baseScan('blocked', [blockedFinding]), llm);
      expect(merged.decision).toBe('blocked');
      expect(merged.findings).toHaveLength(2);
    });

    it('LLM 空线索 → 原 scan 原封不动，limits 不被改写', () => {
      const scan = baseScan('clear');
      const merged = augmentScan(scan, []);
      expect(merged).toEqual(scan);
      expect(merged.limits).toEqual(scan.limits);
    });

    it('去重：同一 where+quote 不重复 add（多次研判幂等）', () => {
      const f: ModerationFinding = { rule: 'llm.context_review', level: 'review', quote: '银行卡密码', where: 'text[1]', why: '索要凭证' };
      const merged = augmentScan(baseScan('clear', [f]), [f]);
      expect(merged.findings).toHaveLength(1);
    });

    it('limits 追加一条"模型研判只是线索、非裁决"的诚实说明', () => {
      const llm = parseModerationReply(JSON.stringify({ findings: [{ textIndex: 1, quote: '银行卡密码', why: '索要凭证' }] }), TEXTS);
      const merged = augmentScan(baseScan('clear'), llm);
      expect(merged.limits.some((l) => l.includes('模型') && l.includes('线索'))).toBe(true);
    });
  });
});
