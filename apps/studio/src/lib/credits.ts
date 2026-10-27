/**
 * M8 — the CREDITS ledger: the creator economy's unit of account, as a PURE model.
 *
 * <p>The creator economy needs one number every other verb can be priced against — a subscription
 * costs credits, a tip moves them, a marketplace listing is paid for with them. Before this module
 * that number did not exist anywhere in the tree (measured 2026-10-25: zero occurrences of
 * "credit" under apps/studio, services/nexus-api, packages and agents). This is the model half:
 * an append-only ledger whose balance is DERIVED from its entries, never stored beside them.
 *
 * <p>Why derived rather than stored (§60): a stored balance is a second spelling of one fact, and
 * two spellings drift. A ledger that sums its entries cannot disagree with its own history, and a
 * caller that reads `balanceOf` reads what the entries SAY, not what some earlier write claimed.
 *
 * <p>The rules are deliberately small and legible:
 * <ul>
 *   <li>an entry carries a SIGNED delta (a spend is negative) and a host-supplied `at` — the
 *       ledger never reads a clock, so a replay is deterministic (ADR 0010);</li>
 *   <li>a delta must be a non-zero INTEGER — a fractional credit is the same class of bug as a
 *       fractional cent, and an entry that moves nothing is noise, not a record;</li>
 *   <li>an entry id is an IDEMPOTENCY key: a retry that reuses an id is refused, never applied
 *       twice, so a caller that retries a failed write cannot double-spend;</li>
 *   <li>a spend may not drive an account's balance below zero — it is refused BY NAME with the
 *       balance that was actually there;</li>
 *   <li>the ledger is append-only: there is no edit and no delete, only a compensating entry.</li>
 * </ul>
 *
 * <p>What this module is NOT: it holds no persistence, no account model and no service call. It is
 * the arithmetic a service, a panel or a proof can all run over the same bytes. An account's
 * identity is `accounts.ts`'s subject; this module only ever sees an opaque id string.
 */

/** One append-only movement on one account's balance. */
export interface CreditEntry {
  /** Idempotency key. Reusing an id on the same ledger is refused, never double-applied. */
  id: string;
  /** Opaque account id (the shape `accounts.ts` mints). */
  accountId: string;
  /** Signed whole units. A grant/adjustment is positive, a spend negative. */
  delta: number;
  /** Human-readable purpose, carried verbatim for a panel or a receipt. */
  reason: string;
  /** Epoch milliseconds, supplied by the host — the ledger never reads a clock. */
  at: number;
  kind: 'grant' | 'spend' | 'refund' | 'adjust';
  /**
   * Optional opaque reference to WHAT this movement was for — the id of the thing bought, sold or
   * paid for. Carried verbatim and never interpreted by the ledger, so a consumer can derive its
   * own history (the marketplace reads it back as the template a purchase was for) without the
   * ledger holding a second, purpose-specific list.
   */
  ref?: string;
}

/** An append-only ledger. `entries` is the ONLY state; every balance is derived from it. */
export interface CreditLedger {
  readonly entries: readonly CreditEntry[];
}

export type CreditAppendDecision = { ok: true; ledger: CreditLedger; entry: CreditEntry } | { ok: false; reason: string };

export interface CreditLedgerProblem {
  code: string;
  detail: string;
}
export type CreditLedgerVerdict = { ok: true; problems: [] } | { ok: false; problems: CreditLedgerProblem[] };

/** The empty ledger. Balances are zero until an entry says otherwise. */
export function emptyCreditLedger(): CreditLedger {
  return { entries: [] };
}

/** Sum of every delta for one account — derived, so it cannot drift from the history. */
export function balanceOf(ledger: CreditLedger, accountId: string): number {
  let sum = 0;
  for (const e of ledger.entries) if (e.accountId === accountId) sum += e.delta;
  return sum;
}

/** One account's entries, in append order — the receipt a panel renders. */
export function historyOf(ledger: CreditLedger, accountId: string): CreditEntry[] {
  return ledger.entries.filter((e) => e.accountId === accountId);
}

/** Every account the ledger has ever moved, in first-touch order. */
export function accountsOf(ledger: CreditLedger): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of ledger.entries) if (!seen.has(e.accountId)) { seen.add(e.accountId); out.push(e.accountId); }
  return out;
}

/**
 * The refs an account holds a NET-POSITIVE claim on: purchases (`spend`) minus refunds, per ref.
 *
 * <p>A single `spend` entry stops being the whole story once refunds exist: an account that bought,
 * refunded and bought again holds the thing; one that bought and refunded does not. Counting
 * `spend − refund` per ref answers "does this account hold it NOW" without a second, stored ownership
 * list — the same derived-not-stored rule the rest of the ledger follows.
 *
 * <p>Refs are OPAQUE: this function says nothing about WHAT a ref names. A consumer that cares (the
 * wallet, the remix right) intersects the answer with the catalog.
 */
export function heldRefsOf(ledger: CreditLedger, accountId: string): Set<string> {
  const net = new Map<string, number>();
  for (const e of ledger.entries) {
    if (e.accountId !== accountId || typeof e.ref !== 'string' || e.ref === '') continue;
    if (e.kind === 'spend') net.set(e.ref, (net.get(e.ref) ?? 0) + 1);
    else if (e.kind === 'refund') net.set(e.ref, (net.get(e.ref) ?? 0) - 1);
  }
  const held = new Set<string>();
  for (const [ref, count] of net) if (count > 0) held.add(ref);
  return held;
}

/**
 * Append one entry, or refuse it BY NAME. The returned ledger is a NEW value; the input is never
 * mutated, so a caller that keeps the old ledger keeps a consistent snapshot.
 */
export function appendCreditEntry(ledger: CreditLedger, entry: CreditEntry): CreditAppendDecision {
  if (typeof entry.id !== 'string' || entry.id === '') return { ok: false, reason: 'a credit entry needs a non-empty id (it is the idempotency key)' };
  if (typeof entry.accountId !== 'string' || entry.accountId === '') return { ok: false, reason: 'a credit entry needs a non-empty accountId' };
  if (typeof entry.reason !== 'string' || entry.reason === '') return { ok: false, reason: 'a credit entry needs a non-empty reason — a movement nobody can explain is not a record' };
  if (typeof entry.at !== 'number' || !Number.isFinite(entry.at)) return { ok: false, reason: 'a credit entry needs a finite `at` (the host supplies the instant; the ledger never reads a clock)' };
  if (typeof entry.delta !== 'number' || !Number.isInteger(entry.delta)) return { ok: false, reason: `a credit delta must be a whole number of units — got ${String(entry.delta)} (a fractional credit is the bug a fractional cent is)` };
  if (entry.delta === 0) return { ok: false, reason: 'a zero delta moves nothing; an entry that moves nothing is noise, not a record' };
  if (ledger.entries.some((e) => e.id === entry.id)) return { ok: false, reason: `entry id "${entry.id}" is already in this ledger — a retry is refused, never applied twice` };
  const balance = balanceOf(ledger, entry.accountId);
  if (balance + entry.delta < 0) {
    return { ok: false, reason: `${entry.accountId} holds ${balance} and this entry moves ${entry.delta} — a spend may not drive a balance below zero` };
  }
  return { ok: true, ledger: { entries: [...ledger.entries, entry] }, entry };
}

/**
 * Replay the whole ledger and answer a VERDICT — the same discipline `validateDocument` follows.
 * The check is stronger than the final balance: it asserts that NO account went below zero at ANY
 * prefix, not merely at the end, so a ledger that dipped negative and recovered is still named.
 *
 * It also names an entry whose `at` is not finite or whose `reason` is blank. `appendCreditEntry`
 * refuses both, so a ledger carrying either did not come from the appender — and a non-finite `at`
 * is not cosmetic: the settlement windows read it, and a NaN silently mis-buckets an entry.
 */
export function validateCreditLedger(ledger: CreditLedger): CreditLedgerVerdict {
  const problems: CreditLedgerProblem[] = [];
  const seen = new Set<string>();
  const running = new Map<string, number>();
  for (const e of ledger.entries) {
    if (typeof e.id !== 'string' || e.id === '') problems.push({ code: 'bad-id', detail: 'an entry has no non-empty string id' });
    else if (seen.has(e.id)) problems.push({ code: 'duplicate-id', detail: `entry id "${e.id}" appears more than once` });
    seen.add(e.id);
    if (typeof e.reason !== 'string' || e.reason === '') problems.push({ code: 'bad-reason', detail: `entry "${e.id}" has no non-empty reason` });
    if (typeof e.at !== 'number' || !Number.isFinite(e.at)) problems.push({ code: 'bad-at', detail: `entry "${e.id}" has no finite at — a settlement window reads it` });
    if (typeof e.accountId !== 'string' || e.accountId === '') { problems.push({ code: 'bad-account', detail: 'an entry has no non-empty string accountId' }); continue; }
    if (typeof e.delta !== 'number' || !Number.isInteger(e.delta)) { problems.push({ code: 'bad-delta', detail: `entry "${e.id}" delta is not a whole number: ${String(e.delta)}` }); continue; }
    if (e.delta === 0) problems.push({ code: 'zero-delta', detail: `entry "${e.id}" moves nothing` });
    const next = (running.get(e.accountId) ?? 0) + e.delta;
    if (next < 0) problems.push({ code: 'negative-balance', detail: `entry "${e.id}" drives ${e.accountId} to ${next}` });
    running.set(e.accountId, next);
  }
  return problems.length ? { ok: false, problems } : { ok: true, problems: [] };
}
