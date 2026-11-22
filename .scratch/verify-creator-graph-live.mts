import { runCreatorAnalysisGraph } from '../apps/web/src/server/ai/creatorGraph';

const digest = [
  'CREATOR FACT DIGEST',
  'project="Demo World" visibility=public moderation=clear',
  'hasCoverImage=true hasGame=false daysSincePublish=28',
  'views=4212 opensToday=3 visitors=780 visitorsToday=2',
  'likes=33 remixes=2 followers=12',
  'completionAvgPct=58.4% completionOver=210',
  'botOpens=300 botVisitors=100 selfOnly=false selfCompleted=false',
  'TITLE_LIMIT=60 chars allowed: 8 used',
  'RULE FINDINGS (1 items):',
  'finding#1 area=title evidence="title too vague: 宏大工程" conclusion="visitors bounce at the title" action="shorten title to ≤20 chars"',
  'END OF FACT DIGEST',
].join('\n');

const locale = (process.argv[2] === 'en' ? 'en' : 'zh') as 'zh' | 'en';
console.log('locale:', locale);
const result = await runCreatorAnalysisGraph({ digest, locale });
console.log('ok:', result.ok);
if (result.ok) {
  console.log('verdict:', result.verdict);
  console.log('iterations:', result.iterations);
  console.log('nodesVisited:', result.nodesVisited.join(' > '));
  console.log('capability:', result.capability);
  console.log('provider/model:', result.provider, result.model);
  console.log('tokensIn/out:', result.usage.tokensIn, '/', result.usage.tokensOut);
  console.log('cachedTokens:', result.usage.cachedTokens, 'cacheReported:', result.usage.cacheReported);
  console.log('--- answer ---');
  console.log(result.answer);
} else {
  console.log('error:', result.status, result.error);
}
