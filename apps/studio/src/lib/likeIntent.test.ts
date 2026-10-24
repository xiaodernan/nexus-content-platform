import { describe, expect, it } from 'vitest';

import { likeIdFromSearch, unlikeIdFromSearch } from './likeIntent';

/**
 * M7 v284 — the intent readers, graded directly.
 *
 * These modules are PURE and tiny, and that is exactly why they had no case of their own: every rule
 * they keep is a rule a page can violate with one malformed link. The rule that matters most is the
 * blank one: a URL that names an EMPTY intent names NO intent — an id of "" would open a composer over
 * nothing and a follow of "" would be asked of the service in this device's name.
 */

describe('likeIntent', () => {
  it('reads its own key out of a ?-prefixed search', () => {
    expect(likeIdFromSearch('?like=pub-1')).toBe('pub-1');
    expect(unlikeIdFromSearch('?unlike=pub-1')).toBe('pub-1');
  });

  it('accepts a bare query with no leading ? — the search a hand-built link may carry', () => {
    expect(likeIdFromSearch('like=pub-1')).toBe('pub-1');
    expect(unlikeIdFromSearch('unlike=pub-1')).toBe('pub-1');
  });

  it('a blank or whitespace value is NO intent — null, never an empty string', () => {
    expect(likeIdFromSearch('?like=')).toBeNull();
    expect(likeIdFromSearch('?like=%20%20')).toBeNull();
    expect(unlikeIdFromSearch('?unlike=')).toBeNull();
    expect(unlikeIdFromSearch('?unlike=%20%20')).toBeNull();
  });

  it('an absent key is null — and the OTHER verbs’ keys are not this verb’s intent', () => {
    expect(likeIdFromSearch('?unlike=pub-1')).toBeNull();
    expect(likeIdFromSearch('')).toBeNull();
    expect(likeIdFromSearch('?other=pub-1')).toBeNull();
    expect(unlikeIdFromSearch('?like=pub-1')).toBeNull();
    expect(unlikeIdFromSearch('')).toBeNull();
    expect(unlikeIdFromSearch('?other=pub-1')).toBeNull();
  });

  it('the value arrives URL-decoded — a link is allowed to encode its id', () => {
    expect(likeIdFromSearch('?like=acct%20ada')).toBe('acct ada');
    expect(unlikeIdFromSearch('?unlike=acct%20ada')).toBe('acct ada');
  });
});
