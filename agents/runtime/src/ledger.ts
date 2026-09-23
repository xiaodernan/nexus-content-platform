import type { FsWriteLike } from './durability.js';
import type { GitArcOutcome } from './gitArc.js';
import type { CheckpointDecision } from './checkpointPolicy.js';
import type { Provenance, RunOutcome } from './types.js';

/**
 * M2 v7 run ledger: append-only JSONL of completed runs (§26/§63 audit trail).
 * M2 v49 adds a SECOND record kind to the same stream. One audit trail, two shapes:
 * - a `RunOutcome` JSON line, exactly as v7 wrote it (no `kind` field — pre-v49 files still parse);
 * - a `GitArcLedgerRecord` line, the role-chain's git walk (v47), which no `RunOutcome` can carry:
 *   the editor stage's plan never contained a git step, and folding the arc into it would be a
 *   lie about what that stage planned (§60). So the arc gets its own line, right after the run
 *   line it followed, joined to it by `runId`.
 * Malformed lines are counted, never silently trusted (§60) — including a line that CLAIMS to be
 * an arc and is not complete enough to be one.
 */
export interface GitArcLedgerRecord {
  kind: 'git-arc';
  provenance: Provenance;
  /** The chain task this arc belongs to — the join key to the `RunOutcome` line above it. */
  runId: string;
  goal: string;
  /** Which named role walked it, so a cold reader knows this was a scoped stage, not the host's own plan. */
  role: string;
  /** The walk verbatim: doors, steps, git's own answers, where it stopped, what it declined to do —
   *  and since v50, the §28 receipts that disposed of its doors when the face kept them. */
  arc: GitArcOutcome;
}

export type LedgerEntry = RunOutcome | GitArcLedgerRecord;

export function isArcRecord(entry: LedgerEntry): entry is GitArcLedgerRecord {
  return (entry as GitArcLedgerRecord).kind === 'git-arc';
}

export function formatLedgerLine(entry: LedgerEntry): string {
  return JSON.stringify(entry);
}

export type LedgerLine =
  | { ok: true; entry: LedgerEntry }
  | { ok: false; reason: string };

/** Shape checks, not trust: a record is only kept if a cold reader could act on every field it claims. */
function isRunOutcome(o: Partial<RunOutcome>): o is RunOutcome {
  return (
    typeof o.task?.id === 'string' &&
    typeof o.status === 'string' &&
    Array.isArray(o.plan?.steps) &&
    Array.isArray(o.results) &&
    Array.isArray(o.events) &&
    o.provenance?.mode === 'demo' &&
    // v54: the run line is held to the SAME standard as the arc line — a half-recorded decision
    // ("granted", no reason) is malformed, not merely thin, a note that is not a sentence is not a
    // note, and a receipt for a call this record never made is not a receipt but a paste. Absent
    // means pre-v54 (or non-durable), which still parses.
    (o.decisions === undefined || (Array.isArray(o.decisions) && o.decisions.every(isReceipt))) &&
    receiptsOwned(o.results, o.decisions) &&
    (o.decisionsNote === undefined || typeof o.decisionsNote === 'string')
  );
}

function isReceipt(d: Partial<CheckpointDecision> | undefined): d is CheckpointDecision {
  return (
    !!d &&
    typeof d.call?.callId === 'string' &&
    typeof d.call?.tool === 'string' &&
    typeof d.granted === 'boolean' &&
    typeof d.matched === 'string' &&
    typeof d.reason === 'string'
  );
}

/**
 * A record may only answer for the calls IT made (M2 v54). `results` is each record's own transcript
 * of what it invoked, so a receipt whose call id is not in that transcript is the line claiming
 * authority over a call it never issued — the paste a reader cannot see from the outside. The runtime
 * already derives receipts this way; checking it here means a cold reader no longer has to trust that.
 */
function receiptsOwned(results: readonly { callId: string }[] | undefined, decisions: readonly CheckpointDecision[] | undefined): boolean {
  if (decisions === undefined) return true;
  const made = new Set((results ?? []).map((r) => r.callId));
  return decisions.every((d) => made.has(d.call?.callId));
}

function isArcShape(a: Partial<GitArcOutcome> | undefined): a is GitArcOutcome {
  return (
    !!a &&
    Array.isArray(a.doors) &&
    Array.isArray(a.steps) &&
    Array.isArray(a.results) &&
    Array.isArray(a.notes) &&
    // v50: a walk that CLAIMS its §28 receipts must claim COMPLETE ones. A half-recorded decision
    // ("granted", no reason) is exactly the document an auditor is later told to trust, so it is
    // malformed rather than trusted — same rule as the arc around it. v54 adds the ownership half of
    // that rule: the receipts must name doors this arc's own transcript shows it knocked on.
    (a.decisions === undefined || (Array.isArray(a.decisions) && a.decisions.every(isReceipt))) &&
    receiptsOwned(a.results, a.decisions) &&
    (a.status === 'completed' || a.status === 'stopped' || a.status === 'no-arc')
  );
}

export function parseLedgerLine(line: string): LedgerLine {
  if (line.trim() === '') return { ok: false, reason: 'empty line' };
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return { ok: false, reason: 'not valid JSON' };
  }
  const o = raw as Partial<LedgerEntry> & { kind?: unknown };
  // A line that names itself an arc is NEVER re-read as a run: the writer's own label is the
  // contract, and quietly downgrading a broken arc into "some other record" would hide it.
  if (o.kind === 'git-arc') {
    const r = raw as Partial<GitArcLedgerRecord>;
    const ok =
      typeof r.runId === 'string' &&
      typeof r.goal === 'string' &&
      typeof r.role === 'string' &&
      r.provenance?.mode === 'demo' &&
      isArcShape(r.arc);
    return ok ? { ok: true, entry: raw as GitArcLedgerRecord } : { ok: false, reason: 'not a complete git-arc record' };
  }
  return isRunOutcome(o as Partial<RunOutcome>) ? { ok: true, entry: raw as RunOutcome } : { ok: false, reason: 'not a RunOutcome record' };
}

/** Append one record; returns the resulting file content (the seam has no native append). */
export function appendLedger(fsLike: FsWriteLike, file: string, entry: LedgerEntry): string {
  let existing = '';
  try {
    existing = fsLike.readFileSync(file, 'utf8');
  } catch {
    existing = '';
  }
  const dir = file.slice(0, file.lastIndexOf('/'));
  if (dir && dir !== file) fsLike.mkdirSync(dir, { recursive: true });
  const content = (existing === '' || existing.endsWith('\n') ? existing : `${existing}\n`) + formatLedgerLine(entry) + '\n';
  fsLike.writeFileSync(file, content, 'utf8');
  return content;
}

export interface LedgerRead {
  /** Well-formed `RunOutcome` lines, in file order (v7 semantics, unchanged). */
  runs: RunOutcome[];
  /** v49: well-formed git-arc lines, in file order — empty for every pre-v49 ledger. */
  arcs: GitArcLedgerRecord[];
  malformed: number;
}

/**
 * Read the ledger; `last` keeps only the trailing N well-formed RECORDS — across both kinds, so
 * "the last line" means the last thing the process wrote, not the last thing of one shape.
 */
export function loadLedger(fsLike: { readFileSync(p: string, e: 'utf8'): string }, file: string, last?: number): LedgerRead {
  let text: string;
  try {
    text = fsLike.readFileSync(file, 'utf8');
  } catch {
    return { runs: [], arcs: [], malformed: 0 };
  }
  const records: LedgerEntry[] = [];
  let malformed = 0;
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    const parsed = parseLedgerLine(line);
    if (parsed.ok) records.push(parsed.entry);
    else malformed++;
  }
  const kept = last === undefined ? records : records.slice(-last);
  return {
    runs: kept.filter((r): r is RunOutcome => !isArcRecord(r)),
    arcs: kept.filter(isArcRecord),
    malformed,
  };
}

