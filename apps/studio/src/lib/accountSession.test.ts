import { describe, expect, it } from 'vitest';
import { accountSession } from './accountSession';
import { createAccountId } from './accounts';
import { memoryStore, type KvStore } from './storage';

/** Fixed clock + uuid, so every id and instant in this file is a known value, not wall time. */
function testSession(store: KvStore = memoryStore(), uuid = () => 'seed-fixed-0000') {
  return { store, session: accountSession({ store, now: () => 1_700_000_000_000, uuid }) };
}

describe('accountSession — register', () => {
  it('registers a valid handle as an unsigned-local account and persists it', () => {
    const { store, session } = testSession();
    const result = session.register('PixelFox', 'Pixel Fox');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.account).toEqual({
      id: createAccountId('pixelfox', 'seed-fixed-0000'),
      handle: 'pixelfox',
      displayName: 'Pixel Fox',
      createdAt: 1_700_000_000_000,
      assurance: 'unsigned-local',
    });
    // The record survives the instance: a fresh session over the same store reads it back.
    expect(accountSession({ store, now: () => 0, uuid: () => 'x' }).current()).toEqual(result.account);
    expect(store.getItem('nexus-device-seed')).toBe('seed-fixed-0000');
  });

  it('defaults the display name to the normalized handle when none is given', () => {
    const { session } = testSession();
    const result = session.register('  Kit_9  ');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.account.handle).toBe('kit_9');
    expect(result.account.displayName).toBe('kit_9');
  });

  it('refuses an invalid handle with the rule\'s own reason and writes NOTHING', () => {
    const { store, session } = testSession();
    const result = session.register('x');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.length).toBeGreaterThan(0);
    expect(session.current()).toBe(null);
    expect(store.getItem('nexus-current-account')).toBe(null);
    expect(store.getItem('nexus-device-seed')).toBe(null);
  });

  it('REFUSES to replace an existing account — a takeover is sign out first, in data', () => {
    const { session } = testSession();
    const first = session.register('first-one');
    expect(first.ok).toBe(true);

    const second = session.register('second-one');
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toContain('sign out first');
    // The original account is untouched: refusal means nothing was written.
    expect(session.current()?.handle).toBe('first-one');
  });
});

describe('accountSession — the device seed is why the id survives', () => {
  it('signOut forgets the name but keeps the seed, so re-registering the same handle yields the SAME id', () => {
    const { store } = testSession();
    const before = accountSession({ store, now: () => 1, uuid: () => 'seed-fixed-0000' });
    const created = before.register('same-handle');
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const idBefore = created.account.id;

    before.signOut();
    expect(before.current()).toBe(null);
    expect(store.getItem('nexus-device-seed')).toBe('seed-fixed-0000');

    const after = accountSession({ store, now: () => 2, uuid: () => 'a-different-seed-that-must-not-be-used' });
    const again = after.register('same-handle');
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.account.id).toBe(idBefore);
    expect(again.account.createdAt).toBe(2);
  });

  it('never derives an id from the injected uuid when a seed is already stored', () => {
    const { store } = testSession(memoryStore(), () => 'first-seed');
    const s1 = accountSession({ store, now: () => 1, uuid: () => 'first-seed' });
    expect(s1.register('alpha').ok).toBe(true);
    s1.signOut();
    const s2 = accountSession({ store, now: () => 2, uuid: () => 'second-seed-must-be-ignored' });
    const result = s2.register('alpha');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.account.id).toBe(createAccountId('alpha', 'first-seed'));
  });
});

describe('accountSession — rename', () => {
  it('changes the display name only: handle, id, createdAt and assurance are pinned', () => {
    const { session } = testSession();
    const created = session.register('pin-name', 'Old Name');
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const renamed = session.rename('  New Name  ');
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;
    expect(renamed.account.displayName).toBe('New Name');
    expect(renamed.account.handle).toBe('pin-name');
    expect(renamed.account.id).toBe(created.account.id);
    expect(renamed.account.createdAt).toBe(created.account.createdAt);
    expect(renamed.account.assurance).toBe('unsigned-local');
  });

  it('refuses an empty or non-string display name with a reason a person can read', () => {
    const { session } = testSession();
    expect(session.register('has-name').ok).toBe(true);

    for (const bad of ['', '   ', 42, null, undefined, {}]) {
      const result = session.rename(bad);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.reason).toBe('display name cannot be empty');
    }
    expect(session.current()?.displayName).toBe('has-name');
  });

  it('refuses when no account is set, rather than creating a nameless one', () => {
    const { session } = testSession();
    const result = session.rename('Ghost');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('no account');
    expect(session.current()).toBe(null);
  });
});

describe('accountSession — corrupt storage is "no account", never a crash', () => {
  it('reads a hand-edited/rotten JSON blob as null and can register over it', () => {
    const store = memoryStore({ 'nexus-current-account': '{not json' });
    const session = accountSession({ store, now: () => 1, uuid: () => 'seed' });
    expect(session.current()).toBe(null);
    expect(session.register('after-corrupt').ok).toBe(true);
    expect(session.current()?.handle).toBe('after-corrupt');
  });
});

describe('accountSession — more refusal edges', () => {
  it('a whitespace-only displayName falls back to the handle', () => {
    const { session } = testSession();
    const result = session.register('falls-back', '   ');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.account.displayName).toBe('falls-back');
  });

  it('non-string handles are refused with the rule\'s own reason and write nothing', () => {
    const { store, session } = testSession();
    for (const bad of [42, null, undefined, {}, true]) {
      const result = session.register(bad);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.reason.length).toBeGreaterThan(0);
    }
    expect(session.current()).toBe(null);
    expect(store.getItem('nexus-current-account')).toBe(null);
  });

  it('rename persists: a fresh session over the same store reads the new display name', () => {
    const { store, session } = testSession();
    expect(session.register('persist-me', 'Old').ok).toBe(true);
    expect(session.rename('Brand New').ok).toBe(true);
    const fresh = accountSession({ store, now: () => 0, uuid: () => 'other' });
    expect(fresh.current()?.displayName).toBe('Brand New');
    expect(fresh.current()?.handle).toBe('persist-me');
  });
});
