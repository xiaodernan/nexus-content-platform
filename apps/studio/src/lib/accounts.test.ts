import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  AccountRegistry,
  AccountTaken,
  HANDLE_RULES,
  InvalidHandle,
  createAccountId,
  isOwnerClaim,
  normalizeHandle,
  ownerClaim,
} from './accounts';

/**
 * M7 v234 — the account model's pure core (ADR 0018).
 *
 * No React, no DOM, no fetch: the two claims a reviewer cares about — *what a handle must look like*
 * and *what an identity is worth* — are functions of data, so they are asserted here and again in a
 * headless proof without the two disagreeing about what they checked.
 *
 * §60 is the crux, so it is asserted as a fact about the module's own source: this build has no
 * password, no token, no session and no signature, and the suite proves it rather than promising it.
 */

const SEED = 'device-seed-for-tests';

describe('normalizeHandle — the canonical rule', () => {
  it('trims and lowercases, and changes nothing else', () => {
    expect(normalizeHandle('  Ada  ')).toEqual({ ok: true, handle: 'ada' });
    expect(normalizeHandle('LoVe-LACE_99')).toEqual({ ok: true, handle: 'love-lace_99' });
  });

  it('refuses an empty or whitespace-only handle, naming the reason', () => {
    expect(normalizeHandle('')).toEqual({ ok: false, reason: 'a handle cannot be empty' });
    expect(normalizeHandle('   ')).toEqual({ ok: false, reason: 'a handle cannot be empty' });
  });

  it('refuses a handle that is too short, and says how short', () => {
    const short = normalizeHandle('ab');
    expect(short.ok).toBe(false);
    expect(short.ok === false && short.reason).toContain(`at least ${HANDLE_RULES.minLength} characters`);
    expect(short.ok === false && short.reason).toContain('got 2');
  });

  it('refuses a handle that is too long', () => {
    const long = normalizeHandle('a'.repeat(HANDLE_RULES.maxLength + 1));
    expect(long.ok).toBe(false);
    expect(long.ok === false && long.reason).toContain(`at most ${HANDLE_RULES.maxLength}`);
  });

  it('refuses illegal characters, and refuses a separator at either END', () => {
    for (const bad of ['ada lovelace', 'ada!', '-ada', 'ada-', 'ada_lovelace!']) {
      const verdict = normalizeHandle(bad);
      expect(verdict.ok, `"${bad}" should be refused`).toBe(false);
      expect(verdict.ok === false && verdict.reason).toContain('lowercase letters, digits, hyphen or underscore');
    }
  });

  it('accepts the boundary lengths', () => {
    expect(normalizeHandle('a'.repeat(HANDLE_RULES.minLength)).ok).toBe(true);
    expect(normalizeHandle('a'.repeat(HANDLE_RULES.maxLength)).ok).toBe(true);

describe('AccountRegistry — the roster', () => {
  const now = 1_700_000_000_000;

  it('registers an account whose handle is the NORMALIZED one', () => {
    const registry = new AccountRegistry();
    const record = registry.register('  Ada  ', 'Ada Lovelace', { deviceSeed: SEED, now });
    expect(record.handle).toBe('ada');
    expect(record.displayName).toBe('Ada Lovelace');
    expect(record.id).toBe(createAccountId('ada', SEED));
    expect(record.createdAt).toBe(now);
    expect(record.assurance).toBe('unsigned-local');
    expect(registry.count()).toBe(1);
  });

  it('two handles that normalize the same are ONE account, so the second registration is refused', () => {
    const registry = new AccountRegistry();
    registry.register('ada', 'Ada', { deviceSeed: SEED, now });
    expect(() => registry.register('ADA', 'Ada again', { deviceSeed: SEED, now })).toThrowError(AccountTaken);
    expect(() => registry.register(' ada ', 'Ada once more', { deviceSeed: SEED, now })).toThrowError(AccountTaken);
    expect(registry.count()).toBe(1);
  });

  it('refuses a handle that fails the rule, naming the rule', () => {
    const registry = new AccountRegistry();
    expect(() => registry.register('no!', 'x', { deviceSeed: SEED, now })).toThrowError(InvalidHandle);
    expect(() => registry.register('ab', 'x', { deviceSeed: SEED, now })).toThrowError(/at least 3/);
    expect(registry.count()).toBe(0);
  });

  it('lookup normalizes, and an unknown handle answers null rather than throwing', () => {
    const registry = new AccountRegistry();
    registry.register('ada', 'Ada', { deviceSeed: SEED, now });
    expect(registry.get('ADA')?.handle).toBe('ada');
    expect(registry.has(' ada ')).toBe(true);
    expect(registry.get('nobody')).toBeNull();
    expect(registry.has('nobody')).toBe(false);
    expect(registry.get('not a handle at all')).toBeNull(); // a bad ask is an absent answer, not a crash
  });

  it('lists in HANDLE order, not registration order', () => {
    const registry = new AccountRegistry();
    registry.register('zed', 'Z', { deviceSeed: SEED, now });
    registry.register('ada', 'A', { deviceSeed: SEED, now });
    registry.register('mid', 'M', { deviceSeed: SEED, now });
    expect(registry.list().map((r) => r.handle)).toEqual(['ada', 'mid', 'zed']);
  });

  it('hands out COPIES, so a caller cannot mutate the roster through a record it was given', () => {
    const registry = new AccountRegistry();
    registry.register('ada', 'Ada', { deviceSeed: SEED, now });
    const first = registry.get('ada');
    if (!first) throw new Error('the account should exist');
    first.displayName = 'MUTATED';
    expect(registry.get('ada')?.displayName).toBe('Ada');
    const listed = registry.list();
    listed[0]!.displayName = 'MUTATED AGAIN';
    expect(registry.get('ada')?.displayName).toBe('Ada');
  });
});

describe('ownerClaim — how a publication names who published it', () => {
  it('names itself a CLAIM and carries the record’s own assurance', () => {
    const registry = new AccountRegistry();
    const account = registry.register('ada', 'Ada', { deviceSeed: SEED, now: 1_700_000_000_000 });
    const claim = ownerClaim(account, 1_700_000_000_500);
    expect(claim).toEqual({
      kind: 'owner-claim',
      accountId: account.id,
      handle: 'ada',
      assurance: 'unsigned-local',
      claimedAt: 1_700_000_000_500,
    });
  });

  it('isOwnerClaim accepts what this core produces and refuses every near-miss', () => {
    const registry = new AccountRegistry();
    const account = registry.register('ada', 'Ada', { deviceSeed: SEED, now: 1 });
    const claim = ownerClaim(account, 2);
    expect(isOwnerClaim(claim)).toBe(true);

    // Each of these is a shape a service could receive; each must be refused rather than trusted.
    expect(isOwnerClaim({ ...claim, kind: 'owner' })).toBe(false);
    expect(isOwnerClaim({ ...claim, assurance: 'verified' })).toBe(false);
    expect(isOwnerClaim({ ...claim, claimedAt: 'now' })).toBe(false);
    expect(isOwnerClaim({ ...claim, accountId: 7 })).toBe(false);
    expect(isOwnerClaim({ kind: 'owner-claim' })).toBe(false);
    expect(isOwnerClaim(null)).toBe(false);
    expect(isOwnerClaim('owner-claim')).toBe(false);
    expect(isOwnerClaim(undefined)).toBe(false);
  });

  it('§60: the module contains no authentication mechanism at all — measured, not promised', () => {
    const source = readFileSync(new URL('./accounts.ts', import.meta.url), 'utf8');
    for (const word of ['password', 'passphrase', 'token', 'jwt', 'session', 'signature', 'privateKey', 'crypto', 'bcrypt']) {
      expect(source.toLowerCase().includes(word.toLowerCase()), `accounts.ts mentions "${word}"`).toBe(false);
    }
    const record = new AccountRegistry().register('ada', 'Ada', { deviceSeed: SEED, now: 1 });
    expect(record.assurance).toBe('unsigned-local');
    expect(HANDLE_RULES.summary.length).toBeGreaterThan(10);
  });
});

  });

  it('refuses a non-string with a reason that names the type it got', () => {
    for (const bad of [undefined, null, 42, {}, []]) {
      const verdict = normalizeHandle(bad);
      expect(verdict.ok).toBe(false);
      expect(verdict.ok === false && verdict.reason).toContain('must be a string');
    }
  });

  it('the pattern governs the character set and the ends; the LENGTH bounds are separate constants', () => {
    // The pattern is deliberately not length-aware: a handle of two legal characters is a LENGTH
    // failure, not a character failure, and folding the bounds into the regex would make one reason
    // answer two different questions. This case pins that split.
    expect(HANDLE_RULES.pattern.test('ab')).toBe(true);
    expect(HANDLE_RULES.pattern.test('a_b-c9')).toBe(true);
    expect(HANDLE_RULES.pattern.test('_abc')).toBe(false);
    expect(HANDLE_RULES.pattern.test('abc_')).toBe(false);
    expect(HANDLE_RULES.pattern.test('a b')).toBe(false);
    expect(HANDLE_RULES.pattern.test('ADA')).toBe(false); // uppercase is the normalizer's job, not the pattern's
    expect(HANDLE_RULES.minLength).toBe(3);
    expect(HANDLE_RULES.maxLength).toBe(24);
  });
});

describe('createAccountId — deterministic per (handle, device seed)', () => {
  it('is stable for one handle on one device, and differs across devices', () => {
    expect(createAccountId('ada', SEED)).toBe(createAccountId('ada', SEED));
    expect(createAccountId('ada', SEED)).not.toBe(createAccountId('ada', 'another-device'));
    expect(createAccountId('ada', SEED)).not.toBe(createAccountId('bob', SEED));
    expect(createAccountId('ada', SEED)).toMatch(/^acct-[0-9a-z]+$/);
  });

  it('refuses an empty seed, because an id that is the same on every device is not an identity', () => {
    expect(() => createAccountId('ada', '')).toThrowError(InvalidHandle);
    expect(() => createAccountId('ada', '   ')).toThrowError(InvalidHandle);
  });
});
