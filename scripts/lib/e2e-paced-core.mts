/**
 * `scripts/e2e-paced.mts` 里**不碰进程、不碰磁盘**的那一半（§SEC 第四十片）。
 *
 * 为什么要拆出来：这一半决定的是"这一片到底发起了几条、那几条是不是我以为的那几条"，
 * 而它原来只有整条链路一起跑才能验到——跑一次要 4~20 分钟、还要等限流窗口。
 * 拆成纯函数以后，它能在几毫秒里被真 `--list` 的输出喂一遍（`scripts/test/e2e-paced-core.test.mts`），
 * 而这一片要拦的那类错——**分片器自己说谎**——恰好是最不该等到晚上才发现的错。
 *
 * 这个文件不许 import `node:child_process` / `node:fs`：一 import，测试就得真起 Playwright。
 */

export interface TestCase {
  /** 声明所在行 —— `--list` 报出来的就是这一行 */
  line: number;
  title: string;
}

/**
 * 从 `--list --reporter=list` 的文本里把用例连行号取出来。
 *
 * 一条都没取到**当场抛**：静默的空列表会让脚本"跑完 N 片全绿"，而那 N 片其实一条用例都没发起——
 * 这是最像成功的一种失败（2026-11-06 撞上 `--shard` 按文件分时，就是这个形状）。
 * 抛出去的那句话带上原文前 800 字与调用方补的一句实况（`--list` 的退出码），
 * 不然读的人只能去猜是措辞变了还是文件根本没匹配上。
 */
export function parseList(text: string, spec: string, detail = ''): TestCase[] {
  const out: TestCase[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    // `  [chrome] › studio.spec.ts:85:5 › @smoke studio slice renders the model on canvas …`
    // 项目名与行号都在这一行里；`›` 在 Windows 的输出里是全角尖括号，不是 '>'。
    const m = /›\s+[\w./-]+:(\d+):\d+\s+›\s+(.+)$/.exec(rawLine.trim());
    if (m) out.push({ line: Number(m[1]), title: m[2]! });
  }
  if (out.length === 0) {
    throw new Error(
      `--list 没从 ${spec} 列出任何用例${detail ? `（${detail}）` : ''}。` +
        `宁可不跑，也不要发起 N 片空跑然后报"全绿"：\n${text.slice(0, 800)}`,
    );
  }
  return out;
}

/**
 * 按下标连续切段（不是按用时均衡）：这一片要证明的是"限流窗口等够了就能全绿"，
 * 所以段的口径必须是**建项目次数的上界**——用例数均匀，段就均匀，谁也不必去猜"这一片到底发起了几条"。
 *
 * 片数切得比用例数还多时，段数**收在用例数上**（57 条切 60 片 = 57 片各 1 条）：
 * 空的那几片会被报成"全绿的一片"，那正是这个分片器要避免的那个假成功。
 */
export function partition(cases: TestCase[], shards: number): TestCase[][] {
  const size = Math.ceil(cases.length / shards);
  const groups: TestCase[][] = [];
  for (let start = 0; start < cases.length; start += size) {
    groups.push(cases.slice(start, start + size));
  }
  return groups;
}

/** 这一片里行号有没有被重复发起（重复 ⇒ 同一条用例占了两个名额，窗口账就对不上了） */
export function duplicateLines(groups: TestCase[][]): number[] {
  const lines = groups.flat().map((c) => c.line);
  return lines.filter((l, i) => lines.indexOf(l) !== i);
}

/** 只认 Playwright 自己那句汇总，不自己数用例——数用例的口径与它不一致时，汇总表就会说谎 */
export function summaryLine(text: string, code: number): string {
  const lines = text.split(/\r?\n/).filter((l) => /\d+ (passed|failed|flaky|skipped|interrupted)/.test(l));
  if (lines.length > 0) return lines[lines.length - 1]!.trim();
  // exit=0 却没有汇总行是**合法**的：位置 filter 一条都没点到时，Playwright 正常退出且不报汇总。
  // 把这种情况报成"根本没跑起来"会让人去查一个不存在的故障
  return code === 0 ? '(这一片没分到用例)' : `(exit=${code} 且没读到汇总行——那一片多半根本没跑起来)`;
}

export function counts(text: string): { passed: number; failed: number; skipped: number } {
  const pick = (word: string): number => {
    const m = text.match(new RegExp(`(\\d+) ${word}`));
    return m ? Number(m[1]) : 0;
  };
  return { passed: pick('passed'), failed: pick('failed'), skipped: pick('skipped') };
}

/**
 * Playwright 自己那句 "Running N tests" 里的 N（读不到就是 null）。
 *
 * 取**最后一个**：配置里只有一个 project 时只会有一句；多 project 时每个 project 各报一行，
 * 最后一行才是那台真正凑齐要跑的数字。
 */
export function claimedTally(text: string): number | null {
  const all = [...text.matchAll(/Running (\d+) test/g)].map((m) => Number(m[1]));
  return all.length > 0 ? all[all.length - 1]! : null;
}

/**
 * 两本账同口供：脚本以为这一片发起了 `launched` 条，Playwright 那句也得是同一个数。
 *
 * **读不到那句也算对不上**。原来写成 `claimed !== null && claimed !== launched`，
 * 等于"解析不到就当对得上"：换掉 reporter、Playwright 改了措辞、或者输出被截断，这一格就静默失明，
 * 而它要拦的恰好是"看着全绿其实没跑"——最该响的时候不响。
 */
export function tallyMismatch(claimed: number | null, launched: number): boolean {
  return claimed === null || claimed !== launched;
}

/** 建项目被服务端拒了（helper 抛的那句话里的标记），与"这条用例自己错了"分开的依据 */
export function refusedByGate(text: string): boolean {
  return /建项目被服务端拒了/.test(text);
}

/** 服务端自己算的那句"还要等 X 分钟"里的 X；报错文本里没带分钟数时是 null */
export function waitMinutesFromServer(text: string): number | null {
  const m = /还要等 (\d+) 分钟/.exec(text);
  return m ? Number(m[1]) : null;
}

/**
 * 下一片要等多久——**由服务端那句决定**，不是由我猜的一个常数决定。
 *
 * 撞了闸就照它算的分钟数 +1（那是滑动窗口里最老一条的到期时间；被拒的那一次不占名额，所以可信）；
 * 没撞闸就照 `cooldownMin`。取 max 是为了让 `--cooldown-min` 仍是**下界**：
 * 一个自称"等的是服务端算出来的那个数"的脚本，实际睡的是自己拍的数，这一格就不诚实。
 */
export function sleepMinutes(text: string, cooldownMin: number): number {
  if (!refusedByGate(text)) return cooldownMin;
  const wait = waitMinutesFromServer(text);
  return wait === null ? cooldownMin : Math.max(cooldownMin, wait + 1);
}
