import { codeIndexSuite } from './suites/code-index.mts';
import { modelRoundtripSuite } from './suites/model-roundtrip.mts';
import { exportRoundtripSuite } from './suites/export-roundtrip.mts';
import { videoPlanSuite } from './suites/video-plan.mts';
import { worldBuildSuite } from './suites/world-build.mts';
import { schemasContractSuite } from './suites/schemas-contract.mts';
import { gameBuildSuite } from './suites/game-build.mts';
import { designBuildSuite } from './suites/design-build.mts';
import { projectBundleSuite } from './suites/project-bundle.mts';
import { localEmbeddingSuite } from './suites/local-embedding.mts';
import { localRerankerSuite } from './suites/local-reranker.mts';
import { demoModeSuite } from './suites/demo-mode.mts';
import { costLedgerSuite } from './suites/cost-ledger.mts';
import { failedChecks, type EvalSuite, type EvalSuiteResult } from './types.ts';

/**
 * §85 能力评测入口：`npm run evals`。
 *
 * 与 `scripts/eval-baseline.mts` 的分工（别把它读成"评测只有这里"）：
 * - 这里放**不需要真库、不需要 provider、确定性**的能力套件（视频、模型往返、检索、真库都靠 `needsDatabase` 开关单列）；
 * - `scripts/eval-baseline.mts` 是 DB 在后台跑的那一份（RAG / 设计精度 / 视觉 / 无障碍），
 *   读数与口径都在 `docs/EVALUATION.md`，跑法：`npm run evals:baseline`；
 * - 两边共用同一条纪律：**只钉结构不变式**，数字由人比对。
 *
 * 为什么 needsDatabase 单列：runner 不偷连库——
 * 不声明 needsDatabase 的（`code-index` / `model-roundtrip` / `video-plan`）全在内存跑；
 * `export-roundtrip` 声明 needsDatabase: true：不设 `NEXUS_DATABASE_URL`/`DATABASE_URL` 时打印 SKIP + 原因并退出码不变。
 *
 * 用法：
 *   npm run evals                 跑全部套件
 *   npm run evals -- --suite code-index
 *   npm run evals -- --list
 */
const SUITES: EvalSuite[] = [codeIndexSuite, modelRoundtripSuite, exportRoundtripSuite, videoPlanSuite, worldBuildSuite, schemasContractSuite, gameBuildSuite, designBuildSuite, projectBundleSuite, localEmbeddingSuite, localRerankerSuite, demoModeSuite, costLedgerSuite];

const args = process.argv.slice(2);
const listOnly = args.includes('--list');

const suiteFlags = args
  .map((_, i) => (args[i] === '--suite' ? args[i + 1] : undefined))
  .filter((v): v is string => !!v);
const unknownFlags = args.filter((a, i) => a !== '--suite' && a !== '--list' && args[i - 1] !== '--suite');

if (unknownFlags.length) {
  console.error(`不认识的参数：${unknownFlags.join(' ')}\n用法：npm run evals [-- --list] [-- --suite <name>]`);
  process.exit(2);
}

if (listOnly) {
  for (const suite of SUITES) console.log(`${suite.name}  [${suite.dimension}]${suite.needsDatabase ? '  (需要真库)' : ''}`);
  process.exit(0);
}

const selected = suiteFlags.length
  ? SUITES.filter((s) => suiteFlags.includes(s.name))
  : SUITES;

if (selected.length !== (suiteFlags.length || SUITES.length)) {
  const missing = suiteFlags.filter((name) => !SUITES.some((s) => s.name === name));
  console.error(`没有叫 ${missing.join(' / ')} 的套件。可用：${SUITES.map((s) => s.name).join(', ')}`);
  process.exit(2);
}

const results: EvalSuiteResult[] = [];
for (const suite of selected) {
  const started = Date.now();
  if (suite.needsDatabase && !process.env.NEXUS_DATABASE_URL && !process.env.DATABASE_URL) {
    console.log(`\n== ${suite.name} == SKIP：这套要真库（NEXUS_DATABASE_URL 未设置）`);
    continue;
  }
  const outcome = await suite.run();
  const result: EvalSuiteResult = {
    suite: suite.name,
    dimension: suite.dimension,
    needsDatabase: suite.needsDatabase,
    checks: outcome.checks,
    notMeasured: outcome.notMeasured,
    durationMs: Date.now() - started,
  };
  results.push(result);

  for (const check of result.checks) {
    console.log(`  ${check.ok ? 'PASS' : 'FAIL'}  ${check.name}  ${check.detail}`);
  }
  for (const note of result.notMeasured) console.log(`  notMeasured  ${note}`);
}

const failures = results.flatMap((result) => failedChecks(result).map((c) => `${result.suite}: ${c.name}`));

console.log('\n==================== 评测汇总 ====================');
console.table(
  results.map((result) => ({
    suite: result.suite,
    dimension: result.dimension,
    checks: result.checks.length,
    passed: result.checks.filter((c) => c.ok).length,
    durationMs: result.durationMs,
  })),
);
if (process.env.NEXUS_DATABASE_URL || process.env.DATABASE_URL) {
  console.log('提示：DB 在后台，§85 基线读数见文档——npm run evals:baseline');
} else {
  console.log('提示：未设 NEXUS_DATABASE_URL，只跑确定性套件；完整 §85 基线走 npm run evals:baseline');
}

if (failures.length) {
  console.error(`\nFAIL：${failures.length} 项结构不变式未通过：\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}
console.log('\n全部结构不变式 PASS。数字读数记进 docs/EVALUATION.md，回归靠人眼比对。');
// 真库套件的连接池不会自己排空——不显式退出，命令会把事件循环留在一个挂着的 postgres 连接上。
//（上一轮就是这样：检查点都跑完了、输出也打了，但进程永远结束不了。）
process.exit(0);
