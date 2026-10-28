/**
 * M8 — the CREDITS ledger's WIRE FORMAT: a versioned envelope and a validator-backed loader, as a PURE
 * model.
 *
 * <p>The ledger (`credits.ts`) lives in memory. The moment anything wants to KEEP it — a local-first
 * snapshot (ADR 0014) or a service row (ADR 0012) — it needs a stable format and a loader that refuses
 * a bad record instead of trusting it. This module is that seam, and it is deliberately small: it adds
 * no state and no policy, only a version and a check.
 *
 * <p>Three rules keep it honest (§60):
 * <ul>
 *   <li><b>The format is VERSIONED.</b> The envelope carries `version`, and a loader that meets a
 *       version it does not know REFUSES the record by name rather than guessing. A format that
 *       silently accepted a future shape would be the bug a migration is supposed to prevent.</li>
 *   <li><b>The loader VALIDATES, it does not merely parse.</b> After the structural checks it replays
 *       the ledger through `validateCreditLedger`, so a record whose entries are individually
 *       well-shaped but whose history dips negative is refused — the same verdict the rest of the
 *       model trusts.</li>
 *   <li><b>It is DETERMINISTIC.</b> `serializeLedger` is a pure function of the entries: the same
 *       ledger serializes to the same bytes, so a snapshot can be compared and a proof can pin it.</li>
 * </ul>
 *
 * <p>What this module is NOT: it is not a store. It does not read or write a file, a database or a
 * cookie, and it holds no session. It turns a ledger into text and text back into a ledger, or says
 * why it will not.
 */

import { validateCreditLedger, type CreditEntry, type CreditLedger } from './credits';

/** The only format this build reads or writes. A bump is a new ADR-worthy decision, not a silent change. */
export const LEDGER_FORMAT_VERSION = 1;

/** The shape written to the wire. `entries` is the ledger's only state. */
export interface LedgerEnvelope {
  version: number;
  entries: CreditEntry[];
}

/**
 * Serialize a ledger to its wire text. Deterministic: entries keep their order and their field order,
 * so the same ledger always produces the same bytes.
 */
export function serializeLedger(ledger: CreditLedger): string {
  const envelope: LedgerEnvelope = {
    version: LEDGER_FORMAT_VERSION,
    entries: ledger.entries.map((e) => ({ ...e })),
  };
  return JSON.stringify(envelope);
}

export type LedgerLoad = { ok: true; ledger: CreditLedger } | { ok: false; reason: string };

// The kind vocabulary is part of the format. `clawback` (ADR 0020, Amendment 4) joins it without a
// version bump: the ENVELOPE did not change, and a reader that predates the kind refuses the record
// by name (the check below) instead of mis-reading it — the safe failure this loader promises.
const KINDS = new Set<CreditEntry['kind']>(['grant', 'spend', 'refund', 'adjust', 'clawback']);

/**
 * Parse and validate wire text into a ledger, or refuse it BY NAME. A parse error, a version this
 * build does not know, a malformed entry, and a history that fails the ledger validator are four
 * DIFFERENT refusals, and each says which one it is.
 */
export function deserializeLedger(text: string): LedgerLoad {
  if (typeof text !== 'string' || text.trim() === '') return { ok: false, reason: 'the ledger text is empty' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { ok: false, reason: `the ledger text is not JSON: ${(err as Error).message}` };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'the ledger envelope is not an object' };
  }

  const envelope = parsed as { version?: unknown; entries?: unknown };
  if (envelope.version !== LEDGER_FORMAT_VERSION) {
    return { ok: false, reason: `unsupported ledger format version ${String(envelope.version)} — this build reads ${LEDGER_FORMAT_VERSION}` };
  }
  if (!Array.isArray(envelope.entries)) {
    return { ok: false, reason: 'the ledger envelope carries no entries array' };
  }

  const entries: CreditEntry[] = [];
  for (const raw of envelope.entries) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'an entry is not an object' };
    const e = raw as Partial<CreditEntry>;
    if (typeof e.id !== 'string' || e.id === '') return { ok: false, reason: 'an entry has no non-empty string id' };
    if (typeof e.accountId !== 'string' || e.accountId === '') return { ok: false, reason: `entry "${e.id}" has no non-empty string accountId` };
    if (typeof e.delta !== 'number' || !Number.isInteger(e.delta)) return { ok: false, reason: `entry "${e.id}" has no integer delta` };
    if (typeof e.reason !== 'string' || e.reason === '') return { ok: false, reason: `entry "${e.id}" has no non-empty reason` };
    if (typeof e.at !== 'number' || !Number.isFinite(e.at)) return { ok: false, reason: `entry "${e.id}" has no finite at` };
    if (typeof e.kind !== 'string' || !KINDS.has(e.kind as CreditEntry['kind'])) return { ok: false, reason: `entry "${e.id}" has an unknown kind "${String(e.kind)}"` };
    if (e.ref !== undefined && typeof e.ref !== 'string') return { ok: false, reason: `entry "${e.id}" has a non-string ref` };
    entries.push({
      id: e.id,
      accountId: e.accountId,
      delta: e.delta,
      reason: e.reason,
      at: e.at,
      kind: e.kind as CreditEntry['kind'],
      ...(e.ref !== undefined ? { ref: e.ref } : {}),
    });
  }

  const ledger: CreditLedger = { entries };
  const verdict = validateCreditLedger(ledger);
  if (!verdict.ok) {
    const [first, ...rest] = verdict.problems;
    return { ok: false, reason: `the ledger is not consistent: ${first!.detail}${rest.length ? ` (+${rest.length} more)` : ''}` };
  }
  return { ok: true, ledger };
}
