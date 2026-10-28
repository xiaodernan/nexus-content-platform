/**
 * M8 — the SETTLEMENT statement: what a ledger says over a window, as a PURE projection.
 *
 * <p>The creator dashboard (`creatorDashboard.ts`) answers "what do I hold and what have I done,
 * all told". A creator's actual question is narrower and time-shaped: *what happened this month*,
 * *which of my listings earned it*, and *does the statement reconcile*. This module answers those
 * over the same ledger, deriving everything and storing nothing.
 *
 * <p>The statement's shape is the one an accountant would recognise — an OPENING balance, the
 * movements inside the window, and a CLOSING balance — because the property that makes it
 * trustworthy is arithmetic rather than decorative: **opening + earned − spent + refunded −
 * clawedBack + after must equal the account's whole-ledger balance, for every account and every
 * window**. A statement that does not reconcile is a statement about a different ledger, and the
 * tests pin the identity across a grid of windows. The stronger reading — `closing` alone equals the
 * whole-ledger balance — holds exactly when the window has no upper bound, because then no entry
 * happens after the close; with a `to`, the entries after it are carried in `after` so a reader can
 * still walk to the present.
 *
 * <p>Refund-shaped movements are NOT folded into earned/spent (v532): money returned to a buyer is
 * not income, and money clawed back from a seller is not spending. Each bucket reads the ONE
 * classification `credits.ts` owns (`creditFlowOf`), so this statement and the creator dashboard can
 * never call the same movement by two names.
 *
 * <p>Windows are inclusive at both ends, and an absent bound is open (no `from` means the beginning
 * of the record; no `to` means everything after). The host supplies the window — this module never
 * reads a clock, so a statement is reproducible from the same bytes (ADR 0010).
 *
 * <p>What this module is NOT: it is not a payout, not a tax document and not a currency conversion.
 * Every number is in the ledger's own whole units, and a window is a reading of the record rather
 * than a claim about it.
 */

import { balanceOf, creditFlowOf, type CreditEntry, type CreditLedger } from './credits';

/** An inclusive time window over a ledger's `at` values. An absent bound is open. */
export interface SettlementWindow {
  from?: number;
  to?: number;
}

export interface AccountStatement {
  accountId: string;
  /** The resolved bounds — null where the window was open. */
  from: number | null;
  to: number | null;
  /** The balance carried by every entry strictly BEFORE the window. */
  opening: number;
  /** Whole cents credited inside the window (grants, sales, upward adjustments) — NOT refunds. */
  earned: number;
  /** Whole cents debited inside the window by the account's own spending — NOT claw-backs. */
  spent: number;
  /** Whole cents RETURNED to the account as a buyer inside the window. */
  refunded: number;
  /** Whole cents TAKEN BACK from the account as a seller inside the window, as a positive number. */
  clawedBack: number;
  /** opening + earned − spent + refunded − clawedBack. The balance AS OF the window's close —
   *  entries after it have not happened yet from this statement's point of view, and their sum
   *  travels in `after`. With no upper bound `after` is 0, so `closing` IS the account's
   *  whole-ledger balance. */
  closing: number;
  /** The sum of this account's entries strictly AFTER the window's close, so a reader can walk
   *  from the statement's closing to the ledger's present balance. */
  after: number;
  /** Movements inside the window. */
  movements: number;
  firstAt: number | null;
  lastAt: number | null;
  /** The entries inside the window, in ledger order. */
  entries: CreditEntry[];
}

function inside(at: number, window: SettlementWindow | undefined): boolean {
  if (window?.from !== undefined && at < window.from) return false;
  if (window?.to !== undefined && at > window.to) return false;
  return true;
}

function before(at: number, window: SettlementWindow | undefined): boolean {
  return window?.from !== undefined && at < window.from;
}

/** One account's statement over one window. Derived; it decides nothing. */
export function statementFor(ledger: CreditLedger, accountId: string, window?: SettlementWindow): AccountStatement {
  let opening = 0;
  let earned = 0;
  let spent = 0;
  let refunded = 0;
  let clawedBack = 0;
  let after = 0;
  let movements = 0;
  let firstAt: number | null = null;
  let lastAt: number | null = null;
  const entries: CreditEntry[] = [];
  for (const e of ledger.entries) {
    if (e.accountId !== accountId) continue;
    if (before(e.at, window)) {
      opening += e.delta;
      continue;
    }
    if (!inside(e.at, window)) {
      // not before and not inside ⇒ strictly after the window's close (only reachable with a `to`)
      after += e.delta;
      continue;
    }
    movements++;
    const flow = creditFlowOf(e);
    if (flow.kind === 'earned') earned += flow.amount;
    else if (flow.kind === 'spent') spent += flow.amount;
    else if (flow.kind === 'refunded') refunded += flow.amount;
    else clawedBack += flow.amount;
    if (firstAt === null) firstAt = e.at;
    lastAt = e.at;
    entries.push(e);
  }
  return {
    accountId,
    from: window?.from ?? null,
    to: window?.to ?? null,
    opening,
    earned,
    spent,
    refunded,
    clawedBack,
    closing: opening + earned - spent + refunded - clawedBack,
    after,
    movements,
    firstAt,
    lastAt,
    entries,
  };
}

/**
 * What each referenced thing did for this account inside the window, largest net first.
 *
 * <p>A single `net` was a lossy reading (v535): a sale of 500 followed by a full claw-back nets 0 —
 * indistinguishable from a listing that never sold. The buckets keep the two histories apart, and
 * they are the SAME names the statement uses, read through the one classifier `creditFlowOf` owns, so
 * a movement cannot be called earned here and refunded one row lower. `net` is derived from the
 * buckets (`earned − spent + refunded − clawedBack`), not from the raw deltas: if the classifier ever
 * mislabels a movement the arithmetic disagrees with the ledger, which is a fact a test can pin,
 * whereas a second independent sum would hide it.
 */
export interface RefAttribution {
  ref: string;
  /** Credits a sale or grant through this ref ADDED to this account. */
  earned: number;
  /** Credits this account SPENT through this ref (its own purchases). */
  spent: number;
  /** Credits RETURNED to this account as a buyer through this ref. */
  refunded: number;
  /** Credits TAKEN BACK from this account as a seller through this ref, as a positive number. */
  clawedBack: number;
  /** earned − spent + refunded − clawedBack — positive net for a seller, negative for a buyer. */
  net: number;
  count: number;
}

export function attributionByRef(ledger: CreditLedger, accountId: string, window?: SettlementWindow): RefAttribution[] {
  const byRef = new Map<string, Omit<RefAttribution, 'ref'>>();
  for (const e of ledger.entries) {
    if (e.accountId !== accountId || e.ref === undefined) continue;
    if (!inside(e.at, window)) continue;
    const cur = byRef.get(e.ref) ?? { earned: 0, spent: 0, refunded: 0, clawedBack: 0, net: 0, count: 0 };
    const flow = creditFlowOf(e);
    if (flow.kind === 'earned') cur.earned += flow.amount;
    else if (flow.kind === 'spent') cur.spent += flow.amount;
    else if (flow.kind === 'refunded') cur.refunded += flow.amount;
    else cur.clawedBack += flow.amount;
    cur.count += 1;
    byRef.set(e.ref, cur);
  }
  return [...byRef.entries()]
    .map(([ref, v]) => ({ ref, ...v, net: v.earned - v.spent + v.refunded - v.clawedBack }))
    .sort((a, b) => b.net - a.net || (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0));
}

/**
 * One deterministic line per ref, naming the flows it actually carried. Zero buckets are OMITTED —
 * the same reading `statementLine` makes for its two refund buckets — and the omission MEANS zero,
 * so a listing that sold and was fully clawed back says both halves out loud while a listing that was
 * only ever bought does not pretend a refund happened. The count travels beside the net because two
 * movements that cancel are a history a one-word verdict would erase.
 */
export function attributionLine(row: RefAttribution): string {
  const parts: string[] = [];
  if (row.earned !== 0) parts.push(`earned ${row.earned}`);
  if (row.spent !== 0) parts.push(`spent ${row.spent}`);
  if (row.refunded !== 0) parts.push(`refunded ${row.refunded}`);
  if (row.clawedBack !== 0) parts.push(`clawed back ${row.clawedBack}`);
  return `${row.ref}: ${parts.join(' · ')} · net ${row.net} (${row.count} movement(s))`;
}

/**
 * The one-line, deterministic verdict for a panel or a ledger row: the window, the flows, and the
 * closing balance. A statement with no movements says so rather than reporting a vacuous zero.
 */
export function statementLine(statement: AccountStatement): string {
  const span = statement.from === null && statement.to === null ? 'all time' : `${statement.from ?? '−'}..${statement.to ?? '−'}`;
  if (statement.movements === 0) return `statement: ${statement.accountId} · ${span} · no movements · balance ${statement.closing}`;
  // Refund-shaped flows are stated only when something of the kind happened: a statement with none
  // is not made noisier by two zeros, and a statement with one cannot hide it behind a net figure.
  const refundFlows =
    statement.refunded === 0 && statement.clawedBack === 0
      ? ''
      : ` · refunded ${statement.refunded} · clawed back ${statement.clawedBack}`;
  return `statement: ${statement.accountId} · ${span} · +${statement.earned} / −${statement.spent}${refundFlows} over ${statement.movements} movement(s) · ${statement.opening} → ${statement.closing}`;
}

/**
 * The reconciliation identity: opening + earned − spent + refunded − clawedBack + after must equal
 * the account's whole-ledger balance, for every account and every window. It is vacuous only while
 * the module buckets entries correctly — the moment one is misfiled the identity breaks, which is
 * exactly why a consumer (or the suite) can run it and trust the answer. With no upper bound `after`
 * is 0, so the identity reduces to the stronger reading: closing IS the balance.
 */
export function statementReconciles(ledger: CreditLedger, statement: AccountStatement): boolean {
  return statement.opening + statement.earned - statement.spent + statement.refunded - statement.clawedBack + statement.after === balanceOf(ledger, statement.accountId);
}
