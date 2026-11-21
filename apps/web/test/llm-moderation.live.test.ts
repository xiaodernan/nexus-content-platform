import { describe, expect, it } from 'vitest';
import { createDocument, createNode, findPage, type DesignDocument } from '@nexus/creative-model';
import { scanPublication, type AssetProvenance } from '../src/server/domain/moderation';
import { scanPublicationWithLlm } from '../src/server/domain/moderationLlm';

/**
 * §MOD-1 真机验证（gpt-6.2-sol）：只在 NEXUS_MODERATION_LLM_LIVE=1 时跑。
 * 默认 skip，避免常规 CI 烧真 token。
 */
const LIVE = process.env.NEXUS_MODERATION_LLM_LIVE === '1';

function doc(texts: string[]): DesignDocument {
  const document = createDocument('审核真机');
  const page = findPage(document, document.activePageId) ?? document.pages[0]!;
  const root = page.nodes[page.rootId]!;
  page.nodes = { [root.id]: root };
  root.children = [];
  texts.forEach((text, i) => {
    const node = createNode({ type: 'text', name: `T${i}`, text, parentId: root.id });
    page.nodes[node.id] = node;
    root.children.push(node.id);
  });
  return document;
}

(LIVE ? describe : describe.skip)('§MOD-1 真机 gpt-6.2-sol 审核研判', () => {
  it('词表漏掉的诈骗语境 → 模型补一条 review 线索，quote 逐字来自原文', async () => {
    const d = doc([
      '欢迎来到星海读书会',
      '活动名额有限，加客服微信领福利红包，先交 99 元激活账户即可提现',
      '我们的社区守则与隐私说明',
    ]);
    const baseline = scanPublication(d, [] as AssetProvenance[]);
    expect(baseline.decision).toBe('clear'); // 词表确实没命中

    process.env.NEXUS_MODERATION_LLM = '1';
    try {
      const r = await scanPublicationWithLlm(d, []);
      expect(r.llmUsed).toBe(true);
      // 模型可能给出 0 条（谨慎）也可能给出线索；只要给了，就必须逐字来自原文、且只挂 review
      for (const f of r.scan.findings) {
        expect(f.rule).toBe('llm.context_review');
        expect(f.level).toBe('review');
        const idx = Number(f.where.replace('text[', '').replace(']', ''));
        expect(['欢迎来到星海读书会', '活动名额有限，加客服微信领福利红包，先交 99 元激活账户即可提现', '我们的社区守则与隐私说明'][idx]).toContain(f.quote);
      }
      if (r.llmFindings > 0) expect(r.scan.decision).toBe('review');
      console.log('LIVE_RESULT', JSON.stringify({ baseline: baseline.decision, llmUsed: r.llmUsed, llmFindings: r.llmFindings, final: r.scan.decision, findings: r.scan.findings.map(f => ({ where: f.where, quote: f.quote, why: f.why })) }));
    } finally {
      delete process.env.NEXUS_MODERATION_LLM;
    }
  }, 120_000);
});
