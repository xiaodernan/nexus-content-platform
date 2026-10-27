/**
 * M8 — direct coverage for the credits ledger (src/lib/credits.ts).
 *
 * The creator economy's unit of account had no model anywhere in the tree before this module
 * (measured 2026-10-25: zero occurrences of "credit" under apps/studio, services/nexus-api,
 * packages and agents). These pin the rules the whole economy will be priced against: the balance
 * is DERIVED (never stored), a spend may not drive an account negative, an entry id is an
 * IDEMPOTENCY key, a delta is a non-zero integer, and the ledger is append-only.
 */
import { describe, expect, it } from 'vitest';
import {
  accountsOf,
  appendCreditEntry,
  balanceOf,
  emptyCreditLedger,
  historyOf,
  validateCreditLedger,
  type CreditEntry,
  type CreditLedger,
} from './credits';

const entry = (over: Partial<CreditEntry> = {}): CreditEntry => ({
  id: 'e1',
  accountId: 'acc-1',
  delta: 100,
  reason: 'signup grant',
  at: 1_000,
  kind: 'grant',
  ...over,
});

/** Append a list of entries, asserting each one is accepted. */
function build(...entries: CreditEntry[]): CreditLedger {
  let ledger = emptyCreditLedger();
  for (const e of entries) {
    const d = appendCreditEntry(ledger, e);
    if (!d.ok) throw new Error(`fixture entry refused: ${d.reason}`);
    ledger = d.ledger;
  }
  return ledger;
}

describe('credits: an empty ledger', () => {
  it('holds zero for every account and knows no accounts', () => {
    const l = emptyCreditLedger();
    expect(balanceOf(l, 'acc-1')).toBe(0);
    expect(historyOf(l, 'acc-1')).toEqual([]);
    expect(accountsOf(l)).toEqual([]);
    expect(validateCreditLedger(l).ok).toBe(true);
  });
});

describe('credits: appending', () => {
  it('a grant lands and the balance is the derived sum', () => {
    const l = build(entry());
    expect(balanceOf(l, 'acc-1')).toBe(100);
    expect(historyOf(l, 'acc-1')).toHaveLength(1);
    expect(accountsOf(l)).toEqual(['acc-1']);
  });

  it('a spend lowers the balance and a refund raises it back', () => {
    const l = build(entry(), entry({ id: 'e2', delta: -30, kind: 'spend', reason: 'listing fee' }), entry({ id: 'e3', delta: 30, kind: 'refund', reason: 'listing withdrawn' }));
    expect(balanceOf(l, 'acc-1')).toBe(100);
  });

  it('never mutates the ledger it is handed (append-only, structural sharing)', () => {
    const before = build(entry());
    const snapshot = before.entries.length;
    const d = appendCreditEntry(before, entry({ id: 'e2', delta: -10, kind: 'spend' }));
    expect(d.ok).toBe(true);
    expect(before.entries).toHaveLength(snapshot); // the input is untouched
    if (!d.ok) return;
    expect(d.ledger).not.toBe(before);
    expect(d.ledger.entries).toHaveLength(snapshot + 1);
    expect(balanceOf(before, 'acc-1')).toBe(100); // the old snapshot still says what it said
  });

  it('reports every account in first-touch order', () => {
    const l = build(entry({ id: 'a', accountId: 'acc-1' }), entry({ id: 'b', accountId: 'acc-2' }), entry({ id: 'c', accountId: 'acc-1', delta: 5, kind: 'adjust' }));
    expect(accountsOf(l)).toEqual(['acc-1', 'acc-2']);
  });
});

describe('credits: refusals, each by name', () => {
  const refuse = (l: CreditLedger, e: CreditEntry) => {
    const d = appendCreditEntry(l, e);
    expect(d.ok).toBe(false);
    return d.ok ? '' : d.reason;
  };

  it('a spend that would drive the balance below zero names the balance that was there', () => {
    const l = build(entry({ delta: 20 }));
    const reason = refuse(l, entry({ id: 'e2', delta: -21, kind: 'spend' }));
    expect(reason).toContain('holds 20');
    expect(reason).toContain('-21');
    expect(reason).toContain('below zero');
  });

  it('a retry that reuses an entry id is refused, never applied twice', () => {
    const l = build(entry());
    const reason = refuse(l, entry({ id: 'e1', delta: 100 }));
    expect(reason).toContain('already in this ledger');
    expect(reason).toContain('never applied twice');
  });

  it('a fractional delta is refused — a credit is a whole unit', () => {
    const reason = refuse(emptyCreditLedger(), entry({ delta: 1.5 }));
    expect(reason).toContain('whole number');
  });

  it('a zero delta is refused — an entry that moves nothing is noise', () => {
    expect(refuse(emptyCreditLedger(), entry({ delta: 0 }))).toContain('moves nothing');
  });

  it('a missing id, accountId, reason or finite instant is refused', () => {
    expect(refuse(emptyCreditLedger(), entry({ id: '' }))).toContain('idempotency key');
    expect(refuse(emptyCreditLedger(), entry({ accountId: '' }))).toContain('accountId');
    expect(refuse(emptyCreditLedger(), entry({ reason: '' }))).toContain('reason');
    expect(refuse(emptyCreditLedger(), entry({ at: Number.NaN }))).toContain('finite');
  });
});

describe('credits: validateCreditLedger replays every prefix', () => {
  it('accepts a ledger the appender produced', () => {
    expect(validateCreditLedger(build(entry(), entry({ id: 'e2', delta: -100, kind: 'spend' }))).ok).toBe(true);
  });

  it('names a hand-built ledger that dipped negative and recovered', () => {
    // The FINAL balance is 0, but the account went to -50 at the second entry. A balance-only
    // check would call this healthy; the prefix replay names it.
    const dipped: CreditLedger = {
      entries: [
        entry({ id: 'a', delta: 50 }),
        entry({ id: 'b', delta: -100, kind: 'spend' }),
        entry({ id: 'c', delta: 50, kind: 'adjust' }),
      ],
    };
    const v = validateCreditLedger(dipped);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.problems.map((p) => p.code)).toContain('negative-balance');
    expect(v.problems[0]!.detail).toContain('"b"');
  });

  it('names duplicate ids, bad deltas and zero deltas in a hand-built ledger', () => {
    const v = validateCreditLedger({ entries: [entry(), entry({ id: 'e1' }), entry({ id: 'z', delta: 0 }), entry({ id: 'f', delta: 0.5 })] });
    expect(v.ok).toBe(false);
    if (v.ok) return;
    const codes = v.problems.map((p) => p.code);
    expect(codes).toContain('duplicate-id');
    expect(codes).toContain('zero-delta');
    expect(codes).toContain('bad-delta');
  });

  it('names a non-finite `at` and a blank `reason` — the fields a settlement window reads', () => {
    const v = validateCreditLedger({ entries: [
      entry({ id: 'bad-at', at: Number.NaN }),
      entry({ id: 'bad-reason', reason: '' }),
    ] });
    expect(v.ok).toBe(false);
    if (v.ok) return;
    const codes = v.problems.map((p) => p.code);
    expect(codes).toContain('bad-at');
    expect(codes).toContain('bad-reason');
  });
});

describe('credits: determinism', () => {
  it('the same entries in the same order always produce the same balances', () => {
    const es = [entry(), entry({ id: 'e2', delta: -40, kind: 'spend' }), entry({ id: 'e3', accountId: 'acc-2', delta: 7, kind: 'adjust' })];
    expect(balanceOf(build(...es), 'acc-1')).toBe(balanceOf(build(...es), 'acc-1'));
    expect(balanceOf(build(...es), 'acc-2')).toBe(7);
  });
});
