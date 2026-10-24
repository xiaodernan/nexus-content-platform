import { describe, expect, it } from 'vitest';

import { commentIdFromSearch, uncommentIdFromSearch } from './commentIntent';

/**
 * M7 v286/v321 — the intent readers, graded directly.
 *
 * These modules are PURE and tiny, and that is exactly why they had no case of their own: every rule
 * they keep is a rule a page can violate with one malformed link. The rule that matters most is the
 * blank one: a URL that names an EMPTY intent names NO intent — an id of "" would open a composer over
 * nothing and a follow of "" would be asked of the service in this device's name.
 */

describe('commentIntent', () => {
  it('reads its own key out of a ?-prefixed search', () => {
    expect(commentIdFromSearch('?comment=pub-1')).toBe('pub-1');
    expect(uncommentIdFromSearch('?uncomment=pub-1')).toBe('pub-1');
  });

  it('accepts a bare query with no leading ? — the search a hand-built link may carry', () => {
    expect(commentIdFromSearch('comment=pub-1')).toBe('pub-1');
    expect(uncommentIdFromSearch('uncomment=pub-1')).toBe('pub-1');
  });

  it('a blank or whitespace value is NO intent — null, never an empty string', () => {
    expect(commentIdFromSearch('?comment=')).toBeNull();
    expect(commentIdFromSearch('?comment=%20%20')).toBeNull();
    expect(uncommentIdFromSearch('?uncomment=')).toBeNull();
    expect(uncommentIdFromSearch('?uncomment=%20%20')).toBeNull();
  });

  it('an absent key is null — and the OTHER verbs’ keys are not this verb’s intent', () => {
    expect(commentIdFromSearch('?uncomment=pub-1')).toBeNull();
    expect(commentIdFromSearch('')).toBeNull();
    expect(commentIdFromSearch('?other=pub-1')).toBeNull();
    expect(uncommentIdFromSearch('?comment=pub-1')).toBeNull();
    expect(uncommentIdFromSearch('')).toBeNull();
    expect(uncommentIdFromSearch('?other=pub-1')).toBeNull();
  });

  it('the value arrives URL-decoded — a link is allowed to encode its id', () => {
    expect(commentIdFromSearch('?comment=acct%20ada')).toBe('acct ada');
    expect(uncommentIdFromSearch('?uncomment=acct%20ada')).toBe('acct ada');
  });
});
