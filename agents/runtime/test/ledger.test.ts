import { describe, expect, it } from 'vitest';
import { appendLedger, formatLedgerLine, isArcRecord, loadLedger, parseLedgerLine } from '../src/ledger.js';
import type { GitArcLedgerRecord, GitArcOutcome, GitArcTool } from '../src/index.js';
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

/** A run that gated something of its own: `annotate` is a write, so §28 disposed of it, and v54
 *  holds this line answerable for exactly that call — and for no git door (§60 anti-fold). */
function outcome(id: string): RunOutcome {
  return {
    task: { id, goal: `goal ${id}` },
    provenance: { mode: 'demo', runtime: 'nexus-agent-runtime', version: '0.1.0' },
    plan: {
      goal: `goal ${id}`,
      seed: 1,
      steps: [
        { stepId: 'search', tool: 'fs.search', args: { term: id }, rationale: 'r' },
        { stepId: 'annotate', tool: 'fs.append', args: { path: 'docs/a.md' }, rationale: 'r' },
      ],
    },
    results: [
      { callId: `${id}:search`, tool: 'fs.search', ok: true, output: { hits: [] } },
      { callId: `${id}:annotate`, tool: 'fs.append', ok: true, output: { bytesWritten: 3 } },
    ],
    events: [{ at: 0, type: 'plan', plan: { goal: '', seed: 0, steps: [] } }, { at: 1, type: 'done', status: 'completed' }],
    status: 'completed',
  };
}

/** The release arc's four doors, as the releaser scope actually sees them. */
const ARC_DOORS: { stepId: string; tool: GitArcTool; args: Record<string, unknown>; output: unknown }[] = [
  { stepId: 'staged', tool: 'git.staged', args: { stat: false }, output: { addedLines: ['staged line 01'] } },
  { stepId: 'commit', tool: 'git.commit', args: { message: 'chore(agent): verified chain c1' }, output: { record: { hash: 'abc123' } } },
  { stepId: 'confirm', tool: 'git.log', args: { count: 2 }, output: { log: ['abc123 chore(agent): verified chain c1'] } },
  { stepId: 'inspect', tool: 'git.show', args: { path: 'docs/a.md' }, output: { diff: '+NOTE' } },
];

/**
 * `results` is the walk's transcript of calls it MADE — including the one §28 refused, which is
 * exactly why v54 can read it as the list of calls this line may answer for. A stopped walk names
 * the door that refused and carries nothing after it: an unasked door leaves no result.
 */
function arc(status: GitArcOutcome['status'] = 'completed', id = 'c1'): GitArcOutcome {
  if (status === 'no-arc') {
    return { doors: [], steps: [], results: [], status, notes: [], reason: 'no git.commit in this scope — the arc belongs to no role by absence (§24)' };
  }
  const stoppedAt = status === 'stopped' ? 'inspect' : undefined;
  const walked = stoppedAt === undefined ? ARC_DOORS : ARC_DOORS.slice(0, ARC_DOORS.findIndex((d) => d.stepId === stoppedAt) + 1);
  return {
    doors: ARC_DOORS.map((d) => d.tool),
    steps: walked.map((d) => ({ stepId: d.stepId, tool: d.tool, args: d.args, rationale: 'r' })),
    results: walked.map((d, i) => ({
      callId: `${id}:release:${d.stepId}`,
      tool: d.tool,
      ok: i < walked.length - 1 || stoppedAt === undefined,
      output: i < walked.length - 1 || stoppedAt === undefined ? d.output : undefined,
      ...(i === walked.length - 1 && stoppedAt !== undefined ? { error: 'checkpoint denied git.show: only the human reads HEAD\'s contents' } : {}),
    })),
    status,
    notes: [],
    ...(stoppedAt === undefined ? {} : { stoppedAt }),
  };
}

function arcRecord(runId = 'c1', status?: GitArcOutcome['status']): GitArcLedgerRecord {
  return { kind: 'git-arc', provenance: { mode: 'demo', runtime: 'nexus-agent-runtime', version: '0.1.0' }, runId, goal: 'goal c1', role: 'releaser', arc: arc(status, runId) };
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
    // v54: the transcript is the whole walk, in ask order — the same list the receipts are checked against.
    expect(parsed.entry.arc.results.map((r) => r.callId)).toEqual(['c1:release:staged', 'c1:release:commit', 'c1:release:confirm', 'c1:release:inspect']);
    expect((parsed.entry.arc.results[1]!.output as { record: { hash: string } }).record.hash).toBe('abc123');
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
    // §60 anti-fold: the arc's git steps are NOT smuggled into the editor's own record — and the
    // editor's record still names the write ITS plan made, which is what v54 keeps it honest about.
    expect(runs[0]!.plan.steps.map((s) => s.tool)).toEqual(['fs.search', 'fs.append']);
    expect(runs[0]!.results.some((r) => r.tool.startsWith('git.'))).toBe(false);
    expect(arcs[0]!.arc.steps.map((s) => s.tool)).toEqual(['git.staged', 'git.commit', 'git.log', 'git.show']);
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
    appendLedger(disk, 'l.jsonl', { ...arcRecord(), arc: { ...arc('stopped'), decisions: [receipt(), vetoed] } });
    const read = loadLedger(disk, 'l.jsonl');
    expect(read.malformed).toBe(0);
    expect(read.arcs[0]!.arc.stoppedAt).toBe('inspect');
    expect(read.arcs[0]!.arc.decisions!.at(-1)).toMatchObject({ granted: false, matched: 'git.show', reason: 'only the human reads HEAD\'s contents' });
  });
});

/* ---- v54: the run line is held to the SAME receipt standard as the arc line ---- */

const runWith = (extra: Record<string, unknown>) => JSON.stringify({ ...outcome('r1'), ...extra });

/** A receipt for the write THIS run's own transcript contains — the only kind a run line may carry. */
const runReceipt = (id = 'r1', over: Record<string, unknown> = {}) =>
  receipt({ call: { callId: `${id}:annotate`, tool: 'fs.append', args: { path: 'docs/a.md' } }, matched: 'fs.*', reason: 'the workspace is open today', ...over });

/** The same run with §28 refusing its write: the refusal is IN `results`, because that is a transcript of calls MADE. */
function deniedOutcome(id: string): RunOutcome {
  const o = outcome(id);
  return {
    ...o,
    status: 'denied',
    results: o.results.map((r) => (r.tool === 'fs.append' ? { ...r, ok: false, output: undefined, error: 'checkpoint denied fs.append' } : r)),
  };
}

describe('ledger run-line receipts (v54)', () => {
  it('complete receipts round-trip through a run line, grant and refusal alike, and a pre-v54 line still parses', () => {
    const parsed = parseLedgerLine(runWith({ decisions: [runReceipt()] }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('a complete run receipt must parse');
    expect((parsed.entry as RunOutcome).decisions).toEqual([runReceipt()]);

    const vetoedId = 'r1b';
    const vetoed = JSON.stringify({ ...deniedOutcome(vetoedId), decisions: [runReceipt(vetoedId, { granted: false, matched: 'default', reason: 'unlisted tools are refused' })] });
    const readVeto = parseLedgerLine(vetoed);
    expect(readVeto.ok).toBe(true);
    if (!readVeto.ok) throw new Error('a refused write is still a decision this line owns');
    expect((readVeto.entry as RunOutcome).decisions![0]).toMatchObject({ granted: false, matched: 'default', reason: 'unlisted tools are refused' });

    // Absent means "not durable" or "written before v54" — both still readable.
    const before = parseLedgerLine(formatLedgerLine(outcome('r1')));
    if (!before.ok) throw new Error('a pre-v54 run line must still parse');
    expect('decisions' in before.entry).toBe(false);
    expect('decisionsNote' in before.entry).toBe(false);
  });

  it('the arc\'s half-receipt matrix is malformed on a run line too: one rule, two record kinds', () => {
    for (const decisions of [[runReceipt('r1', { reason: undefined })], [runReceipt('r1', { granted: 'yes' })], [{ call: { tool: 'fs.append' }, granted: true, matched: 'fs.*', reason: 'r' }], 'not an array']) {
      expect(parseLedgerLine(runWith({ decisions }))).toEqual({ ok: false, reason: 'not a RunOutcome record' });
    }
  });

  it('a receipt for a call this record never made is a paste, not a thinner receipt — in both directions', () => {
    // The arc's git.commit answer, glued onto a run line that never knocked on a git door: every
    // field is complete, so shape alone would believe it. `results` is what says otherwise.
    expect(parseLedgerLine(runWith({ decisions: [receipt()] }))).toEqual({ ok: false, reason: 'not a RunOutcome record' });
    // and the run's fs.append answer, glued onto the arc line, whose transcript names only git doors.
    expect(parseLedgerLine(arcWith([runReceipt()]))).toEqual({ ok: false, reason: 'not a complete git-arc record' });
    // One genuine receipt plus one borrowed one still condemns the whole line: a cold reader has no
    // way to tell which of the two the file was honest about, and must not be asked to guess.
    expect(parseLedgerLine(runWith({ decisions: [runReceipt(), receipt()] }))).toEqual({ ok: false, reason: 'not a RunOutcome record' });
    // The prefixes differ only by the stage — a paste is a plausible mistake, not an unreachable one.
    expect(outcome('r1').results[1]!.callId).toBe('r1:annotate');
    expect(arc().results[1]!.callId).toBe('c1:release:commit');
  });

  it('an empty list beside a sentence is readable; a note that is not a sentence is not a note', () => {
    const explained = parseLedgerLine(runWith({ decisions: [], decisionsNote: 'the checkpoint keeps no audit list' }));
    expect(explained.ok).toBe(true);
    if (!explained.ok) return;
    expect((explained.entry as RunOutcome).decisions).toEqual([]);
    expect((explained.entry as RunOutcome).decisionsNote).toBe('the checkpoint keeps no audit list');
    expect(parseLedgerLine(runWith({ decisionsNote: 7 }))).toEqual({ ok: false, reason: 'not a RunOutcome record' });
    // An empty list with no sentence still means "gated nothing", and owns nothing to own.
    expect(parseLedgerLine(runWith({ decisions: [] })).ok).toBe(true);
  });

  it('a chain writes a run line and an arc line that each answer for their own calls, read cold', () => {
    const disk = new MemDisk();
    appendLedger(disk, 'l.jsonl', { ...outcome('r9'), decisions: [runReceipt('r9')] });
    appendLedger(disk, 'l.jsonl', { ...arcRecord('r9'), arc: { ...arc('completed', 'r9'), decisions: [receipt({ call: { callId: 'r9:release:commit', tool: 'git.commit', args: { message: 'm' } } })] } });
    const read = loadLedger(disk, 'l.jsonl');
    expect(read.malformed).toBe(0);
    expect(read.runs[0]!.decisions!.map((d) => d.call.callId)).toEqual(['r9:annotate']);
    expect(read.arcs[0]!.arc.decisions!.map((d) => d.call.callId)).toEqual(['r9:release:commit']);
    // ...and the two lists are disjoint: the file records one decision per call, never one per side.
    const both = [...read.runs[0]!.decisions!, ...read.arcs[0]!.arc.decisions!].map((d) => d.call.callId);
    expect(new Set(both).size).toBe(both.length);
  });
});
