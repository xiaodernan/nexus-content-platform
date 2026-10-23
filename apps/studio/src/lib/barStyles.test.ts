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
import { REPORT_BAR_STYLES, REPORT_REASONS, renderReportBar, reportReasonText } from './reportBar';

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

/**
 * v458 — the report bar’s two unasked exports: its reason VOCABULARY and its style block.
 *
 * `REPORT_REASONS` is the closed set the composer’s dropdown is built from — the client’s own four,
 * and no others — and until now the list itself had never been asked: WHAT a reader can report is a
 * decision, and it lived in a constant only the component read. `REPORT_BAR_STYLES` is the seventh
 * panel’s stylesheet, and the family guard above never met it.
 */
describe('the report bar’s reason vocabulary (v458)', () => {
  it('the vocabulary is the client’s own four, in this order', () => {
    expect([...REPORT_REASONS]).toEqual(['spam', 'harassment', 'illegal', 'other']);
  });

  it('no reason appears twice — a dropdown would offer the same complaint twice', () => {
    expect(new Set(REPORT_REASONS).size).toBe(REPORT_REASONS.length);
    expect(REPORT_REASONS.length).toBe(4);
  });

  it('every reason in the vocabulary has a reader’s word — and “other” is the one that is not its own', () => {
    for (const reason of REPORT_REASONS) {
      const text = reportReasonText(reason);
      expect(text.length, reason).toBeGreaterThan(0);
      if (reason === 'other') expect(text).toBe('something else');
      else expect(text).toBe(reason);
    }
  });

  it('the four reader words are all different — a reader can tell the complaints apart', () => {
    const words = REPORT_REASONS.map((r) => reportReasonText(r));
    expect(new Set(words).size).toBe(words.length);
  });
});

describe('the report bar’s style block — the seventh panel joins the family (v458)', () => {
  const FAMILY = [
    { name: 'planBar', styles: PLAN_BAR_STYLES },
    { name: 'likeBar', styles: LIKE_BAR_STYLES },
    { name: 'followBar', styles: FOLLOW_BAR_STYLES },
    { name: 'commentBar', styles: COMMENT_STYLES },
    { name: 'history', styles: HISTORY_STYLES },
    { name: 'tipBar', styles: TIP_BAR_STYLES },
  ] as const;

  it('ships its CSS as ONE well-formed <style> block', () => {
    expect(REPORT_BAR_STYLES.startsWith('<style>')).toBe(true);
    expect(REPORT_BAR_STYLES.endsWith('</style>')).toBe(true);
    expect(REPORT_BAR_STYLES.match(/<style/g) ?? []).toHaveLength(1);
    expect(REPORT_BAR_STYLES.match(/<\/style>/g) ?? []).toHaveLength(1);
  });

  it('every class it declares is namespaced under nexus-report', () => {
    const declared = [...declaredClasses(REPORT_BAR_STYLES)];
    expect(declared.length).toBeGreaterThan(0);
    for (const c of declared) expect(c.startsWith('nexus-report'), `.${c}`).toBe(true);
  });

  it('its classes collide with NONE of the six blocks already in the family', () => {
    const mine = declaredClasses(REPORT_BAR_STYLES);
    for (const bar of FAMILY) {
      for (const c of declaredClasses(bar.styles)) {
        expect(mine.has(c), `.${c} is declared by both ${bar.name} and reportBar`).toBe(false);
      }
    }
  });

  it('renderReportBar emits ONLY classes its own block declares', () => {
    // A withdrawn report with a filed instant beside a fresh one: the row carries the reason, and
    // the instant emits the when-class — the per-row classes are the drift surface.
    const html = renderReportBar({
      projectId: 'proj-1',
      count: 2,
      reports: [
        { id: 'r1', reason: 'spam', reasonText: 'spam', withdrawn: false, status: 'open', statusText: 'not acknowledged yet', targetId: 'proj-1', filedAt: 1700000000000, detail: 'buy followers' },
        { id: 'r2', reason: 'other', reasonText: 'something else', withdrawn: true, status: 'rejected', statusText: 'withdrawn by the reporter', targetId: 'proj-1', detail: '' },
      ],
    });
    const declared = declaredClasses(REPORT_BAR_STYLES);
    const emitted = emittedClasses(html);
    expect(emitted.size).toBeGreaterThan(0);
    for (const c of emitted) expect(declared.has(c), `reportBar emits .${c}, which its stylesheet never declares`).toBe(true);
  });
});
