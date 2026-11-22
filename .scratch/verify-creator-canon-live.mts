import { runCreatorAnalysisGraph } from '../apps/web/src/server/ai/creatorGraph';
import { buildCreatorDigest, AGENT_NARRATE_SYSTEM_PROMPT } from '../apps/web/src/server/domain/analytics-agent-ai';

const digest = buildCreatorDigest(
  {
    projectName: 'Demo World', description: 'walk it', hasCoverImage: true, visibility: 'public', moderation: 'clear',
    daysSincePublish: 28, hasGame: false, publishedAt: '2026-10-20T00:00:00.000Z',
    numbers: {
      views: 4212, opensToday: 3, visitors: 780, visitorsToday: 2, likes: 33, remixes: 2, followers: 12,
      completion: { avgPct: 58.4, over: 210 }, playTimeMs: 1_800_000, cappedReports: 0,
      completedVisitors: 21, botCompletions: 4, botOpens: 300, botVisitors: 100, selfOnly: false, selfCompleted: false,
    },
  } as any,
  [{ area: 'title', evidence: 'title too vague: 宏大工程', conclusion: 'visitors bounce at the title', action: 'shorten title to ≤20 chars' }],
);

const a = await runCreatorAnalysisGraph({ digest, locale: 'zh' });
console.log('CREATOR #1 ok:', a.ok, 'verdict:', a.ok ? a.verdict : null);
if (a.ok) console.log('tokensIn:', a.usage.tokensIn, 'cachedTokens:', a.usage.cachedTokens, 'reported:', a.usage.cacheReported);

const b = await runCreatorAnalysisGraph({ digest, locale: 'zh' });
console.log('CREATOR #2 ok:', b.ok, 'verdict:', b.ok ? b.verdict : null);
if (b.ok) console.log('tokensIn:', b.usage.tokensIn, 'cachedTokens:', b.usage.cachedTokens, 'reported:', b.usage.cacheReported);

console.log('creator sys chars:', AGENT_NARRATE_SYSTEM_PROMPT.length);
