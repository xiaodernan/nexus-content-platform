import { runInsightAnalysisGraph } from '../apps/web/src/server/ai/insightGraph';
import { buildInsightDigest } from '../apps/web/src/server/domain/insightAi';

const digestInsight = buildInsightDigest({
  snapshot: {
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
  },
  ratios: { publishRate: 0.39, guestShare: 0.39, interactionRate: 0.35, botShare: 0.1, creditBurn: 0.32 },
  opensSlope: 1.4, opensR2: 0.55, publishSlope: 0.3, publishR2: 0.41,
  locale: 'zh',
});

console.log('warm-up call #0……');
const warm = await runInsightAnalysisGraph({ digest: digestInsight, locale: 'zh' });
console.log(`warm: cachedTokens=${warm.ok ? warm.usage.cachedTokens : null} tokensIn=${warm.ok ? warm.usage.tokensIn : null} verdict=${warm.ok ? warm.verdict : null}`);

console.log('now fire 4 concurrent calls……');
const results = await Promise.all(
  Array.from({ length: 4 }, () => runInsightAnalysisGraph({ digest: digestInsight, locale: 'zh' })),
);
for (const [i, r] of results.entries()) {
  console.log(`call #${i + 1}: ok=${r.ok} cachedTokens=${r.ok ? r.usage.cachedTokens : null} tokensIn=${r.ok ? r.usage.tokensIn : null} reported=${r.ok ? r.usage.cacheReported : null} verdict=${r.ok ? r.verdict : null}`);
}
