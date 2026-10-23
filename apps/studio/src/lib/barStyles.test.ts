import { describe, expect, it } from 'vitest';

import { COMMENT_STYLES } from './commentBar';
import { FOLLOW_BAR_STYLES } from './followBar';
import { HISTORY_STYLES } from './history';
import { LIKE_BAR_STYLES } from './likeBar';
import { PLAN_BAR_STYLES } from './planBar';
import { TIP_BAR_STYLES } from './tipBar';
import { renderCommentsHtml } from './commentBar';
import { renderFollowBar } from './followBar';
import { renderHistoryHtml } from './history';
import { renderLikeBar } from './likeBar';
import { renderPlanBar } from './planBar';
import { renderTipBar } from './tipBar';

/**
 * v457 — the six dock panels' style seams, graded as a FAMILY.
 *
 * Each bar ships its own `<style>` block: there is no shared stylesheet, so the one thing that keeps
 * two panels on one page from styling each other is that no class is declared twice. Until now each
 * block was reachable only by importing it, and the family invariant — namespaced, well-formed,
 * disjoint — had never been asked. The renderers' half of the contract is asked too: a bar may emit
 * only classes its own block declares, or the HTML and the CSS have drifted apart.
 */

/** One entry per bar: its stylesheet, the prefix its classes live under, and a representative render. */
const BARS = [
  {
    name: 'planBar',
    styles: PLAN_BAR_STYLES,
    prefix: 'nexus-plan',
    render: () => renderPlanBar({ accountId: 'acct-ada', plans: [{ planId: 'pro', priceCents: 1500, priceText: '\u00a515.00', period: 'month', periodText: 'per month', active: true, openedText: 'opened last week', termsText: 'the terms on offer now' }], count: 1 }),
  },
  {
    name: 'likeBar',
    styles: LIKE_BAR_STYLES,
    prefix: 'nexus-likes',
    render: () => renderLikeBar({ projectId: 'proj-1', count: 2, likers: [{ accountId: 'acct-bob', nameText: 'bob', assurance: 'signed' }] }),
  },
  {
    name: 'followBar',
    styles: FOLLOW_BAR_STYLES,
    prefix: 'nexus-follower',
    render: () => renderFollowBar({ accountId: 'acct-ada', followerCount: 1, followers: [{ accountId: 'acct-bob', nameText: 'bob', assurance: 'signed', followedText: 'just now' }] }),
  },
  {
    name: 'commentBar',
    styles: COMMENT_STYLES,
    prefix: 'nexus-comment',
    render: () => renderCommentsHtml([{ id: 'c1', authorText: 'bob', bodyText: 'nice', timeText: 'just now', deleted: false }], 1, 'proj-1'),
  },
  {
    name: 'history',
    styles: HISTORY_STYLES,
    prefix: 'nexus-history',
    render: () => renderHistoryHtml([], 0),
  },
  {
    name: 'tipBar',
    styles: TIP_BAR_STYLES,
    prefix: 'nexus-tip',
    render: () => renderTipBar({ accountId: 'acct-ada', count: 1, totalCents: 1500, tips: [{ id: 't1', amountCents: 1500, amountText: '\u00a515.00', messageText: 'thanks', anonymous: false, givenText: 'just now' }] }),
  },
] as const;

/** Every class a stylesheet declares, as a set. */
function declaredClasses(styles: string): Set<string> {
  return new Set([...styles.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)].map((m) => m[1]!));
}

/** Every class a rendered fragment puts on an element, as a set. */
function emittedClasses(html: string): Set<string> {
  const out = new Set<string>();
  for (const m of html.matchAll(/class="([^"]+)"/g)) {
    for (const c of m[1]!.split(/\s+/)) if (c !== '') out.add(c);
  }
  return out;
}

describe('the dock bars’ style seams — one family, six blocks (v457)', () => {
  it('each bar ships its CSS as ONE well-formed <style> block', () => {
    for (const bar of BARS) {
      expect(bar.styles.startsWith('<style>'), bar.name).toBe(true);
      expect(bar.styles.endsWith('</style>'), bar.name).toBe(true);
      expect(bar.styles.match(/<style/g) ?? [], bar.name).toHaveLength(1);
      expect(bar.styles.match(/<\/style>/g) ?? [], bar.name).toHaveLength(1);
    }
  });

  it('every class a bar declares is namespaced under its OWN prefix', () => {
    for (const bar of BARS) {
      const declared = [...declaredClasses(bar.styles)];
      expect(declared.length, bar.name).toBeGreaterThan(0);
      for (const c of declared) expect(c.startsWith(bar.prefix), `${bar.name}: .${c}`).toBe(true);
    }
  });

  it('the six declared sets are pairwise DISJOINT — two panels on one page cannot style each other', () => {
    // No shared stylesheet means the namespaces are the only wall. A class two bars declare would
    // let one panel's rules reach the other's elements on the profile page.
    const seen = new Map<string, string>();
    let total = 0;
    for (const bar of BARS) {
      for (const c of declaredClasses(bar.styles)) {
        expect(seen.has(c), `.${c} is declared by both ${seen.get(c)} and ${bar.name}`).toBe(false);
        seen.set(c, bar.name);
        total++;
      }
    }
    expect(seen.size).toBe(total);
  });

  it('each bar’s renderer emits ONLY classes its own block declares', () => {
    // The other half of the contract: HTML and CSS drift apart quietly, and the first symptom is a
    // class on an element that no stylesheet rules.
    for (const bar of BARS) {
      const declared = declaredClasses(bar.styles);
      const emitted = emittedClasses(bar.render());
      expect(emitted.size, bar.name).toBeGreaterThan(0);
      for (const c of emitted) expect(declared.has(c), `${bar.name} emits .${c}, which its stylesheet never declares`).toBe(true);
    }
  });
});
