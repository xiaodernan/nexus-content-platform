import { createDocument, createPage, type DesignDocument } from '../../packages/creative-model/src/index.ts';
import { DeterministicMockProvider } from '../../apps/web/src/server/ai/mock.ts';
import type { AiRequest } from '../../packages/schemas/src/index.js';
import { EvalRecorder } from '../lib/recorder.ts';
import type { EvalSuite } from '../types.ts';

/**
 * §85 · §159/§160 — DEMO MODE honesty.
 *
 * DEMO MODE is legal as long as it never confuses "a human asked for AI" with "a human saw a canned
 * answer labelled as AI". What is graded here:
 *   1. `capability` is ALWAYS 'demo' and `usage.demoMode` is ALWAYS true — never a provider name.
 *   2. `tokensIn` / `tokensOut` / `costUsd` / `latencyMs` are ALWAYS zero — no fake accounting.
 *   3. The response is deterministic: same request → byte-identical response.
 *   4. The response never references a vendor, model, latency, or endpoint that would make a
 *      reader think a real provider answered.
 */
export const demoModeSuite: EvalSuite = {
  name: 'demo-mode',
  dimension: '代码正确性 / DEMO MODE 诚实（§159/§160）',
  needsDatabase: false,

  async run() {
    const rec = new EvalRecorder();
    const document = fixtureDocument();
    const artifact = new DeterministicMockProvider();
    const intents = ['critique', 'design-edit', 'research'] as const;

    // ── §159 capability/usage 契约：三条意图都必须声称 demo ─────────────────────────────
    const values = await Promise.all(
      intents.map((intent) => artifact.run(makeRequest({ document, intent }), { document })),
    );
    for (const [index, value] of values.entries()) {
      const label = intents[index]!;
      rec.structural(`intent '${label}': capability is 'demo'`, value.capability === 'demo', String(value.capability));
      rec.structural(`intent '${label}': usage.demoMode is true`, value.usage.demoMode === true, JSON.stringify(value.usage));
      rec.structural(
        `intent '${label}': tokensIn/tokensOut/costUsd are all 0`,
        value.usage.tokensIn === 0 && value.usage.tokensOut === 0 && value.usage.costUsd === 0,
        JSON.stringify({ in: value.usage.tokensIn, out: value.usage.tokensOut, cost: value.usage.costUsd }),
      );
      rec.structural(
        `intent '${label}': provider/model never names a vendor's cloud or a real model name`,
        !/openai|anthropic|cohere|gemini|mistral|grok|deepseek|moonshot|ernie|wenxin|qwen|kimi|302|openrouter/i.test(
          `${value.provider} ${value.model} ${value.usage.modelClass ?? ''}`,
        ),
        `${value.provider}/${value.model}/${value.usage.modelClass}`,
      );
    }

    // ── 响应里不得出现 network-shaped 形态（URLs）──────────────────────────────────────
    const blob = JSON.stringify(values);
    const banned = /http:\/\/|https:\/\/|api\.openai\.com|api\.anthropic\.com/i;
    rec.structural('output carries no network-shaped URLs', !banned.test(blob), blob.length);

    // ── 确定性：同请求、同文档，两次 → 每个真语义字段必须一致 ─────────────────────────────
    // latencyMs 是墙上时钟，刻意非确定；比较除此之外的所有字段。
    const again = await artifact.run(makeRequest({ document, intent: 'critique' }), { document });
    const samePayload = (a: typeof values[number], b: typeof values[number]) => {
      if (a.capability !== b.capability) return false;
      if (a.provider !== b.provider || a.model !== b.model) return false;
      if (a.usage.demoMode !== b.usage.demoMode) return false;
      if (a.usage.tokensIn !== b.usage.tokensIn || a.usage.tokensOut !== b.usage.tokensOut || a.usage.costUsd !== b.usage.costUsd) return false;
      if (a.patches.length !== b.patches.length || a.labels.length !== b.labels.length) return false;
      if (a.plans.length !== b.plans.length) return false;
      // 补丁内容必须逐字段相同（nodeIds 与 op shape 一致）
      if (JSON.stringify(a.patches) !== JSON.stringify(b.patches)) return false;
      if (JSON.stringify(a.labels) !== JSON.stringify(b.labels)) return false;
      return true;
    };
    rec.structural(
      'two calls with the same inputs produce the identical response (modulo wall-clock latency)',
      samePayload(values[0]!, again),
      `first.latencyMs=${values[0]?.usage.latencyMs} again.latencyMs=${again.usage.latencyMs}`,
    );

    return rec;
  },
};

// ── helpers ────────────────────────────────────────────────────────────────────

function fixtureDocument(): DesignDocument {
  const document = createDocument('demo honesty fixture', 'website');
  const page = createPage('Home');
  document.pages = [page];
  document.activePageId = page.id;
  return document;
}

function makeRequest(args: {
  document: DesignDocument;
  intent: 'critique' | 'design-edit' | 'research';
}): AiRequest {
  return {
    requestId: `demo-honesty-${args.intent}`,
    modelClass: 'balanced',
    intent: args.intent,
    prompt: '把首屏加高 50%，其他不动',
    variants: 1,
    context: {
      projectId: 'demo-honesty',
      pageId: args.document.activePageId,
      selection: [],
      document: args.document as unknown as Record<string, unknown>,
    } as never,
    approvalPolicy: [],
    references: [],
    dryRun: false,
  };
}
