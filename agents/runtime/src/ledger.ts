import type { FsWriteLike } from './durability.js';
import type { RunOutcome } from './types.js';

/**
 * M2 v7 run ledger: append-only JSONL of completed runs (§26/§63 audit trail).
 * Line format is a plain RunOutcome JSON — parseable and replayable without code,
 * malformed lines are counted, never silently trusted (§60).
 */
export function formatLedgerLine(out: RunOutcome): string {
  return JSON.stringify(out);
}

export type LedgerLine = { ok: true; outcome: RunOutcome } | { ok: false; reason: string };

export function parseLedgerLine(line: string): LedgerLine {
  if (line.trim() === '') return { ok: false, reason: 'empty line' };
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return { ok: false, reason: 'not valid JSON' };
  }
  const o = raw as Partial<RunOutcome>;
  const bad =
    typeof o.task?.id !== 'string' ||
    typeof o.status !== 'string' ||
    !Array.isArray(o.plan?.steps) ||
    !Array.isArray(o.results) ||
    !Array.isArray(o.events) ||
    o.provenance?.mode !== 'demo';
  return bad ? { ok: false, reason: 'not a RunOutcome record' } : { ok: true, outcome: o as RunOutcome };
}

/** Append one run; returns the resulting file content (the seam has no native append). */
export function appendLedger(fsLike: FsWriteLike, file: string, out: RunOutcome): string {
  let existing = '';
  try {
    existing = fsLike.readFileSync(file, 'utf8');
  } catch {
    existing = '';
  }
  const dir = file.slice(0, file.lastIndexOf('/'));
  if (dir && dir !== file) fsLike.mkdirSync(dir, { recursive: true });
  const content = (existing === '' || existing.endsWith('\n') ? existing : `${existing}\n`) + formatLedgerLine(out) + '\n';
  fsLike.writeFileSync(file, content, 'utf8');
  return content;
}

export interface LedgerRead {
  runs: RunOutcome[];
  malformed: number;
}

/** Read the ledger; `last` keeps only the trailing N well-formed records. */
export function loadLedger(fsLike: { readFileSync(p: string, e: 'utf8'): string }, file: string, last?: number): LedgerRead {
  let text: string;
  try {
    text = fsLike.readFileSync(file, 'utf8');
  } catch {
    return { runs: [], malformed: 0 };
  }
  const runs: RunOutcome[] = [];
  let malformed = 0;
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    const parsed = parseLedgerLine(line);
    if (parsed.ok) runs.push(parsed.outcome);
    else malformed++;
  }
  return { runs: last === undefined ? runs : runs.slice(-last), malformed };
}
