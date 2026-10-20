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
    expect(planPeriodText('once')).toBe('one-off');
    expect(planPeriodText('month')).toBe('monthly');
    expect(planPeriodText('year')).toBe('yearly');
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
    expect(row.periodText).toBe('monthly');
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
    expect(html).toContain('monthly');
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
