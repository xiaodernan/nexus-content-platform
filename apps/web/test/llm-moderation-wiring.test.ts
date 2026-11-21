import { describe, expect, it } from 'vitest';
import {
  llmModerationEnabled,
  rulesVersionWithLlm,
  scanPublicationWithLlm,
  visibleTextsOf,
} from '../src/server/domain/moderationLlm';
import type { AiChatResult } from '../src/server/ai/client';
import { createDocument, createNode, findPage, type DesignDocument } from '@nexus/creative-model';

/** §MOD-1 接线判据（无 DB）：scanPublication 是纯函数，这里注入假 chat 钉 real/fallback。 */

const doc = (texts: string[]): DesignDocument => {
  const document = createDocument('审核测试');
  const page = findPage(document, document.activePageId) ?? document.pages[0]!;
  const root = page.nodes[page.rootId]!;
  // createDocument 自带样板内容；清空到只剩 root，测试才有确定的可见文本集
  page.nodes = { [root.id]: root };
  root.children = [];
  texts.forEach((text, i) => {
    const node = createNode({ type: 'text', name: `T${i}`, text, parentId: root.id });
    page.nodes[node.id] = node;
    root.children.push(node.id);
  });
  return document;
};

const okChat = (text: string) => (async () => ({
  ok: true,
  response: {
    requestId: 'x', capability: 'real', provider: 'fake', model: 'gpt-6.2-sol', text,
    usage: { provider: 'fake', model: 'gpt-6.2-sol', tokensIn: 1, tokensOut: 1, cachedTokens: 0, cacheReported: false, latencyMs: 1, toolCalls: 1, demoMode: false },
  } as const,
  orchestration: null,
})) as unknown as typeof import('../src/server/ai/client').chatWithCharacter;

const failChat = (() => async () => ({
  ok: false, status: 503, error: { code: 'provider-failed', message: 'down', retryable: true }, orchestration: null,
})) as unknown as typeof import('../src/server/ai/client').chatWithCharacter;

const throwChat = (() => async () => { throw new Error('boom'); }) as unknown as typeof import('../src/server/ai/client').chatWithCharacter;

describe('§MOD-1 审核 LLM 接线（无 DB）', () => {
  it('开关：显式 1/0；未设置时生产开、测试关', () => {
    expect(llmModerationEnabled({ NODE_ENV: 'production' })).toBe(true);
    expect(llmModerationEnabled({ NODE_ENV: 'test' })).toBe(false);
    expect(llmModerationEnabled({ NODE_ENV: 'test', NEXUS_MODERATION_LLM: '1' })).toBe(true);
    expect(llmModerationEnabled({ NODE_ENV: 'production', NEXUS_MODERATION_LLM: '0' })).toBe(false);
  });

  it('可见文本只取 node.text/alt，与机检口径一致', () => {
    expect(visibleTextsOf(doc(['甲', '乙']))).toEqual(['甲', '乙']);
  });

  it('模型给出合法线索 → 机检 clear 升 review，llmUsed=true', async () => {
    // 用 vi 模拟开关开启（process.env 在测试默认关），改临时设置
    const old = process.env.NEXUS_MODERATION_LLM;
    process.env.NEXUS_MODERATION_LLM = '1';
    try {
      const d = doc(['欢迎', '核对银行卡密码和验证码']);
      const r = await scanPublicationWithLlm(d, [], okChat(JSON.stringify({ findings: [{ textIndex: 1, quote: '银行卡密码', why: '索要凭证' }] })));
      expect(r.llmUsed).toBe(true);
      expect(r.llmFindings).toBe(1);
      expect(r.scan.decision).toBe('review');
      expect(r.scan.findings.some((f) => f.rule === 'llm.context_review')).toBe(true);
    } finally {
      if (old === undefined) delete process.env.NEXUS_MODERATION_LLM; else process.env.NEXUS_MODERATION_LLM = old;
    }
  });

  it('provider 失败 → 原样机检结果，llmUsed=false（增强不是门）', async () => {
    const old = process.env.NEXUS_MODERATION_LLM;
    process.env.NEXUS_MODERATION_LLM = '1';
    try {
      const plain = doc(['普通文案']);
      const r = await scanPublicationWithLlm(plain, [], failChat);
      expect(r.llmUsed).toBe(false);
      expect(r.llmFindings).toBe(0);
      expect(r.scan.decision).toBe('clear');
    } finally {
      if (old === undefined) delete process.env.NEXUS_MODERATION_LLM; else process.env.NEXUS_MODERATION_LLM = old;
    }
  });

  it('chat 抛错 → 不拖垮发布，返回机检结果', async () => {
    const old = process.env.NEXUS_MODERATION_LLM;
    process.env.NEXUS_MODERATION_LLM = '1';
    try {
      const r = await scanPublicationWithLlm(doc(['普通']), [], throwChat);
      expect(r.llmUsed).toBe(false);
      expect(r.scan.decision).toBe('clear');
    } finally {
      if (old === undefined) delete process.env.NEXUS_MODERATION_LLM; else process.env.NEXUS_MODERATION_LLM = old;
    }
  });

  it('没有可见文本 → 不调模型（llmUsed=false）', async () => {
    const old = process.env.NEXUS_MODERATION_LLM;
    process.env.NEXUS_MODERATION_LLM = '1';
    try {
      const r = await scanPublicationWithLlm(doc([]), [], okChat('{}'));
      expect(r.llmUsed).toBe(false);
    } finally {
      if (old === undefined) delete process.env.NEXUS_MODERATION_LLM; else process.env.NEXUS_MODERATION_LLM = old;
    }
  });

  it('规则版本标签带 +llm 只在用了模型时', () => {
    expect(rulesVersionWithLlm(true)).toContain('+llm');
    expect(rulesVersionWithLlm(false)).not.toContain('+llm');
  });
});
