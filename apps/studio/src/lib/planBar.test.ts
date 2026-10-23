import { describe, expect, it } from 'vitest';

import { subscribeIdFromSearch } from './planIntent';
import { injectPlanBar, planPeriodText, renderPlanBar, toPlanRow, toPlanRows } from './planBar';

/**
 * M7 v301 — the PLANS bar on the profile page.
 *
 * Two rules the suite grades: a list that could not be READ is not an empty list, and the bar does not
 * pretend a creator offers nothing when it simply could not ask.
 */
const plan = (over: Record<string, unknown> = {}) => ({
  planId: 'pro',
  creatorId: 'acct-ada',
  priceCents: 1500,
  currency: 'CNY',
  period: 'month',
  active: true,
  createdAt: 1_776_000_000_000,
  handle: 'ada',
  assurance: 'unsigned-local',
  ...over,
});

describe('planIntent — the URL names the plan (M7 v301)', () => {
  it('v342 — says WHEN each plan was opened, in the service’s own style', () => {
    // The service has carried the instant since the plan's own beginning, and the tip bar on the same
    // page said its dates since v341; the plan bar said nothing. A plan with no date on it is a price
    // with no history.
    const row = toPlanRow({ planId: 'pro', priceCents: 1500, period: 'month', createdAt: 1_700_000_000_000 });
    expect(row?.openedText).toBe('2023-11-14T22:13:20Z');
  });

  it('v342 — and a wire with NO instant says nothing rather than guessing', () => {
    const row = toPlanRow({ planId: 'pro', priceCents: 1500, period: 'month' });
    expect(row?.openedText).toBeNull();
    const html = renderPlanBar({ accountId: 'acct-ada', plans: [row!] });
    expect(html).not.toContain('nexus-plan-opened');
  });

  it('reads the subscribe id out of the query', () => {
    expect(subscribeIdFromSearch('?subscribe=pro')).toBe('pro');
    expect(subscribeIdFromSearch('subscribe=pro')).toBe('pro');
    expect(subscribeIdFromSearch('?a=1&subscribe=pro')).toBe('pro');
  });

  it('answers null for ABSENCE', () => {
    expect(subscribeIdFromSearch('?subscribe=')).toBeNull();
    expect(subscribeIdFromSearch('?subscribe=%20')).toBeNull();
    expect(subscribeIdFromSearch('')).toBeNull();
    expect(subscribeIdFromSearch('?like=pub-1')).toBeNull();
  });
});

describe('planBar — the periods (M7 v301)', () => {
  it('names each of the three periods', () => {
    // v371 — ONE wording for a period, everywhere it is shown: the bar used to say "monthly" and the
    // creator's own panel said "per month" for the same service's word.
    expect(planPeriodText('once')).toBe('one time');
    expect(planPeriodText('month')).toBe('per month');
    expect(planPeriodText('year')).toBe('per year');
  });

  it('v371/v374 — and a plan says its terms are the ones ON OFFER now', () => {
    // A creator may reprice a plan, period and all (v317), so a plan's terms and a subscription's terms
    // can disagree — and the row has to say which one it is showing.
    const row = toPlanRow(plan())!;
    expect(row.termsText).toBe('on offer now');
    expect(renderPlanBar({ accountId: 'acct-ada', plans: [row] })).toContain('on offer now');
  });

  it('v372 — says how many plans the creator offers, over the WHOLE table', () => {
    // The bar's list is a window; a reader who saw three plans and a creator who offers five would read
    // the three as all of them.
    const html = renderPlanBar({ accountId: 'acct-ada', plans: toPlanRows([plan()]), count: 5 });
    expect(html).toContain('5 plans');
    expect(html).toContain('showing the 1 newest of 5');
  });

  it('v372 — and a list that shows EVERYONE says no such thing', () => {
    const html = renderPlanBar({ accountId: 'acct-ada', plans: toPlanRows([plan()]), count: 1 });
    expect(html).toContain('1 plan');
    expect(html).not.toContain('showing the');
  });

  it('v372 — and a count that could not be read says NO count rather than the window’s length', () => {
    // A count of zero would say the creator offers nothing, and the window's length would be a count of
    // what happened to be on the screen.
    const html = renderPlanBar({ accountId: 'acct-ada', plans: toPlanRows([plan()]), count: null });
    expect(html).not.toContain('nexus-plans-count');
    expect(html).not.toContain('showing the');
  });

  it('v371 — and a RETIRED plan says no such thing: its terms are the last ones it offered', () => {
    // "current terms" on a retired plan would be wrong about it: the plan is not on offer, so its terms
    // are the ones it last offered.
    const row = toPlanRow(plan({ active: false }))!;
    expect(row.termsText).toBeNull();
    expect(renderPlanBar({ accountId: 'acct-ada', plans: [row] })).not.toContain('on offer now');
  });

  it('PASSES AN UNKNOWN PERIOD THROUGH — the bar must not relabel a period it does not know', () => {
    expect(planPeriodText('fortnight')).toBe('fortnight');
  });
});

describe('planBar — one plan becomes one row (M7 v301)', () => {
  it('carries the id, the price in cents AND in a reader\u2019s words', () => {
    const row = toPlanRow(plan())!;
    expect(row.planId).toBe('pro');
    expect(row.priceCents).toBe(1500);
    expect(row.priceText).toBe('\u00a515.00');
    // v371 — ONE wording for a period, everywhere it is shown.
    expect(row.periodText).toBe('per month');
    expect(row.active).toBe(true);
  });

  it('a row it cannot display honestly is dropped', () => {
    expect(toPlanRow(null)).toBeNull();
    expect(toPlanRow(plan({ planId: '' }))).toBeNull();
    expect(toPlanRow(plan({ priceCents: 'lots' }))).toBeNull();
    expect(toPlanRow(plan({ priceCents: Number.NaN }))).toBeNull();
  });

  it('the list keeps the service\u2019s order and drops what it cannot show', () => {
    const rows = toPlanRows([plan({ planId: 'a' }), plan({ planId: '' }), plan({ planId: 'b' })]);
    expect(rows.map((r) => r.planId)).toEqual(['a', 'b']);
  });
});

describe('planBar — the bar on the profile (M7 v301)', () => {
  it('lists the plans with their prices and offers to back them', () => {
    const html = renderPlanBar({ accountId: 'acct-ada', plans: toPlanRows([plan()]) });
    expect(html).toContain('data-plans="1"');
    expect(html).toContain('data-plan="pro"');
    expect(html).toContain('\u00a515.00');
    expect(html).toContain('per month');
    expect(html).toContain('href="/?subscribe=pro"');
  });

  it('a creator with no plans shows no bar \u2014 the page is not padded with an empty section', () => {
    expect(renderPlanBar({ accountId: 'acct-ada', plans: [] })).toBe('');
  });

  it('a list that could NOT be read is NOT an empty list \u2014 the bar is left out entirely', () => {
    // "This creator offers nothing" and "the plans could not be read" are different facts.
    expect(renderPlanBar({ accountId: 'acct-ada', plans: null })).toBe('');
  });

  it('a RETIRED plan is shown as retired and offers no action', () => {
    const html = renderPlanBar({ accountId: 'acct-ada', plans: toPlanRows([plan({ active: false })]) });
    expect(html).toContain('retired');
    expect(html).not.toContain('href="/?subscribe=pro"');
  });

  it('encodes the plan id in the link', () => {
    const html = renderPlanBar({ accountId: 'acct-ada', plans: toPlanRows([plan({ planId: 'a/b c' })]) });
    expect(html).toContain('href="/?subscribe=a%2Fb%20c"');
  });

  it('escapes caller-controlled text', () => {
    const html = renderPlanBar({ accountId: 'acct-ada', plans: toPlanRows([plan({ planId: '<script>x</script>' })]) });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('inserts the bar before the closing body tag, and an EMPTY bar inserts nothing', () => {
    const page = '<html><body><div>profile</div></body></html>';
    const out = injectPlanBar(page, '<div class="nexus-plans"></div>');
    expect(out).toContain('<div>profile</div><div class="nexus-plans"></div></body>');
    expect(injectPlanBar(page, '')).toBe(page);
    const noBody = '<html><div>profile</div></html>';
    expect(injectPlanBar(noBody, '<div></div>')).toBe(noBody);
  });
});

describe('planBar — the bar PAGES through the plans (M7 v396)', () => {
  // The same shape the tip bar got in v395: the page is server-rendered and cannot act, so the
  // pager is a LINK the route builds, and a boundary is a span with no href.
  const pageHref = (offset: number) => `/u/acct-ada?planOffset=${offset}`;
  const twoPlans = () => toPlanRows([plan({ planId: 'p-1' }), plan({ planId: 'p-2' })]);

  it('the first window says it is the newest, and not the only', () => {
    const html = renderPlanBar({ accountId: 'acct-ada', plans: twoPlans(), count: 5, offset: 0, limit: 2, pageHref });
    expect(html).toContain('showing the 2 newest of 5');
  });

  it('a later window says WHICH plans it is showing', () => {
    // "the 2 newest" is a true thing about the first window and a false thing about the third
    // (v386's correction, the shared wording's third argument since v392).
    const html = renderPlanBar({ accountId: 'acct-ada', plans: twoPlans(), count: 10, offset: 4, limit: 2, pageHref });
    expect(html).toContain('showing 5–6 of 10');
    expect(html).not.toContain('newest');
  });

  it('an empty window past the end says so — it is not "this creator offers nothing"', () => {
    // v301 kept an empty list off the page entirely; a window PAST the end is a different fact
    // about a different thing — the page, not the creator.
    const html = renderPlanBar({ accountId: 'acct-ada', plans: [], count: 5, offset: 4, limit: 2, pageHref });
    expect(html).toContain('this page is past the end — the service answered an empty window');
    expect(html).toContain('data-plan-count="5"');
  });

  it('but an empty FIRST window is still no bar at all', () => {
    expect(renderPlanBar({ accountId: 'acct-ada', plans: [], count: 0, offset: 0, limit: 20, pageHref })).toBe('');
    expect(renderPlanBar({ accountId: 'acct-ada', plans: [], count: 5, offset: 0, limit: 20, pageHref })).toBe('');
    expect(renderPlanBar({ accountId: 'acct-ada', plans: [], count: null, offset: 4, limit: 20, pageHref })).toBe('');
  });

  it('the pager is links, and a boundary is a span with no href', () => {
    const first = renderPlanBar({ accountId: 'acct-ada', plans: twoPlans(), count: 5, offset: 0, limit: 2, pageHref });
    expect(first).toContain('<span class="nexus-plans-page" data-plans-page="newer"');
    expect(first).toContain('<a class="nexus-plans-page" data-plans-page="older" href="/u/acct-ada?planOffset=2"');
    const last = renderPlanBar({ accountId: 'acct-ada', plans: twoPlans(), count: 5, offset: 4, limit: 2, pageHref });
    expect(last).toContain('<a class="nexus-plans-page" data-plans-page="newer" href="/u/acct-ada?planOffset=2"');
    expect(last).toContain('<span class="nexus-plans-page" data-plans-page="older"');
  });

  it('"Older" is not offered when the next window would hold nothing', () => {
    const html = renderPlanBar({ accountId: 'acct-ada', plans: [], count: 5, offset: 4, limit: 2, pageHref });
    expect(html).toContain('<span class="nexus-plans-page" data-plans-page="older"');
    expect(html).not.toContain('data-plans-page="older" href');
  });

  it('a bar that cannot build a link draws no pager — only the count', () => {
    const html = renderPlanBar({ accountId: 'acct-ada', plans: twoPlans(), count: 5, offset: 0, limit: 2 });
    expect(html).toContain('showing the 2 newest of 5');
    expect(html).not.toContain('nexus-plans-pager');
  });

  it('and a window that holds the whole catalogue gets no pager at all', () => {
    const html = renderPlanBar({ accountId: 'acct-ada', plans: twoPlans(), count: 2, offset: 0, limit: 100, pageHref });
    expect(html).not.toContain('nexus-plans-pager');
    expect(html).not.toContain('showing');
  });
});
