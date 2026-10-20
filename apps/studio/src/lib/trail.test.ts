import { describe, expect, it } from 'vitest';

import { toTrailRow, toTrailRows, trailActionText, trailActorText } from './trail';

/**
 * M9 v272 — the AUDIT TRAIL's reading half.
 *
 * v271 gave the service a trail; this is the half that turns it into facts a person can act on. Two limits
 * are pinned here because they are the ones a reader will meet first: the trail names ACCOUNT IDS (the
 * service has no account table to resolve them with), and an entry with no actor says NOBODY rather than
 * being dropped.
 */
const entry = (over: Record<string, unknown> = {}) => ({
  id: '7',
  action: 'publish',
  actorId: 'acct-ada',
  targetId: 'pub-1',
  createdAt: 1_776_000_000_000,
  assurance: 'unsigned-local',
  ...over,
});

describe('trail — one entry becomes one row (M9 v272)', () => {
  it('keeps the service’s own words for what happened, and the account id that did it', () => {
    const row = toTrailRow(entry())!;
    expect(row.id).toBe('7');
    expect(row.action).toBe('publish');
    expect(row.actorText).toBe('acct-ada · unsigned-local');
    expect(row.targetId).toBe('pub-1');
    expect(row.anonymous).toBe(false);
  });

  it('spells a known action the way a person would say it', () => {
    expect(trailActionText('publish')).toBe('published');
    expect(trailActionText('unpublish')).toBe('took down');
  });

  it('PASSES AN UNKNOWN ACTION THROUGH — a trail that could not recognise an action must not invent one', () => {
    // `follow`/`like`/`comment`/`tip` are in the client's model but do not exist server-side yet. If one
    // ever arrives, the panel must show it as it is rather than relabelling it as something it knows.
    expect(trailActionText('follow')).toBe('follow');
    expect(toTrailRow(entry({ action: 'follow' }))!.actionText).toBe('follow');
  });

  it('an entry with NO actor says nobody — the one place the client’s own type is wrong', () => {
    const row = toTrailRow(entry({ actorId: null, assurance: null }))!;
    expect(row.anonymous).toBe(true);
    expect(row.actorText).toBe('nobody (anonymous)');
    // `ops.ts` declares `actorId: AccountId` non-null; the service sends null for an anonymous publish and
    // will not fake an actor to fit a type (v271).
  });

  it('an actor with NO assurance is shown without one rather than with a borrowed one', () => {
    expect(trailActorText('acct-ada', null)).toBe('acct-ada');
    expect(toTrailRow(entry({ assurance: null }))!.actorText).toBe('acct-ada');
  });

  it('reads the instant as the client’s unit and shows it as UTC to the second', () => {
    const row = toTrailRow(entry())!;
    expect(row.createdAt).toBe(1_776_000_000_000);
    expect(row.timeText).toBe('2026-04-12T13:20:00Z');
  });

  it('a row it cannot display HONESTLY is dropped, not faked', () => {
    expect(toTrailRow(null)).toBeNull();
    expect(toTrailRow('a string')).toBeNull();
    expect(toTrailRow(entry({ id: '' }))).toBeNull();
    expect(toTrailRow(entry({ id: 42 }))).toBeNull();
    expect(toTrailRow(entry({ action: '' }))).toBeNull();
    expect(toTrailRow(entry({ targetId: null }))).toBeNull();
    expect(toTrailRow(entry({ createdAt: 'yesterday' }))).toBeNull();
    expect(toTrailRow(entry({ createdAt: Number.NaN }))).toBeNull();
  });
});

describe('trail — the whole trail (M9 v272)', () => {
  it('preserves the service’s NEWEST-FIRST order: the order is part of what the trail asserts', () => {
    const rows = toTrailRows([
      entry({ id: '3', createdAt: 300 }),
      entry({ id: '2', createdAt: 200 }),
      entry({ id: '1', createdAt: 100 }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['3', '2', '1']);
  });

  it('drops what it cannot show and keeps the rest, in place', () => {
    const rows = toTrailRows([entry({ id: '2' }), entry({ id: '1', targetId: null }), entry({ id: '0' })]);
    expect(rows.map((r) => r.id)).toEqual(['2', '0']);
  });

  it('an empty trail is an empty answer, not an error', () => {
    expect(toTrailRows([])).toEqual([]);
  });
});
