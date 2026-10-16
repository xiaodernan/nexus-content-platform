import { describe, expect, it } from 'vitest';
import type {
  Comment,
  Follow,
  Like,
  Profile,
} from './community';
import {
  buildFollowersIndex,
  buildFollowingIndex,
  buildProfileIndex,
  commentsFor,
  escapeHtml,
  likeCountFor,
  isFollowing,
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