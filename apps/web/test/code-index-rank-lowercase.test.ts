import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  queryTokens,
  rankCodeFiles,
  type CodeFileEntry,
  type CodeFileOrigin,
  type CodeIndex,
  type CodeRankInput,
  type CodeSymbol,
} from '../src/server/domain/code-index';

/**
 * §PERF-5 rankCodeFiles 去重复 toLowerCase——把内层循环不变量提到外层（loop-invariant hoisting）。
 *
 * 背景（先量再治，code-index.ts:537-544 / :561-629）：
 *   `hit(haystack, token)` 每次调用都做 `token.toLowerCase()` 与 `haystack.toLowerCase()`；
 *   而 `rankCodeFiles` 是 O(files × tokens × fields) 的嵌套循环——
 *   同一个 token 被小写 O(files × fields) 次，同一个 file 的 path/symbols/externals 被小写 O(tokens) 次。
 *   这两类小写都是**循环不变量**（纯、幂等、只依赖字符串内容），完全可以各算一次复用。
 *
 * 判据哲学（延续 §CRIT-1 / ADR-0154「锚真实代码」与 §PERF-4「逐字节 oracle」）：
 *   1. **零行为风险靠逐字节相等钉死**：本文件自带当前 rankCodeFiles+hit+originTier 的 oracle，
 *      对多组输入（CJK / exact / contains / pageId / nodeIds / externals / path /
 *      css 符号 / 空 query / limit / tier 排序）断言优化后的输出 `JSON.stringify` 逐字符相等——
 *      连 reasons 文案、顺序、去重、score 都一字不差。
 *      诚实边界：hit 的「反方向 needle.includes(value)」分支在当前 queryTokens 切词下不可达
 *      （含 CJK 的 token 恒为 1/2 字，达不到分支要求的长度≥3）。既不谎称 oracle 覆盖了它，
 *      也不删这段防御逻辑；另立一条「可达性门」把"当前不可达"这一事实本身钉死，
 *      一旦未来切词改变让它复活，该门会红，提醒补 oracle 用例（§CRIT-1 声称覆盖纪律）。
 *   2. **工作量下降靠精确计数**：spy `String.prototype.toLowerCase`，按 this 值分类统计调用次数。
 *      优化后 token 小写次数 = O(tokens)（与 files 无关），每个 file 字段小写次数 = O(1)（与 tokens 无关）。
 *      这是**精确次数门**，不是墙钟（抢资源机不可靠），也无法用 O(n log n) 全量蒙混（不同于 PERF-4）。
 *   3. **静态结构门**：rankCodeFiles 体内必含 needle 预计算与 file 字段预小写，且 hit 热路径不再
 *      对入参做 toLowerCase——堵「换皮但热路径仍重复小写」。静态门锚剥注释后的函数体（ADR-0154）。
 *
 * 纯内存、零库、零网络、零时钟、零 sleep。合成 index 不依赖 generateProject。
 */

const SRC = readFileSync(new URL('../src/server/domain/code-index.ts', import.meta.url), 'utf8');

/** 取函数体并剥注释（ADR-0154：防注释复述旧模式喂红/喂绿）。 */
function functionBody(name: string): string {
  const marker = `export function ${name}`;
  const start = SRC.indexOf(marker);
  if (start < 0) return '';
  const next = SRC.indexOf('\nexport ', start + marker.length);
  const raw = SRC.slice(start, next < 0 ? undefined : next);
  return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

// ---------------- oracle：逐字复刻当前（优化前）rankCodeFiles + hit + originTier ----------------

const CJK_RANGES = '\\u3400-\\u9fff\\u3040-\\u30ff\\uac00-\\ud7af';
const CJK_CHAR = new RegExp(`[${CJK_RANGES}]`);

/** 优化前的 hit：每次都对 needle / value 各做一次 toLowerCase。 */
function oracleHit(haystack: string, token: string): boolean {
  const needle = token.toLowerCase();
  const value = haystack.toLowerCase();
  if (!needle || !value) return false;
  if (value.includes(needle)) return true;
  return CJK_CHAR.test(needle) && needle.length >= 3 && needle.includes(value);
}

function oracleOriginTier(origin: CodeFileOrigin): number {
  switch (origin.kind) {
    case 'page':
      return 0;
    case 'node-region':
      return 1;
    case 'barrel':
      return 2;
    case 'tokens':
      return 3;
  }
}

function oracleRank(index: CodeIndex, input: CodeRankInput) {
  const tokens = input.query ? queryTokens(input.query) : [];
  const nodeIds = new Set(input.nodeIds ?? []);
  const limit = input.limit ?? 8;
  const matches: Array<{ path: string; score: number; reasons: string[] }> = [];

  for (const file of index.files) {
    const origin = file.origin;
    const pageName = origin.kind === 'page' || origin.kind === 'node-region' ? origin.pageName : null;
    const nodeName = origin.kind === 'node-region' ? origin.nodeName : null;
    const reasons: string[] = [];
    let score = 0;

    if (input.pageId && 'pageId' in origin && origin.pageId === input.pageId) {
      score += 12;
      reasons.push('当前页');
    }
    if (nodeIds.size && origin.kind === 'node-region' && nodeIds.has(origin.nodeId)) {
      score += 16;
      reasons.push('选中节点');
    }

    let symbolHit = 0;
    let symbolName = '';
    for (const token of tokens) {
      const symbol = file.symbols.find((candidate) => oracleHit(candidate.name, token));
      if (symbol) {
        const exact = symbol.name.toLowerCase() === token;
        if ((exact ? 10 : 5) > symbolHit) {
          symbolHit = exact ? 10 : 5;
          symbolName = symbol.name;
        }
      }
      if (pageName && oracleHit(pageName, token) && !reasons.includes(`页面「${pageName}」`)) {
        score += 8;
        reasons.push(`页面「${pageName}」`);
      }
      if (nodeName && oracleHit(nodeName, token) && !reasons.includes(`节点「${nodeName}」`)) {
        score += 8;
        reasons.push(`节点「${nodeName}」`);
      }
      if (oracleHit(file.path, token) && !reasons.includes(`路径 ${file.path}`)) {
        score += 4;
        reasons.push(`路径 ${file.path}`);
      }
      if (file.externals.some((external) => oracleHit(external, token)) && !reasons.includes(`外部依赖 ${token}`)) {
        score += 2;
        reasons.push(`外部依赖 ${token}`);
      }
    }
    if (symbolHit) {
      score += symbolHit;
      reasons.push(`符号 ${symbolName}${symbolHit === 10 ? ' 完全命中' : ''}`);
    }

    if (score > 0) matches.push({ path: file.path, score, reasons: [...new Set(reasons)] });
  }

  const byPath = new Map(index.files.map((file) => [file.path, file]));
  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const tierA = oracleOriginTier(byPath.get(a.path)!.origin);
    const tierB = oracleOriginTier(byPath.get(b.path)!.origin);
    return tierA - tierB || a.path.localeCompare(b.path);
  });
  return matches.slice(0, limit);
}

// ---------------- 合成夹具 ----------------

function sym(name: string, params: string[] = []): CodeSymbol {
  return { name, kind: 'function', line: 1, exported: true, params };
}

/** 覆盖所有 origin kind、CJK / 大小写 / exact / contains / 反方向包含 / externals 的 oracle 夹具。 */
function oracleFixture(): CodeIndex {
  const files: CodeFileEntry[] = [
    {
      path: 'components/nexus/Page1.tsx',
      language: 'tsx',
      origin: { kind: 'page', pageId: 'p1', pageName: '结算页' },
      lines: 10,
      chars: 100,
      symbols: [sym('SubmitButton'), sym('coupon'), sym('结算卡片')],
      deps: [],
      externals: ['react', '@nexus/ui'],
      unresolvedDeps: [],
      designAnchors: 0,
      syntaxErrors: null,
    },
    {
      path: 'components/nexus/Page2.tsx',
      language: 'tsx',
      origin: { kind: 'page', pageId: 'p2', pageName: '优惠券' },
      lines: 20,
      chars: 200,
      symbols: [sym('CouponCountdown'), sym('useCoupon')],
      deps: [],
      externals: ['react', 'zustand'],
      unresolvedDeps: [],
      designAnchors: 0,
      syntaxErrors: null,
    },
    {
      path: 'code-only/p1/n1.tsx',
      language: 'tsx',
      origin: { kind: 'node-region', pageId: 'p1', pageName: '结算页', nodeId: 'n1', nodeName: '提交按钮' },
      lines: 8,
      chars: 80,
      symbols: [sym('提交按钮'), sym('COUPONWidget')],
      deps: [],
      externals: ['clsx'],
      unresolvedDeps: [],
      designAnchors: 0,
      syntaxErrors: null,
    },
    {
      path: 'components/nexus/index.ts',
      language: 'ts',
      origin: { kind: 'barrel' },
      lines: 3,
      chars: 30,
      symbols: [sym('NexusPages')],
      deps: [],
      externals: [],
      unresolvedDeps: [],
      designAnchors: 0,
      syntaxErrors: null,
    },
    {
      path: 'styles/tokens.css',
      language: 'css',
      origin: { kind: 'tokens' },
      lines: 5,
      chars: 60,
      symbols: [sym('--nx-coupon-bg')],
      deps: [],
      externals: [],
      unresolvedDeps: [],
      designAnchors: 0,
      syntaxErrors: null,
    },
  ];
  return {
    schemaVersion: 1,
    generatedFrom: { documentId: 'd', documentName: '夹具', updatedAt: '2026-01-01T00:00:00Z', mode: null },
    files,
    totals: {
      files: files.length,
      pageFiles: 2,
      nodeRegionFiles: 1,
      symbols: files.reduce((s, f) => s + f.symbols.length, 0),
      exportedSymbols: files.reduce((s, f) => s + f.symbols.length, 0),
      components: 0,
      functions: files.reduce((s, f) => s + f.symbols.length, 0),
      classes: 0,
      interfaces: 0,
      internalDeps: 0,
      externalDeps: 0,
      unresolvedDeps: 0,
      codeChars: files.reduce((s, f) => s + f.chars, 0),
      unreadableFiles: 0,
      nodeRegionChars: 80,
    },
    omissions: [],
  };
}

/** 多组输入：每一组都是一次独立的「零行为」比对，覆盖各条 hit / 排序 / 加权分支。 */
const ORACLE_CASES: CodeRankInput[] = [
  { query: '把结算页的提交按钮改一下' }, // CJK 页面名命中（文件名无中文）+ 节点名 + 反方向二元组
  { query: 'CouponCountdown' }, // 大小写不敏感 + exact 10 分
  { query: 'COUPONWIDGET' }, // 大小写混排 exact
  { query: 'coupon' }, // contains 5 分，跨多文件比最高 symbolHit
  { query: 'useCoupon' }, // 前缀 contains
  { query: 'clsx' }, // 仅 externals 命中
  { query: 'nexus' }, // 仅 path 命中
  { query: '--nx-coupon-bg' }, // css 变量符号
  { query: '结算卡片' }, // CJK 符号名
  { query: 'zzz 不存在的东西 qqq' }, // 空结果
  { query: '' }, // 空 query → 只有位置加权
  { pageId: 'p1' }, // 仅当前页 +12
  { pageId: 'p1', nodeIds: ['n1'] }, // 当前页 + 选中节点 +16
  { query: 'coupon', pageId: 'p2', nodeIds: ['n1'], limit: 2 }, // 混合打分 + 截断
  { query: 'CouponCountdown', limit: 0 }, // limit=0
  { query: '结算', pageId: 'p1', nodeIds: ['n1', 'n9'], limit: 3 }, // CJK + 多 nodeIds + 截断
];

// ---------------- toLowerCase 计数（精确次数门的核心） ----------------

/**
 * spy `String.prototype.toLowerCase`，统计调用总次数与「按被小写原文 this 分组」的次数。
 * this 值分类让我们能精确区分「token 被小写几次」「某 file 字段被小写几次」，
 * 而不污染 oracle / 业务结果（spy 只包装、如实转发原生实现）。
 */
function countLowercases(run: () => void): { total: number; callsByValue: Map<string, number> } {
  // Reflect.get 取原生实现而非 `String.prototype.toLowerCase` 直接引用：后者触发
  // @typescript-eslint/unbound-method（方法脱离对象取值易误绑 this）；语义同为"替换前存下原生函数"，
  // 且 spy 安装后 real 仍是替换前那份，不会递归拿到 wrapped 自身。
  const real = Reflect.get(String.prototype, 'toLowerCase') as (this: string) => string;
  const callsByValue = new Map<string, number>();
  let total = 0;
  const wrapped = function (this: string): string {
    total += 1;
    callsByValue.set(this, (callsByValue.get(this) ?? 0) + 1);
    return real.call(this);
  };
  (String.prototype as unknown as { toLowerCase: typeof wrapped }).toLowerCase = wrapped;
  try {
    run();
  } finally {
    (String.prototype as unknown as { toLowerCase: typeof real }).toLowerCase = real;
  }
  return { total, callsByValue };
}

/**
 * 合成"每个文件都带若干符号/外部依赖"的 index，并给出所有会被小写的**字段原文**集合，
 * 用于把字段小写次数从总次数里精确摘出来。token 用 queryTokens 切出的原文（此处构造时统一小写），
 * 与字段原文集合不重叠（字段带大写/中文/CJK，token 是纯小写 ASCII 词），保证分类不串味。
 */
function makeCountFixture(
  files: number,
  symbolsPerFile: number,
  externalsPerFile: number,
): { index: CodeIndex; fieldValues: Set<string>; tokens: string[] } {
  const tokens = ['coupon', 'submit', 'button', 'nexus', 'react', 'update', 'render'] as const; // 7 个 token
  const fieldValues = new Set<string>();
  const entries: CodeFileEntry[] = Array.from({ length: files }, (_, i) => {
    const path = `components/nexus/Page${i}.tsx`;
    const pageName = `结算页${i}`; // CJK，必被 hit 走一遍 toLowerCase
    const symbolNames = Array.from({ length: symbolsPerFile }, (_, j) => `Symbol${i}_${j}_Coupon`);
    const externalNames = Array.from({ length: externalsPerFile }, (_, j) => `@nexus/pkg${i}_${j}`);
    fieldValues.add(path);
    fieldValues.add(pageName);
    for (const n of symbolNames) fieldValues.add(n);
    for (const n of externalNames) fieldValues.add(n);
    return {
      path,
      language: 'tsx',
      origin: { kind: 'page', pageId: `p${i}`, pageName },
      lines: 10,
      chars: 100,
      symbols: symbolNames.map((name) => sym(name)),
      deps: [],
      externals: externalNames,
      unresolvedDeps: [],
      designAnchors: 0,
      syntaxErrors: null,
    };
  });
  const index: CodeIndex = {
    schemaVersion: 1,
    generatedFrom: { documentId: 'd', documentName: '计数夹具', updatedAt: '2026-01-01T00:00:00Z', mode: null },
    files: entries,
    totals: {
      files,
      pageFiles: files,
      nodeRegionFiles: 0,
      symbols: files * symbolsPerFile,
      exportedSymbols: files * symbolsPerFile,
      components: 0,
      functions: files * symbolsPerFile,
      classes: 0,
      interfaces: 0,
      internalDeps: 0,
      externalDeps: 0,
      unresolvedDeps: 0,
      codeChars: files * 100,
      unreadableFiles: 0,
      nodeRegionChars: 0,
    },
    omissions: [],
  };
  return { index, fieldValues, tokens: [...tokens] };
}

/** 从计数结果里精确摘出「字段原文被小写」的总次数。 */
function fieldLowercaseCalls(callsByValue: Map<string, number>, fieldValues: Set<string>): number {
  let sum = 0;
  for (const value of fieldValues) sum += callsByValue.get(value) ?? 0;
  return sum;
}

/** 从计数结果里精确摘出「token 原文被小写」的总次数。 */
function tokenLowercaseCalls(callsByValue: Map<string, number>, tokens: string[]): number {
  return tokens.reduce((sum, token) => sum + (callsByValue.get(token) ?? 0), 0);
}

describe('§PERF-5 rankCodeFiles 去重复 toLowerCase（loop-invariant hoisting）', () => {
  it('零行为门：优化后输出与 oracle 逐字节相等（含 exact/contains/CJK 正向/加权/排序/reasons 去重）', () => {
    const index = oracleFixture();
    for (const input of ORACLE_CASES) {
      expect(JSON.stringify(rankCodeFiles(index, input)), `input=${JSON.stringify(input)}`).toBe(
        JSON.stringify(oracleRank(index, input)),
      );
    }
  });

  it('可达性门：反方向分支当前不可达——含 CJK 的 token 恒 <3 字， oracle 不谎称覆盖它', () => {
    // 反方向触发前提：CJK_CHAR.test(needle) && needle.length >= 3。
    // queryTokens 的 CJK 分支只产单字(1)与二元组(2)，ASCII 分支产的词不含 CJK——
    // 故两者无法同时成立，该分支在当前实现下是防御性死代码。
    const cjkQueries = ['结算页', '把结算页的提交按钮改一改', '优惠券倒计时', '甲乙丙丁戊己', '单', '混排 CouponButton 结算'];
    for (const query of cjkQueries) {
      for (const token of queryTokens(query)) {
        if (CJK_CHAR.test(token)) {
          expect(token.length, `token「${token}」含 CJK 却长度≥3，反方向分支变可达：须补 oracle 用例`).toBeLessThan(3);
        }
      }
    }
    // 正向门：确有一个 CJK 二元组能命中中文页面名（证明 CJK 命中走的是 value.includes(needle) 正向）
    const index = oracleFixture();
    const ranked = rankCodeFiles(index, { query: '结算页' });
    expect(ranked.length, 'CJK 二元组应能正向命中中文页面名').toBeGreaterThan(0);
    expect(ranked.some((m) => m.reasons.some((r) => r.includes('结算页')))).toBe(true);
  });

  it('计数门①：token 的小写次数与文件数无关（O(files×tokens×fields) → O(tokens)）', () => {
    const query = 'coupon submit button nexus react update render';
    const small = makeCountFixture(4, 3, 2);
    const big = makeCountFixture(32, 3, 2);
    const smallTokens = queryTokens(query);
    const bigTokens = queryTokens(query);
    const smallCalls = countLowercases(() => void rankCodeFiles(small.index, { query }));
    const bigCalls = countLowercases(() => void rankCodeFiles(big.index, { query }));

    const smallTokenLowers = tokenLowercaseCalls(smallCalls.callsByValue, smallTokens);
    const bigTokenLowers = tokenLowercaseCalls(bigCalls.callsByValue, bigTokens);
    // 优化后：每个 token 只小写一次（与 files 无关）；调用方的 queryTokens 内部再各小写一次，故上界 2×。
    // 当前：每个 token 被每个 file 的每个字段各小写一次 → 随 files 线性暴涨。
    expect(bigTokenLowers, `文件 4→32 时 token 小写 ${smallTokenLowers}→${bigTokenLowers}，应仍 ≤ ${bigTokens.length * 2}`).toBeLessThanOrEqual(
      bigTokens.length * 2,
    );
    expect(smallTokenLowers).toBeLessThanOrEqual(smallTokens.length * 2);
  });

  it('计数门②：每个 file 的字段只小写一次（O(tokens) → O(1) per file）', () => {
    const files = 8;
    const query = 'coupon submit button nexus react update render';
    const { index, fieldValues } = makeCountFixture(files, 4, 3);
    const tokens = queryTokens(query);
    const calls = countLowercases(() => void rankCodeFiles(index, { query }));

    const fieldLowers = fieldLowercaseCalls(calls.callsByValue, fieldValues);
    // 优化后：每字段原文恰 1 次 → files × (1 path + 1 pageName + 4 symbols + 3 externals)。
    // 注意字段原文含大写/中文，toLowerCase() 仍如实调用一次（spy 记原文 this）。
    const expected = files * (1 + 1 + 4 + 3);
    // 当前：每字段被每个 token 各小写一次 → 远超 expected；优化后恰为 expected。
    expect(fieldLowers, `字段小写 ${fieldLowers} 次，应为 files×每文件字段数 = ${expected}（与 ${tokens.length} 个 token 无关）`).toBe(expected);
  });

  it('计数门③：字段小写次数不随 token 数增长（旧实现 O(tokens) per field）', () => {
    const files = 8;
    const { index, fieldValues } = makeCountFixture(files, 4, 3);
    const few = 'coupon submit';
    const many = 'coupon submit button nexus react update render';
    const fewCalls = countLowercases(() => void rankCodeFiles(index, { query: few }));
    const manyCalls = countLowercases(() => void rankCodeFiles(index, { query: many }));

    const fewFieldLowers = fieldLowercaseCalls(fewCalls.callsByValue, fieldValues);
    const manyFieldLowers = fieldLowercaseCalls(manyCalls.callsByValue, fieldValues);
    // 优化后两次相等（字段只按 file 预小写一次）；当前 many≈few×3.5。
    expect(manyFieldLowers, `token 2→7 时字段小写 ${fewFieldLowers}→${manyFieldLowers}，不该增长`).toBe(fewFieldLowers);
  });

  it('结构门：rankCodeFiles 预小写 needle/字段，hit 热路径不再对入参 toLowerCase（ADR-0154 剥注释）', () => {
    const rankBody = functionBody('rankCodeFiles');
    expect(rankBody, '找不到 rankCodeFiles 函数体').not.toBe('');
    // 必含预计算：token → needle 的一次性小写，且挂在文件字段的预小写上。
    expect(rankBody, '丢了 token→needle 的预小写（应有 needles/map toLowerCase）').toMatch(
      /needles?[\s\S]{0,40}toLowerCase|toLowerCase[\s\S]{0,40}needles?/,
    );
    // hit 热路径：优化后 hit 接受已小写值，不再含 toLowerCase（旧实现每次两点）。
    // 用独立函数体片段锚 hit/hitLower，避免被 rankBody 的预小写喂绿。
    const hitStart = SRC.indexOf('function hit');
    expect(hitStart, '找不到 hit 函数定义').toBeGreaterThanOrEqual(0);
    const hitBody = SRC.slice(hitStart, SRC.indexOf('\nfunction ', hitStart + 1));
    const hitClean = hitBody.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(hitClean, 'hit 热路径仍在对入参做 toLowerCase（重复小写没消除）').not.toContain('toLowerCase');
  });
});
