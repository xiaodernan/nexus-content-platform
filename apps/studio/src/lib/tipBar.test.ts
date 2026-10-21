import { describe, expect, it } from 'vitest';

import { tipIdFromSearch } from './tipIntent';
import { injectTipBar, renderTipBar, toTipRow, toTipRows } from './tipBar';

/**
 * M7 v298 — the TIPS bar on the profile page.
 *
 * Two rules the suite grades: a count that could not be READ is not a count of zero, and the bar does not
 * name the PAYER — a page that listed who gave what would turn a small gesture into a public list of who
 * supports whom.
 */
const entry = (over: Record<string, unknown> = {}) => ({
  id: 't-1',
  recipientId: 'acct-bob',
  payerId: 'acct-ada',
  amountCents: 1500,
  currency: 'CNY',
  message: 'nice work',
  anonymous: false,
  createdAt: 1_776_000_000_000,
  handle: 'ada',
  assurance: 'unsigned-local',
  ...over,
});

describe('tipIntent — the URL names the account (M7 v298)', () => {
  it('v341 — says WHEN each tip arrived, in the service\u2019s own style', () => {
    // The service has carried the instant since the tip's own beginning, and the economy panel has said
    // it since v333; the profile page did not. A gift with no date on it is a gift without a history.
    const row = toTipRow({ id: 't-1', amountCents: 500, createdAt: 1_700_000_000_000 });
    expect(row?.givenText).toBe('2023-11-14T22:13:20Z');
  });

  it('v341 — and a wire with NO instant says nothing rather than guessing', () => {
    const row = toTipRow({ id: 't-1', amountCents: 500 });
    expect(row?.givenText).toBeNull();
    const html = renderTipBar({ accountId: 'acct-ada', count: 1, totalCents: 500, tips: [row!] });
    expect(html).not.toContain('nexus-tip-when');
  });

  it('reads the tip id out of the query', () => {
    expect(tipIdFromSearch('?tip=acct-bob')).toBe('acct-bob');
    expect(tipIdFromSearch('tip=acct-bob')).toBe('acct-bob');
    expect(tipIdFromSearch('?a=1&tip=acct-bob')).toBe('acct-bob');
  });

  it('answers null for ABSENCE', () => {
    expect(tipIdFromSearch('?tip=')).toBeNull();
    expect(tipIdFromSearch('?tip=%20')).toBeNull();
    expect(tipIdFromSearch('')).toBeNull();
    expect(tipIdFromSearch('?like=pub-1')).toBeNull();
  });
});

describe('tipBar — one tip becomes one row (M7 v298)', () => {
  it('carries the amount in cents AND in a reader’s words', () => {
    const row = toTipRow(entry())!;
    expect(row.id).toBe('t-1');
    expect(row.amountCents).toBe(1500);
    expect(row.amountText).toBe('¥15.00');
    expect(row.messageText).toBe('nice work');
    expect(row.anonymous).toBe(false);
  });

  it('a row it cannot display honestly is dropped', () => {
    expect(toTipRow(null)).toBeNull();
    expect(toTipRow(entry({ id: '' }))).toBeNull();
    expect(toTipRow(entry({ amountCents: 'lots' }))).toBeNull();
    expect(toTipRow(entry({ amountCents: Number.NaN }))).toBeNull();
  });

  it('the message is ESCAPED again on the way out', () => {
    const row = toTipRow(entry({ message: '<script>x</script>' }))!;
    expect(row.messageText).toBe('&lt;script&gt;x&lt;/script&gt;');
    expect(row.messageText).not.toContain('<script>');
  });

  it('the list keeps the service’s order and drops what it cannot show', () => {
    const rows = toTipRows([entry({ id: 't-1' }), entry({ id: '' }), entry({ id: 't-2' })]);
    expect(rows.map((r) => r.id)).toEqual(['t-1', 't-2']);
  });
});

describe('tipBar — the bar on the profile (M7 v298)', () => {
  it('states the count AND the total, and offers the tip', () => {
    const html = renderTipBar({ accountId: 'acct-bob', count: 2, totalCents: 1500 });
    expect(html).toContain('data-tips="2"');
    expect(html).toContain('2 tips');
    expect(html).toContain('¥15.00');
    expect(html).toContain('href="/?tip=acct-bob"');
  });

  it('says "1 tip" for one', () => {
    expect(renderTipBar({ accountId: 'acct-bob', count: 1, totalCents: 500 })).toContain('1 tip');
  });

  it('ZERO tips is something to say — it is a fact, and it is different from a failed read', () => {
    const html = renderTipBar({ accountId: 'acct-bob', count: 0, totalCents: 0 });
    expect(html).toContain('data-tips="0"');
    expect(html).toContain('0 tips');
  });

  it('a count that could NOT be read is NOT zero — the bar is left out entirely', () => {
    // A creator’s page must not say "no tips" when it knows it could not read them.
    expect(renderTipBar({ accountId: 'acct-bob', count: null, totalCents: null })).toBe('');
  });

  it('it does NOT name the PAYER — the count is the fact, the identities are the reader’s business', () => {
    const rows = toTipRows([entry()]);
    const html = renderTipBar({ accountId: 'acct-bob', count: 1, totalCents: 1500, tips: rows });
    expect(html).not.toContain('acct-ada');
    expect(html).not.toContain('ada');
    expect(html).toContain('data-tip="t-1"');
    expect(html).toContain('¥15.00');
  });

  it('encodes the account id in the link', () => {
    expect(renderTipBar({ accountId: 'a/b c', count: 1, totalCents: 500 })).toContain('href="/?tip=a%2Fb%20c"');
  });

  it('inserts the bar before the closing body tag, and an EMPTY bar inserts nothing', () => {
    const page = '<html><body><div>profile</div></body></html>';
    const out = injectTipBar(page, '<div class="nexus-tips"></div>');
    expect(out).toContain('<div>profile</div><div class="nexus-tips"></div></body>');
    expect(injectTipBar(page, '')).toBe(page);
    const noBody = '<html><div>profile</div></html>';
    expect(injectTipBar(noBody, '<div></div>')).toBe(noBody);
  });
});
