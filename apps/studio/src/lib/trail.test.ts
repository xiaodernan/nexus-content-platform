import { describe, expect, it } from 'vitest';

import { toTrailRow, toTrailRows, trailActionColorVar, trailActionText, trailActorText, trailFilterCaption, trailFilterHint, trailSummaryOf, trailSummaryText, trailTargetTypeText, TRAIL_FILTER_ACTIONS } from './trail';
import { AUDIT_ACTIONS } from './ops';

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
  targetType: 'publication',
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

  it('v384 — the row carries the KIND of thing it happened to, as the service declared it', () => {
    const row = toTrailRow(entry())!;
    expect(row.targetType).toBe('publication');
    expect(toTrailRow(entry({ targetType: 'account' }))!.targetType).toBe('account');
    expect(toTrailRow(entry({ targetType: 'plan' }))!.targetType).toBe('plan');
  });

  it('v384 — a row that cannot say what KIND of thing it happened to is dropped like any other', () => {
    // The kind is part of what the row asserts: a follow and a publish both happened to an id, and a row
    // that could not say which sort of id would be asking the reader to guess.
    expect(toTrailRow(entry({ targetType: null }))).toBeNull();
    expect(toTrailRow(entry({ targetType: '' }))).toBeNull();
  });

  it('v384 — the three kinds are spelled as a person would say them, and an unknown one passes through', () => {
    expect(trailTargetTypeText('account')).toBe('account');
    expect(trailTargetTypeText('plan')).toBe('plan');
    expect(trailTargetTypeText('publication')).toBe('publication');
    // A kind a newer service added is shown as it arrived — the same rule the action keeps.
    expect(trailTargetTypeText('world')).toBe('world');
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

describe('trail — the tally says WHICH rows it counts (M7 v379)', () => {
  it('v379 — says the tally is about the ROWS on the screen', () => {
    // The trail is a WINDOW (the service caps at a hundred and the panel asks for twenty), so a bare
    // "4 published" was a fact about twenty rows and not about the trail.
    const rows = toTrailRows([entry({ id: '1', action: 'publish' }), entry({ id: '2', action: 'publish' })]);
    expect(trailSummaryText(trailSummaryOf(rows), 20)).toBe('of these 20 rows: 2 published');
  });

  it('v379 — and a tally with no rows says nothing yet, and names no rows', () => {
    expect(trailSummaryText(trailSummaryOf([]), 20)).toBe('nothing yet');
  });

  it('v379 — and a caller that does not say how many rows it has gets the plain tally', () => {
    // The wording stays available for a caller that has no row count: the panel always has one.
    const rows = toTrailRows([entry({ id: '1', action: 'publish' })]);
    expect(trailSummaryText(trailSummaryOf(rows))).toBe('1 published');
  });
});

describe('trail — the TALLY over the rows the answer carried (M9 v281)', () => {
  const rows = toTrailRows([
    entry({ id: '1', action: 'publish' }),
    entry({ id: '2', action: 'unpublish' }),
    entry({ id: '3', action: 'publish' }),
  ]);

  it('counts what the rows carry, and nothing else', () => {
    expect(trailSummaryOf(rows)).toEqual({
      published: 2,
      tookDown: 1,
      liked: 0,
      unliked: 0,
      commented: 0,
      uncommented: 0,
      // v311 — the report verbs have their own buckets too, and they are zero when no report was filed.
      reported: 0,
      withdrewReport: 0,
      acknowledged: 0,
      other: 0,
      total: 3,
    });
  });

  it('an action this build does NOT know is counted as OTHER, never folded into a verb it does', () => {
    // `follow` is in the client's model but does not exist server-side yet. If one ever arrives, the tally
    // must not call it a publish — a summary that said "3 published" when one was a follow would be a lie.
    const withFollow = toTrailRows([entry({ id: '1', action: 'publish' }), entry({ id: '2', action: 'follow' })]);
    const summary = trailSummaryOf(withFollow);
    expect(summary.published).toBe(1);
    expect(summary.other).toBe(1);
    expect(summary.total).toBe(2);
  });

  it('v289 — the SOCIAL verbs have their OWN buckets, not the other one', () => {
    // A like is the product's own verb and the service records it: a tally that called a like "other"
    // would be hiding the very thing the panel is for.
    const social = toTrailRows([
      entry({ id: '1', action: 'like' }),
      entry({ id: '2', action: 'unlike' }),
      entry({ id: '3', action: 'comment' }),
      entry({ id: '4', action: 'uncomment' }),
    ]);
    const summary = trailSummaryOf(social);
    expect(summary.liked).toBe(1);
    expect(summary.unliked).toBe(1);
    expect(summary.commented).toBe(1);
    expect(summary.uncommented).toBe(1);
    expect(summary.other).toBe(0);
    expect(summary.total).toBe(4);
  });

  it('v289 — the un-verbs are NOT folded into the verbs: liked and unliked are different facts', () => {
    const social = toTrailRows([entry({ id: '1', action: 'like' }), entry({ id: '2', action: 'unlike' })]);
    const summary = trailSummaryOf(social);
    expect(summary.liked).toBe(1);
    expect(summary.unliked).toBe(1);
    expect(summary.total).toBe(2);
  });

  it('an empty trail sums to zero, not to undefined', () => {
    const summary = trailSummaryOf([]);
    expect(summary.total).toBe(0);
    expect(summary.other).toBe(0);
  });

  it('v289 — the tally says only the buckets that are NOT zero', () => {
    // A line that always carried every bucket would grow a dozen "0 took down"s and a reader would learn
    // to skip it.
    const social = toTrailRows([entry({ id: '1', action: 'like' }), entry({ id: '2', action: 'comment' })]);
    expect(trailSummaryText(trailSummaryOf(social))).toBe('1 liked · 1 commented');
    expect(trailSummaryText(trailSummaryOf([]))).toBe('nothing yet');
    const both = toTrailRows([entry({ id: '1', action: 'publish' }), entry({ id: '2', action: 'like' })]);
    expect(trailSummaryText(trailSummaryOf(both))).toBe('1 published · 1 liked');
  });

  it('v289 — the social verbs have their own WORDS', () => {
    expect(trailActionText('like')).toBe('liked');
    expect(trailActionText('unlike')).toBe('took the like back');
    expect(trailActionText('comment')).toBe('commented');
    expect(trailActionText('uncomment')).toBe('removed the comment');
  });

describe('trail — the REPORT verbs (M7 v311)', () => {
  it('each report verb has its own word, and the un-verb is not folded into the verb', () => {
    expect(trailActionText('report')).toBe('reported');
    expect(trailActionText('withdraw-report')).toBe('withdrew the report');
    expect(trailActionText('acknowledge')).toBe('acknowledged the report');
    // "reported" and "withdrew the report" are DIFFERENT facts: the complaint was filed, and the reporter
    // no longer stands by it. A trail that merged them would lose one of them.
    expect(trailActionText('report')).not.toBe(trailActionText('withdraw-report'));
  });

  it('an action this build does not know is still passed through', () => {
    expect(trailActionText('follow')).toBe('follow');
    expect(trailActionText('tip')).toBe('tip');
  });
});

describe('trail — the REPORT verbs in the tally (M7 v311)', () => {
  it('the report verbs have their OWN buckets, not the other one', () => {
    // A complaint is the one social act that asks somebody else to do something. A tally that called it
    // "other" would be hiding the very thing a reader of the trail is looking for.
    const reports = toTrailRows([
      entry({ id: '1', action: 'report' }),
      entry({ id: '2', action: 'report' }),
      entry({ id: '3', action: 'withdraw-report' }),
      entry({ id: '4', action: 'acknowledge' }),
    ]);
    const summary = trailSummaryOf(reports);
    expect(summary.reported).toBe(2);
    expect(summary.withdrewReport).toBe(1);
    expect(summary.acknowledged).toBe(1);
    expect(summary.other).toBe(0);
    expect(summary.total).toBe(4);
  });

  it('and the tally says them in its own words', () => {
    const reports = toTrailRows([
      entry({ id: '1', action: 'report' }),
      entry({ id: '2', action: 'withdraw-report' }),
      entry({ id: '3', action: 'acknowledge' }),
    ]);
    const text = trailSummaryText(trailSummaryOf(reports));
    expect(text).toContain('1 reported');
    expect(text).toContain('1 withdrew the report');
    expect(text).toContain('1 acknowledged');
  });
});

/**
 * v556 — the panel's verbs come from the SERVICE's table, not from a list written here.
 *
 * The defect v541 left behind: `ops.ts` was reconciled with `AuditService.ACTIONS` field for field, and the
 * audit trail kept its own nine-case switch, its own nine buttons and its own button words in `Toolbar.tsx` —
 * 37 quoted verb literals, in an order that had already drifted from the service's. The gate certified a
 * model that nothing in production imported; the words a reader actually saw could be edited to anything and
 * no test would have gone red. These cases pin the wiring instead of the wording: the table, the order, and
 * the fact that every verb in it reaches the reader through a shipped function.
 */
describe('trail — the verbs come from the audited table (M9 v556)', () => {
  it('the filter bar offers exactly the service\'s verbs, in the service\'s order', () => {
    expect([...TRAIL_FILTER_ACTIONS]).toEqual([...AUDIT_ACTIONS]);
    // Order is a claim about the SERVICE, so it is pinned against the service's own list rather than a
    // hand-copied array of nine strings — which is the spelling that drifted in the first place.
    expect(TRAIL_FILTER_ACTIONS).toEqual(['publish', 'unpublish', 'like', 'unlike', 'comment', 'uncomment', 'report', 'withdraw-report', 'acknowledge']);
  });

  it('every verb the service records reaches the reader with words — none prints as its own identifier', () => {
    for (const action of TRAIL_FILTER_ACTIONS) {
      expect(trailActionText(action), action).not.toBe(action);
      expect(trailFilterCaption(action), action).not.toBe(action);
      expect(trailFilterHint(action), action).not.toBe(action);
      expect(trailActionText(action).length, action).toBeGreaterThan(0);
      // A caption is a button label, not a sentence: it starts capitals and carries no full stop.
      expect(trailFilterCaption(action), action).toMatch(/^[A-Z][A-Za-z -]*$/);
    }
  });

  it('a caption is not a hint is not a row word — three faces, three jobs', () => {
    for (const action of TRAIL_FILTER_ACTIONS) {
      const caption = trailFilterCaption(action);
      const hint = trailFilterHint(action);
      const row = trailActionText(action);
      expect(caption).not.toBe(hint);
      expect(caption).not.toBe(row);
      expect(hint.startsWith('only the '), hint).toBe(true);
    }
  });

  it('a verb this build has never heard of still reaches the reader as it arrived, in all three faces', () => {
    // The service is a separate deployable: a verb added there must show up here as ITSELF, not as a gap,
    // a crash or the nearest word this build happens to have.
    expect(trailActionText('dance')).toBe('dance');
    expect(trailFilterCaption('dance')).toBe('dance');
    expect(trailFilterHint('dance')).toBe('dance');
  });

  it('only the take-down is printed muted — and an unknown verb is printed as a normal event, not silenced', () => {
    expect(trailActionColorVar('unpublish')).toBe('var(--nexus-muted)');
    for (const action of TRAIL_FILTER_ACTIONS) {
      if (action === 'unpublish') continue;
      expect(trailActionColorVar(action), action).toBe('var(--nexus-brand)');
    }
    expect(trailActionColorVar('dance')).toBe('var(--nexus-brand)');
  });
});
});
