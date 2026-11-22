// 四臂电池：新门 apps/web/test/doc-evidence.test.ts 有没有牙齿，逐臂量，不靠推理。
// 只动那一份测试文件的字节，跑完按字节还原并算 sha256。
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'apps', 'web', 'test', 'doc-evidence.test.ts');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const mine = readFileSync(FILE);
const before = sha(mine);
// 探针的 needle 一律按 LF 写；磁盘若是 CRLF，读写两侧都归一，否则 replace 静默不咬（臂会假 NO-OP）。
const text = mine.toString('utf8');
const EOL = text.includes('\r\n') ? '\r\n' : '\n';
const BASE = text.split('\r\n').join('\n');

function runSuite() {
  try {
    const out = execFileSync('npx', ['vitest', 'run', 'apps/web/test/doc-evidence.test.ts'], {
      cwd: ROOT,
      encoding: 'utf8',
      shell: true,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return out;
  } catch (err) {
    return `${err.stdout ?? ''}${err.stderr ?? ''}${err.message ?? ''}`;
  }
}

// tally 里先剥 ANSI：汇总行其实是 `\u001b[2m      Tests \u001b[22m \u001b[32m4 passed\u001b[39m`，
// 行首是转义符而不是空格，锚在 `^\s*Tests` 上的正则一行都读不到——第一版就把全绿误读成了 crash。
const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*m/g, '');

function tally(raw) {
  const out = stripAnsi(raw);
  // 只认 `Tests` 那一行：`Test Files  1 passed (1)` 在它之前，抓第一个 "N passed" 会把文件数当用例数。
  // 汇总行的缩进是排版的（`      Tests  4 passed (4)`），锚在行首会一行都读不到。
  const line = (out.match(/^\s*Tests\s+.*$/m) ?? [''])[0];
  const fm = line.match(/(\d+) failed/);
  const pm = line.match(/(\d+) passed/);
  // 非 TTY 的默认 reporter 不打 `×`，它打 ` FAIL  <文件> > <describe> > <用例名>`：取最后一个 `>` 之后。
  const names = [...out.matchAll(/^\s*FAIL\s+.*$/gm)].map((x) => {
    const parts = x[0].split('>');
    return (parts[parts.length - 1] ?? '').trim();
  });
  return { failed: fm ? Number(fm[1]) : 0, passed: pm ? Number(pm[1]) : 0, names, crashed: line === '' };
}

const ARMS = [
  {
    name: 'E1-凭空加一条指向不存在文件的点名',
    predict: '只有「点名解得出」红：证明那条腿真的在逐个查磁盘',
    patch: (s) =>
      s.replace(
        'expect(docCount).toBeGreaterThanOrEqual(50);',
        "expect(docCount).toBeGreaterThanOrEqual(50);\n    cites.push({ token: 'no-such-evidence-9k3.mjs', where: 'arm:1' });",
      ),
  },
  {
    name: 'E2-抓回旧版按扩展名收尾的正则',
    predict:
      '3 红：「抓取器吃整段路径」（`.fixed` 又被截断）、「点名解得出」（截出的 submit.ts 磁盘上没有）、' +
      '外加「扫描面不是空的」——旧正则只读到 22 次点名（<70 的人口下限），人口腿跟着红，这正是它该有的样子',
    patch: (s) => s.replace(/const CITATION = .*;/, 'const CITATION = /\\.scratch\\/([A-Za-z0-9._-]+\\.(mjs|ts|py))/g;'),
  },
  {
    name: 'E3-摘掉入册人口判据（tracked.size 那条）',
    predict: '0 红：这条腿本来就靠 untracked 列表判，今天列表为空是因为确实都入了册',
    patch: (s) => s.replace('    expect(tracked.size).toBeGreaterThanOrEqual(100);\n', ''),
  },
  {
    name: 'E4-注入同一条坏点名，但把"解得出"过滤器摘成恒假',
    predict: '0 红：E1 那一红完全是这个过滤器给的——它今天不咬是因为确实没缺件，摘掉它就把唯一的咬合点拆了',
    patch: (s) =>
      s
        .replace(
          'expect(docCount).toBeGreaterThanOrEqual(50);',
          "expect(docCount).toBeGreaterThanOrEqual(50);\n    cites.push({ token: 'no-such-evidence-9k3.mjs', where: 'arm:1' });",
        )
        .replace("const missing = cites.filter((c) => resolveToken(c.token).kind === 'none');", 'const missing = cites.filter(() => false);'),
  },
  {
    name: 'E5-入册名单永远交空白（模拟"只比磁盘、不比版本库"）',
    predict: '「在版本库里」那条红，先踩人口判据 tracked.size>=100',
    patch: (s) => s.replace('function trackedScratchFiles(): Set<string> {', 'function trackedScratchFiles(): Set<string> {\n  return new Set();\n}\nfunction unusedTracked(): Set<string> {'),
  },
  // 下面两臂是成对的判别：同一个"目录里那 10 个文件没入册"的状态，只换过滤器，看红不红全由它决定。
  {
    name: 'E6-旧过滤器 kind===file + 目录里的文件从入册名单里抹掉',
    predict: '0 红：这一臂复现的是修之前的行为——同一个坏状态它一个字都不说，这就是那个洞本身',
    patch: (s) =>
      s
        .replace(
          "const resolvable = cites.filter((c) => resolveToken(c.token).kind !== 'none');",
          "const resolvable = cites.filter((c) => resolveToken(c.token).kind === 'file');",
        )
        .replace(
          '      .filter(Boolean),',
          "      .filter((l) => Boolean(l) && !l.startsWith('.scratch/pw-paced-studio/')),",
        ),
  },
  {
    name: 'E7-新过滤器 kind!==none + 同样把那 10 个文件抹掉',
    predict: '1 红，且只有「点名到的证据全在版本库里」红，红话逐个点名那 10 个文件',
    patch: (s) =>
      s.replace(
        '      .filter(Boolean),',
        "      .filter((l) => Boolean(l) && !l.startsWith('.scratch/pw-paced-studio/')),",
      ),
  },
  {
    name: 'E8-walkFiles 恒交空白目录（退化返回值）',
    predict: '「抓取器吃整段路径」红：那条新加的 paths.length>0 判据就是冲着这个退化来的；第 3、4 腿跟着空转不红',
    patch: (s) => s.replace('    return [relative(ROOT, p).split(\'\\\\\').join(\'/\')];', '    return [];'),
  },
];

const base = tally(runSuite());
console.log(`BASE failed=${base.failed} passed=${base.passed} crash=${base.crashed}`);
if (base.crashed || base.failed !== 0) {
  console.log('BASE 不干净：电池作废（先修基线再谈臂）');
  for (const n of base.names) console.log(`    · ${n}`);
  writeFileSync(FILE, mine);
  process.exit(1);
}

for (const arm of ARMS) {
  const patched = arm.patch(BASE);
  if (patched === BASE) {
    console.log(`\n[${arm.name}]\n  NO-OP：needle 没咬住磁盘上的原文，这条臂作废`);
    continue;
  }
  writeFileSync(FILE, patched.split('\n').join(EOL));
  const t = tally(runSuite());
  console.log(`\n[${arm.name}]\n  预测：${arm.predict}\n  实测：failed=${t.failed} passed=${t.passed} crash=${t.crashed}`);
  for (const n of t.names) console.log(`    · ${n}`);
}

writeFileSync(FILE, mine);
const after = sha(readFileSync(FILE));
console.log(`\nRESTORE ${before} -> ${after}  RESIDUE=${before === after ? 'false' : 'TRUE'}`);
