/**
 * 一份 e2e 文件跑到底，但**照实等限流窗口**（§SEC 第四十片）。
 *
 * 为什么需要这个东西：`e2e/studio.spec.ts` 有 57 条用例、57 处 `createProject` + 1 处
 * `createProjectNamed`（都是 POST /api/projects），而
 * `/api/projects` POST 是 **20 次/小时/IP**（`apps/web/src/server/security/rateLimit.ts`）。
 * 一次全量跑必然撞闸——2026-11-05 那次后台全量跑就是 18 passed / 37 failed，
 * 37 条同一成因（HTTP 429，服务端还回了"还要等 41 分钟"），**不是回归**。
 *
 * 一条用例只建一个项目 ⇒ 一片最多分到 `20 - 余量` 条。默认切 5 片、每片 12 条：
 * 留 8 次余量给"同一段时间里人也在点界面"和"某条用例重试了一次"。
 *
 * 三条不许越过的线，这个脚本一条都不越：
 * 1. **产品里那道闸一字不改**，也不给它开后门（不塞假身份、不写合成 IP 绕开按 IP 的桶——
 *    那等于用伪造身份躲过一道安全控制，与"为测试放宽限流"同罪）；
 * 2. **等的是服务端算出来的那个数**（滑动窗口 60 分钟），不是"多试几次说不定就过了"；
 * 3. **一次只跑一份 Playwright**：`--output` 指到脚本自己的目录，并用锁文件挡住并发启动。
 *    上一片就是因为后台一份、前台一份同时跑，两份共用同一个 `test-results/`，
 *    后跑那份在 `browserContext.close` 报 `ENOENT …/traces/….trace` 判红，而断言其实全过了——
 *    **并行的仪器红不是产品的红**，但没人该去猜哪一份是哪种红。
 *
 * 分片**不用 `--shard`**（2026-11-06 实测撞上的）：Playwright 的 shard 以**文件**为单位分配，
 * 一份文件不可能被拆开。所以 `--shard=1/5` 对 `e2e/studio.spec.ts` 的结果是第一片拿走全部 57 条、
 * 2–5 片各 0 条——`--list` 逐字能看到：
 *   shard 1/5: 57 条 / shard 2/5: 0 条 / shard 3/5: 0 条 / shard 4/5: 0 条 / shard 5/5: 0 条
 * 那种跑法名义上分了五片，实际是把整份文件塞进第一片去撞闸。这里改成**自己点名**：
 * 先 `--list` 把用例连同各自的声明行号列出来，按下标切成 N 段，
 * 每段用位置参数 `e2e/studio.spec.ts:85 e2e/studio.spec.ts:100 …` 交给 Playwright
 * （多个位置 filter 是并集，`--list` 验过：三条行号 filter ⇒ `Total: 3 tests in 1 file`）。
 * 行号比 `--grep` 稳：不用转义标题里的 `（）§` 和正则元字符，也不会因为两条标题互为前缀而多点到一条。
 *
 * 用法（两种形状，别混用 `--only` 与 `--from`）：
 *   # ① 一条一片 + 睡闸自己的补名额速率（20 次/小时 ⇒ 每 3 分钟一个）：墙钟下界 ≈ 2.9 小时，中途可续跑
 *   tsx scripts/e2e-paced.mts --shards 57 --cooldown-min 3
 *   tsx scripts/e2e-paced.mts --shards 57 --from 24 --cooldown-min 3     # 从第 24 片接着跑
 *   # ② 一片几条 + 片间睡满一个窗口：坏一片只坏一片，人按窗口发起
 *   tsx scripts/e2e-paced.mts --only 2                    # 只发起第 2 片（默认 5 片 × 12 条 × 61 分钟）
 *   tsx scripts/e2e-paced.mts --spec e2e/storyboard.spec.ts --shards 2 --cooldown-min 1
 *   tsx scripts/e2e-paced.mts --plan                      # 只打印切法，不发起任何用例
 *
 * 退出码：任何一片非 0 就非 0。每片的完整输出落在 `<out>/shard-i.log`（**边跑边写**），
 * 汇总（逐片的 passed/failed/skipped、两本账的读数与时刻）落在 `<out>/paced-summary.md`——
 * 中途被打断也有可读的半成品，不必整晚守着。
 */

import {
  claimedTally,
  counts,
  duplicateLines,
  parseList,
  partition,
  refusedByGate,
  sleepMinutes as sleepMinutesFor,
  summaryLine,
  tallyMismatch,
  type TestCase,
  waitMinutesFromServer,
} from './lib/e2e-paced-core.mts';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, appendFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface Args {
  spec: string;
  shards: number;
  cooldownMin: number;
  out: string;
  only: number | null;
  from: number | null;
  plan: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string, fallback: string): string => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : fallback;
  };
  const num = (name: string, fallback: number): number => {
    const raw = get(name, String(fallback));
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) throw new Error(`--${name} 要写正整数，收到的是 "${raw}"`);
    return n;
  };
  return {
    spec: get('spec', 'e2e/studio.spec.ts'),
    shards: num('shards', 5),
    cooldownMin: num('cooldown-min', 61),
    out: get('out', '.scratch/pw-paced'),
    // --only i：只跑第 i 片，不睡。为什么留这个口子：一次连跑 5 片要在后台活 4.5 小时，
    // 而这台机器上 Chromium 的 worker 会偶发 `code=3221225794` 直接退出（2026-11-06 实测把
    // 第 1 片打断在第 4 条）——一睡到底的那一份死了，后面四片跟着没跑。
    // 一片一次、片间由人（或调度）按窗口隔开发起，坏一片只坏一片。
    only: argv.includes('--only') ? Number(argv[argv.indexOf('--only') + 1]) : null,
    // --from k：从第 k 片起连跑到最后一片（片间照睡）。为什么要有它：45 条剩用例若按 12 条一片发，
    // 要人守四个 61 分钟的窗口；按 1 条一片发、睡 3 分钟（= 20 次/小时的**补名额速率**），
    // 一次发起就能自己走完，且撞闸时睡的是服务端那句给的数。被打断之后也从这一格续跑，不必整晚重来。
    from: argv.includes('--from') ? Number(argv[argv.indexOf('--from') + 1]) : null,
    // --plan：只打印"哪些行号落进哪一片"就退出。分片本身要能被单独验一次——
    // 否则第一次知道切错了，代价是一整晚的窗口。
    plan: argv.includes('--plan'),
  };
}

/** 进程还活着吗（锁文件用；不是"文件在不在"，那会被上一次被 kill 的残留永久卡住） */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function takeLock(outDir: string): string {
  const lock = resolve(outDir, 'paced.lock');
  if (existsSync(lock)) {
    const holder = Number(readFileSync(lock, 'utf8').trim());
    if (Number.isInteger(holder) && holder > 0 && isAlive(holder)) {
      throw new Error(
        `已经有一份 paced 跑在跑（pid ${holder}，锁 ${lock}）。` +
          `两份 Playwright 共用工作区会互相删 artifacts——先停那一份，别同时跑。`,
      );
    }
    rmSync(lock); // 上一份是被 kill 的：锁是残留，不是有人在跑
  }
  writeFileSync(lock, String(process.pid));
  return lock;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
/**
 * 时刻一律带 `Z`。
 * **Why:** 这台机器的本地时钟是 UTC+8，而 `toISOString()` 给的是 UTC。汇总里一行
 * `2026-11-05 21:34:45 片 15/57` 挨着文档里的"20:49 发起"看，会把同一件事读成隔了 45 分钟跑一片、
 * 又把跨零点的一次跑法读成跑在昨天。UTC 不是要藏的坑，标出来就行。
 */
const stamp = (): string => `${new Date().toISOString().replace('T', ' ').slice(0, 19)}Z`;

/** Playwright 的 CLI 入口：不能用 `npx`（Windows 上 npx 是 .cmd，spawnSync 不带 shell 找不到它） */
const PW_CLI = (): string => resolve(process.cwd(), 'node_modules', '@playwright', 'test', 'cli.js');

/**
 * 用 `--list` 把这份 spec 里的用例连行号列出来（解析在 `lib/e2e-paced-core.mts`，那里能用真输出单测）。
 * 为什么要列出来而不是让 Playwright 自己分片：见文件头——`--shard` 按**文件**分，
 * 一份文件拆不开，五片里有四片是空的、第一片装着全部 57 条。
 *
 * `--output` 指到 `<out>/list-artifacts`：Playwright 每次启动会先清它的 output 目录，
 * 而那次清是递归的——默认那棵 `test-results/` 条目一多就被沙箱的批量删除守卫挡下
 * （`docs/ENVIRONMENT.md`「Playwright e2e 与沙箱的批量删除守卫」那节），
 * 连"只是列一下用例"都会被拒；指到自己目录里既绕开守卫，也不去动并行会话正在用的那棵。
 */
function listTests(spec: string, outDir: string): TestCase[] {
  const listed = spawnSync(
    process.execPath,
    [PW_CLI(), 'test', spec, '--list', '--reporter=list', '--output', resolve(outDir, 'list-artifacts')],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
  const text = `${listed.stdout ?? ''}\n${listed.stderr ?? ''}`;
  return parseList(text, spec, `exit=${listed.status ?? 1}`);
}

/**
 * 跑一片，并把输出**边跑边落盘**。
 *
 * 为什么值得为这件事从 `spawnSync` 换成 `spawn`：一片要跑 4~20 分钟，而 `spawnSync` 只在整片
 * 结束时一次性写文件 —— 期间日志是空的，"这一片是慢还是已经死了"只能靠猜
 * （2026-11-06 第 1 片就是这么盯了 4 分钟才确认它在跑）。
 * 汇总仍从完整文本里现读，所以 `summaryLine` / `counts` / 两本账那条口径一字未变。
 */
function runShard(cliArgs: string[], logPath: string): Promise<{ text: string; code: number }> {
  writeFileSync(logPath, ''); // 重跑同一片要覆盖，不要接在上一轮后面
  return new Promise((done) => {
    const child = spawn(process.execPath, cliArgs);
    const chunks: Buffer[] = [];
    const sink = (name: 'stdout' | 'stderr') =>
      child[name]?.on('data', (buf: Buffer) => {
        chunks.push(buf);
        appendFileSync(logPath, buf);
      });
    sink('stdout');
    sink('stderr');
    child.on('error', (error: Error) => {
      const text = `\n[spawn error] ${error.message}\n`;
      chunks.push(Buffer.from(text));
      appendFileSync(logPath, text);
    });
    child.on('close', (code) =>
      done({ text: Buffer.concat(chunks).toString('utf8'), code: code ?? 1 }),
    );
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const outDir = resolve(args.out);
  mkdirSync(outDir, { recursive: true });

  if (args.plan) {
    const cases = listTests(args.spec, outDir);
    const groups = partition(cases, args.shards);
    groups.forEach((g, idx) => {
      console.log(`片 ${idx + 1}/${groups.length}（${g.length} 条）：`);
      g.forEach((c) => console.log(`  :${c.line}  ${c.title}`));
    });
    const dupes = duplicateLines(groups.flat());
    const covered = groups.reduce((n, g) => n + g.length, 0);
    // 重复与漏掉要分开说：前者是"同一条用例被两片各发起一次"（名额多算），后者是"有一条从未被任何一片发起"。
    // 只报"合计 N 条"的话，57 条里漏 1 条又重 1 条会正好抵成 57，看起来一句话都没错。
    const missing = cases.length - covered;
    // 行号相同的两条（用例写在循环里时就是这样）没法用行号 filter 各自点出来：
    // 它们会同时被两条 filter 命中，于是"发起 1 条、Playwright 报 2 条"——那不是回归，是分片器点不准。
    // 与其让两片的对账各自红一次，不如在这里就停：这条今天不响（全目录 148 条里没有重号行）。
    const sharedLines = duplicateLines(cases);
    console.log(
      `合计 ${covered} 条（列出 ${cases.length} 条），${dupes.length === 0 ? '行号互不重复' : `行号重复：${dupes.join(' ')}`}` +
        `${missing === 0 ? '、无漏' : `、**漏掉 ${missing} 条**`}` +
        `${sharedLines.length === 0 ? '' : `、**同一行号声明了多条用例：${sharedLines.join(' ')}**（行号 filter 分不开它们）`}`,
    );
    process.exit(dupes.length === 0 && missing === 0 && sharedLines.length === 0 ? 0 : 1);
  }

  // 锁在 `--list` **之前**拿：那一步本身也是一次 Playwright 启动。
  // 顺序反过来的话，第二份 paced 会先做完列举、再在锁上撞死——而它列举时已经动过工作区了。
  const lock = takeLock(outDir);
  let groups: TestCase[][];
  try {
    groups = partition(listTests(args.spec, outDir), args.shards);
  } catch (error) {
    rmSync(lock); // 列举失败也要放锁，不然下一次启动被一份没在跑的锁永久挡住
    throw error;
  }
  const shardCount = groups.length;
  const starts: Array<[string, number | null]> = [
    ['--only', args.only],
    ['--from', args.from],
  ];
  for (const [name, value] of starts) {
    if (value !== null && (!Number.isInteger(value) || value < 1 || value > shardCount)) {
      rmSync(lock);
      throw new Error(`${name} 要在 1..${shardCount} 之间，收到的是 ${value}`);
    }
  }
  if (args.only !== null && args.from !== null) {
    rmSync(lock);
    throw new Error('--only 与 --from 只能给一个：前者跑一片，后者从某一片起连跑到最后');
  }
  const summaryPath = resolve(outDir, 'paced-summary.md');
  if (!existsSync(summaryPath)) {
    writeFileSync(
      summaryPath,
      `# paced e2e 汇总\n\nspec=${args.spec} shards=${shardCount} cooldownMin=${args.cooldownMin}\n` +
        `产品里的限流一字未改；片间等的是滑动窗口腾名额。\n\n`,
    );
  }

  const first = args.only ?? args.from ?? 1;
  const last = args.only ?? shardCount;
  console.log(
    `[paced] ${stamp()} ${args.spec} 共 ${groups.reduce((n, g) => n + g.length, 0)} 条用例，` +
      `切成 ${shardCount} 片（${groups.map((g) => g.length).join('/')} 条），` +
      (args.only !== null
        ? `这次只发起第 ${args.only} 片（不睡：一片一次，按窗口隔开发起）`
        : `从第 ${first} 片起连跑到第 ${last} 片，片间至少等 ${args.cooldownMin} 分钟` +
          '（撞了闸就照服务端那句"还要等 X 分钟"加长）') +
      `（闸是 20 次/小时/IP，不改它，改跑法）。输出目录 ${args.out}`,
  );

  let bad = 0;
  for (let i = first; i <= last; i += 1) {
    const group = groups[i - 1]!;
    const shard = `${i}/${shardCount}`;
    const logPath = resolve(outDir, `shard-${i}.log`);
    console.log(
      `[paced] ${stamp()} 第 ${shard} 片开始（${group.length} 条：` +
        `${group.map((c) => c.line).join(' ')}）→ ${args.out}/shard-${i}.log`,
    );
    const run = await runShard(
      [
        PW_CLI(),
        'test',
        ...group.map((c) => `${args.spec}:${c.line}`),
        '--workers=1',
        '--output',
        resolve(outDir, `artifacts-${i}`),
      ],
      logPath,
    );
    // 起不来时 stdout 是空的：`child.on('error')` 那句已经把它抄进日志了
    const text = run.text;
    const code = run.code;
    const line = summaryLine(text, code);
    const c = counts(text);
    // 两本账同口供，解析在 lib 里（那里能用真输出单测）：脚本以为这一片发起了 N 条，
    // Playwright 自己那句 "Running N tests" 也得是 N；对不上就是**分片器在说谎**
    // （行号 filter 没点到、点重了，或 --list 的口径与跑起来的口径不一致），
    // 而这种红最危险：exit=0、passed 数字也齐，看着全绿，实际有几条从未被发起过。
    // 多 project 时每个 project 各报一行，lib 取最后一行——只有一个 project 时它就是那一行；
    // 配置将来变成多 project 时要改成求和（ADR-0088「没牙的格子」第 2 条记了这一格）。
    const claimed = claimedTally(text);
    // **读不到那句也算红**——`claimed === null` 就判红：
    // 换掉 reporter、Playwright 改了措辞、或者输出被截断，都不许静默失明，
    // 而它要拦的恰好是"看着全绿其实没跑"——最该响的时候不响。
    const shardMismatch = tallyMismatch(claimed, group.length);
    const shardBad = code !== 0 || shardMismatch;
    if (shardBad) bad += 1;
    console.log(`[paced] ${stamp()} 第 ${shard} 片结束 exit=${code} ${line}`);
    if (shardBad) {
      console.log(
        claimed === null
          ? `[paced] ⚠ 这一片的输出里**没有 "Running N tests" 那一句**（exit=${code}）：` +
              '没法对账就按红处理。多半是 reporter 换过、或者 Playwright 根本没跑到发起用例那一步——去看这一片的日志。'
          : shardMismatch
            ? `[paced] ⚠ 这一片**发起了 ${group.length} 条，Playwright 报 "Running ${claimed} tests"** —— ` +
              '两边对不上。别把这一片当绿：要么行号 filter 没点到用例，要么 --list 与实跑的口径漂移了。'
            : '',
      );
    }
    appendFileSync(
      summaryPath,
      `- ${stamp()} 片 ${shard}（发起 ${group.length} 条，Playwright 报 ${claimed ?? '读不到'} 条` +
        `${shardMismatch ? ' ⇒ **对不上**' : ''}）：exit=${code}，` +
        `passed=${c.passed} failed=${c.failed} skipped=${c.skipped}｜${line}\n`,
    );
    // 撞闸与真回归分得开：建项目被拒时 helper 抛的那句话里有服务端自己算的分钟数。
    // 这句在 `if (shardBad)` 外面算：下一片要等多久用的是它，而"这一片算不算红"用的是上面的对账——
    // 两件事共用同一个事实，不该各自再解析一遍。
    // 撞闸与真回归分得开：解析在 lib 里（`refusedByGate` / `waitMinutesFromServer` / `sleepMinutes`），
    // 不在这里各抄一份正则——两份正则迟早漂移，而这句一旦漂移，撞闸与回归就分不开了。
    const gated = refusedByGate(text);
    const waitFromServer = waitMinutesFromServer(text);
    if (shardBad) {
      console.log(
        gated
          ? `[paced] 这一片里有**被限流拒了**的建项目（建项目被服务端拒了）——那是窗口没等够，不是产品回归。` +
              (waitFromServer !== null
                ? `服务端自己算的：还要等 **${waitFromServer} 分钟** ⇒ 这一片至少 ${waitFromServer + 1} 分钟后重发` +
                  '（被拒的那一次不占名额，所以这个数是可信的）。'
                : '这句报错里没带上分钟数，按 --cooldown-min 等。')
          : code === 0
            ? '[paced] 这一片 exit=0 但对账没过：按仪器故障处理，别按产品绿处理。'
            : '[paced] 这一片红了：按真回归处理（日志在这一片自己的 shard-i.log 里）。',
      );
    }
    if (i < last && args.only === null) {
      // 等多久**由服务端那句决定**：撞了闸就照它算的分钟数 +1 等（那是滑动窗口里最老一条的到期时间），
      // 没撞就照 --cooldown-min 等。固定睡一个自定的数是本脚本原来最不诚实的地方——
      // 它自称"等的是服务端算出来的那个数"，实际睡的是我猜的 61 分钟。
      const sleepMin = sleepMinutesFor(text, args.cooldownMin);
      const until = new Date(Date.now() + sleepMin * 60_000).toISOString().slice(11, 16);
      console.log(
        `[paced] ${stamp()} 等窗口腾名额：${sleepMin} 分钟（约 ${until} 续跑）` +
          (gated && waitFromServer !== null
            ? `——照服务端那句"还要等 ${waitFromServer} 分钟"加 1 分钟`
            : '——这一片没撞闸，照 --cooldown-min 等'),
      );
      await sleep(sleepMin * 60_000);
    }
  }

  rmSync(lock);
  const ran = last - first + 1;
  console.log(
    `[paced] ${stamp()} 第 ${first}–${last} 片（共 ${shardCount} 片里的 ${ran} 片）跑完，` +
      `${bad === 0 ? '全绿' : `${bad} 片红`}。汇总：${args.out}/paced-summary.md`,
  );
  process.exit(bad === 0 ? 0 : 1);
}

main().catch((error: Error) => {
  console.error(`[paced] 中止：${error.message}`);
  process.exit(1);
});
