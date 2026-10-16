/**
 * M7 A1 — the current device account, persisted in localStorage so the Studio can attach
 * an owner claim to publish/unpublish without a server session.
 *
 * `accounts.ts` stays pure (no DOM, no fetch, no cryptography). This module owns the
 * browser boundary: it reads/writes one JSON record under a single localStorage key.
 *
 * No password, no token, no session, no signature. The stored record is the same shape
 * `AccountRegistry` produces, so `assurance: 'unsigned-local'` travels with it and every
 * consumer reads what it is worth rather than assuming an identity.
 */

import type { AccountRecord, OwnerClaim } from './accounts';
import { ownerClaim } from './accounts';

const STORAGE_KEY = 'nexus-current-account';

/** A browser-like key/value store, injected so tests run without localStorage. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const browserStore: KeyValueStore = {
  getItem(key: string): string | null {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  },
  setItem(key: string, value: string): void {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  },
  removeItem(key: string): void {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  },
};

/** A handle to the current-device account store. All methods are small, explicit and
 *  testable against an injected store. */
export function currentAccountStore(store: KeyValueStore = browserStore) {
  return {
    /** The account this device is currently publishing as, or `null` when none is set. */
    getCurrentAccount(): AccountRecord | null {
      const raw = store.getItem(STORAGE_KEY);
      if (!raw) return null;
      try {
        const record = JSON.parse(raw) as unknown;
        if (
          record &&
          typeof record === 'object' &&
          'id' in record &&
          'handle' in record &&
          typeof (record as { id?: unknown }).id === 'string' &&
          typeof (record as { handle?: unknown }).handle === 'string'
        ) {
          return record as AccountRecord;
        }
      } catch {
        // Corrupt or hand-edited storage is treated as "no account", never as a crash.
      }
      return null;
    },

    /** Remember this account as the current one for this device. Replaces any earlier one. */
    setCurrentAccount(account: AccountRecord): void {
      store.setItem(STORAGE_KEY, JSON.stringify(account));
    },

    /** Forget the current account. Publish/unpublish then proceed without an owner claim,
     *  which the service answers under the pre-v242 rule (anyone may take down an ownerless row). */
    clearCurrentAccount(): void {
      store.removeItem(STORAGE_KEY);
    },

    /** Whether this device currently names an account. */
    hasCurrentAccount(): boolean {
      return this.getCurrentAccount() !== null;
    },

    /** Build an owner claim from the current account, or `null` when none is set.
     *  `now` is host-supplied so the claim is testable rather than wall-clock-only. */
    currentOwnerClaim(now: number): OwnerClaim | null {
      const account = this.getCurrentAccount();
      return account ? ownerClaim(account, now) : null;
    },
  };
}

/** The singleton this device uses. Tests that need isolation should call
 *  `currentAccountStore(fakeStore)` instead. */
export const currentAccount = currentAccountStore();