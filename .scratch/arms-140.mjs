import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

/**
 * #140 的变异电池：把"错位那句话"的四个供给点各自拆掉一处，看红的是不是**该红的那几条**。
 * 对照臂（什么都不改）先跑，证明起点是绿的。
 *
 * 纪律（以前付过学费的那些）：
 * - 每一臂在干净快照上重新起算，臂与臂不叠加；
 * - 替换命中数必须是 1，命中 0 或 >1 判 INTERFERED；
 * - 变异要运行期等价：改的是值与措辞，不是让人在 import 阶段就崩；
 * - 采集用 JSON reporter，读不到 JSON 或 0 条用例都算这一臂作废；
 * - 收尾按字节比对还原。
 */

const ROOT = 'D:/内容创作平台';
const CODEGEN = 'packages/game-model/src/codegen.ts';
const SERVER_RUNTIME = 'apps/web/src/server/agent/runtime.ts';
const ROUTE = 'apps/web/src/app/api/projects/[projectId]/game/code/route.ts';
const SUITES = [
  'packages/game-model/test/codegen.test.ts',
  'apps/web/test/game-code.integration.test.ts',
  'apps/web/test/agent-orchestration.integration.test.ts',
];

const pristine = new Map();
for (const rel of [CODEGEN, SERVER_RUNTIME, ROUTE]) {
  const text = readFileSync(`${ROOT}/${rel}`, 'utf8');
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/\n/g) ?? []).length;
  const loneCr = (text.replace(/\r\n/g, '').match(/\r/g) ?? []).length;
  if (loneCr > 0 || (crlf > 0 && lf !== crlf)) {
    throw new Error(`${rel} 的行尾混着（CRLF=${crlf} LF=${lf} 孤立 CR=${loneCr}），脚本不敢直接拼`);
  }
  pristine.set(rel, { text, crlf: crlf > 0 });
}
const toLf = (rel) => pristine.get(rel).text.replace(/\r\n/g, '\n');
const restore = () => {
  for (const [rel, snap] of pristine) {
    const out = snap.crlf ? snap.text.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n') : snap.text;
    if (readFileSync(`${ROOT}/${rel}`, 'utf8') !== snap.text) writeFileSync(`${ROOT}/${rel}`, out, 'utf8');
  }
};

function splice(rel, needle, replacement) {
  const base = toLf(rel);
  const hits = base.split(needle).length - 1;
  if (hits !== 1) throw new Error(`命中 ${hits} 次（要 1 次）：${rel} :: ${needle.slice(0, 60)}`);
  const next = base.split(needle).join(replacement);
  const snap = pristine.get(rel);
  writeFileSync(`${ROOT}/${rel}`, snap.crlf ? next.replace(/\n/g, '\r\n') : next, 'utf8');
}

function runSuite(tag) {
  const outFile = `.scratch/arms-140/${tag}.json`;
  mkdirSync(`${ROOT}/.scratch/arms-140`, { recursive: true });
  let raw = '';
  try {
    raw = execFileSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...SUITES, '--reporter=json', `--outputFile=${outFile}`], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NEXUS_DATABASE_URL: 'postgres://nexus:nexus_dev_only@localhost:55100/nexus' },
    });
  } catch (error) {
    raw = `${error.message}\n${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
  let report;
  try {
    report = JSON.parse(readFileSync(`${ROOT}/${outFile}`, 'utf8'));
  } catch {
    throw new Error(`${tag}：没有读到 JSON（采集就崩了，这一臂不算数）\n${raw.slice(-2000)}`);
  }
  const results = (report.testResults ?? []).flatMap((file) => file.assertionResults ?? []);
  if (results.length === 0) throw new Error(`${tag}：JSON 里一条用例都没有，采集失败（0 红不等于没红）`);
  const red = results.filter((item) => item.status === 'failed');
  return {
    total: results.length,
    red: red.length,
    names: red.map((item) => `${(item.ancestorTitles ?? []).join(' > ')} > ${item.title}`.trim()),
    crash: raw.includes('Unhandled') || report.numTotalErrorCases > 0 ? 'COLLECT_CRASH' : '',
  };
}

const README_NEEDLE = `    ...(kindNote
      ? [\`- 数据：plan.json 与 plan.js 是同一次 compileGame() 序列化的结果。${'$'}{kindNote}\`]
      : ["- 数据：plan.json 与 plan.js 是同一次 compileGame() 序列化的结果，界面上的画布读的就是这一份。"]),`;
const HTML_NEEDLE = `    // 打开的就是这一页，不是 README：类型不对上的那句话要印在页面上，不然作者看到的就是"我的 RPG 没有成长"\n    ...(kindNote ? [\`<p id="kind-note">${'$'}{escapeHtml(kindNote)}</p>\`] : []),\n`;
const STEP_NOTE_NEEDLE = `      // 错位由生成器自己报，这一格不复述、也不猜：链上那份草稿标的是 rpg-prototype，而产物只会跑 2D 俯视那条链\n      ...(output.kindNote ? [output.kindNote] : []),\n`;
const ROUTE_NEEDLE = `      kindNote: output.kindNote,\n`;

const ARMS = [
  {
    tag: 'A-always-topdown',
    what: 'A 分派点被绕过：kindPipeline 恒为 topdown（等于"永远没有错位"）',
    apply: () => splice(CODEGEN, '  const kindPipeline = compileForKind(document).pipeline;', '  const kindPipeline = "topdown" as const;'),
  },
  {
    tag: 'B-readme-keeps-lie',
    what: 'B README 那一行不再分叉：无论哪一型都印"界面上的画布读的就是这一份"',
    apply: () => splice(CODEGEN, README_NEEDLE, `    "- 数据：plan.json 与 plan.js 是同一次 compileGame() 序列化的结果，界面上的画布读的就是这一份。",`),
  },
  {
    tag: 'C-html-drops-the-line',
    what: 'C 页面少了那句话：只在 README 里说，作者打开 index.html 看不见',
    apply: () => splice(CODEGEN, HTML_NEEDLE, ''),
  },
  {
    tag: 'D-step-drops-the-line',
    what: 'D 链上那一格不念这句：notes 里没有生成器那句，读数仍报 kindMismatch=1',
    apply: () => splice(SERVER_RUNTIME, STEP_NOTE_NEEDLE, ''),
  },
  {
    tag: 'E-route-drops-the-field',
    what: 'E 出口丢字段：路由不再把 kindNote 带给界面（面板于是永远没有那句警告）',
    apply: () => splice(ROUTE, ROUTE_NEEDLE, ''),
  },
  {
    tag: 'F-count-hardwired',
    what: 'F 计数写死：kindMismatch 恒为 1（没有错位的那一型也被算成有）',
    apply: () => splice(SERVER_RUNTIME, '      kindMismatch: output.kindNote ? 1 : 0,', '      kindMismatch: 1,'),
  },
  {
    tag: 'G-summary-hardwired',
    what: 'G summary 里的管线名写死成 topdown（rpg 那一份被报成没有错位）',
    apply: () =>
      // 这一条必须用反引号拼：双引号串里的 ${'$'} 不会展开，上一版因此命中 0 次（INTERFERED）
      splice(SERVER_RUNTIME, `      \`产物跑的永远是 2D 俯视那条链，这份设计标的是 ${'$'}{output.kindPipeline ?? '没有管线'}）\`,` , `      \`产物跑的永远是 2D 俯视那条链，这份设计标的是 topdown）\`,`),
  },
];

function assertMutated(tag) {
  for (const [rel, snap] of pristine) {
    if (readFileSync(`${ROOT}/${rel}`, 'utf8') !== snap.text) return;
  }
  throw new Error(`${tag}：这一臂写完字节还是原样，跑它没有意义`);
}

restore();
const baseline = runSuite('baseline');
console.log(`BASELINE: ${baseline.total - baseline.red}/${baseline.total} passed, red=${baseline.red} ${baseline.crash}`);
for (const name of baseline.names) console.log(`  baseline red: ${name}`);

for (const arm of ARMS.filter((arm) => !process.argv[2] || arm.tag.startsWith(process.argv[2]))) {
  restore();
  try {
    arm.apply();
    assertMutated(arm.tag);
  } catch (error) {
    console.log(`INTERFERED ${arm.tag}: ${error.message}`);
    restore();
    continue;
  }
  let r;
  try {
    r = runSuite(arm.tag);
  } catch (error) {
    console.log(`INTERFERED ${arm.tag}: ${error.message}`);
    restore();
    continue;
  }
  console.log(`VERDICT ${arm.tag}: red=${r.red}/${r.total} ${r.crash} :: ${arm.what}`);
  for (const name of r.names) console.log(`    ✗ ${name}`);
  restore();
}

for (const [rel, snap] of pristine) {
  const now = readFileSync(`${ROOT}/${rel}`, 'utf8');
  console.log(`RESTORED ${rel}: ${now === snap.text ? 'byte-identical' : 'DIFFERS — 立刻人工还原'}`);
}
