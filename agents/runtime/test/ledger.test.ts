import { describe, expect, it } from 'vitest';
import { appendLedger, formatLedgerLine, isArcRecord, loadLedger, parseLedgerLine } from '../src/ledger.js';
import type { GitArcLedgerRecord, GitArcOutcome } from '../src/index.js';
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

function arc(status: GitArcOutcome['status'] = 'completed'): GitArcOutcome {
  const walked = status !== 'no-arc';
  return {
    doors: walked ? ['git.staged', 'git.commit'] : [],
    steps: walked
      ? [
          { stepId: 'staged', tool: 'git.staged', args: { stat: false }, rationale: 'r' },
          { stepId: 'commit', tool: 'git.commit', args: { message: 'chore(agent): verified chain c1' }, rationale: 'r' },
        ]
      : [],
    results: walked ? [{ callId: 'c1:release:commit', tool: 'git.commit', ok: true, output: { record: { hash: 'abc123' } } }] : [],
    status,
    notes: [],
    ...(status === 'no-arc' ? { reason: 'no git.commit in this scope — the arc belongs to no role by absence (§24)' } : {}),
  };
}

function arcRecord(runId = 'c1', status?: GitArcOutcome['status']): GitArcLedgerRecord {
  return { kind: 'git-arc', provenance: { mode: 'demo', runtime: 'nexus-agent-runtime', version: '0.1.0' }, runId, goal: 'goal c1', role: 'releaser', arc: arc(status) };
}

describe('ledger (v7 run audit trail)', () => {
  it('parse round-trips a real outcome and rejects junk with reasons', () => {
    const line = formatLedgerLine(outcome('r1'));
    const parsed = parseLedgerLine(line);
    expect(parsed.ok).toBe(true);
    if (parsed.ok && !isArcRecord(parsed.entry)) expect(parsed.entry.task.id).toBe('r1');
    else throw new Error('a RunOutcome line must parse as a run, not an arc');
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
    expect(loadLedger(disk, 'missing.jsonl')).toEqual({ runs: [], arcs: [], malformed: 0 });
    // v49 added a field to the read shape; every pre-v49 ledger must still read the same way.
    expect(all.arcs).toEqual([]);
  });
});

describe('ledger × git-arc records (v49)', () => {
  it('an arc round-trips through one JSON line, walk and all', () => {
    const rec = arcRecord();
    const parsed = parseLedgerLine(formatLedgerLine(rec));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || !isArcRecord(parsed.entry)) throw new Error('the arc line must parse as an arc');
    expect(parsed.entry).toEqual(rec);
    expect(parsed.entry.arc.results[0]!.callId).toBe('c1:release:commit');
    expect((parsed.entry.arc.results[0]!.output as { record: { hash: string } }).record.hash).toBe('abc123');
  });

  it('a line that CLAIMS to be an arc is never re-read as something else', () => {
    const broken = [
      { ...arcRecord(), arc: { ...arc(), status: 'sort-of' } },
      { ...arcRecord(), arc: { ...arc(), results: 'not an array' } },
      { ...arcRecord(), role: undefined },
      { ...arcRecord(), provenance: { mode: 'real', runtime: 'x', version: '1' } },
    ];
    for (const b of broken) {
      const parsed = parseLedgerLine(JSON.stringify(b));
      expect(parsed).toEqual({ ok: false, reason: 'not a complete git-arc record' });
    }
    // A no-arc walk is COMPLETE data about a walk that did not happen — it parses.
    const noArc = parseLedgerLine(formatLedgerLine(arcRecord('c9', 'no-arc')));
    expect(noArc.ok).toBe(true);
    if (noArc.ok && isArcRecord(noArc.entry)) expect(noArc.entry.arc.status).toBe('no-arc');
  });

  it('one stream, two kinds: append order, `last` across kinds, malformed arcs counted', () => {
    const disk = new MemDisk();
    appendLedger(disk, 'l.jsonl', outcome('a'));
    appendLedger(disk, 'l.jsonl', arcRecord('a'));
    disk.writeFileSync('l.jsonl', disk.readFileSync('l.jsonl') + '{"kind":"git-arc","runId":"b"}\n');
    appendLedger(disk, 'l.jsonl', outcome('b'));
    appendLedger(disk, 'l.jsonl', arcRecord('b', 'stopped'));

    const all = loadLedger(disk, 'l.jsonl');
    expect(all.runs.map((r) => r.task.id)).toEqual(['a', 'b']);
    expect(all.arcs.map((a) => `${a.runId}:${a.arc.status}`)).toEqual(['a:completed', 'b:stopped']);
    expect(all.malformed).toBe(1);
    // `last` trims trailing RECORDS, so a cold reader can ask for "the last thing that happened".
    const tail = loadLedger(disk, 'l.jsonl', 2);
    expect(tail.runs.map((r) => r.task.id)).toEqual(['b']);
    expect(tail.arcs.map((a) => a.runId)).toEqual(['b']);
    expect(loadLedger(disk, 'l.jsonl', 1).runs).toEqual([]);
  });

  it('the durable arc is joined to its run line by runId, and says who walked it', () => {
    const disk = new MemDisk();
    const rec = arcRecord('chain-7');
    appendLedger(disk, 'l.jsonl', outcome('chain-7'));
    appendLedger(disk, 'l.jsonl', rec);
    const { runs, arcs } = loadLedger(disk, 'l.jsonl');
    expect(arcs[0]!.role).toBe('releaser');
    expect(arcs[0]!.runId).toBe(runs[0]!.task.id);
    // §60 anti-fold: the arc's git step is NOT smuggled into the editor's own record.
    expect(runs[0]!.plan.steps.map((s) => s.tool)).toEqual(['fs.search']);
    expect(runs[0]!.results.some((r) => r.tool.startsWith('git.'))).toBe(false);
    expect(arcs[0]!.arc.steps.map((s) => s.tool)).toEqual(['git.staged', 'git.commit']);
  });
});

/* ---- v50: the arc's §28 receipts are part of the record, and part of the shape check ---- */

const receipt = (over: Record<string, unknown> = {}) => ({
  call: { callId: 'c1:release:commit', tool: 'git.commit', args: { message: 'chore(agent): verified chain c1' } },
  granted: true,
  matched: 'git.*',
  reason: 'the release window is open today',
  ...over,
});
const arcWith = (decisions: unknown) => JSON.stringify({ ...arcRecord(), arc: { ...arc(), decisions } });

describe('ledger × §28 receipts (v50)', () => {
  it('complete receipts round-trip, and an EMPTY list is data about a walk that gated nothing', () => {
    const granted = [receipt(), receipt({ call: { callId: 'c1:release:staged', tool: 'git.staged', args: {} } })];
    const parsed = parseLedgerLine(arcWith(granted));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || !isArcRecord(parsed.entry)) throw new Error('a complete receipt list must parse');
    expect(parsed.entry.arc.decisions).toEqual(granted);
    expect(parsed.entry.arc.decisions![1]!.call.tool).toBe('git.staged');
    expect(parseLedgerLine(arcWith([])).ok).toBe(true);
    // A pre-v50 line carries no field at all — and still parses, because the field is additive.
    const before = parseLedgerLine(formatLedgerLine(arcRecord()));
    if (!before.ok || !isArcRecord(before.entry)) throw new Error('a pre-v50 arc line must still parse as an arc');
    expect('decisions' in before.entry.arc).toBe(false);
  });

  it('a half-recorded decision makes the whole line malformed: no reason, no verdict, no grant', () => {
    const broken = [
      [receipt({ reason: undefined })],
      [receipt({ granted: 'yes' })],
      [receipt({ matched: undefined })],
      [{ call: { tool: 'git.commit' }, granted: true, matched: 'git.*', reason: 'r' }],
      { not: 'an array' },
    ];
    for (const d of broken) {
      expect(parseLedgerLine(arcWith(d))).toEqual({ ok: false, reason: 'not a complete git-arc record' });
    }
  });

  it('a refused door survives the file: the veto\'s reason is readable by a cold reader', () => {
    const disk = new MemDisk();
    const vetoed = receipt({ call: { callId: 'c1:release:inspect', tool: 'git.show', args: { path: 'docs/a.md' } }, granted: false, matched: 'git.show', reason: 'only the human reads HEAD\'s contents' });
    appendLedger(disk, 'l.jsonl', { ...arcRecord(), arc: { ...arc('stopped'), stoppedAt: 'inspect', decisions: [receipt(), vetoed] } });
    const read = loadLedger(disk, 'l.jsonl');
    expect(read.malformed).toBe(0);
    expect(read.arcs[0]!.arc.stoppedAt).toBe('inspect');
    expect(read.arcs[0]!.arc.decisions!.at(-1)).toMatchObject({ granted: false, matched: 'git.show', reason: 'only the human reads HEAD\'s contents' });
  });
});
