/**
 * Direct coverage for the two durability line-format writers —
 * `formatEvaluationLine` (evaluate.ts) and `formatTestLine` (testRunner.ts).
 *
 * Both are `JSON.stringify` of one record, and both are the single writer behind
 * `appendEvaluation` / `appendTestReport`, whose loaders read the file ONE LINE PER
 * RECORD. The only invariant that actually matters — and that a line-per-record loader
 * silently depends on — is that the emitted string carries NO raw newline (a record whose
 * field held a literal \n is escaped by JSON.stringify, so it can never split into two
 * "malformed" lines). Neither writer was referenced directly before. Per house discipline an
 * untested pure branch *is* the next increment.
 */
import { describe, expect, it } from 'vitest';
import { formatEvaluationLine, loadEvaluations, type RunEvaluation } from '../src/evaluate.js';
import { formatTestLine, loadTestReports, type TestReport } from '../src/testRunner.js';

const ev: RunEvaluation = {
  runId: 'r1',
  provenance: { mode: 'demo', runtime: 'nexus-agent-runtime', version: '0.1.0' },
  score: 0.9,
  marks: [{ name: 'completed', ok: true, detail: 'line\nwith a raw newline inside', weight: 0.4 }],
};

const report: TestReport = { engine: 'test', ok: true, total: 1, passed: 1, failures: [], detail: 'detail\nwith a raw newline' };

const reader = (text: string) => ({ readFileSync: (_p: string, _e: 'utf8') => text });

describe('formatEvaluationLine', () => {
  it('emits exactly one line even when a field contains a raw newline', () => {
    const line = formatEvaluationLine(ev);
    expect(line).not.toContain('\n');
  });

  it('round-trips back to the identical record through loadEvaluations', () => {
    const back = loadEvaluations(reader(formatEvaluationLine(ev) + '\n'), 'state/eval.jsonl');
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.evaluations).toEqual([ev]);
  });
});

describe('formatTestLine', () => {
  it('emits exactly one line even when detail contains a raw newline', () => {
    const line = formatTestLine(report);
    expect(line).not.toContain('\n');
  });

  it('round-trips back to the identical record through loadTestReports', () => {
    const back = loadTestReports(reader(formatTestLine(report) + '\n'), 'state/test.jsonl');
    expect(back.reports).toEqual([report]);
    expect(back.malformed).toBe(0);
  });
});
