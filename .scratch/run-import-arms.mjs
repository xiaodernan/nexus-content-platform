/**
 * §105/§144 导入侧的变异电池：一臂拆掉一条判据，红的用例**事先点名**。
 *
 * 平面 = `git archive HEAD` + 我这个会话的 8 个文件（写端 v2、导入读端、两份测试、两份路由）。
 * 不叠这些文件的话，平面里根本没有导入这条链路；叠上之后每臂开始前都重铺原始字节，
 * 于是两臂的补丁不会串。
 *
 * 预测在跑之前写死在下面这张表里；跑完只要有一条与预测不符就 exit 1，不做解释性修补。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'D:/内容创作平台';
const PLANE = path.join(ROOT, '.scratch/plane-import');
const SRC = 'apps/web/src/server/domain/import.ts';
const TESTS = ['apps/web/test/zip-import.test.ts', 'apps/web/test/import.integration.test.ts'];
// 平面上这一片要的全部文件（HEAD 里没有的都是我这个会话新写的）
const FILES = [
  SRC,
  ...TESTS,
  'apps/web/src/server/domain/export.ts',
  'apps/web/test/export.integration.test.ts',
  'apps/web/test/zip-read.test.ts',
  'apps/web/src/app/api/projects/import/route.ts',
  'apps/web/src/app/api/projects/[projectId]/export/route.ts',
];
const pristine = fs.readFileSync(path.join(ROOT, SRC), 'utf8');

/** 臂名 → { 改动点, 替换, 应该变红的用例（按标题子串点名）} */
const ARMS = [
  { name: 'A01 空包门', find: "if (zipBytes.length === 0) return refuse('包是空的');", repl: 'if (false) return refuse(\'包是空的\');', reds: ['空包'] },
  { name: 'A02 整包上限', find: 'if (zipBytes.length > IMPORT_MAX_ZIP_BYTES) {', repl: 'if (false) {', reds: ['超过上限'] },
  { name: 'A03 ZIP 判据原样透传', find: "return refuse(error instanceof Error ? error.message : '这份 ZIP 读不开');", repl: "return refuse('这份 ZIP 读不开');", reds: ['ZIP 读端的那几道门'] },
  { name: 'A04 format 相等判', find: 'if (manifest.format !== EXPORT_FORMAT) {', repl: 'if (false) {', reds: ['format 不对'] },
  { name: 'A05 格式版本相等判', find: 'if (manifest.formatVersion !== EXPORT_FORMAT_VERSION) {', repl: 'if (false) {', reds: ['v1 的包'] },
  { name: 'A06 entries/assetRefs 存在判', find: 'if (!Array.isArray(manifest.entries) || !Array.isArray(manifest.assetRefs)) {', repl: 'if (false) {', reds: ['清单少了 entries'] },
  { name: 'A07 parts 合法性', find: "manifest.parts.some((p) => p !== 'design' && p !== 'code' && p !== 'assets')", repl: 'false', reds: ['parts 里有不认识的组合'] },
  { name: 'A08 assetRefs 必须对得上 entries', find: 'if (!declared.has(ref.path)) problems.push(`assetRefs 说有 ${ref.path}，entries 里却没有这一项`);', repl: '', reds: ['assetRefs 指向 entries 里没有的路径'] },
  { name: 'A09 声明字节数与实际', find: 'if (actual.contents.length !== item.bytes) {', repl: 'if (false) {', reds: ['清单声明的字节数与实际不符'] },
  { name: 'A10 逐条目 CRC', find: 'if (crc !== item.crc32) {', repl: 'if (false) {', reds: ['清单的 CRC 与实际不符'] },
  { name: 'A11 包里没有清单没记的东西', find: 'if (!declared.has(file.path)) problems.push(`包里有一份清单没记的东西：${file.path}`);', repl: '', reds: ['包里多了一件清单没记的东西'] },
  { name: 'A12 design 是必选项', find: "if (!manifest.parts.includes('design')) {", repl: 'if (false) {', reds: ['没导 design'] },
  { name: 'A13 清单说导了就得有那份文档', find: 'if (docText === null) return refuse(`清单说导了 design，包里却没有 ${DESIGN_DOC_PATH}`);', repl: '', reds: ['清单说导了 design，包里却没有那份文档'] },
  // 只有"文档过不了校验"那一例是这条判据的见证。`docText === null` 那一例在 A14 下是**绿**的：
  // 它被自己上面那道门（A13 拆的那一条）先挡住了，走不到这一格。第一次跑我把两条都写进预测，那是预测错。
  { name: 'A14 走界面同一条校验门', find: "if (!parsed.ok) return refuse('包里的设计文档过不了校验，整包拒收', parsed.issues);", repl: '', reds: ['设计文档过不了界面同一条校验门'] },
  { name: 'A15 项目类型白名单', find: 'if (!PROJECT_KINDS.includes(kind as ProjectType)) {', repl: 'if (false) {', reds: ['项目类型这个实例不认识'] },
  // 不换号则页面 id 与源项目那几行撞主键：凡是真写库的那五例全红，比只预测两例更狠。
  { name: 'A16 页面/组件换号', find: 'fromDocument: duplicateDocument(source, name),', repl: 'fromDocument: source,', reds: ['自家导出的包导回来是一个新项目', '别人拿这份包导入', '包里的字节过不了摄取门', '导出时就没带上字节的那张图', '只导 design 的包照样导得回来'] },
  { name: 'A17 资产引用换号', find: 'saveDocument(created.id, remapAssetIds(stored, idMap))', repl: 'saveDocument(created.id, stored)', reds: ['自家导出的包导回来是一个新项目'] },
  { name: 'A18 悬空引用点名', find: 'const missingRefs = [...documentAssetRefs(stored)].filter((id) => !idMap.has(id));', repl: 'const missingRefs: string[] = [];', reds: ['包里的字节过不了摄取门', '导出时就没带上字节的那张图'] },
  { name: 'A19 摄取门拒了要记账', find: 'assetFailures.push({ path: item.path, reason: `${result.reason}：${result.issues.join(\'；\')}` });', repl: '', reds: ['包里的字节过不了摄取门'] },
  { name: 'A20 代码文件数如实报', find: 'codeFilesIgnored: manifest.entries.filter((e) => e.path.startsWith(CODE_DIR)).length,', repl: 'codeFilesIgnored: 0,', reds: ['自家导出的包导回来是一个新项目'] },
];

function sh(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function buildPlane() {
  fs.rmSync(PLANE, { recursive: true, force: true });
  fs.mkdirSync(PLANE, { recursive: true });
  const tar = path.join(ROOT, '.scratch/plane-import.tar');
  const buf = execFileSync('git', ['archive', 'HEAD'], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 });
  fs.writeFileSync(tar, buf);
  sh('tar', ['-xf', '../plane-import.tar', '--force-local'], PLANE);
  overlay();
}

function overlay() {
  for (const rel of FILES) {
    const from = path.join(ROOT, rel);
    const to = path.join(PLANE, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, rel === SRC ? pristine : fs.readFileSync(from), 'utf8');
  }
}

function run(tag) {
  const outFile = path.join(ROOT, `.scratch/import-arms-${tag}.json`);
  let out = '';
  try {
    out = sh(
      process.execPath,
      [path.join(ROOT, 'node_modules/vitest/vitest.mjs'), 'run', ...TESTS, '--reporter=json', `--outputFile=${outFile}`],
      PLANE,
    );
  } catch (e) {
    out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
  if (!fs.existsSync(outFile)) throw new Error(`${tag}：没有 JSON 报告（收集/崩掉了，零证据）\n${out.slice(0, 1500)}`);
  const json = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  const all = (json.testResults ?? []).flatMap((f) => f.assertionResults ?? []);
  const red = all.filter((a) => a.status === 'failed').map((a) => a.title);
  const skipped = all.filter((a) => a.status === 'skipped' || a.status === 'pending');
  if (skipped.length > 0) throw new Error(`${tag}：${skipped.length} 例 skipped —— 跳过的用例不算绿，也不给它当证据`);
  return { total: all.length, red };
}

buildPlane();
const control = run('control');
if (control.total === 0) throw new Error('控制臂收集到 0 例：这一轮什么也没证明');
if (control.red.length > 0) throw new Error(`控制臂本该全绿，却红了：${control.red.join(' | ')}`);
console.log(`控制臂：${control.total}/${control.total} 绿`);

let holes = 0;
const wrongs = [];
// 只跑点名的那几臂（修完预测做定向复跑用；不传参数就是全量）
const ONLY = process.argv.slice(2);
const SELECTED = ONLY.length === 0 ? ARMS : ARMS.filter((a) => ONLY.some((p) => a.name.includes(p)));
if (SELECTED.length === 0) throw new Error(`没有臂匹配 ${ONLY.join(' ')}：这一轮不会动到任何判据`);
for (const arm of SELECTED) {
  overlay();
  const file = path.join(PLANE, SRC);
  const text = fs.readFileSync(file, 'utf8');
  const hits = text.split(arm.find).length - 1;
  if (hits !== 1) throw new Error(`${arm.name}：改动点命中 ${hits} 次，不是 1 —— 这一臂没有真的动到判据`);
  fs.writeFileSync(file, text.replace(arm.find, arm.repl), 'utf8');
  const { red } = run(arm.name);
  const missed = arm.reds.filter((w) => !red.some((r) => r.includes(w)));
  const extra = red.filter((r) => !arm.reds.some((w) => r.includes(w)));
  if (arm.reds.length === 0 && red.length === 0) {
    holes += 1;
    console.log(`⚠ ${arm.name}：无人见证`);
  } else if (missed.length === 0 && extra.length === 0 && red.length > 0) {
    console.log(`✓ ${arm.name}：红 ${red.length} 例，正是预测的那 ${arm.reds.length} 条`);
  } else {
    wrongs.push(`${arm.name}：预测 ${JSON.stringify(arm.reds)}，实测 ${JSON.stringify(red)}（漏 ${missed.length}，多 ${extra.length}）`);
  }
}
overlay();
const after = run('after');
if (after.red.length > 0) throw new Error(`复位后仍红 ${after.red.length} 例：平面被弄脏了`);
if (wrongs.length > 0) {
  console.log(`\n与预测不符 ${wrongs.length} 臂：\n${wrongs.join('\n')}`);
  process.exit(1);
}
console.log(`\n${SELECTED.length}/${ARMS.length} 臂全部与预测一致；无人见证 ${holes} 臂`);
