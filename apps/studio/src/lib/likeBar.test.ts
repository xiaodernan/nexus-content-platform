import { describe, expect, it } from 'vitest';

import { likeClaimOf, likeIdFromSearch, unlikeIdFromSearch } from './likeIntent';
import { injectLikeBar, renderLikeBar } from './likeBar';

/**
 * M7 v284 — the LIKE intent and the LIKES bar.
 *
 * Two rules the suite grades: the intent is read out of the URL the artifact page links, and a count
 * that could not be READ is not a count of zero.
 */
describe('likeIntent — the URL names the publication (M7 v284)', () => {
  it('reads the like id out of the query', () => {
    expect(likeIdFromSearch('?like=pub-1')).toBe('pub-1');
    expect(likeIdFromSearch('like=pub-1')).toBe('pub-1');
    expect(likeIdFromSearch('?a=1&like=pub-2&b=2')).toBe('pub-2');
  });

  it('decodes the id, so a project id with a slash in it survives the round trip', () => {
    expect(likeIdFromSearch('?like=' + encodeURIComponent('my pub/id'))).toBe('my pub/id');
  });

  it('answers null for ABSENCE \u2014 a bare ?like= is not a project named ""', () => {
    expect(likeIdFromSearch('?like=')).toBeNull();
    expect(likeIdFromSearch('?like=%20')).toBeNull();
    expect(likeIdFromSearch('')).toBeNull();
    expect(likeIdFromSearch('?other=pub-1')).toBeNull();
  });

  it('reads the unlike id separately, and the two never collide', () => {
    expect(unlikeIdFromSearch('?unlike=pub-1')).toBe('pub-1');
    expect(likeIdFromSearch('?unlike=pub-1')).toBeNull();
    expect(unlikeIdFromSearch('?like=pub-1')).toBeNull();
  });
});

describe('likeIntent — the claim the like travels with (M7 v284)', () => {
  it('is built from the device\u2019s own account', () => {
    const claim = likeClaimOf('acct-ada', 'ada', 'unsigned-local');
    expect(claim).toEqual({
      accountId: 'acct-ada',
      handle: 'ada',
      assurance: 'unsigned-local',
      claimedAt: null,
    });
  });

  it('a device with NO account has NO claim \u2014 the client never invents an actor', () => {
    // An invented account id would be a like nobody made, and the service would record it as a fact.
    expect(likeClaimOf(null, null, null)).toBeNull();
    expect(likeClaimOf('   ', 'ada', 'unsigned-local')).toBeNull();
  });

  it('a claim without a handle is still a claim \u2014 the account id is the identity', () => {
    const claim = likeClaimOf('acct-ada', null, null);
    expect(claim).not.toBeNull();
    expect(claim!.accountId).toBe('acct-ada');
    expect(claim!.handle).toBeNull();
  });
});

describe('likeBar — the bar on the artifact page (M7 v284)', () => {
  it('states the count and offers the like', () => {
    const html = renderLikeBar({ projectId: 'pub-1', count: 3 });
    expect(html).toContain('data-likes="3"');
    expect(html).toContain('3 likes');
    expect(html).toContain('href="/?like=pub-1"');
  });

  it('says "1 like" for one, because a count of one is not a count of many', () => {
    expect(renderLikeBar({ projectId: 'pub-1', count: 1 })).toContain('1 like');
    expect(renderLikeBar({ projectId: 'pub-1', count: 1 })).not.toContain('1 likes');
  });

  it('ZERO likes is something to say \u2014 it is a fact, and it is different from a failed read', () => {
    const html = renderLikeBar({ projectId: 'pub-1', count: 0 });
    expect(html).toContain('data-likes="0"');
    expect(html).toContain('0 likes');
  });

  it('a count that could NOT be read is NOT zero \u2014 the bar is left out entirely', () => {
    // "0 likes" and "the likes could not be read" are different facts, and a page that showed the first
    // when it knew the second would make a reader conclude nobody cared.
    expect(renderLikeBar({ projectId: 'pub-1', count: null, reason: 'the service is down' })).toBe('');
  });

  it('it does NOT claim YOU liked it \u2014 the page cannot know who is asking', () => {
    const html = renderLikeBar({ projectId: 'pub-1', count: 3 });
    expect(html).not.toContain('Liked');
    expect(html).not.toContain('liked');
  });

  it('v320 — it also offers the TAKING-BACK, as a link to the Studio', () => {
    // The chain was already whole — the intent, the lane, the Studio’s door, the service’s door — and
    // nothing in the product pointed at it. A capability with no door is a capability nobody can reach.
    const html = renderLikeBar({ projectId: 'pub-1', count: 3 });
    expect(html).toContain('href="/?unlike=pub-1"');
    expect(html).toContain('Take it back');
  });

  it('v320 — and the taking-back is an OFFER, not a claim: the page still cannot say you liked it', () => {
    // The word "liked" is the claim; the offer must not make it. "Take it back" is an action, and the
    // service’s answer is what says whether there was a like to take back.
    const html = renderLikeBar({ projectId: 'pub-1', count: 3 });
    expect(html).not.toContain('Liked');
    expect(html).not.toContain('liked');
  });

  it('encodes the project id in the link', () => {
    expect(renderLikeBar({ projectId: 'a/b c', count: 1 })).toContain('href="/?like=a%2Fb%20c"');
  });

  it('escapes caller-controlled text', () => {
    const html = renderLikeBar({ projectId: '<script>x</script>', count: 1 });
    expect(html).not.toContain('<script>');
    expect(html).toContain('%3Cscript%3E');
  });
});

describe('likeBar — the bar is inserted into the artifact page (M7 v284)', () => {
  it('inserts the bar before the closing body tag', () => {
    const page = '<html><body><div>artifact</div></body></html>';
    const out = injectLikeBar(page, '<div class="nexus-likes"></div>');
    expect(out).toContain('<div>artifact</div><div class="nexus-likes"></div></body>');
  });

  it('an EMPTY bar inserts nothing', () => {
    const page = '<html><body><div>artifact</div></body></html>';
    expect(injectLikeBar(page, '')).toBe(page);
  });

  it('a preview with no closing body tag is returned unchanged rather than corrupted', () => {
    const page = '<html><div>artifact</div></html>';
    expect(injectLikeBar(page, '<div></div>')).toBe(page);
  });
});
