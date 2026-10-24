import { describe, expect, it } from 'vitest';

import { followIdFromSearch, unfollowIdFromSearch } from './followIntent';

/**
 * M7 v288 — the intent readers, graded directly.
 *
 * These modules are PURE and tiny, and that is exactly why they had no case of their own: every rule
 * they keep is a rule a page can violate with one malformed link. The rule that matters most is the
 * blank one: a URL that names an EMPTY intent names NO intent — an id of "" would open a composer over
 * nothing and a follow of "" would be asked of the service in this device's name.
 */

describe('followIntent', () => {
  it('reads its own key out of a ?-prefixed search', () => {
    expect(followIdFromSearch('?follow=pub-1')).toBe('pub-1');
    expect(unfollowIdFromSearch('?unfollow=pub-1')).toBe('pub-1');
  });

  it('accepts a bare query with no leading ? — the search a hand-built link may carry', () => {
    expect(followIdFromSearch('follow=pub-1')).toBe('pub-1');
    expect(unfollowIdFromSearch('unfollow=pub-1')).toBe('pub-1');
  });

  it('a blank or whitespace value is NO intent — null, never an empty string', () => {
    expect(followIdFromSearch('?follow=')).toBeNull();
    expect(followIdFromSearch('?follow=%20%20')).toBeNull();
    expect(unfollowIdFromSearch('?unfollow=')).toBeNull();
    expect(unfollowIdFromSearch('?unfollow=%20%20')).toBeNull();
  });

  it('an absent key is null — and the OTHER verbs’ keys are not this verb’s intent', () => {
    expect(followIdFromSearch('?unfollow=pub-1')).toBeNull();
    expect(followIdFromSearch('')).toBeNull();
    expect(followIdFromSearch('?other=pub-1')).toBeNull();
    expect(unfollowIdFromSearch('?follow=pub-1')).toBeNull();
    expect(unfollowIdFromSearch('')).toBeNull();
    expect(unfollowIdFromSearch('?other=pub-1')).toBeNull();
  });

  it('the value arrives URL-decoded — a link is allowed to encode its id', () => {
    expect(followIdFromSearch('?follow=acct%20ada')).toBe('acct ada');
    expect(unfollowIdFromSearch('?unfollow=acct%20ada')).toBe('acct ada');
  });
});
