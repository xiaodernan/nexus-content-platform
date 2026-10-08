import { describe, expect, it } from 'vitest';
import { appendEvaluation, loadEvaluations, scoreRun } from '../src/evaluate.js';
import type { RunOutcome } from '../src/types.js';

class MemDisk {
  files = new Map<string, string>();
  readFileSync(p: string): string {
    const c = this.files.get(p);
    if (c === undefined) throw new Error(`no such file: ${p}`);
    return c;
  }
  /**
   * v206: `FsWriteLike` extends `FsLike`, which requires these two — and this mock had NEITHER, in six of
   * the eight suites that define one, until the type gate learned to read `test/`. Nothing on these paths
   * reads a directory or stats a file, so every suite stayed green while the mock was incomplete against its
   * own interface. They THROW rather than answering an empty listing: a mock that reports "no entries" for a
   * disk that HAS entries is the kind of lie a future test would pass against.
   */
  readdirSync(): never {
    throw new Error('MemDisk.readdirSync is not implemented for this suite — nothing here needs it');
  }
  statSync(): never {
    throw new Error('MemDisk.statSync is not implemented for this suite — nothing here needs it');
  }
  mkdirSync(): void {}
  writeFileSync(p: string, data: string): void {
    this.files.set(p, data);
  }
}

function outcome(over: Partial<RunOutcome> = {}): RunOutcome {
  const base: RunOutcome = {
    task: { id: 'e1', goal: 'g' },
    provenance: { mode: 'demo', runtime: 'nexus-agent-runtime', version: '0.1.0' },
    plan: { goal: 'g', seed: 1, steps: [] },
    results: [
      { callId: 'a', tool: 'fs.search', ok: true },
      { callId: 'b', tool: 'test.run', ok: true },
    ],
    events: [
      { at: 0, type: 'plan', plan: { goal: 'g', seed: 1, steps: [] } },
      { at: 1, type: 'verify', ok: true, detail: 'd' },
      { at: 2, type: 'done', status: 'completed' },
    ],
    status: 'completed',
    changeSet: { runId: 'e1', files: [{ path: 'x.md', ops: [], added: 3, removed: 0 }] },
  };
  return { ...base, ...over };
}

describe('scoreRun (v8 deterministic rubric)', () => {
  it('a clean completed run scores 1.0 with named marks', () => {
    const ev = scoreRun(outcome());
    expect(ev.score).toBe(1);
    expect(ev.marks.map((m) => m.name)).toEqual(['completed', 'all-steps-ok', 'verified', 'needed-no-rework', 'change-economy']);
    expect(ev.provenance.mode).toBe('demo');
    expect(ev.runId).toBe('e1');
  });

  it('failures degrade the score by their weights, deterministically', () => {
    const denied = scoreRun(
      outcome({
        status: 'denied',
        results: [{ callId: 'a', tool: 'fs.append', ok: false, error: 'checkpoint required' }],
        events: [{ at: 0, type: 'done', status: 'denied' }],
      }),
    );
    expect(denied.score).toBeCloseTo(0.1 + 0.1, 10);
    expect(denied.marks.find((m) => m.name === 'completed')!.ok).toBe(false);
    expect(denied.marks.find((m) => m.name === 'verified')!.ok).toBe(false);
    expect(scoreRun(outcome({ status: 'denied', results: [{ callId: 'a', tool: 'x', ok: false }], events: [] }))).toEqual(denied);
  });

  it('final verify decides: an early pass then later failure does not count', () => {
    const ev = scoreRun(
      outcome({
        events: [
          { at: 0, type: 'verify', ok: true, detail: '' },
          { at: 1, type: 'verify', ok: false, detail: 'regressed' },
        ],
      }),
    );
    expect(ev.marks.find((m) => m.name === 'verified')!.ok).toBe(false);
  });

  it('change-economy budget is configurable', () => {
    const big = outcome({ changeSet: { runId: 'e1', files: [{ path: 'x', ops: [], added: 100, removed: 0 }] } });
    expect(scoreRun(big).marks.find((m) => m.name === 'change-economy')!.ok).toBe(false);
    expect(scoreRun(big, { maxAddedLines: 200 }).marks.find((m) => m.name === 'change-economy')!.ok).toBe(true);
  });
});

describe('evaluation persistence', () => {
  it('append + reload keeps order and rejects corrupt files with reasons', () => {
    const disk = new MemDisk();
    appendEvaluation(disk, 'state/eval.jsonl', scoreRun(outcome()));
    appendEvaluation(disk, 'state/eval.jsonl', scoreRun(outcome({ task: { id: 'e2', goal: 'g' } })));
    const loaded = loadEvaluations(disk, 'state/eval.jsonl');
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.evaluations.map((e) => e.runId)).toEqual(['e1', 'e2']);
    disk.writeFileSync('state/eval.jsonl', 'junk\n');
    expect(loadEvaluations(disk, 'state/eval.jsonl')).toEqual({ ok: false, reason: 'not valid JSON' });
    expect(loadEvaluations(disk, 'none.jsonl')).toEqual({ ok: false, reason: 'no such file: none.jsonl' });
  });
});
