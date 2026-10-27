/**
 * M8 — the LOCAL-FIRST credits store: the ledger's first real consumer, over a storage SEAM.
 *
 * <p>`ledgerStore.ts` turns a ledger into text and back. This module puts that text somewhere: it
 * reads and writes through a minimal key-value seam (`getItem`/`setItem`) that `localStorage` and a
 * Map-backed test double both satisfy, the same injected-seam discipline `webfs.ts` follows. It is the
 * data source a credits panel needs, and it is local-first in the sense ADR 0014 uses: the browser is
 * the first copy, and no service is required for the ledger to survive a reload.
 *
 * <p>Three rules keep it honest (§60):
 * <ul>
 *   <li><b>Absence and corruption are DIFFERENT facts.</b> A key that is not there is an EMPTY ledger
 *       (`source: 'empty'`) — a new user has no history, which is not an error. A key that is there but
 *       unreadable is REFUSED with the loader's reason; silently returning an empty ledger would erase
 *       a balance by accident.</li>
 *   <li><b>What is saved can be loaded.</b> `saveCredits` runs the ledger validator BEFORE writing and
 *       refuses an inconsistent ledger, so the store cannot persist a record its own loader would
 *       reject.</li>
 *   <li><b>A failed write is reported.</b> A storage quota error is caught and returned by name; the
 *       caller learns the save did not land instead of believing it did.</li>
 * </ul>
 *
 * <p>What this module is NOT: it is not a service, a session or an authority. It does not decide who
 * may read a key, and a key is only as trustworthy as the storage that holds it. A server that owns a
 * ledger is ADR 0012's business, not this module's.
 */

import { emptyCreditLedger, validateCreditLedger, type CreditLedger } from './credits';
import { deserializeLedger, serializeLedger } from './ledgerStore';

/** The one key this build writes. A namespace prefix keeps it from colliding with other local data. */
export const CREDITS_STORAGE_KEY = 'nexus.credits.v1';

/** The storage seam: the shape `localStorage` and a Map-backed double both satisfy. */
export interface CreditsKv {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type CreditsLoad =
  | { ok: true; ledger: CreditLedger; source: 'stored' | 'empty' }
  | { ok: false; reason: string };

/**
 * Load the ledger from storage. An ABSENT key is an empty ledger; a PRESENT but unreadable key is a
 * refusal carrying the loader's reason. The two are never collapsed into one answer.
 */
export function loadCredits(kv: CreditsKv, key: string = CREDITS_STORAGE_KEY): CreditsLoad {
  const raw = kv.getItem(key);
  if (raw === null) return { ok: true, ledger: emptyCreditLedger(), source: 'empty' };
  const loaded = deserializeLedger(raw);
  if (!loaded.ok) return { ok: false, reason: loaded.reason };
  return { ok: true, ledger: loaded.ledger, source: 'stored' };
}

export type CreditsSave = { ok: true; bytes: number } | { ok: false; reason: string };

/**
 * Save the ledger. Refuses an inconsistent ledger (what is saved must be loadable), reports a storage
 * failure by name, and returns the byte count written so a caller can meter it.
 */
export function saveCredits(kv: CreditsKv, ledger: CreditLedger, key: string = CREDITS_STORAGE_KEY): CreditsSave {
  const verdict = validateCreditLedger(ledger);
  if (!verdict.ok) {
    const [first, ...rest] = verdict.problems;
    return { ok: false, reason: `refusing to save an inconsistent ledger: ${first!.detail}${rest.length ? ` (+${rest.length} more)` : ''}` };
  }
  const text = serializeLedger(ledger);
  try {
    kv.setItem(key, text);
  } catch (err) {
    return { ok: false, reason: `the storage refused the write: ${(err as Error).message}` };
  }
  return { ok: true, bytes: text.length };
}
