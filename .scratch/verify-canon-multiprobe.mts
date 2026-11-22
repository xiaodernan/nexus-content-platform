import { runCanonAnswerGraph } from '../apps/web/src/server/ai/canonGraph';
import { CANON_DIGEST } from '../apps/web/src/lib/bibleAsk';

console.log('bible digest length:', CANON_DIGEST.length);

const questions = [
  '米缸浮了多少年？',
  '为什么候潮石只能在风里？',
  '第四十一次大会散会之后发生了什么？',
  '灯塔最高层那面镜子为什么要朝向镜湖？',
  '潮候院为什么叫潮候院？',
];

for (const q of questions) {
  const result = await runCanonAnswerGraph({ question: q, locale: 'zh' });
  if (!result.ok) {
    console.log('FAIL:', result.status, result.error);
    continue;
  }
  console.log(`\nQ: ${q}`);
  console.log(`A: ${result.answer}`);
  console.log(`verdict: ${result.verdict}  iterations: ${result.iterations}  cachedTokens: ${result.usage.cachedTokens} totalTokens: ${result.usage.tokensIn}`);
}
