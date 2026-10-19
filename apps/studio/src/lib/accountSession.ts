/**
 * M7 v252 — the Studio's ACCOUNT SESSION: pick a handle, this device answers to it.
 *
 * Three honest pieces, each owned by one module: `accounts.ts` holds the pure rules (a handle verdict,
 * a deterministic id), `currentAccount.ts` holds the localStorage boundary for the one record this
 * device currently publishes as, and this module composes them into the verbs a UI needs —
 * `register`, `rename`, `signOut`, `current`.
 *
 * No password, no token, no session (ADR 0018): `assurance` is always `'unsigned-local'`, and the
 * refusal that matters most is here in DATA — registering while an account is already set REFUSES and
 * names `sign out first` rather than silently replacing someone's local identity.
 *
 * The DEVICE SEED is why an id survives a reload: `createAccountId(handle, seed)` is deterministic, so
 * the seed is generated once under its own key and kept even across `signOut` — signing out forgets the
 * NAME, not the device. Re-registering the same handle on the same device therefore produces the same
 * id, which is the entire promise of "this device publishes as".
 */
import { createAccountId, normalizeHandle, type AccountRecord } from './accounts';
import { currentAccountStore, type KeyValueStore } from './currentAccount';
import { browserStorage } from './storage';

const SEED_KEY = 'nexus-device-seed';

export type SessionResult = { ok: true; account: AccountRecord } | { ok: false; reason: string };

/** The clock and the randomness are injected so a test can produce a known id and a known instant. */
export interface SessionDeps {
  store: KeyValueStore;
  now: () => number;
  uuid: () => string;
}

function defaultDeps(): SessionDeps {
  return {
    store: browserStorage(),
    now: () => Date.now(),
    uuid: () => crypto.randomUUID(),
  };
}

export function accountSession(overrides: Partial<SessionDeps> = {}) {
  const deps: SessionDeps = { ...defaultDeps(), ...overrides };
  const current = currentAccountStore(deps.store);

  /** This device's seed, generated on first use and persisted. */
  function ensureSeed(): string {
    const existing = deps.store.getItem(SEED_KEY);
    if (existing) return existing;
    const fresh = deps.uuid();
    deps.store.setItem(SEED_KEY, fresh);
    return fresh;
  }

  return {
    /** The account this device currently is, or `null`. */
    current(): AccountRecord | null {
      return current.getCurrentAccount();
    },

    /**
     * Register the handle this device will answer to. REFUSES (never silently replaces) when an
     * account is already set — a takeover is a decision the user makes by signing out first.
     */
    register(handle: unknown, displayName?: string): SessionResult {
      const verdict = normalizeHandle(handle);
      if (!verdict.ok) return { ok: false, reason: verdict.reason };
      if (current.hasCurrentAccount()) {
        return { ok: false, reason: 'an account is already set on this device — sign out first' };
      }
      const record: AccountRecord = {
        id: createAccountId(verdict.handle, ensureSeed()),
        handle: verdict.handle,
        displayName: (displayName ?? '').trim() || verdict.handle,
        createdAt: deps.now(),
        assurance: 'unsigned-local',
      };
      current.setCurrentAccount(record);
      return { ok: true, account: record };
    },

    /** Change the DISPLAY name only: the handle and the id are what the id was derived from. */
    rename(displayName: unknown): SessionResult {
      const account = current.getCurrentAccount();
      if (!account) return { ok: false, reason: 'no account is set on this device' };
      if (typeof displayName !== 'string' || displayName.trim().length === 0) {
        return { ok: false, reason: 'display name cannot be empty' };
      }
      const updated: AccountRecord = { ...account, displayName: displayName.trim() };
      current.setCurrentAccount(updated);
      return { ok: true, account: updated };
    },

    /** Forget the name; the device seed stays — signing out is not a factory reset. */
    signOut(): void {
      current.clearCurrentAccount();
    },
  };
}

/** The singleton the Studio uses; tests call `accountSession({ store, now, uuid })`. */
export const session = accountSession();
