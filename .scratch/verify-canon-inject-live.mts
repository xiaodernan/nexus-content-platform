import { runInsightAnalysisGraph } from '../apps/web/src/server/ai/insightGraph';
import { INSIGHT_AI_SYSTEM_PROMPT, buildInsightDigest } from '../apps/web/src/server/domain/insightAi';

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

const a = await runInsightAnalysisGraph({ digest: digestInsight, locale: 'zh' });
console.log('INSIGHT #1 ok:', a.ok, 'verdict:', a.ok ? a.verdict : null);
if (a.ok) console.log('tokensIn:', a.usage.tokensIn, 'cachedTokens:', a.usage.cachedTokens, 'reported:', a.usage.cacheReported);

const b = await runInsightAnalysisGraph({ digest: digestInsight, locale: 'zh' });
console.log('INSIGHT #2 ok:', b.ok, 'verdict:', b.ok ? b.verdict : null);
if (b.ok) console.log('tokensIn:', b.usage.tokensIn, 'cachedTokens:', b.usage.cachedTokens, 'reported:', b.usage.cacheReported);

console.log('insight sys chars:', INSIGHT_AI_SYSTEM_PROMPT.length);
