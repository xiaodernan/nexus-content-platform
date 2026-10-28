import { describe, expect, it } from 'vitest';

import { appendCreditEntry, emptyCreditLedger, type CreditEntry, type CreditLedger } from './credits';
import { LEDGER_FORMAT_VERSION, deserializeLedger, serializeLedger } from './ledgerStore';

function build(...entries: CreditEntry[]): CreditLedger {
  let ledger = emptyCreditLedger();
  for (const entry of entries) {
    const res = appendCreditEntry(ledger, entry);
    if (!res.ok) throw new Error(`fixture: ${res.reason}`);
    ledger = res.ledger;
  }
  return ledger;
}

const grant = (over: Partial<CreditEntry> = {}): CreditEntry => ({
  id: 'e1', accountId: 'acc-1', delta: 100, reason: 'signup grant', at: 1_000, kind: 'grant', ...over,
});

describe('ledgerStore: round-trip', () => {
  it('a ledger survives serialize → deserialize unchanged', () => {
    const ledger = build(
      grant(),
      grant({ id: 'e2', delta: -40, reason: 'template "t1"', at: 2_000, kind: 'spend', ref: 't1' }),
      grant({ id: 'e3', accountId: 'acc-2', delta: 40, reason: 'sale of "t1"', at: 2_000, kind: 'grant', ref: 't1' }),
    );
    const loaded = deserializeLedger(serializeLedger(ledger));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.ledger.entries).toEqual(ledger.entries);
  });

  it('an empty ledger round-trips', () => {
    const loaded = deserializeLedger(serializeLedger(emptyCreditLedger()));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.ledger.entries).toEqual([]);
  });

  it('serialization is deterministic: the same ledger always writes the same bytes', () => {
    const ledger = build(grant());
    const first = serializeLedger(ledger);
    const loaded = deserializeLedger(first);
    if (!loaded.ok) throw new Error('unreachable');
    expect(serializeLedger(loaded.ledger)).toBe(first);
  });

  it('preserves an absent ref as absent (it does not invent an empty string)', () => {
    const ledger = build(grant());
    const loaded = deserializeLedger(serializeLedger(ledger));
    if (!loaded.ok) throw new Error('unreachable');
    expect(loaded.ledger.entries[0]!.ref).toBeUndefined();
  });

  it('a ledger carrying a clawback survives the round-trip — the kind is part of the format', () => {
    const ledger = build(
      grant(),
      grant({ id: 'e2', delta: -40, reason: 'template "t1"', at: 2_000, kind: 'spend', ref: 't1' }),
      grant({ id: 'e3', accountId: 'acc-2', delta: 40, reason: 'sale of "t1"', at: 2_000, kind: 'grant', ref: 't1' }),
      grant({ id: 'e4', accountId: 'acc-2', delta: -40, reason: 'refund of "t1"', at: 3_000, kind: 'clawback', ref: 't1' }),
      grant({ id: 'e5', delta: 40, reason: 'refund of "t1"', at: 3_000, kind: 'refund', ref: 't1' }),
    );
    const loaded = deserializeLedger(serializeLedger(ledger));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.ledger.entries).toEqual(ledger.entries);
    expect(loaded.ledger.entries[3]!.kind).toBe('clawback');
  });
});

describe('ledgerStore: refusals, each by name', () => {
  const reasonFor = (text: string): string => {
    const r = deserializeLedger(text);
    expect(r.ok).toBe(false);
    return r.ok ? '' : r.reason;
  };

  it('empty text', () => {
    expect(reasonFor('')).toContain('empty');
    expect(reasonFor('   ')).toContain('empty');
  });

  it('text that is not JSON', () => {
    expect(reasonFor('{not json')).toContain('not JSON');
  });

  it('an unknown format version is refused rather than guessed', () => {
    expect(reasonFor(JSON.stringify({ version: LEDGER_FORMAT_VERSION + 1, entries: [] }))).toContain('unsupported ledger format version');
  });

  it('an envelope with no entries array', () => {
    expect(reasonFor(JSON.stringify({ version: LEDGER_FORMAT_VERSION }))).toContain('no entries array');
  });

  it('an entry with an unknown kind', () => {
    expect(reasonFor(JSON.stringify({ version: LEDGER_FORMAT_VERSION, entries: [{ ...grant(), kind: 'bribe' }] }))).toContain('unknown kind');
  });

  it('an entry with a fractional delta', () => {
    expect(reasonFor(JSON.stringify({ version: LEDGER_FORMAT_VERSION, entries: [{ ...grant(), delta: 1.5 }] }))).toContain('integer delta');
  });

  it('a structurally valid ledger whose history dips negative is refused by the VALIDATOR', () => {
    const dipped = {
      version: LEDGER_FORMAT_VERSION,
      entries: [
        { id: 'a', accountId: 'acc-1', delta: 50, reason: 'grant', at: 1, kind: 'grant' },
        { id: 'b', accountId: 'acc-1', delta: -100, reason: 'spend', at: 2, kind: 'spend' },
      ],
    };
    const reason = reasonFor(JSON.stringify(dipped));
    expect(reason).toContain('not consistent');
    expect(reason).toContain('drives acc-1 to -50');
  });
});

describe('ledgerStore: round-trip over generated ledgers', () => {
  // A deterministic PRNG: a failing seed reproduces the failing case exactly.
  function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it('every appender-built ledger survives the round-trip with its entries intact', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rnd = mulberry32(seed);
      let ledger = emptyCreditLedger();
      for (let i = 0; i < 30; i++) {
        const accountId = rnd() < 0.5 ? 'acc-1' : 'acc-2';
        const kind = rnd() < 0.5 ? 'grant' : 'spend';
        const balance = ledger.entries.filter((e) => e.accountId === accountId).reduce((s, e) => s + e.delta, 0);
        const delta = kind === 'spend'
          ? (balance > 0 ? -Math.max(1, Math.floor(rnd() * balance)) : 0)
          : Math.max(1, Math.floor(rnd() * 100));
        if (delta === 0) continue;
        const res = appendCreditEntry(ledger, {
          id: `s${seed}-${i}`, accountId, delta, reason: `r${i}`, at: Math.floor(rnd() * 1000), kind,
          ...(rnd() < 0.3 ? { ref: `ref-${Math.floor(rnd() * 3)}` } : {}),
        });
        if (res.ok) ledger = res.ledger;
      }
      const loaded = deserializeLedger(serializeLedger(ledger));
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) continue;
      expect(loaded.ledger.entries).toEqual(ledger.entries);
    }
  });
});
