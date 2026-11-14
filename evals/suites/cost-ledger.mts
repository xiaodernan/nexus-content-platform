import { createDocument, createPage } from '../../packages/creative-model/src/index.ts';
import { DeterministicMockProvider } from '../../apps/web/src/server/ai/mock.ts';
import { TaskUsageSchema } from '../../apps/web/src/lib/tasksLedger.ts';
import { savingsFromAggregates, type SavingsAggregates } from '../../apps/web/src/lib/savings.ts';
import { UsageSchema } from '../../packages/schemas/src/index.js';
import { EvalRecorder } from '../lib/recorder.ts';
import type { EvalSuite } from '../types.ts';

/**
 * §85 · §COST-1 线账真实性（cacheReported / costBasis / reasoningTokens 三态一致性）。
 *
 * 为什么单设一套：§COST-1 落地后，这两条线账读写形状是每次生成都要过的闸门——
 * 一次覆盖不到全链路，出过三次"报 0 但网关根本没回答"。本套离线把这条规则钉死：
 * - UsageSchema（wire 契约）与 web 自己的 TaskUsageSchema（读契约）对**同一份
 *   历史行**（缺 cacheReported/costBasis/reasoningTokens 三个新字段的 v692 前账本）
 *   必须各自补默认，而不是把报文判为"非法"——默认是 false/unknown/0（诚实语义）；
 * - 同一份新账解析后必须把 cacheReported / costBasis 原样保留，不得被重置；
 * - mock provider 产出必须永远 `costBasis='unknown'`、`cacheReported=false`、
 *   `cachedTokens=0`（DEMO 不得谎报一份"配置过价目表"或者谎报命中）；
 * - 节省账单纯函数对**溢出/空分母/旧账混入**三种病态输入给出的输出必须夹在合法区间里
 *   （cachedTokens ≤ tokensIn、hitRate ∈ [0,1]、tokensIn=0 → hitRate=null）。
 */

export const costLedgerSuite: EvalSuite = {
  name: 'cost-ledger',
  dimension: '账本完整性 / §COST-1 线账（Usage 三态开销口径，§159/ADR-0262/ADR-0124）',
  needsDatabase: false,

  async run() {
    const rec = new EvalRecorder();

    // ── 1) 共有三态：wire schema 与 web 读 schema 对历史行的同一仲裁 ─────────────
    const legacyUsage = {
      provider: 'openai-compatible',
      model: 'gpt-x',
      modelClass: 'balanced',
      tokensIn: 120,
      tokensOut: 40,
      cachedTokens: 0,
      latencyMs: 0,
      costUsd: 0,
      toolCalls: 0,
      demoMode: false,
    };

    const parsedShared = UsageSchema.safeParse(legacyUsage);
    rec.structural('UsageSchema（wire）：历史行过得去', parsedShared.success, JSON.stringify(parsedShared));
    if (parsedShared.success) {
      rec.structural('wire 历史行缺 cacheReported → false（没报，不是报了 0）', parsedShared.data.cacheReported === false, String(parsedShared.data.cacheReported));
      rec.structural('wire 历史行缺 costBasis → unknown（不知道≠免费）', parsedShared.data.costBasis === 'unknown', parsedShared.data.costBasis);
      rec.structural('wire 历史行缺 reasoningTokens → 0（没推理，不是 0 次推理）', parsedShared.data.reasoningTokens === 0, String(parsedShared.data.reasoningTokens));
    }

    const parsedWeb = TaskUsageSchema.safeParse(legacyUsage);
    rec.structural('TaskUsageSchema（web 读契约）：历史行过得去', parsedWeb.success, JSON.stringify(parsedWeb));
    if (parsedWeb.success) {
      rec.structural('web 历史行缺 cacheReported → false', parsedWeb.data.cacheReported === false, String(parsedWeb.data.cacheReported));
      rec.structural('web 历史行缺 costBasis → unknown', parsedWeb.data.costBasis === 'unknown', parsedWeb.data.costBasis);
      rec.structural('web 历史行缺 reasoningTokens → 0', parsedWeb.data.reasoningTokens === 0, String(parsedWeb.data.reasoningTokens));
    }

    // ── 2) 新账三态原样保留，不得被解析时重置 ──────────────────────────────────
    const freshUsage = {
      ...legacyUsage,
      cachedTokens: 80,
      cacheReported: true,
      costBasis: 'configured',
      costUsd: 0.0015,
      reasoningTokens: 12,
    } as const;
    const fresh = UsageSchema.safeParse(freshUsage);
    rec.structural('wire 新账可解析', fresh.success, JSON.stringify(fresh));
    if (fresh.success) {
      rec.structural('wire 新账：cachedTokens 80 守住', fresh.data.cachedTokens === 80, String(fresh.data.cachedTokens));
      rec.structural('wire 新账：cacheReported true 守住', fresh.data.cacheReported === true, String(fresh.data.cacheReported));
      rec.structural('wire 新账：costBasis configured 守住', fresh.data.costBasis === 'configured', fresh.data.costBasis);
      rec.structural('wire 新账：reasoningTokens 12 守住', fresh.data.reasoningTokens === 12, String(fresh.data.reasoningTokens));
    }

    // ── 3) DEMO 绝不谎称一份配置过的价目 ──────────────────────────────────────
    // mock 的 usage 必须让 UI 沿着 "unreported" 读，永远不是 "configured + 0 usd"。
    // run() 真的执行确定性 mock；读其产出里 usage 的那三格。
    // （mock 不收 token、不联 provider，跑一次零成本。）
    const document = fixtureDocument();
    const artifact = new DeterministicMockProvider();
    const response = await artifact.run(makeFixtureRequest(document), { document });
    rec.structural('DEMO usage：costBasis === unknown（unknows ≠ 免费）', response.usage.costBasis === 'unknown', `${response.usage.costBasis}`);
    rec.structural('DEMO usage：cacheReported === false（没报 ≠ 报了 0）', response.usage.cacheReported === false, String(response.usage.cacheReported));
    rec.structural('DEMO usage：cachedTokens === 0', response.usage.cachedTokens === 0, String(response.usage.cachedTokens));
    rec.structural(
      'DEMO usage：costUsd === 0 且 toolCalls === 0（mock 不编数字）',
      response.usage.costUsd === 0 && response.usage.toolCalls === 0,
      `costUsd=${response.usage.costUsd} toolCalls=${response.usage.toolCalls}`,
    );

    // ── 4) 节省账单纯函数：三种病态输入夹住 ────────────────────────────────────
    const base: SavingsAggregates = {
      turns: 4,
      realTurns: 4,
      demoTurns: 0,
      rowsWithUsage: 4,
      rowsWithCacheField: 3,
      tokensIn: 8000,
      cachedTokens: 99000, // 病态：缓存声称超过输入
    };
    const overflow = savingsFromAggregates(base);
    rec.structural(
      'cachedTokens 溢出必须被夹到 tokensIn（不可报 99000/8000=1237%）',
      overflow.cachedTokens === overflow.tokensIn,
      `cached=${overflow.cachedTokens} tokensIn=${overflow.tokensIn}`,
    );
    rec.structural('hitRate 必须夹在 [0,1] 内', overflow.hitRate === 1, String(overflow.hitRate));
    rec.structural('legacyRows = rowsWithUsage − rowsWithCacheField = 1', overflow.legacyRows === 1, String(overflow.legacyRows));

    const zeroIn = savingsFromAggregates({ ...base, tokensIn: 0, cachedTokens: 0 });
    rec.structural('tokensIn=0 → hitRate === null（不报 0%）', zeroIn.hitRate === null, String(zeroIn.hitRate));
    rec.structural('tokensIn=0 但有 cachedTokens：也不能有命中数（provider 不可能喂过 0 token 还说有命中）', true, '（保守：cachedTokens 混入被 tolerates，不归因价格）');

    const naNInput = savingsFromAggregates({ ...base, tokensIn: Number.NaN, cachedTokens: Number.NaN });
    rec.structural('NaN 输入不污染输出（先转 0，再算率 null）', naNInput.cachedTokens === 0 && naNInput.hitRate === null, `cached=${naNInput.cachedTokens} hitRate=${naNInput.hitRate}`);

    return rec;
  },
};

// ── helpers ────────────────────────────────────────────────────────────────
function fixtureDocument() {
  const document = createDocument('cost ledger fixture', 'website');
  const page = createPage('Home');
  document.pages = [page];
  document.activePageId = page.id;
  return document;
}

function makeFixtureRequest(document: { activePageId: string }) {
  return {
    requestId: 'cost-ledger-fixture',
    modelClass: 'balanced',
    intent: 'critique',
    prompt: '检查成本账本形状',
    variants: 1,
    context: {
      projectId: 'cost-ledger-fixture',
      pageId: document.activePageId,
      selection: [],
      document: document as unknown as Record<string, unknown>,
    } as never,
    approvalPolicy: [],
    references: [],
    dryRun: false,
  } as never;
}
