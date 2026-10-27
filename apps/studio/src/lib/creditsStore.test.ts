import { describe, expect, it } from 'vitest';

import { appendCreditEntry, emptyCreditLedger, type CreditEntry, type CreditLedger } from './credits';
import { serializeLedger } from './ledgerStore';
import { CREDITS_STORAGE_KEY, loadCredits, saveCredits, type CreditsKv } from './creditsStore';

/** A Map-backed seam — the same shape `localStorage` satisfies. */
function kvOf(initial: Record<string, string> = {}): CreditsKv & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    setItem: (key, value) => { map.set(key, value); },
  };
}

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

describe('creditsStore: load', () => {
  it('an ABSENT key is an empty ledger, not an error', () => {
    const loaded = loadCredits(kvOf());
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.source).toBe('empty');
    expect(loaded.ledger.entries).toEqual([]);
  });

  it('a PRESENT but unreadable key is REFUSED with the loader reason (not silently emptied)', () => {
    const loaded = loadCredits(kvOf({ [CREDITS_STORAGE_KEY]: '{not json' }));
    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.reason).toContain('not JSON');
  });

  it('an unknown format version is refused', () => {
    const loaded = loadCredits(kvOf({ [CREDITS_STORAGE_KEY]: JSON.stringify({ version: 99, entries: [] }) }));
    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.reason).toContain('unsupported ledger format version');
  });

  it('reads a custom key when one is given', () => {
    const kv = kvOf({ other: serializeLedger(build(grant())) });
    const loaded = loadCredits(kv, 'other');
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.source).toBe('stored');
    expect(loaded.ledger.entries).toHaveLength(1);
  });
});

describe('creditsStore: save', () => {
  it('round-trips a ledger through the seam and reports the bytes written', () => {
    const kv = kvOf();
    const ledger = build(grant(), grant({ id: 'e2', delta: -40, reason: 'spend', at: 2_000, kind: 'spend', ref: 't1' }));
    const saved = saveCredits(kv, ledger);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.bytes).toBe(serializeLedger(ledger).length);

    const loaded = loadCredits(kv);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.source).toBe('stored');
    expect(loaded.ledger.entries).toEqual(ledger.entries);
  });

  it('an overwrite replaces the previous record', () => {
    const kv = kvOf();
    saveCredits(kv, build(grant()));
    saveCredits(kv, build(grant(), grant({ id: 'e2', delta: 50, reason: 'top-up', at: 2_000, kind: 'grant' })));
    const loaded = loadCredits(kv);
    if (!loaded.ok) throw new Error('unreachable');
    expect(loaded.ledger.entries).toHaveLength(2);
  });

  it('REFUSES to save an inconsistent ledger, and does not write it', () => {
    const kv = kvOf();
    const dipped: CreditLedger = { entries: [{ id: 'a', accountId: 'x', delta: -10, reason: 'spend', at: 1, kind: 'spend' }] };
    const saved = saveCredits(kv, dipped);
    expect(saved.ok).toBe(false);
    if (saved.ok) return;
    expect(saved.reason).toContain('refusing to save an inconsistent ledger');
    expect(kv.map.has(CREDITS_STORAGE_KEY)).toBe(false);
  });

  it('reports a storage failure by name instead of pretending the save landed', () => {
    const throwing: CreditsKv = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
    const saved = saveCredits(throwing, build(grant()));
    expect(saved.ok).toBe(false);
    if (saved.ok) return;
    expect(saved.reason).toContain('the storage refused the write');
    expect(saved.reason).toContain('QuotaExceededError');
  });

  it('an empty ledger round-trips', () => {
    const kv = kvOf();
    expect(saveCredits(kv, emptyCreditLedger()).ok).toBe(true);
    const loaded = loadCredits(kv);
    if (!loaded.ok) throw new Error('unreachable');
    expect(loaded.ledger.entries).toEqual([]);
  });
});
