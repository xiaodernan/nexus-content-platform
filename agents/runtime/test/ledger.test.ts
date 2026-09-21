import { describe, expect, it } from 'vitest';
import { appendLedger, formatLedgerLine, loadLedger, parseLedgerLine } from '../src/ledger.js';
import type { RunOutcome } from '../src/types.js';

class MemDisk {
  files = new Map<string, string>();
  readFileSync(p: string): string {
    const c = this.files.get(p);
    if (c === undefined) throw new Error(`no such file: ${p}`);
    return c;
  }
  mkdirSync(): void {}
  writeFileSync(p: string, data: string): void {
    this.files.set(p, data);
  }
}

function outcome(id: string): RunOutcome {
  return {
    task: { id, goal: `goal ${id}` },
    provenance: { mode: 'demo', runtime: 'nexus-agent-runtime', version: '0.1.0' },
    plan: { goal: `goal ${id}`, seed: 1, steps: [{ stepId: 'search', tool: 'fs.search', args: { term: id }, rationale: 'r' }] },
    results: [{ callId: `${id}:search`, tool: 'fs.search', ok: true, output: { hits: [] } }],
    events: [{ at: 0, type: 'plan', plan: { goal: '', seed: 0, steps: [] } }, { at: 1, type: 'done', status: 'completed' }],
    status: 'completed',
  };
}

describe('ledger (v7 run audit trail)', () => {
  it('parse round-trips a real outcome and rejects junk with reasons', () => {
    const line = formatLedgerLine(outcome('r1'));
    const parsed = parseLedgerLine(line);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.outcome.task.id).toBe('r1');
    expect(parseLedgerLine('not json')).toEqual({ ok: false, reason: 'not valid JSON' });
    expect(parseLedgerLine('{"task":{"id":"x"}}')).toEqual({ ok: false, reason: 'not a RunOutcome record' });
    expect(parseLedgerLine('')).toEqual({ ok: false, reason: 'empty line' });
  });

  it('append is additive, newline-safe and creates parents', () => {
    const disk = new MemDisk();
    appendLedger(disk, 'state/ledger.jsonl', outcome('a'));
    appendLedger(disk, 'state/ledger.jsonl', outcome('b'));
    const read = loadLedger(disk, 'state/ledger.jsonl');
    expect(read.runs.map((r) => r.task.id)).toEqual(['a', 'b']);
    expect(read.malformed).toBe(0);
  });

  it('loadLedger keeps order, counts malformed lines, and `last` trims from the tail', () => {
    const disk = new MemDisk();
    disk.writeFileSync(
      'l.jsonl',
      [formatLedgerLine(outcome('a')), 'garbage', formatLedgerLine(outcome('b')), formatLedgerLine(outcome('c')), ''].join('\n'),
    );
    const all = loadLedger(disk, 'l.jsonl');
    expect(all.runs.map((r) => r.task.id)).toEqual(['a', 'b', 'c']);
    expect(all.malformed).toBe(1);
    expect(loadLedger(disk, 'l.jsonl', 2).runs.map((r) => r.task.id)).toEqual(['b', 'c']);
    expect(loadLedger(disk, 'missing.jsonl')).toEqual({ runs: [], malformed: 0 });
  });
});
