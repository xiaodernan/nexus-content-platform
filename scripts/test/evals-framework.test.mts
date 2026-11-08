/**
 * `evals/` 评测框架（§85）的单测。
 *
 * 为什么框架自己也要有门：评测是"防假绿"的工具，假绿一旦出现在框架里，
 * 所有 suite 的绿都跟着失效。这里只钉三件事：recorder 不吞 check、
 * failedChecks 不放过任何一条红、suite 的 run() 在当前代码上确实全绿
 * （code-index 那套是纯内存、无库无网，不进 npm run evals 也能被 npm test 提前看见）。
 */

import { describe, expect, it } from 'vitest';
import { EvalRecorder } from '../../evals/lib/recorder';
import { failedChecks, type EvalSuite, type EvalSuiteResult } from '../../evals/types';
import { codeIndexSuite } from '../../evals/suites/code-index.mts';
import { modelRoundtripSuite } from '../../evals/suites/model-roundtrip.mts';

async function failedNames(suite: EvalSuite): Promise<{ failures: string[]; totalChecks: number }> {
  const started = Date.now();
  const outcome = await suite.run();
  const result: EvalSuiteResult = {
    suite: suite.name,
    dimension: suite.dimension,
    needsDatabase: suite.needsDatabase,
    checks: outcome.checks,
    notMeasured: outcome.notMeasured,
    durationMs: Date.now() - started,
  };
  return {
    failures: failedChecks(result).map((c) => `${c.name} :: ${c.detail}`),
    totalChecks: outcome.checks.length,
  };
}

describe('EvalRecorder：记下了就跑不掉', () => {
  it('check / structural / skip 各记各的账', () => {
    const rec = new EvalRecorder();
    expect(rec.check('a', true, 'd1')).toBe(true);
    expect(rec.check('b', false, 'd2')).toBe(false);
    const one: number = 1;
    expect(rec.structural('c', one === 2, 3)).toBe(false);
    expect(rec.structural('d', one === 1, 2)).toBe(true);
    rec.skip('没测 e');

    expect(rec.checks.map((c) => c.name)).toEqual(['a', 'b', 'c', 'd']);
    expect(rec.notMeasured).toEqual(['没测 e']);
    expect(rec.checks[2]!.detail).toBe('actual=3');
  });
});

describe('failedChecks：红的一个都不许漏', () => {
  it('只留 ok=false 的那些，保持 suite 内顺序', () => {
    const result: EvalSuiteResult = {
      suite: 's',
      dimension: 'd',
      needsDatabase: false,
      checks: [
        { name: 'ok-1', ok: true, detail: '' },
        { name: 'bad-1', ok: false, detail: '' },
        { name: 'ok-2', ok: true, detail: '' },
        { name: 'bad-2', ok: false, detail: '' },
      ],
      notMeasured: [],
      durationMs: 0,
    };
    expect(failedChecks(result).map((c) => c.name)).toEqual(['bad-1', 'bad-2']);
  });
});

describe('code-index suite 在当前代码上全绿', () => {
  it('§69 的结构不变式与决定性检索当前全部 PASS', async () => {
    const { failures, totalChecks } = await failedNames(codeIndexSuite);
    expect(failures, 'Code Index suite 有结构不变式未通过').toEqual([]);
    // 也别空转：suite 声称覆盖了 §69 的哪几格，数目要有下限
    expect(totalChecks).toBeGreaterThanOrEqual(15);
  });
});

describe('model-roundtrip suite 在当前代码上全绿', () => {
  it('§16/§19 投影自洽矩阵（5 格 generate→parse）当前全部 PASS', async () => {
    const { failures, totalChecks } = await failedNames(modelRoundtripSuite);
    expect(failures, '投影自洽矩阵有格对不上——发射器产物读不回来').toEqual([]);
    expect(totalChecks).toBeGreaterThanOrEqual(7);
  });
});
