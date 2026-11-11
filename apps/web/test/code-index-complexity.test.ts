import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildCodeDigest,
  codeIndexChars,
  fitCodeIndexToBudget,
  jsonArrayCharsFromSum,
  jsonArrayCharsPrefix,
  rankCodeFiles,
  type CodeFileEntry,
  type CodeIndex,
} from '../src/server/domain/code-index';

/** 生产源码——静态结构门用（延续 ADR-0154「锚真实代码」纪律，防用 O(n log n) 全量 stringify 蒙混复杂度门）。 */
const SRC = readFileSync(new URL('../src/server/domain/code-index.ts', import.meta.url), 'utf8');

/**
 * 取函数体（从 `export function NAME` 到下一个顶层 `export` 前），并剥掉注释。
 * 剥注释是必须的（ADR-0154 纪律）：本片源码注释里就复述了旧模式 `[...files, candidate]`
 * 与旧写法 `keep -= 1`，若不剥，静态门会被自己的注释喂红（把说明当代码）。
 */
function functionBody(name: string): string {
  const start = SRC.indexOf(`export function ${name}`);
  if (start < 0) return '';
  const next = SRC.indexOf('\nexport ', start + 1);
  const raw = SRC.slice(start, next < 0 ? undefined : next);
  return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * §PERF-4：code-index 两处预算裁剪从 O(n²) 全量序列化降到次线性。
 *
 * 背景（先量再治）：`fitCodeIndexToBudget` 的"砍文件"步骤从 keep=length-1 逐个递减、
 * 每轮 `JSON.stringify({...index, files: slice(0,keep)})`（O(总字符)）→ 最坏 O(n²)；
 * `buildCodeDigest` 逐文件追加时每轮 `[...files, candidate]` + 全量 stringify → O(n²)。
 * 两个函数都是纯函数（code-index.ts:322/583 明示不读库、不碰时钟），正该用算法优化。
 *
 * 判据哲学（延续 §CRIT-1 / ADR-0154「锚真实代码」）：
 * 1. **零行为风险靠"逐字节相等"钉死**：本文件自带当前实现的 oracle（copy 源码逻辑），
 *    断言优化后的结果与 oracle 对多组规模/预算 `JSON.stringify` 逐字符相等——不是"字段差不多"，
 *    是连 trimmed 文案、dropped 计数、files 顺序都一字不差。
 * 2. **复杂度下降靠"序列化工作量"量化**：spy `JSON.stringify` 累计返回字符串总长度 ≈ CPU
 *    序列化字节工作量。合成 n 与 4n 两份 index，断言工作量比率 < 8（O(n²) 理论≈16，
 *    O(n) 理论≈4，留余量）。这测的是真实工作量，不是墙钟（墙钟在抢资源机上不可靠）。
 * 3. **调用次数**：fit 的全量 index 序列化次数（用 `totals.toJSON` 探针计）优化后须与 n 无关
 *    （O(1)/O(log n)），当前为 O(n)。
 *
 * 纯内存、零库、零网络、零时钟、零 sleep。合成 index 不依赖 generateProject。
 */

const SYMBOLS_PER_FILE = 60; // 与生产 code-index.ts 同常量，保证 oracle 一致

/** 合成一份"每个文件都带 bench token、序列化长度可控"的纯内存 index。 */
function makeBenchIndex(n: number, perFileChars: number): CodeIndex {
  const files: CodeFileEntry[] = Array.from({ length: n }, (_, i) => {
    const padding = 'x'.repeat(perFileChars);
    return {
      path: `src/bench-${String(i).padStart(5, '0')}.tsx`,
      language: 'tsx',
      origin: { kind: 'page', pageId: `bench-page-${i}`, pageName: `基准页${i}` },
      lines: 20,
      chars: fileCharsFor(perFileChars),
      symbols: [
        { name: `benchSymbol${i}`, kind: 'function', line: 1, exported: true, params: [padding, 'second'] },
      ],
      deps: [`./bench-dep-${i}`],
      externals: ['bench-runtime'],
      unresolvedDeps: [],
      designAnchors: i % 3 === 0 ? 2 : 0, // 触发 step1 锚点裁剪（保持 oracle 覆盖面）
      syntaxErrors: null,
    };
  });
  return {
    schemaVersion: 1,
    generatedFrom: { documentId: 'bench-doc', documentName: '基准文档', updatedAt: '2026-01-01T00:00:00Z', mode: null },
    files,
    totals: {
      files: n,
      pageFiles: n,
      nodeRegionFiles: 0,
      symbols: n,
      exportedSymbols: n,
      components: 0,
      functions: n,
      classes: 0,
      interfaces: 0,
      internalDeps: 0,
      externalDeps: n,
      unresolvedDeps: 0,
      codeChars: n * perFileChars,
      unreadableFiles: 0,
      nodeRegionChars: 0,
    },
    omissions: [],
  };
}

/** chars 字段本身不进"每个文件的序列化长度" Cost 主项，给个确定值即可。 */
function fileCharsFor(perFileChars: number): number {
  return perFileChars * 2 + 128;
}

/** 复制 `fitCodeIndexToBudget` 当前实现作 oracle——不 import 私有逻辑，独立逐字复刻。 */
function oracleFit(index: CodeIndex, maxChars: number): CodeIndex {
  if (maxChars <= 0 || codeIndexChars(index) <= maxChars) return index;

  const dropped = { files: 0, symbols: 0, anchors: false };
  const trimmed: string[] = [];
  let files = index.files.map((file) => ({ ...file }));

  if (files.some((file) => file.designAnchors > 0)) {
    dropped.anchors = true;
    files = files.map((file) => ({ ...file, designAnchors: 0 }));
    trimmed.push('去掉了每个文件的节点锚点计数');
  }
  let droppedSymbols = 0;
  files = files.map((file) => {
    if (file.symbols.length <= SYMBOLS_PER_FILE) return file;
    droppedSymbols += file.symbols.length - SYMBOLS_PER_FILE;
    return { ...file, symbols: file.symbols.slice(0, SYMBOLS_PER_FILE) };
  });
  if (droppedSymbols > 0) {
    dropped.symbols = droppedSymbols;
    trimmed.push(`每个文件最多列 ${SYMBOLS_PER_FILE} 个符号，省掉 ${droppedSymbols} 个`);
  }
  if (codeIndexChars({ ...index, files }) > maxChars) {
    files = files.map((file) => ({ ...file, symbols: file.symbols.map((symbol) => ({ ...symbol, params: [] })) }));
    trimmed.push('去掉了符号的参数名');
  }
  if (codeIndexChars({ ...index, files }) > maxChars) {
    let keep = files.length - 1;
    while (keep > 1 && codeIndexChars({ ...index, files: files.slice(0, keep) }) > maxChars) keep -= 1;
    dropped.files = files.length - keep;
    files = files.slice(0, Math.max(keep, 1));
    trimmed.push(`只列前 ${Math.max(keep, 1)} 个文件，另有 ${dropped.files} 个未展开（总数仍在 totals 里）`);
  }

  const next: CodeIndex = { ...index, files, dropped, trimmed };
  if (codeIndexChars(next) > maxChars) {
    trimmed.push(`即便只剩骨架仍是 ${codeIndexChars(next)} 字符：预算 ${maxChars} 比这份项目的最小目录还小`);
  }
  return next;
}

/**
 * 复制 `buildCodeDigest` 的预算循环作 oracle。
 * 排序/命中理由直接调**导出的真实 `rankCodeFiles`**（本片不动它），
 * 于是这条 oracle 只检验"预算检查那一行"改造前后的等价——正是本片唯一动的地方，
 * 不会因复刻排序细节走样而误报。
 */
function oracleDigest(
  index: CodeIndex,
  input: { query?: string | null; pageId?: string | null; nodeIds?: string[]; maxChars?: number },
) {
  const maxChars = input.maxChars ?? 8_000;
  const ranked = rankCodeFiles(index, {
    query: input.query,
    pageId: input.pageId,
    nodeIds: input.nodeIds,
    limit: index.files.length,
  });
  const byPath = new Map(index.files.map((file) => [file.path, file]));
  const files: Array<Record<string, unknown>> = [];
  const trimmed: string[] = [];

  for (const match of ranked) {
    const file = byPath.get(match.path);
    if (!file) continue;
    const candidate = {
      path: file.path,
      language: file.language,
      origin: `生成自页面「${(file.origin as { pageName: string }).pageName}」`,
      pageName: (file.origin as { pageName: string }).pageName,
      lines: file.lines,
      symbols: file.symbols.slice(0, 40).map((s) => `${s.kind}:${s.name}${s.exported ? '' : '(局部)'}`),
      deps: file.deps,
      externals: file.externals,
      unresolvedDeps: file.unresolvedDeps,
      reasons: match.reasons,
    };
    if (JSON.stringify({ schemaVersion: 1, files: [...files, candidate] }).length > maxChars) {
      trimmed.push(`预算 ${maxChars} 字符用满：还有 ${ranked.length - files.length} 个命中的文件没发出去`);
      break;
    }
    files.push(candidate);
  }
  if (!files.length && (input.query || input.pageId || input.nodeIds?.length)) {
    trimmed.push('没有任何文件命中这轮请求的关键词与位置：宁可发空目录，也不发一份看起来相关的猜测');
  }
  return {
    schemaVersion: 1 as const,
    mode: index.generatedFrom.mode,
    query: input.query ?? null,
    files,
    totals: index.totals,
    budgetChars: maxChars,
    omittedFiles: index.files.length - files.length,
    trimmed,
    omissions: index.omissions,
  };
}

/** spy JSON.stringify，累计所有序列化返回字符串的总字节数（≈ CPU 工作量）。 */
function measureWork<T>(run: () => T): { result: T; work: number; calls: number } {
  const real = JSON.stringify;
  let work = 0;
  let calls = 0;
  (JSON as { stringify: typeof JSON.stringify }).stringify = ((value: unknown, ...rest: unknown[]) => {
    const out = real(value as never, ...(rest as never[]));
    calls += 1;
    if (typeof out === 'string') work += out.length;
    return out;
  }) as typeof JSON.stringify;
  try {
    const result = run();
    return { result, work, calls };
  } finally {
    (JSON as { stringify: typeof JSON.stringify }).stringify = real;
  }
}

/** 用 totals.toJSON 探针统计"整个 index 被序列化"的次数。 */
function countWholeIndexStringifies(run: (index: CodeIndex) => void, index: CodeIndex): number {
  let whole = 0;
  const totalsWithProbe = {
    ...index.totals,
    toJSON() {
      whole += 1;
      const { toJSON: _drop, ...plain } = this as Record<string, unknown>;
      return plain;
    },
  };
  run({ ...index, totals: totalsWithProbe as unknown as CodeIndex['totals'] });
  return whole;
}

describe('§PERF-4 code-index 预算裁剪复杂度（O(n²) → 次线性）', () => {
  // 预算取"能装下约 8 个文件"的规模，让 fit 的砍文件步骤必经深度循环
  const perFile = 240;
  const budgetFor = (n: number) => Math.floor(codeIndexChars(makeBenchIndex(Math.min(n, 8), perFile)) * 1.15);

  it('地基：数组序列化长度前缀和 == 真 JSON.stringify 逐前缀长度（含中文/引号/嵌套/空）', () => {
    const cases: unknown[][] = [
      [],
      ['a', 'bb', 'ccc'],
      ['中文', '含"引号"', '带\\反斜杠', '换行\n制表\t'],
      [{ a: 1 }, { b: [1, 2, 3] }, null, true, 42],
      [
        { path: 'src/页.tsx', symbols: [{ name: '函数', params: ['甲', '乙'] }] },
        { deps: ['./依赖'], externals: ['react'] },
      ],
    ];
    for (const items of cases) {
      const lens = items.map((item) => JSON.stringify(item).length);
      const prefix = jsonArrayCharsPrefix(lens);
      for (let k = 0; k <= items.length; k += 1) {
        const real = JSON.stringify(items.slice(0, k)).length;
        expect(prefix[k], `前缀 k=${k} 与真序列化不符：${prefix[k]} vs ${real}`).toBe(real);
      }
      // 增量闭式与前缀和必须同一来源
      expect(jsonArrayCharsFromSum(lens.reduce((a, b) => a + b, 0), items.length)).toBe(prefix[items.length]);
      expect(jsonArrayCharsFromSum(0, 0)).toBe(2); // 空数组 []
    }
  });

  it('fit：优化后输出与 oracle 逐字节相等（零行为风险命门）', () => {
    for (const n of [2, 5, 12, 40]) {
      for (const factor of [0.3, 0.55, 0.8, 1.15]) {
        const index = makeBenchIndex(n, perFile);
        const budget = Math.floor(codeIndexChars(index) * factor);
        expect(JSON.stringify(fitCodeIndexToBudget(index, budget))).toBe(JSON.stringify(oracleFit(index, budget)));
      }
    }
  });

  it('fit：序列化工作量随规模线性增长，而非平方（4n 的工作量 < 8×，O(n²) 理论≈16×）', () => {
    const small = measureWork(() => fitCodeIndexToBudget(makeBenchIndex(40, perFile), budgetFor(40)));
    const big = measureWork(() => fitCodeIndexToBudget(makeBenchIndex(160, perFile), budgetFor(160)));
    const ratio = big.work / Math.max(small.work, 1);
    expect(ratio, `O(n²) 未消除：4× 文件数的工作量比 ${ratio.toFixed(1)}（应 < 8）`).toBeLessThan(8);
  });

  it('fit：整个 index 的序列化次数不再随文件数线性增长', () => {
    const small = countWholeIndexStringifies(
      (idx) => void fitCodeIndexToBudget(idx, budgetFor(40)),
      makeBenchIndex(40, perFile),
    );
    const big = countWholeIndexStringifies(
      (idx) => void fitCodeIndexToBudget(idx, budgetFor(160)),
      makeBenchIndex(160, perFile),
    );
    expect(big - small, `全量序列化随 n 增长（small=${small} big=${big}），砍文件仍在逐轮全量 stringify`).toBeLessThanOrEqual(2);
  });

  it('digest：优化后输出与 oracle 逐字节相等（零行为风险命门）', () => {
    for (const n of [2, 5, 12, 40]) {
      for (const maxChars of [120, 400, 1200, 8_000]) {
        const index = makeBenchIndex(n, perFile);
        expect(JSON.stringify(buildCodeDigest(index, { query: 'bench', maxChars }))).toBe(
          JSON.stringify(oracleDigest(index, { query: 'bench', maxChars })),
        );
      }
    }
  });

  it('digest：序列化工作量随规模线性增长，而非平方（4n 的工作量 < 8×）', () => {
    // maxChars 足够大让所有候选都进（不提前 break），暴露逐轮 [...files] 全量 stringify 的 O(n²)
    const maxChars = 500_000;
    const small = measureWork(() => buildCodeDigest(makeBenchIndex(40, perFile), { query: 'bench', maxChars }));
    const big = measureWork(() => buildCodeDigest(makeBenchIndex(160, perFile), { query: 'bench', maxChars }));
    const ratio = big.work / Math.max(small.work, 1);
    expect(ratio, `O(n²) 未消除：4× 文件数的工作量比 ${ratio.toFixed(1)}（应 < 8）`).toBeLessThan(8);
  });

  it('结构门：砍文件用 O(1) 前缀查表 + 二分，digest 用增量闭式（堵 O(n log n) 全量蒙混）', () => {
    const fitBody = functionBody('fitCodeIndexToBudget');
    const digestBody = functionBody('buildCodeDigest');
    expect(fitBody, '找不到 fitCodeIndexToBudget 函数体').not.toBe('');
    expect(digestBody, '找不到 buildCodeDigest 函数体').not.toBe('');

    // fit：预算判定必须走前缀和查表，禁止逐轮全量 stringify 整个 index 的旧模式
    expect(fitBody, '砍文件步骤丢了 jsonArrayCharsPrefix 前缀和').toContain('jsonArrayCharsPrefix');
    expect(fitBody, '砍文件步骤丢了 indexCharsWithFiles 骨架拼接').toContain('indexCharsWithFiles');
    expect(fitBody, '又出现了逐轮全量 codeIndexChars({...index, files.slice(...))').not.toMatch(
      /codeIndexChars\(\{\s*\.\.\.index,\s*files:\s*files\.slice/,
    );
    expect(fitBody, '砍文件又变回逐个递减 keep -= 1（线性扫描）').not.toMatch(/keep\s*-=\s*1/);
    expect(fitBody, '砍文件丢了二分（while lo<=hi）').toMatch(/while\s*\(\s*lo\s*<=\s*hi\s*\)/);

    // digest：必须用增量闭式 O(1) 算长度，禁止 [...files, candidate] 每轮全量 stringify
    expect(digestBody, 'digest 丢了 jsonArrayCharsFromSum 增量闭式').toContain('jsonArrayCharsFromSum');
    expect(digestBody, 'digest 又出现 [...files, candidate] 全量复制+序列化').not.toContain('[...files, candidate]');
  });
});
