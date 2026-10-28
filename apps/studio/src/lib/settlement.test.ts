/**
 * M8 — direct coverage for the settlement statement (src/lib/settlement.ts).
 *
 * These pin what makes a statement trustworthy: the OPENING → movements → CLOSING shape whose
 * closing must equal the account's whole-ledger balance for EVERY window (the reconciliation
 * identity), inclusive bounds with open ends, and per-ref attribution that NAMES what each listing
 * did (earned / spent / refunded / clawedBack) instead of folding a sale and its full reversal into
 * one net of zero. A statement whose closing disagrees with the ledger is a statement about a
 * different ledger.
 */
import { describe, expect, it } from 'vitest';
import { appendCreditEntry, balanceOf, emptyCreditLedger, type CreditLedger } from './credits';
import { attributionByRef, attributionLine, statementFor, statementLine, statementReconciles } from './settlement';

function fixture(): CreditLedger {
  let l = emptyCreditLedger();
  const add = (id: string, accountId: string, delta: number, at: number, ref?: string, kind: 'grant' | 'spend' | 'refund' | 'adjust' = 'grant') => {
    const d = appendCreditEntry(l, { id, accountId, delta, reason: `r-${id}`, at, kind, ...(ref === undefined ? {} : { ref }) });
    if (!d.ok) throw new Error('fixture: ' + d.reason);
    l = d.ledger;
  };
  add('g1', 'acc-1', 1000, 100); // before the window
  add('s1', 'acc-1', -200, 200, 't1', 'spend'); // inside
  add('g2', 'acc-1', 50, 300, undefined, 'adjust'); // inside
  add('s2', 'acc-1', -100, 400, 't2', 'spend'); // inside
  add('x1', 'acc-2', 700, 250, 't1'); // another account
  return l;
}

/** One purchase and its full reversal, seen from both sides — the ledger the attribution tests read. */
function reversalFixture(): CreditLedger {
  let l = emptyCreditLedger();
  const add = (id: string, accountId: string, delta: number, at: number, kind: 'grant' | 'spend' | 'refund' | 'adjust' | 'clawback', ref?: string) => {
    const d = appendCreditEntry(l, { id, accountId, delta, reason: `r-${id}`, at, kind, ...(ref === undefined ? {} : { ref }) });
    if (!d.ok) throw new Error('fixture: ' + d.reason);
    l = d.ledger;
  };
  add('g1', 'buyer', 1000, 100, 'grant');
  add('s1', 'buyer', -500, 200, 'spend', 't1');
  add('sale', 'author', 500, 200, 'grant', 't1');
  add('r1', 'buyer', 500, 300, 'refund', 't1');
  add('c1', 'author', -500, 300, 'clawback', 't1');
  return l;
}

describe('settlement: the statement shape', () => {
  it('a whole-ledger statement opens at zero and closes at the balance', () => {
    const s = statementFor(fixture(), 'acc-1');
    expect(s.opening).toBe(0);
    expect(s.earned).toBe(1050); // 1000 + 50
    expect(s.spent).toBe(300); // 200 + 100, as a positive number
    expect(s.closing).toBe(750);
    expect(s.closing).toBe(balanceOf(fixture(), 'acc-1'));
    expect(s.movements).toBe(4);
    expect(s.firstAt).toBe(100);
    expect(s.lastAt).toBe(400);
    expect(s.from).toBeNull();
    expect(s.to).toBeNull();
  });

  it('a windowed statement folds the earlier entries into the opening balance', () => {
    const s = statementFor(fixture(), 'acc-1', { from: 200, to: 400 });
    expect(s.opening).toBe(1000); // only g1 is strictly before the window
    expect(s.earned).toBe(50);
    expect(s.spent).toBe(300);
    expect(s.closing).toBe(750); // 1000 + 50 − 300
    expect(s.movements).toBe(3);
    expect(s.entries.map((e) => e.id)).toEqual(['s1', 'g2', 's2']);
    expect(s.from).toBe(200);
    expect(s.to).toBe(400);
  });

  it('bounds are INCLUSIVE at both ends', () => {
    const s = statementFor(fixture(), 'acc-1', { from: 200, to: 200 });
    expect(s.entries.map((e) => e.id)).toEqual(['s1']); // the entry AT 200 is inside
    expect(s.opening).toBe(1000);
  });

  it('an absent bound is open: no `from` is the beginning, no `to` is everything after', () => {
    const fromOnly = statementFor(fixture(), 'acc-1', { from: 300 });
    expect(fromOnly.entries.map((e) => e.id)).toEqual(['g2', 's2']);
    expect(fromOnly.opening).toBe(800); // g1 (+1000) and s1 (−200) are both strictly before 300
    expect(fromOnly.after).toBe(0); // no upper bound, so nothing happens after the close
    const toOnly = statementFor(fixture(), 'acc-1', { to: 300 });
    expect(toOnly.entries.map((e) => e.id)).toEqual(['g1', 's1', 'g2']);
    expect(toOnly.opening).toBe(0);
    expect(toOnly.after).toBe(-100); // s2 happens after the close and is carried so a reader can walk on
  });

  it('an account with nothing in the window says so rather than reporting a vacuous zero', () => {
    const s = statementFor(fixture(), 'acc-1', { from: 9_000, to: 9_999 });
    expect(s.movements).toBe(0);
    expect(s.firstAt).toBeNull();
    expect(s.lastAt).toBeNull();
    expect(s.entries).toEqual([]);
    expect(s.closing).toBe(s.opening); // nothing moved inside
    expect(statementLine(s)).toContain('no movements');
  });

  it('an unknown account reconciles at zero', () => {
    const s = statementFor(fixture(), 'nobody');
    expect(s.movements).toBe(0);
    expect(s.closing).toBe(0);
    expect(statementReconciles(fixture(), s)).toBe(true);
  });
});

describe('settlement: the reconciliation identity holds for every window', () => {
  it('opening + earned − spent + after equals the whole-ledger balance, whatever the window', () => {
    const ledger = fixture();
    for (const w of [undefined, { from: 0 }, { to: 9_999 }, { from: 200, to: 400 }, { from: 250 }, { to: 250 }, { from: 100, to: 100 }, { from: 9_000 }, { to: 0 }]) {
      for (const account of ['acc-1', 'acc-2', 'nobody']) {
        const s = statementFor(ledger, account, w);
        expect(statementReconciles(ledger, s), `${account} over ${JSON.stringify(w)}`).toBe(true);
        expect(s.opening + s.earned - s.spent + s.refunded - s.clawedBack + s.after).toBe(balanceOf(ledger, account));
      }
    }
  });

  it('with no upper bound, `after` is zero and closing IS the whole-ledger balance', () => {
    const ledger = fixture();
    for (const w of [undefined, { from: 0 }, { from: 200 }, { from: 9_000 }]) {
      const s = statementFor(ledger, 'acc-1', w);
      expect(s.after).toBe(0);
      expect(s.closing).toBe(balanceOf(ledger, 'acc-1'));
    }
  });

  it('with an upper bound, closing is the balance AS OF the close and `after` walks to the present', () => {
    const s = statementFor(fixture(), 'acc-1', { to: 250 });
    expect(s.closing).toBe(800); // as of 250: +1000 − 200
    expect(s.after).toBe(-50); // g2 (+50) and s2 (−100) happened after the close
    expect(s.closing + s.after).toBe(750); // the present balance
  });
});

describe('settlement: refund-shaped flows are their own buckets', () => {
  it('money coming back is `refunded`, money taken back is `clawedBack` — never earned or spent', () => {
    const l = reversalFixture();
    const buyer = statementFor(l, 'buyer');
    expect(buyer.earned).toBe(1000); // the grant only
    expect(buyer.spent).toBe(500); // the purchase only
    expect(buyer.refunded).toBe(500);
    expect(buyer.clawedBack).toBe(0);
    expect(buyer.closing).toBe(1000);
    expect(statementReconciles(l, buyer)).toBe(true);

    const author = statementFor(l, 'author');
    expect(author.earned).toBe(500); // the sale DID happen
    expect(author.spent).toBe(0); // the claw-back is not a purchase
    expect(author.refunded).toBe(0);
    expect(author.clawedBack).toBe(500);
    expect(author.closing).toBe(0);
    expect(statementReconciles(l, author)).toBe(true);

    expect(statementLine(buyer)).toContain('refunded 500');
    expect(statementLine(author)).toContain('clawed back 500');
  });

  it('a window holding only the reversal reports it without touching earned', () => {
    const s = statementFor(reversalFixture(), 'buyer', { from: 300, to: 300 });
    expect(s.earned).toBe(0);
    expect(s.spent).toBe(0);
    expect(s.refunded).toBe(500);
    expect(s.closing).toBe(1000); // 500 opening + 500 refunded
  });
});

describe('settlement: attribution by ref', () => {
  it('names each referenced thing by flow and orders by net, then ref', () => {
    const ledger = fixture();
    expect(attributionByRef(ledger, 'acc-1')).toEqual([
      { ref: 't2', earned: 0, spent: 100, refunded: 0, clawedBack: 0, net: -100, count: 1 },
      { ref: 't1', earned: 0, spent: 200, refunded: 0, clawedBack: 0, net: -200, count: 1 },
    ]);
    // the SELLER side: acc-2 was credited through t1
    expect(attributionByRef(ledger, 'acc-2')).toEqual([{ ref: 't1', earned: 700, spent: 0, refunded: 0, clawedBack: 0, net: 700, count: 1 }]);
  });

  it('honours the window and ignores movements that reference nothing', () => {
    const ledger = fixture();
    expect(attributionByRef(ledger, 'acc-1', { from: 400 })).toEqual([{ ref: 't2', earned: 0, spent: 100, refunded: 0, clawedBack: 0, net: -100, count: 1 }]);
    expect(attributionByRef(ledger, 'acc-1', { from: 9_000 })).toEqual([]);
  });

  it('a listing that SOLD and was fully clawed back is not the same row as one that never sold', () => {
    let l = emptyCreditLedger();
    const add = (id: string, accountId: string, delta: number, at: number, kind: 'grant' | 'spend' | 'refund' | 'adjust' | 'clawback', ref?: string) => {
      const d = appendCreditEntry(l, { id, accountId, delta, reason: `r-${id}`, at, kind, ...(ref === undefined ? {} : { ref }) });
      if (!d.ok) throw new Error('fixture: ' + d.reason);
      l = d.ledger;
    };
    add('sale-t1', 'author', 500, 200, 'grant', 't1');
    add('back-t1', 'author', -500, 300, 'clawback', 't1');
    add('sale-t2', 'author', 300, 400, 'grant', 't2');

    const rows = attributionByRef(l, 'author');
    expect(rows).toEqual([
      { ref: 't2', earned: 300, spent: 0, refunded: 0, clawedBack: 0, net: 300, count: 1 },
      // net zero, but the row still says a sale WAS made and WAS taken back
      { ref: 't1', earned: 500, spent: 0, refunded: 0, clawedBack: 500, net: 0, count: 2 },
    ]);
    expect(rows.some((r) => r.ref === 't3')).toBe(false); // never sold → absent, not a zero row
  });

  it('a buyer who bought and was refunded keeps both halves named', () => {
    let l = emptyCreditLedger();
    const add = (id: string, delta: number, at: number, kind: 'grant' | 'spend' | 'refund' | 'adjust' | 'clawback', ref?: string) => {
      const d = appendCreditEntry(l, { id, accountId: 'buyer', delta, reason: `r-${id}`, at, kind, ...(ref === undefined ? {} : { ref }) });
      if (!d.ok) throw new Error('fixture: ' + d.reason);
      l = d.ledger;
    };
    add('g', 1000, 100, 'grant');
    add('buy', -200, 200, 'spend', 'tpl');
    add('back', 200, 300, 'refund', 'tpl');
    expect(attributionByRef(l, 'buyer')).toEqual([
      { ref: 'tpl', earned: 0, spent: 200, refunded: 200, clawedBack: 0, net: 0, count: 2 },
    ]);
  });

  it('the one-line reading names the flows that happened and omits the zeros', () => {
    const ledger = reversalFixture();
    expect(attributionLine(attributionByRef(ledger, 'author')[0]!)).toBe('t1: earned 500 · clawed back 500 · net 0 (2 movement(s))');
    expect(attributionLine(attributionByRef(ledger, 'buyer')[0]!)).toBe('t1: spent 500 · refunded 500 · net 0 (2 movement(s))');
  });

  it('net is the buckets added up AND the raw deltas added up — never a second bookkeeping', () => {
    const ledger = reversalFixture();
    for (const who of ['buyer', 'author']) {
      for (const row of attributionByRef(ledger, who)) {
        const raw = ledger.entries
          .filter((e) => e.accountId === who && e.ref === row.ref)
          .reduce((sum, e) => sum + e.delta, 0);
        expect(row.net, `${who}/${row.ref}`).toBe(row.earned - row.spent + row.refunded - row.clawedBack);
        expect(row.net, `${who}/${row.ref}`).toBe(raw);
        expect(row.count).toBe(ledger.entries.filter((e) => e.accountId === who && e.ref === row.ref).length);
      }
    }
  });
});

describe('settlement: the one-line verdict', () => {
  it('names the window, the flows and the opening → closing walk', () => {
    const line = statementLine(statementFor(fixture(), 'acc-1', { from: 200, to: 400 }));
    expect(line).toContain('200..400');
    expect(line).toContain('+50 / −300');
    expect(line).toContain('1000 → 750');
    expect(statementLine(statementFor(fixture(), 'acc-1'))).toContain('all time');
  });
});
