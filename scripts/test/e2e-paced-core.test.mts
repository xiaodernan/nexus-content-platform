/**
 * `scripts/lib/e2e-paced-core.mts` 的单测（§SEC 第四十片补记）。
 *
 * 为什么要给一个跑法脚本写单测：这个脚本要防的那类错不是"用例红了"，是**"看着全绿其实没跑"**——
 * 那种错在跑的时候看不出来，要等一整晚的窗口过去才发现有一片是空的。
 * 而它自己那条 `--plan` 只能证明"这一次切得对"，证明不了"Playwright 换个措辞以后还认得出来"。
 * 这里用真 `--list` 的输出（`fixtures/studio-list.sample.txt`，2026-11-06 在本机原样落盘）喂它，
 * 措辞一漂移，第一条就叫，而不是等到第二天早上。
 */

import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  claimedTally,
  counts,
  duplicateLines,
  parseList,
  partition,
  refusedByGate,
  sleepMinutes,
  summaryLine,
  tallyMismatch,
  type TestCase,
  waitMinutesFromServer,
} from '../lib/e2e-paced-core.mts';

const sample = readFileSync(fileURLToPath(new URL('fixtures/studio-list.sample.txt', import.meta.url)), 'utf8');
const cases = parseList(sample, 'e2e/studio.spec.ts');

describe('parseList：认的是 Playwright 真输出的形状', () => {
  it('从原样落盘的那份 --list 里数出 57 条，行号与标题都对', () => {
    expect(cases).toHaveLength(57);
    expect(cases[0]!.line).toBe(85);
    expect(cases[0]!.title).toContain('DEMO MODE visible');
    expect(cases[cases.length - 1]!.line).toBe(4759);
    // 那句 "Total: 57 tests in 1 file" 不是用例：把它当成一条，分片器就会多发一次空跑
    expect(cases.some((c) => c.title.includes('Total:'))).toBe(false);
    expect(cases.every((c) => c.title.trim().length > 0)).toBe(true);
    expect(cases.every((c) => Number.isInteger(c.line) && c.line > 0)).toBe(true);
  });

  it('一条都没列出来就抛——不许静默变成"N 片全绿"', () => {
    expect(() => parseList('Listing tests:\nTotal: 0 tests in 0 files\n', 'e2e/没有这一份.spec.ts')).toThrow(
      /宁可不跑/,
    );
  });

  it('抛出去的那句话带上调用方补的实况（exit 码）', () => {
    expect(() => parseList('(empty)\n', 'e2e/x.spec.ts', 'exit=1')).toThrow(/exit=1/);
  });
});

describe('partition：切法本身要能被单独验一次', () => {
  it('57 条切 5 片 = 12/12/12/12/9，与 --plan 当年报的那个数一致', () => {
    expect(partition(cases, 5).map((g) => g.length)).toEqual([12, 12, 12, 12, 9]);
  });

  it('一条一片时就是 57 片各 1 条', () => {
    const groups = partition(cases, 57);
    expect(groups).toHaveLength(57);
    expect(groups.every((g) => g.length === 1)).toBe(true);
  });

  it('片数切得比用例数还多时，段数收在用例数上——没有空的那几片', () => {
    const groups = partition(cases, 60);
    expect(groups).toHaveLength(57);
    expect(groups.some((g) => g.length === 0)).toBe(false);
  });

  it('分段不漏不重：摊平之后与原列表逐条同序', () => {
    const groups = partition(cases, 5);
    expect(groups.flat()).toEqual(cases);
    expect(duplicateLines(groups.flat())).toEqual([]);
    // 连续分段：第 k 片的第一条必须紧跟第 k−1 片的最后一条
    for (let i = 1; i < groups.length; i += 1) {
      const prev = groups[i - 1]!;
      const cur = groups[i]!;
      expect(cases.indexOf(cur[0]!)).toBe(cases.indexOf(prev[prev.length - 1]!) + 1);
    }
  });

  it('同一个行号上声明了两条用例时能查出来（行号 filter 分不开它们）', () => {
    const twin: TestCase[] = [
      { line: 10, title: '循环里生成的第一条' },
      { line: 10, title: '循环里生成的第二条' },
    ];
    expect(duplicateLines(twin)).toEqual([10]);
  });
});

describe('两本账同口供：脚本发起的数 vs Playwright 自己报的数', () => {
  it('从 list reporter 的原句里读出 N', () => {
    expect(claimedTally('Running 1 test using 1 worker\n')).toBe(1);
    expect(claimedTally('Running 12 tests using 1 worker\n')).toBe(12);
  });

  it('多 project 各报一行时取最后一行（这一片真正凑齐的那个数）', () => {
    expect(claimedTally('Running 4 tests using 1 worker\nRunning 8 tests using 1 worker\n')).toBe(8);
  });

  it('读不到那句就是"对不上"，不是"对得上"', () => {
    // 这一格原来写着 `claimed !== null && …`：换掉 reporter 或输出被截断时静默失明，
    // 而它要拦的恰好是"看着全绿其实没跑"
    expect(claimedTally('没有那句\n')).toBeNull();
    expect(tallyMismatch(null, 1)).toBe(true);
    expect(tallyMismatch(1, 1)).toBe(false);
    expect(tallyMismatch(2, 1)).toBe(true);
  });
});

describe('汇总行与计数：只认 Playwright 自己那句话', () => {
  it('取最后一条带数字的汇总行', () => {
    expect(summaryLine('✓ a\n1 passed (6.2s)\n', 0)).toBe('1 passed (6.2s)');
    expect(summaryLine('2 failed\n1 skipped\n', 1)).toBe('1 skipped');
    const c = counts('===== 12 failed\n2 skipped\n');
    expect(c).toEqual({ passed: 0, failed: 12, skipped: 2 });
  });

  it('exit=0 而没有汇总行 ≠ 仪器坏了；非 0 而没有汇总行才是', () => {
    expect(summaryLine('', 0)).toContain('这一片没分到用例');
    expect(summaryLine('', 1)).toContain('没读到汇总行');
  });
});

describe('等多久由服务端那句决定', () => {
  // 这句是 `e2e/support/auth-session.ts` 里 429 那条报错的原样形状（界面上那句话不关心，只关心分钟数）
  const refusal =
    'Error: 建项目被服务端拒了（HTTP 429 · 界面上写：每小时只能建 20 个）' +
    '——这是建项目限流：等窗口腾出名额再跑（还要等 23 分钟），别放宽产品里那道闸。';

  it('认得出这是撞闸，并读出服务端自己算的分钟数', () => {
    expect(refusedByGate(refusal)).toBe(true);
    expect(waitMinutesFromServer(refusal)).toBe(23);
  });

  it('睡的是服务端那个数 +1，且 --cooldown-min 只是下界', () => {
    expect(sleepMinutes(refusal, 3)).toBe(24);
    expect(sleepMinutes(refusal, 61)).toBe(61); // 已经打算睡满一个窗口，服务端那句更短就不加戏
  });

  it('没撞闸就照 --cooldown-min；撞闸但没带分钟数也照 --cooldown-min（不许睡出 1 分钟这种数）', () => {
    expect(sleepMinutes('1 passed (6.2s)\n', 3)).toBe(3);
    expect(sleepMinutes('建项目被服务端拒了（HTTP 429）', 3)).toBe(3);
  });
});
