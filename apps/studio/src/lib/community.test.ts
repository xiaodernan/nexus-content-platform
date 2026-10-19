import { describe, expect, it } from 'vitest';
import type {
  Comment,
  Follow,
  Like,
  Profile,
} from './community';
import type { AccountId } from './community';
import {
  buildFollowersIndex,
  buildFollowingIndex,
  buildProfileIndex,
  blockButtonText,
  canDeleteComment,
  commentBodyText,
  commentsFor,
  escapeHtml,
  followButtonText,
  formatSince,
  followingOf,
  isLiked,
  isMutedBy,
  likeCountFor,
  likeCountText,
  muteToggleButtonText,
  isFollowing,
  toggleFollow,
  toggleLike,
} from './community';

const now = 1_700_000_000_000;

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    accountId: 'acct-ada',
    handle: 'ada',
    ...overrides,
  } as Profile;
}

function follow(overrides: Partial<Follow> = {}): Follow {
  return {
    followerId: 'acct-ada',
    followeeId: 'acct-bob',
    createdAt: now,
    ...overrides,
  } as Follow;
}

function like(overrides: Partial<Like> = {}): Like {
  return {
    accountId: 'acct-ada',
    projectId: 'pub-1',
    createdAt: now,
    ...overrides,
  } as Like;
}

function comment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c-1',
    accountId: 'acct-ada',
    projectId: 'pub-1',
    body: 'nice',
    createdAt: now,
    deleted: false,
    ...overrides,
  } as Comment;
}

describe('community — profile index', () => {
  it('indexes profiles by accountId for O(1) lookup', () => {
    const p1 = profile({ accountId: 'acct-1', handle: 'one' });
    const p2 = profile({ accountId: 'acct-2', handle: 'two' });
    const index = buildProfileIndex([p1, p2]);
    expect(index.get('acct-1')?.handle).toBe('one');
    expect(index.get('acct-2')?.handle).toBe('two');
    expect(index.get('acct-missing')).toBeUndefined();
  });

  it('later profile wins on duplicate accountId', () => {
    const index = buildProfileIndex([
      profile({ accountId: 'acct-1', handle: 'first' }),
      profile({ accountId: 'acct-1', handle: 'second' }),
    ]);
    expect(index.get('acct-1')?.handle).toBe('second');
  });
});

describe('community — follow indexes', () => {
  it('followersIndex maps followee → set of followers', () => {
    const f1 = follow({ followerId: 'acct-a', followeeId: 'acct-target' });
    const f2 = follow({ followerId: 'acct-b', followeeId: 'acct-target' });
    const f3 = follow({ followerId: 'acct-a', followeeId: 'acct-other' });
    const index = buildFollowersIndex([f1, f2, f3]);
    expect(index.get('acct-target')).toEqual(new Set(['acct-a', 'acct-b']));
    expect(index.get('acct-other')).toEqual(new Set(['acct-a']));
    expect(index.get('acct-nobody')).toBeUndefined();
  });

  it('followingIndex maps follower → set of followees', () => {
    const f1 = follow({ followerId: 'acct-a', followeeId: 'acct-x' });
    const f2 = follow({ followerId: 'acct-a', followeeId: 'acct-y' });
    const index = buildFollowingIndex([f1, f2]);
    expect(index.get('acct-a')).toEqual(new Set(['acct-x', 'acct-y']));
    expect(index.get('acct-b')).toBeUndefined();
  });

  it('isFollowing returns true only for an exact follower→followee pair', () => {
    const follows = [follow({ followerId: 'acct-a', followeeId: 'acct-b' })];
    expect(isFollowing('acct-a', 'acct-b', follows)).toBe(true);
    expect(isFollowing('acct-b', 'acct-a', follows)).toBe(false);
    expect(isFollowing('acct-a', 'acct-c', follows)).toBe(false);
  });
});

describe('community — like count', () => {
  it('counts unique accounts per project', () => {
    const likes = [
      like({ accountId: 'acct-a', projectId: 'pub-1' }),
      like({ accountId: 'acct-b', projectId: 'pub-1' }),
      like({ accountId: 'acct-a', projectId: 'pub-1' }), // duplicate account, same project
      like({ accountId: 'acct-c', projectId: 'pub-2' }), // different project
    ];
    expect(likeCountFor('pub-1', likes)).toBe(2);
    expect(likeCountFor('pub-2', likes)).toBe(1);
    expect(likeCountFor('pub-3', likes)).toBe(0);
  });
});

describe('community — comments', () => {
  it('returns non-deleted comments for a project, oldest first', () => {
    const c1 = comment({ id: 'c-1', createdAt: now, body: 'first' });
    const c2 = comment({ id: 'c-2', createdAt: now + 1000, body: 'second' });
    const c3 = comment({ id: 'c-3', createdAt: now + 2000, body: 'third', deleted: true });
    const c4 = comment({ id: 'c-4', projectId: 'pub-2', body: 'other project' });
    const result = commentsFor('pub-1', [c1, c2, c3, c4]);
    expect(result.map((c) => c.id)).toEqual(['c-1', 'c-2']);
    expect(result.every((c) => !c.deleted)).toBe(true);
  });

  it('returns empty array when no comments match', () => {
    expect(commentsFor('pub-9', [comment()])).toEqual([]);
  });
});

describe('community — escapeHtml', () => {
  it('escapes HTML metacharacters', () => {
    expect(escapeHtml('<script>x</script>')).toBe('&lt;script&gt;x&lt;/script&gt;');
    expect(escapeHtml('a"b\'c&d<e>f')).toBe('a&quot;b&#039;c&amp;d&lt;e&gt;f');
  });

  it('leaves plain text unchanged', () => {
    expect(escapeHtml('nice comment')).toBe('nice comment');
    expect(escapeHtml('')).toBe('');
  });
});

describe('community — UI helpers', () => {
  it('followButtonText toggles with the follow state', () => {
    expect(followButtonText(false)).toBe('Follow');
    expect(followButtonText(true)).toBe('Unfollow');
  });

  it('likeCountText hides zero', () => {
    expect(likeCountText(0)).toBe('');
    expect(likeCountText(1)).toBe('1');
    expect(likeCountText(42)).toBe('42');
  });

  it('commentBodyText shows [deleted] for deleted comments', () => {
    expect(commentBodyText(comment({ deleted: true, body: 'secret' }))).toBe('[deleted]');
    expect(commentBodyText(comment({ deleted: false, body: 'nice' }))).toBe('nice');
  });
});

describe('community — permission: canDeleteComment', () => {
  const c = comment({ accountId: 'acct-author', id: 'c-1' });
  const pubOwner = 'acct-pub';

  it('comment author can delete their own comment', () => {
    expect(canDeleteComment(c, 'acct-author', pubOwner)).toBe(true);
  });

  it('publication owner can delete any comment', () => {
    expect(canDeleteComment(c, pubOwner, pubOwner)).toBe(true);
  });

  it('random viewer cannot delete', () => {
    expect(canDeleteComment(c, 'acct-stranger', pubOwner)).toBe(false);
  });

  it('no viewer (signed out) cannot delete', () => {
    expect(canDeleteComment(c, null, pubOwner)).toBe(false);
  });
});

describe('community — display: formatSince', () => {
  const now = 1_700_000_000_000;

  it('sub-minute shows just now', () => {
    expect(formatSince(now - 30_000, now)).toBe('just now');
    expect(formatSince(now - 59_999, now)).toBe('just now');
  });

  it('minutes ago', () => {
    expect(formatSince(now - 60_000, now)).toBe('1 m ago');
    expect(formatSince(now - 3_599_999, now)).toBe('59 m ago');
  });

  it('hours ago', () => {
    expect(formatSince(now - 3_600_000, now)).toBe('1 h ago');
    expect(formatSince(now - 86_399_999, now)).toBe('23 h ago');
  });

  it('days ago', () => {
    expect(formatSince(now - 86_400_000, now)).toBe('1 d ago');
    expect(formatSince(now - 200_000_000, now)).toBe('2 d ago');
  });

  it('future clock clamps to just now', () => {
    expect(formatSince(now + 1_000_000, now)).toBe('just now');
  });
});

describe('community — like: toggleLike / isLiked', () => {
  const likes = new Set<AccountId>(['acct-a', 'acct-b']);

  it('isLiked reports membership', () => {
    expect(isLiked(likes, 'acct-a')).toBe(true);
    expect(isLiked(likes, 'acct-z')).toBe(false);
  });

  it('toggleLike adds a missing like and does not mutate the input', () => {
    const next = toggleLike(likes, 'acct-z');
    expect(isLiked(next, 'acct-z')).toBe(true);
    expect(isLiked(likes, 'acct-z')).toBe(false); // input untouched
    expect(next.size).toBe(3);
    expect(likes.size).toBe(2);
  });

  it('toggleLike removes an existing like', () => {
    const next = toggleLike(likes, 'acct-a');
    expect(isLiked(next, 'acct-a')).toBe(false);
    expect(next.size).toBe(1);
    expect(isLiked(likes, 'acct-a')).toBe(true); // input untouched
  });
});

describe('community — follow: toggleFollow', () => {
  const following = new Set<AccountId>(['acct-target']);

  it('toggleFollow adds a missing follow and does not mutate the input', () => {
    const next = toggleFollow(following, 'acct-new');
    expect(next.has('acct-new')).toBe(true);
    expect(following.has('acct-new')).toBe(false); // input untouched
    expect(next.size).toBe(2);
  });

  it('toggleFollow removes an existing follow', () => {
    const next = toggleFollow(following, 'acct-target');
    expect(next.has('acct-target')).toBe(false);
    expect(next.size).toBe(0);
  });
});

describe('community — followingOf', () => {
  it('returns an empty set (in-memory placeholder; server-side later)', () => {
    const result = followingOf('acct-ada' as AccountId);
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
    expect(result.has('acct-bob')).toBe(false);
  });
});

describe('community — blockButtonText / muteToggleButtonText', () => {
  it('blockButtonText: Block when not blocked, Unblock when blocked', () => {
    expect(blockButtonText(false)).toBe('Block');
    expect(blockButtonText(true)).toBe('Unblock');
  });

  it('muteToggleButtonText: Mute when not muted, Unmute when muted', () => {
    expect(muteToggleButtonText(false)).toBe('Mute');
    expect(muteToggleButtonText(true)).toBe('Unmute');
  });
});

describe('community — isMutedBy', () => {
  const muted = new Set<AccountId>(['acct-spammer', 'acct-bot']);

  it('reports membership in muted set', () => {
    expect(isMutedBy(muted, 'acct-spammer')).toBe(true);
    expect(isMutedBy(muted, 'acct-normal')).toBe(false);
  });

  it('empty set reports nothing muted', () => {
    expect(isMutedBy(new Set(), 'acct-any')).toBe(false);
  });
});

describe('community — escapeHtml', () => {
  it('escapes & < > " and \'', () => {
    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('>')).toBe('&gt;');
    expect(escapeHtml('"')).toBe('&quot;');
    expect(escapeHtml("'")).toBe('&#039;');
  });

  it('neutralizes XSS attempt', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  it('returns empty string for empty input', () => {
    expect(escapeHtml('')).toBe('');
  });
});

describe('community — formatSince', () => {
  const now = 1_700_000_000_000;

  it('reports just now in the same second', () => {
    expect(formatSince(now, now)).toBe('just now');
    expect(formatSince(now - 1, now)).toBe('just now');
  });

  it('reports minutes ago at the 60s boundary', () => {
    expect(formatSince(now - 59_000, now)).toBe('just now');
    expect(formatSince(now - 60_000, now)).toBe('1 m ago');
  });

  it('reports hours ago at the 3600s boundary', () => {
    expect(formatSince(now - 3_600_000, now)).toBe('1 h ago');
  });

  it('reports days ago at the 86400s boundary', () => {
    expect(formatSince(now - 86_400_000, now)).toBe('1 d ago');
  });
});