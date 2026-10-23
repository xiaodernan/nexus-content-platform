import { describe, expect, it } from 'vitest';

import { followIdFromSearch, unfollowIdFromSearch } from './followIntent';
import { injectFollowBar, renderFollowBar, toFollowerRow, toFollowerRows, toFollowingRow } from './followBar';
import { claimOf } from './socialClaim';

/**
 * M7 v288 — the FOLLOWERS on the profile page, and the claim a follow travels with.
 *
 * Two rules the suite grades: a count that could not be READ is not a count of zero, and the claim
 * builder is ONE builder for all three social verbs.
 */
describe('followIntent — the URL names the account (M7 v288)', () => {
  it('v343 — says WHEN a follow happened, in the service’s own style', () => {
    // The service has carried the instant since the follow's own beginning, and the tip and plan bars on
    // the same page said their dates since v341 and v342; the follow bar said nothing. A follower with
    // no date on them is a name with no history.
    const row = toFollowerRow({ followerId: 'acct-bob', handle: 'bob', createdAt: 1_700_000_000_000 });
    expect(row?.followedText).toBe('2023-11-14T22:13:20Z');
    const html = renderFollowBar({
      accountId: 'acct-ada',
      followerCount: 1,
      handle: 'ada',
      followers: [row!],
    });
    expect(html).toContain('nexus-follower-when');
  });

  it('v343 — and a wire with NO instant says nothing rather than guessing', () => {
    const row = toFollowerRow({ followerId: 'acct-bob', handle: 'bob' });
    expect(row?.followedText).toBeNull();
    const html = renderFollowBar({
      accountId: 'acct-ada',
      followerCount: 1,
      handle: 'ada',
      followers: [row!],
    });
    expect(html).not.toContain('nexus-follower-when');
  });

  it('reads the follow id out of the query', () => {
    expect(followIdFromSearch('?follow=acct-ada')).toBe('acct-ada');
    expect(followIdFromSearch('follow=acct-ada')).toBe('acct-ada');
    expect(followIdFromSearch('?a=1&follow=acct-bob&b=2')).toBe('acct-bob');
  });

  it('decodes the id, so an account id with a slash in it survives the round trip', () => {
    expect(followIdFromSearch('?follow=' + encodeURIComponent('acct/ada'))).toBe('acct/ada');
  });

  it('answers null for ABSENCE', () => {
    expect(followIdFromSearch('?follow=')).toBeNull();
    expect(followIdFromSearch('?follow=%20')).toBeNull();
    expect(followIdFromSearch('')).toBeNull();
    expect(followIdFromSearch('?like=pub-1')).toBeNull();
  });

  it('reads the unfollow id separately, and the two never collide', () => {
    expect(unfollowIdFromSearch('?unfollow=acct-ada')).toBe('acct-ada');
    expect(followIdFromSearch('?unfollow=acct-ada')).toBeNull();
    expect(unfollowIdFromSearch('?follow=acct-ada')).toBeNull();
  });
});

describe('socialClaim — ONE builder for all three social verbs (M7 v288)', () => {
  it('is built from the device’s own account', () => {
    const claim = claimOf('acct-ada', 'ada', 'unsigned-local');
    expect(claim).toEqual({
      accountId: 'acct-ada',
      handle: 'ada',
      assurance: 'unsigned-local',
      claimedAt: null,
    });
  });

  it('a device with NO account has NO claim — the client never invents an actor', () => {
    expect(claimOf(null, null, null)).toBeNull();
    expect(claimOf('   ', 'ada', 'unsigned-local')).toBeNull();
  });

  it('a claim without a handle is still a claim — the account id is the identity', () => {
    const claim = claimOf('acct-ada', null, null);
    expect(claim).not.toBeNull();
    expect(claim!.accountId).toBe('acct-ada');
    expect(claim!.handle).toBeNull();
  });
});

describe('followBar — the bar on the profile page (M7 v288)', () => {
  it('states the count and offers the follow', () => {
    const html = renderFollowBar({ accountId: 'acct-ada', followerCount: 3, handle: 'ada' });
    expect(html).toContain('data-followers="3"');
    expect(html).toContain('3 followers');
    expect(html).toContain('href="/?follow=acct-ada"');
    expect(html).toContain('Follow @ada');
  });

  it('says "1 follower" for one', () => {
    expect(renderFollowBar({ accountId: 'acct-ada', followerCount: 1 })).toContain('1 follower');
    expect(renderFollowBar({ accountId: 'acct-ada', followerCount: 1 })).not.toContain('1 followers');
  });

  it('ZERO followers is something to say — it is a fact, and it is different from a failed read', () => {
    const html = renderFollowBar({ accountId: 'acct-ada', followerCount: 0 });
    expect(html).toContain('data-followers="0"');
    expect(html).toContain('0 followers');
  });

  it('a count that could NOT be read is NOT zero — the bar is left out entirely', () => {
    // "0 followers" and "the followers could not be read" are different facts, and a page that showed the
    // first when it knew the second would make a reader conclude nobody is watching.
    expect(renderFollowBar({ accountId: 'acct-ada', followerCount: null, reason: 'the service is down' })).toBe('');
  });

  it('it does NOT claim YOU follow them — the page cannot know who is asking', () => {
    const html = renderFollowBar({ accountId: 'acct-ada', followerCount: 3 });
    expect(html).not.toContain('Following');
    expect(html).not.toContain('Unfollow');
  });

  it('encodes the account id in the link', () => {
    expect(renderFollowBar({ accountId: 'a/b c', followerCount: 1 })).toContain('href="/?follow=a%2Fb%20c"');
  });

  it('escapes caller-controlled text', () => {
    const html = renderFollowBar({ accountId: '<script>x</script>', followerCount: 1, handle: '<script>y</script>' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('%3Cscript%3E');
  });

  it('inserts the bar before the closing body tag', () => {
    const page = '<html><body><div>profile</div></body></html>';
    const out = injectFollowBar(page, '<div class="nexus-followers"></div>');
    expect(out).toContain('<div>profile</div><div class="nexus-followers"></div></body>');
  });

  it('an EMPTY bar inserts nothing, and a page without a body tag is left alone', () => {
    const page = '<html><body><div>profile</div></body></html>';
    expect(injectFollowBar(page, '')).toBe(page);
    const noBody = '<html><div>profile</div></html>';
    expect(injectFollowBar(noBody, '<div></div>')).toBe(noBody);
  });
});

describe('followBar — the OTHER direction of the edge (M9 v303)', () => {
  it('the bar carries the accounts the account FOLLOWS, in the SAME bar', () => {
    // Two floating panels saying "followers" and "following" would be two panels a person has to read
    // together to learn one thing: the shape of this account's social life.
    const html = renderFollowBar({
      accountId: 'acct-ada',
      followerCount: 2,
      following: toFollowerRows([{ followerId: 'acct-bob', handle: 'bob', assurance: 'unsigned-local' }]),
      followingCount: 1,
    });
    expect(html).toContain('data-following="1"');
    expect(html).toContain('data-following="acct-bob"');
    expect(html).toContain('href="/u/acct-bob"');
    expect(html).toContain('1 following');
  });

  it('the two lists are told apart \u2014 a follower is not a following', () => {
    const html = renderFollowBar({
      accountId: 'acct-ada',
      followerCount: 1,
      followers: toFollowerRows([{ followerId: 'acct-carol', handle: 'carol', assurance: 'unsigned-local' }]),
      following: toFollowerRows([{ followerId: 'acct-bob', handle: 'bob', assurance: 'unsigned-local' }]),
      followingCount: 1,
    });
    expect(html).toContain('data-follower="acct-carol"');
    expect(html).toContain('data-following="acct-bob"');
  });

  it('an account that follows nobody says so, in the count', () => {
    const html = renderFollowBar({ accountId: 'acct-ada', followerCount: 1, following: [], followingCount: 0 });
    expect(html).toContain('data-following="0"');
  });
});

describe('followBar — the follower LIST (M9 v292)', () => {
  it('names the follower by its handle, with the assurance its claim carried', () => {
    const row = toFollowerRow({ followerId: 'acct-bob', handle: 'bob', assurance: 'unsigned-local' })!;
    expect(row.accountId).toBe('acct-bob');
    expect(row.nameText).toBe('@bob');
    expect(row.assurance).toBe('unsigned-local');
  });

  it('falls back to the ACCOUNT id when the claim carried no handle', () => {
    const row = toFollowerRow({ followerId: 'acct-bob' })!;
    expect(row.nameText).toBe('acct-bob');
    expect(row.assurance).toBeNull();
  });

  it('a follower with no id is DROPPED — an address nobody could reach is not a follower to show', () => {
    expect(toFollowerRow({ handle: 'bob' })).toBeNull();
    expect(toFollowerRow({ followerId: '' })).toBeNull();
    expect(toFollowerRow(null)).toBeNull();
  });

  it('the list keeps the service\u2019s order and drops what it cannot show', () => {
    const rows = toFollowerRows([
      { followerId: 'acct-bob', handle: 'bob' },
      { handle: 'nobody' },
      { followerId: 'acct-ada', handle: 'ada' },
    ]);
    expect(rows.map((r) => r.accountId)).toEqual(['acct-bob', 'acct-ada']);
  });

  it('the bar renders the followers as LINKS to their own profiles', () => {
    const rows = toFollowerRows([{ followerId: 'acct-bob', handle: 'bob', assurance: 'unsigned-local' }]);
    const html = renderFollowBar({ accountId: 'acct-ada', followerCount: 1, followers: rows });
    expect(html).toContain('data-follower="acct-bob"');
    expect(html).toContain('href="/u/acct-bob"');
    expect(html).toContain('@bob · unsigned-local');
  });

  it('escapes caller-controlled text in the follower\u2019s name', () => {
    const rows = toFollowerRows([{ followerId: 'acct-x', handle: '<script>y</script>' }]);
    const html = renderFollowBar({ accountId: 'acct-ada', followerCount: 1, followers: rows });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('followBar — the bar PAGES both of its lists (M7 v397)', () => {
  // The followers list was the one list on the profile page a reader could not page (v397): the
  // following direction has paged since v390, and the tip and plan bars on the same page since v395
  // and v396. Both lists in this bar page now, each on its own URL parameter, as LINKS — the page
  // is server-rendered and cannot act (ADR 0018).
  const followersPageHref = (offset: number) => `/u/acct-ada?followersOffset=${offset}`;
  const followingPageHref = (offset: number) => `/u/acct-ada?followingOffset=${offset}`;
  const twoFollowers = () => toFollowerRows([{ followerId: 'acct-bob', handle: 'bob' }, { followerId: 'acct-cyd', handle: 'cyd' }]);
  const twoFollowing = () => [toFollowingRow({ followeeId: 'acct-dee', handle: 'dee' })!, toFollowingRow({ followeeId: 'acct-eve', handle: 'eve' })!];

  it('the first window says it is the newest, and not the only', () => {
    const html = renderFollowBar({ accountId: 'acct-ada', followerCount: 5, followers: twoFollowers(), followersOffset: 0, followersLimit: 2, followersPageHref });
    expect(html).toContain('showing the 2 newest of 5');
  });

  it('a later window says WHICH followers it is showing', () => {
    // "the 2 newest" is a true thing about the first window and a false thing about the third
    // (v386's correction, the shared wording the tip and plan bars received in v395 and v396).
    const html = renderFollowBar({ accountId: 'acct-ada', followerCount: 10, followers: twoFollowers(), followersOffset: 4, followersLimit: 2, followersPageHref });
    expect(html).toContain('showing 5–6 of 10');
    expect(html).not.toContain('newest');
  });

  it('an empty window past the end says so — it is not "nobody follows this account"', () => {
    // v288 kept a count of zero and an unreadable count apart; v397 adds the third case: a window
    // PAST the end is empty because the PAGE is past the end, not because nobody follows.
    const html = renderFollowBar({ accountId: 'acct-ada', followerCount: 5, followers: [], followersOffset: 4, followersLimit: 2, followersPageHref });
    expect(html).toContain('this page is past the end — the service answered an empty window');
    expect(html).toContain('data-followers="5"');
  });

  it('but an empty FIRST window is still just the count', () => {
    const html = renderFollowBar({ accountId: 'acct-ada', followerCount: 0, followers: [], followersOffset: 0, followersLimit: 20, followersPageHref });
    expect(html).toContain('data-followers="0"');
    expect(html).not.toContain('showing');
    expect(html).not.toContain('nexus-followers-pager');
  });

  it('the followers pager is links, and a boundary is a span with no href', () => {
    const first = renderFollowBar({ accountId: 'acct-ada', followerCount: 5, followers: twoFollowers(), followersOffset: 0, followersLimit: 2, followersPageHref });
    expect(first).toContain('<span class="nexus-followers-page" data-followers-page="newer"');
    expect(first).toContain('<a class="nexus-followers-page" data-followers-page="older" href="/u/acct-ada?followersOffset=2"');
    const last = renderFollowBar({ accountId: 'acct-ada', followerCount: 5, followers: twoFollowers(), followersOffset: 4, followersLimit: 2, followersPageHref });
    expect(last).toContain('<a class="nexus-followers-page" data-followers-page="newer" href="/u/acct-ada?followersOffset=2"');
    expect(last).toContain('<span class="nexus-followers-page" data-followers-page="older"');
  });

  it('"Older" is not offered when the next window would hold nothing', () => {
    const html = renderFollowBar({ accountId: 'acct-ada', followerCount: 5, followers: [], followersOffset: 4, followersLimit: 2, followersPageHref });
    expect(html).toContain('<span class="nexus-followers-page" data-followers-page="older"');
    expect(html).not.toContain('data-followers-page="older" href');
  });

  it('the OTHER list in the same bar pages too, on its own links', () => {
    // One bar, two lists, two independent windows: a reader on followers page 2 can be on following
    // page 1, and the two pagers must not be the same pager.
    const html = renderFollowBar({
      accountId: 'acct-ada',
      followerCount: 5,
      followers: twoFollowers(),
      followersOffset: 0,
      followersLimit: 2,
      followersPageHref,
      following: twoFollowing(),
      followingCount: 4,
      followingOffset: 2,
      followingLimit: 2,
      followingPageHref,
    });
    expect(html).toContain('showing 3–4 of 4');
    expect(html).toContain('<a class="nexus-followers-page" data-following-page="newer" href="/u/acct-ada?followingOffset=0"');
    expect(html).toContain('<span class="nexus-followers-page" data-following-page="older"');
  });

  it('an empty following window past the end says so, and the followers window line is untouched', () => {
    const html = renderFollowBar({
      accountId: 'acct-ada',
      followerCount: 5,
      followers: twoFollowers(),
      followersOffset: 0,
      followersLimit: 2,
      followersPageHref,
      following: [],
      followingCount: 3,
      followingOffset: 2,
      followingLimit: 2,
      followingPageHref,
    });
    // The following list is EMPTY, so its half of the bar is not drawn at all — the followers window
    // line beside it is unaffected by a list that is not on the page.
    expect(html).toContain('showing the 2 newest of 5');
    expect(html).not.toContain('data-following-page');
  });

  it('a bar given no builders draws no pagers — only the counts', () => {
    const html = renderFollowBar({
      accountId: 'acct-ada',
      followerCount: 5,
      followers: twoFollowers(),
      following: twoFollowing(),
      followingCount: 5,
    });
    expect(html).toContain('showing the 2 newest of 5');
    expect(html).not.toContain('nexus-followers-pager');
  });
});
