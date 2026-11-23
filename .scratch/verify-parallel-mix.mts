import { runInsightAnalysisGraph } from '../apps/web/src/server/ai/insightGraph';
import { buildInsightDigest } from '../apps/web/src/server/domain/insightAi';

const snapshot = {
  totals: { users: 42, guests: 9, projects: 18, published: 7, likes: 88, comments: 23, follows: 12, viewsAllTime: 4212, gameCompletions: 33, workCompletions: 57, usageCalls30d: 1250 },
  series30d: { days: Array.from({ length: 30 }, (_, i) => String(i + 1).padStart(2, '0')), signups: [], publishes: [], opens: [] },
  credits30d: { granted: 1000, consumed: 320 },
  ai30d: { realCalls: 142, demoCalls: 0, tokensIn: 450_000, cachedTokens: 420_000, costEstimateUsd: 0.5, avgLatencyMs: 1400 },
  botOpens30d: 31,
  opens30d: 310,
  likes30d: 88,
  comments30d: 23,
  topWorks: [],
  metrics: {},
};

// variant A: same system (CANON_DIGEST), but DIFFERENT user digest bytes (different open slopes & ratios)
const digestA = buildInsightDigest({
  snapshot,
  ratios: { publishRate: 0.39, guestShare: 0.39, interactionRate: 0.35, botShare: 0.10, creditBurn: 0.32 },
  opensSlope: 1.4, opensR2: 0.55, publishSlope: 0.3, publishR2: 0.41,
  locale: 'zh',
});
const digestB = buildInsightDigest({
  snapshot: { ...snapshot, totals: { ...snapshot.totals, viewsAllTime: 4213 } },
  ratios: { publishRate: 0.38, guestShare: 0.40, interactionRate: 0.34, botShare: 0.11, creditBurn: 0.33 },
  opensSlope: 1.6, opensR2: 0.60, publishSlope: 0.4, publishR2: 0.45,
  locale: 'zh',
});

console.log('warm-up call A……');
const warm = await runInsightAnalysisGraph({ digest: digestA, locale: 'zh' });
console.log(`warm A: cachedTokens=${warm.ok ? warm.usage.cachedTokens : null}`);
console.log('---');

console.log('4 concurrent calls — same system, DIFFERENT user digest bytes (A,A,B,B mixed):');
const results = await Promise.all([
  runInsightAnalysisGraph({ digest: digestA, locale: 'zh' }),
  runInsightAnalysisGraph({ digest: digestA, locale: 'zh' }),
  runInsightAnalysisGraph({ digest: digestB, locale: 'zh' }),
  runInsightAnalysisGraph({ digest: digestB, locale: 'zh' }),
]);
for (const [i, r] of results.entries()) {
  console.log(`call #${i + 1}: ok=${r.ok} cachedTokens=${r.ok ? r.usage.cachedTokens : null} tokensIn=${r.ok ? r.usage.tokensIn : null} verdict=${r.ok ? r.verdict : null}`);
}
