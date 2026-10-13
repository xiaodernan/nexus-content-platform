/**
 * M7 v234 — the account model's PURE core (ADR 0018).
 *
 * **What this is.** The shape of an identity and the rules a handle must satisfy, as data and as
 * refusals: `normalizeHandle` is the canonical rule, `AccountRegistry` is the roster, `ownerClaim`
 * is how a publication names who published it.
 *
 * **What this is NOT, stated first because it is the §60 point of the whole increment.** There is no
 * password, no token, no session, no signature and no cryptography anywhere in this file. A handle
 * registered here is a name THIS DEVICE chose for itself; it proves nothing to anybody, and the
 * registry does not pretend it does. ADR 0018 records why that is the honest thing to build before
 * the service can enforce ownership — and why a `signedIn: true` badge would be a lie today.
 *
 * The consequences are carried in the DATA rather than in prose:
 *   - every `AccountRecord` carries `assurance: 'unsigned-local'`, so a consumer reading a record
 *     reads what it is worth without having to trust this comment;
 *   - `ownerClaim` names itself `kind: 'owner-claim'`, so a service receiving it can tell a claim
 *     from a verified identity without pattern-matching a sentence;
 *   - the module reserves NO names, because a reserved list the client enforces and the service does
 *     not is a refusal nobody agreed to. That is a stated bound, not an omission.
 *
 * Deterministic throughout (ADR 0010): `createAccountId` derives an id from the handle and a
 * host-supplied device seed, so the same device produces the same id and a test produces a known one.
 */

/** What a handle is worth. Not a quality grade — an assurance level, and today there is only one. */
export type HandleAssurance = 'unsigned-local';

/** The verdict of the canonical handle rule. `ok` names whether the handle is usable; the `reason`
 *  does the explaining, and it is written for the person who typed it. */
export type HandleVerdict = { ok: true; handle: string } | { ok: false; reason: string };

/** The rule, as data, so a test and a reviewer can read it without reading code. */
export const HANDLE_RULES = {
  minLength: 3,
  maxLength: 24,
  /** Characters a handle may contain AFTER normalization: lowercase letters, digits, `-`, `_`. */
  pattern: /^[a-z0-9][a-z0-9_-]*[a-z0-9]$/,
  /** What the rule is for, in one line a UI can show. */
  summary: '3–24 characters: lowercase letters, digits, hyphen or underscore; must start and end with a letter or digit',
} as const;

export interface AccountRecord {
  /** Deterministic per (handle, device seed) — see `createAccountId`. */
  id: string;
  handle: string;
  displayName: string;
  /** When this device registered it, in milliseconds since the epoch. The HOST supplies the clock. */
  createdAt: number;
  /** What this identity is worth. Always `'unsigned-local'` in this build; the field exists so a
   *  consumer cannot read a record and assume it means anything stronger. */
  assurance: HandleAssurance;
}

/** How a publication names its publisher. `kind` is the field a service reads to know it is a claim. */
export interface OwnerClaim {
  kind: 'owner-claim';
  accountId: string;
  handle: string;
  assurance: HandleAssurance;
  /** When the claim was made, host-supplied so it is testable rather than wall-clock-only. */
  claimedAt: number;
}

export class InvalidHandle extends Error {}

/**
 * The canonical handle rule.
 *
 * A verdict rather than a throw: a handle is data a person typed, and the caller needs to show them
 * what is wrong rather than catch an exception. Normalization is TRIM → LOWERCASE and nothing else —
 * a handle that needs more rewriting than that is not a handle this build will quietly reshape.
 */
export function normalizeHandle(raw: unknown): HandleVerdict {
  if (typeof raw !== 'string') return { ok: false, reason: `a handle must be a string, got ${typeof raw}` };
  const handle = raw.trim().toLowerCase();
  if (handle.length === 0) return { ok: false, reason: 'a handle cannot be empty' };
  if (handle.length < HANDLE_RULES.minLength) {
    return { ok: false, reason: `a handle needs at least ${HANDLE_RULES.minLength} characters, got ${handle.length} ("${handle}")` };
  }
  if (handle.length > HANDLE_RULES.maxLength) {
    return { ok: false, reason: `a handle may hold at most ${HANDLE_RULES.maxLength} characters, got ${handle.length}` };
  }
  if (!HANDLE_RULES.pattern.test(handle)) {
    return { ok: false, reason: `a handle may hold only lowercase letters, digits, hyphen or underscore, and must start and end with a letter or digit ("${handle}")` };
  }
  return { ok: true, handle };
}

/** FNV-1a, the same hash the provider package's `hashString` uses, so ids are stable across the tree. */
function fnv1a(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * The device-local account id, derived from the handle and a HOST-SUPPLIED device seed.
 *
 * The seed is a parameter rather than a `Math.random()` call for two reasons, and both are the repo's:
 * it makes the id deterministic for a given device (a remix recorded twice names the same author),
 * and it makes the function testable. The host persists one seed per browser; this module never
 * invents one.
 */
export function createAccountId(handle: string, deviceSeed: string): string {
  // v234: a seed that is only WHITESPACE is refused too. The first draft checked `!deviceSeed`, which
  // accepts `'   '` — and a host that persisted a padded empty string would get an id that differs from
  // the one it gets the next time it persists a truly empty one. The suite found this; the rule is
  // "no seed, or a seed with nothing in it", which is what the sentence above always claimed.
  if (!deviceSeed.trim()) throw new InvalidHandle('createAccountId needs a device seed; an id derived from an empty seed is the same id on every device');
  return `acct-${fnv1a(`${handle}:${deviceSeed}`).toString(36)}`;
}
/**
 * The roster. One account per handle, and the collision rule is the handle's own: two handles that
 * normalize to the same string are the same account, so `Nexus` and `nexus` cannot both be registered.
 */
export class AccountRegistry {
  private readonly byHandle = new Map<string, AccountRecord>();

  /**
   * Register an account. Throws `InvalidHandle` when the handle fails the rule and `AccountTaken`
   * when the roster already holds it — a mutation whose input is bad or whose target exists is a
   * programming error, not a question to answer with a verdict.
   */
  register(handle: unknown, displayName: string, opts: { deviceSeed: string; now: number }): AccountRecord {
    const verdict = normalizeHandle(handle);
    if (!verdict.ok) throw new InvalidHandle(verdict.reason);
    if (this.byHandle.has(verdict.handle)) throw new AccountTaken(`the handle "${verdict.handle}" is already registered on this device`);
    const record: AccountRecord = {
      id: createAccountId(verdict.handle, opts.deviceSeed),
      handle: verdict.handle,
      displayName,
      createdAt: opts.now,
      assurance: 'unsigned-local',
    };
    this.byHandle.set(verdict.handle, record);
    return structuredClone(record);
  }

  /** The record for a handle, or `null`. Lookup normalizes, so `Nexus` finds `nexus`. */
  get(handle: unknown): AccountRecord | null {
    const verdict = normalizeHandle(handle);
    if (!verdict.ok) return null;
    const found = this.byHandle.get(verdict.handle);
    return found ? structuredClone(found) : null;
  }

  has(handle: unknown): boolean {
    return this.get(handle) !== null;
  }

  /** Every account, sorted by handle — the roster's order is the handles' order, not registration order. */
  list(): AccountRecord[] {
    return [...this.byHandle.values()].sort((a, b) => a.handle.localeCompare(b.handle)).map((r) => structuredClone(r));
  }

  count(): number {
    return this.byHandle.size;
  }
}

export class AccountTaken extends Error {}

/**
 * How a publication names who published it.
 *
 * A CLAIM, and it says so twice — in `kind` and in `assurance` — so the service that receives it can
 * decide what a claim is worth without having to trust the client's comment. The service is the only
 * party that can turn this into an identity, and ADR 0018 records that this build has not asked it to.
 */
export function ownerClaim(account: AccountRecord, claimedAt: number): OwnerClaim {
  return {
    kind: 'owner-claim',
    accountId: account.id,
    handle: account.handle,
    assurance: account.assurance,
    claimedAt,
  };
}

/** Whether a value received over the wire is shaped like a claim this core would have produced. A
 *  service reads this to decide what to do with an unknown shape: refuse it, or record nothing. */
export function isOwnerClaim(value: unknown): value is OwnerClaim {
  if (typeof value !== 'object' || value === null) return false;
  const claim = value as Partial<OwnerClaim>;
  return (
    claim.kind === 'owner-claim' &&
    typeof claim.accountId === 'string' &&
    typeof claim.handle === 'string' &&
    claim.assurance === 'unsigned-local' &&
    typeof claim.claimedAt === 'number'
  );
}

