// 量 HEAD 那一平面（第八片的模型半边已提交、面板归一与那几条腿还没提交）：
// 把本次落地会改动单测结果的三个文件换成 HEAD 字节，跑同一份测试范围，再按字节还原。
// 判据是"HEAD 自己红几条"，不是"我这版绿不绿"——那两寸要分开记。
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = join(ROOT, '.scratch', 'headplane.json');
const PATHS = [
  'packages/creative-model/test/code-parse.test.ts',
  'packages/creative-model/test/codegen.test.ts',
  'apps/web/src/studio/responsive-editor.ts',
];
const SUITES = ['packages/creative-model', 'apps/web/test/responsive-editor.test.ts', 'apps/web/test/studio-responsive.test.ts'];
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);

const mine = PATHS.map((p) => ({ p, b: readFileSync(join(ROOT, p)) }));
const before = mine.map((m) => sha(m.b));
const headBytes = (p) =>
  execFileSync('git', ['show', `HEAD:${p}`], { cwd: ROOT, encoding: 'buffer', maxBuffer: 64 << 20 });

try {
  rmSync(REPORT, { force: true });
  for (const p of PATHS) writeFileSync(join(ROOT, p), headBytes(p));
  execFileSync('npx', ['vitest', 'run', ...SUITES, '--reporter=json', '--outputFile=.scratch/headplane.json'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: true,
    maxBuffer: 64 << 20,
    timeout: 900000,
  });
} catch {
  /* vitest 有红灯时非零退出；报告文件在不在才是判据 */
} finally {
  mine.forEach((m, i) => writeFileSync(join(ROOT, m.p), m.b));
  const after = mine.map((m) => sha(readFileSync(join(ROOT, m.p))));
  console.log(`RESTORE ${before.map((b, i) => `${b === after[i] ? 'OK' : 'RESIDUE:' + PATHS[i]}`).join(' ')}`);
}

if (!existsSync(REPORT)) {
  console.log('NO-REPORT：这一平面没量出来');
  process.exit(1);
}
const r = JSON.parse(readFileSync(REPORT, 'utf8'));
const reds = r.testResults.flatMap((f) => f.assertionResults.filter((a) => a.status === 'failed').map((a) => a.title));
const dm = r.testResults.filter((f) => f.name.includes('design-model'));
console.log(
  `HEAD 平面 files=${r.testResults.length} passed=${r.numPassedTests}/${r.numTotalTests} failed=${r.numFailedTests} ` +
    `| design-model files=${dm.length} passed=${dm.reduce((n, f) => n + f.assertionResults.filter((a) => a.status === 'passed').length, 0)}`,
);
console.log(`redNames=${reds.length}`);
for (const n of reds) console.log(`    · ${n}`);
