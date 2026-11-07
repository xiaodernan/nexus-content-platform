import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 文档点名的证据必须查得到，而且必须跟仓库一起走。
 *
 * 为什么要这道门：`docs/ROADMAP.md` / `TESTING.md` / `EVALUATION.md` / ADR 里那些「见证」段落
 * 把读数指向 `.scratch/<脚本>` 与 `.scratch/<日志>`，而 `.scratch/` 写在 `.gitignore` 第 47 行。
 * 于是 2026-11-08 量到的是：**100 个 docs 文件、79 个点名路径、展开 102 个磁盘文件、git 里 0 个**。
 * 也就是说整条证据链只活在这一次清理之前、只活在这台机器上——`rm -rf .scratch` 或一次全新 clone
 * 之后，那 79 句声称没有一句还能当场查证。这一片把它们 `git add -f` 入册，并用下面四条腿钉住：
 * 人口不是空的、抓取器自己不是瞎的、点名解得出、解出来的人在版本库里。
 *
 * 判据的形状（故意不改成"忽略缺失"）：缺一条就红，红话里带上是哪一份 docs 的哪一行。
 * 修法只有两种——把那个文件 `git add -f .scratch/<路径>` 入册，或者把那句声称改掉。
 */

const ROOT = process.cwd();

/**
 * 整段吃路径 token，不按扩展名收尾。
 *
 * 这条是踩过才写下来的：上一版普查按 `\.(mjs|ts|py)` 分桶，正则回溯把
 * `.scratch/submit.ts.fixed` 截成 `.scratch/submit.ts`，于是报了一条根本不存在的死引用。
 * 段内允许的字符就是磁盘上用过的（点、下划线、连字符、加号、`@`、glob 的 `*`）；
 * 中文标点、反引号、括号、空格都不在类里，天然收尾。
 */
const CITATION = /\.scratch\/([A-Za-z0-9_+.@*-]+(?:\/[A-Za-z0-9_+.@*-]+)?)/g;

function markdownFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '.git' || name === 'node_modules' ? [] : markdownFiles(p);
    return name.endsWith('.md') ? [p] : [];
  });
}

type Cite = { token: string; where: string };

function collectCitations(): { docCount: number; cites: Cite[] } {
  const docs = markdownFiles(join(ROOT, 'docs'));
  const cites: Cite[] = [];
  for (const f of docs) {
    const lines = readFileSync(f, 'utf8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) continue;
      for (const m of line.matchAll(CITATION)) {
        const token = m[1];
        if (!token) continue;
        cites.push({
          token: token.replace(/\.+$/, ''),
          where: `${relative(ROOT, f).split('\\').join('/')}:${i + 1}`,
        });
      }
    }
  }
  return { docCount: docs.length, cites };
}

/** token -> 磁盘上解得出的相对路径；`*` 只认最后一段，目录引用收它下面的文件。 */
function resolveToken(token: string): { kind: 'file' | 'dir' | 'none'; paths: string[] } {
  const direct = join(ROOT, '.scratch', token);
  if (!token.includes('*')) {
    if (!existsSync(direct)) return { kind: 'none', paths: [] };
    if (statSync(direct).isDirectory()) return { kind: 'dir', paths: walkFiles(direct) };
    return { kind: 'file', paths: [`.scratch/${token}`] };
  }
  const segs = token.split('/');
  const last = segs.pop()!;
  const base = join(ROOT, '.scratch', ...segs);
  if (!existsSync(base)) return { kind: 'none', paths: [] };
  const re = new RegExp(`^${last.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
  const hits = readdirSync(base)
    .filter((n) => re.test(n) && statSync(join(base, n)).isFile())
    .map((n) => `.scratch/${[...segs, n].join('/')}`)
    .sort();
  return hits.length ? { kind: 'file', paths: hits } : { kind: 'none', paths: [] };
}

function walkFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walkFiles(p);
    return [relative(ROOT, p).split('\\').join('/')];
  });
}

function trackedScratchFiles(): Set<string> {
  return new Set(
    execFileSync('git', ['ls-files', '-c', '--', '.scratch'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean),
  );
}

describe('§192 文档点名的 .scratch 证据：解得出、且跟仓库一起走', () => {
  const { docCount, cites } = collectCitations();

  it('扫描面不是空的：docs 扫到一份清单，点名数量与实测同档（门自己先证明它有牙齿）', () => {
    // 这两条是"普查作废"判据：population 空的话，下面两条腿会因为什么都不必检查而假绿。
    expect(docCount).toBeGreaterThanOrEqual(50);
    expect(cites.length).toBeGreaterThanOrEqual(70);
  });

  it('抓取器吃整段路径：非标准后缀不被截断，中文标点与括号正常收尾', () => {
    const grab = (line: string) =>
      [...line.matchAll(CITATION)]
        .map((m) => m[1])
        .filter((token): token is string => token !== undefined)
        .map((token) => token.replace(/\.+$/, ''));
    // 旧版在这里只会交出 `submit.ts`，于是把一个磁盘上存在的文件读成了死引用。
    expect(grab('见证：`.scratch/submit.ts.fixed`')).toEqual(['submit.ts.fixed']);
    expect(grab('读数在 `.scratch/arms-141-vitest*.log`、`.scratch/arms-141-e2e*.log`。')).toEqual([
      'arms-141-vitest*.log',
      'arms-141-e2e*.log',
    ]);
    expect(grab('（`.scratch/s28-forwarded-live-probe2.mts`）：')).toEqual(['s28-forwarded-live-probe2.mts']);
    expect(grab('.scratch/shots/40-*-light.png')).toEqual(['shots/40-*-light.png']);
    // 真文件确实解得出，假名字解不出：这两句钉住 resolveToken 不是恒真。
    expect(resolveToken('submit.ts.fixed').paths).toEqual(['.scratch/submit.ts.fixed']);
    expect(resolveToken('no-such-evidence-8f2b1c.mjs')).toEqual({ kind: 'none', paths: [] });
    // 目录型点名（`docs/ENVIRONMENT.md` 把一次 `--out .scratch/pw-paced-studio` 写进了正文）走的是另一条分支：
    // 它必须展开出**非空的文件清单**，否则第 4 腿拿着一个空数组遍历，对着一整目录没入册的证据也能白给绿。
    expect(resolveToken('pw-paced-studio')).toMatchObject({ kind: 'dir' });
    expect(resolveToken('pw-paced-studio').paths.length).toBeGreaterThan(0);
  });

  it('每一句点名的证据在磁盘上都查得到（缺一个就红，红话带 docs 行号）', () => {
    const missing = cites.filter((c) => resolveToken(c.token).kind === 'none');
    expect(
      missing.map((m) => `${m.where} 点名 .scratch/${m.token} —— 磁盘上没有`),
      `${missing.length} 条声称的证据已失踪：${missing.map((m) => `${m.where} .scratch/${m.token}`).join('；')}`,
    ).toEqual([]);
  });

  it('点名到的证据全在版本库里：文件、glob 命中的每一个、目录下面的每一个（`.scratch/` 被忽略，不入册就只活在这一台机器上）', () => {
    const tracked = trackedScratchFiles();
    // 这里以前只 filter kind==='file'，于是"见证：一个目录"整条不受检——
    // 磁盘上查得到（第三腿过），但一次全新 clone 里那 10 个文件一个都不在。
    const resolvable = cites.filter((c) => resolveToken(c.token).kind !== 'none');
    const untracked = new Set<string>();
    for (const c of resolvable) {
      for (const p of resolveToken(c.token).paths) if (!tracked.has(p)) untracked.add(`${p}  ← ${c.where}`);
    }
    // 入册人口本身就是判据：只比磁盘不比版本库的话，一次 git rm 之后这条腿会空转。
    expect(tracked.size).toBeGreaterThanOrEqual(100);
    expect(
      [...untracked].sort(),
      `${untracked.size} 个被文档点名的证据文件没进版本库，` +
        `修法是 git add -f .scratch/<路径>，或者改掉那句声称：${[...untracked].sort().join('；')}`,
    ).toEqual([]);
  });
});
