import { afterEach, describe, expect, it } from 'vitest';
import { currentAccountStore, currentAccount, type KeyValueStore } from './currentAccount';
import { AccountRegistry, isOwnerClaim, type AccountRecord } from './accounts';

function fakeStore(): KeyValueStore & { calls: string[]; data: string } {
  let data = '';
  const calls: string[] = [];
  return {
    getItem: () => data,
    setItem: (key: string, value: string) => {
      calls.push(`set:${key}`);
      data = value;
    },
    removeItem: () => {
      calls.push('remove');
      data = '';
    },
    calls,
    get data(): string {
      return data;
    },
    set data(value: string) {
      data = value;
    },
  };
}

function aRecord(overrides: Partial<AccountRecord> = {}): AccountRecord {
  const registry = new AccountRegistry();
  const now = 1_700_000_000_000;
  return registry.register('nexus-user', 'Nexus User', { deviceSeed: 'seed-1', now });
}

describe('currentAccount — store boundary', () => {
  it('getCurrentAccount is null when nothing is stored', () => {
    const store = fakeStore();
    const acct = currentAccountStore(store);
    expect(acct.getCurrentAccount()).toBeNull();
    expect(acct.hasCurrentAccount()).toBe(false);
  });

  it('setCurrentAccount then getCurrentAccount round-trips', () => {
    const store = fakeStore();
    const acct = currentAccountStore(store);
    const account = aRecord();
    acct.setCurrentAccount(account);
    expect(acct.getCurrentAccount()).toEqual(account);
    expect(acct.hasCurrentAccount()).toBe(true);
    expect(store.calls).toContain('set:nexus-current-account');
  });

  it('clearCurrentAccount forgets the account', () => {
    const store = fakeStore();
    const acct = currentAccountStore(store);
    acct.setCurrentAccount(aRecord());
    acct.clearCurrentAccount();
    expect(acct.getCurrentAccount()).toBeNull();
    expect(acct.hasCurrentAccount()).toBe(false);
    expect(store.calls).toContain('remove');
  });

  it('setCurrentAccount replaces an earlier account', () => {
    const store = fakeStore();
    const acct = currentAccountStore(store);
    acct.setCurrentAccount(aRecord());
    const registry = new AccountRegistry();
    const now = 1_700_000_000_000;
    const second = registry.register('other-user', 'Other', { deviceSeed: 'seed-2', now });
    acct.setCurrentAccount(second);
    expect(acct.getCurrentAccount()?.handle).toBe('other-user');
    expect(store.calls.filter((c) => c.startsWith('set:'))).toHaveLength(2);
  });

  it('corrupt stored JSON is treated as no account, not a crash', () => {
    const store = fakeStore();
    (store as { data: string }).data = 'not-json{{';
    const acct = currentAccountStore(store);
    expect(acct.getCurrentAccount()).toBeNull();
    expect(acct.hasCurrentAccount()).toBe(false);
  });

  it('stored JSON missing id or handle is treated as no account', () => {
    const store = fakeStore();
    (store as { data: string }).data = JSON.stringify({ handle: 'no-id' });
    const acct = currentAccountStore(store);
    expect(acct.getCurrentAccount()).toBeNull();
  });
});

describe('currentAccount — owner claim', () => {
  it('currentOwnerClaim returns null when no account is set', () => {
    const store = fakeStore();
    const acct = currentAccountStore(store);
    expect(acct.currentOwnerClaim(1_700_000_000_000)).toBeNull();
  });

  it('currentOwnerClaim carries the account id, handle, assurance and claimedAt', () => {
    const store = fakeStore();
    const acct = currentAccountStore(store);
    const now = 1_700_000_000_000;
    acct.setCurrentAccount(aRecord());
    const claim = acct.currentOwnerClaim(now);
    expect(claim).not.toBeNull();
    expect(claim!.kind).toBe('owner-claim');
    expect(claim!.assurance).toBe('unsigned-local');
    expect(claim!.claimedAt).toBe(now);
    expect(typeof claim!.accountId).toBe('string');
    expect(claim!.accountId.startsWith('acct-')).toBe(true);
    expect(claim!.handle).toBe('nexus-user');
  });

  it('currentOwnerClaim is shaped like what the service accepts', () => {
    const store = fakeStore();
    const acct = currentAccountStore(store);
    acct.setCurrentAccount(aRecord());
    const claim = acct.currentOwnerClaim(1_700_000_000_000)!;
    expect(isOwnerClaim(claim)).toBe(true);
  });

  it('currentOwnerClaim uses the supplied now, so the same account yields different claimedAt across calls', () => {
    const store = fakeStore();
    const acct = currentAccountStore(store);
    acct.setCurrentAccount(aRecord());
    const first = acct.currentOwnerClaim(1_700_000_000_000)!;
    const second = acct.currentOwnerClaim(1_700_000_001_000)!;
    expect(first.claimedAt).toBe(1_700_000_000_000);
    expect(second.claimedAt).toBe(1_700_000_001_000);
    expect(first.accountId).toBe(second.accountId);
    expect(first.handle).toBe(second.handle);
  });

  it('the exported singleton answers like a constructed store', () => {
    expect(typeof currentAccount.getCurrentAccount).toBe('function');
    expect(typeof currentAccount.setCurrentAccount).toBe('function');
    expect(typeof currentAccount.clearCurrentAccount).toBe('function');
    expect(typeof currentAccount.hasCurrentAccount).toBe('function');
    expect(typeof currentAccount.currentOwnerClaim).toBe('function');
  });

  it('stored JSON with non-string id or handle is treated as no account', () => {
    const store = fakeStore();
    (store as { data: string }).data = JSON.stringify({ id: 123, handle: 'ada' });
    expect(currentAccountStore(store).getCurrentAccount()).toBeNull();
    (store as { data: string }).data = JSON.stringify({ id: 'acct-ada', handle: 456 });
    expect(currentAccountStore(store).getCurrentAccount()).toBeNull();
  });

  it('stored JSON with extra unknown fields still round-trips (forward compatible)', () => {
    const store = fakeStore();
    const acct = currentAccountStore(store);
    const account = aRecord();
    const enriched = { ...account, extra: { notes: 'later schema' } };
    acct.setCurrentAccount(enriched);
    const back = acct.getCurrentAccount();
    expect(back?.id).toBe(account.id);
    expect(back?.handle).toBe(account.handle);
    expect((back as { extra?: unknown }).extra).toEqual({ notes: 'later schema' });
  });

  it("literal 'null', an array, and JSON primitives are all treated as no account", () => {
    const store = fakeStore();
    for (const raw of ['null', '[]', '5', '"a string"']) {
      (store as { data: string }).data = raw;
      expect(currentAccountStore(store).getCurrentAccount()).toBeNull();
    }
  });

  it('clearCurrentAccount also drops the owner claim', () => {
    const store = fakeStore();
    const acct = currentAccountStore(store);
    acct.setCurrentAccount(aRecord());
    expect(acct.currentOwnerClaim(1_700_000_000_000)).not.toBeNull();
    acct.clearCurrentAccount();
    expect(acct.currentOwnerClaim(1_700_000_000_000)).toBeNull();
  });
});