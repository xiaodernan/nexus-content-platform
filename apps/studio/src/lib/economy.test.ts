import { describe, expect, it } from 'vitest';

import type { PriceCents, Tip, Subscription } from './monetization';

import {
  planCountText,
  subscriptionsTotalText,
  subscriptionsWindowText,
  tipGivenText,
  tipPayerText,
  toPlanRow,
  toSubscriptionRow,
  toSubscriptionRows,
  toTipRow,
  toTipRows,
  priceText,
  tipText,
  isFreePrice,
  subscriptionActiveText,
  subscriptionDaysLeftText,
  tipsTotal,
  tipCount,
  tipPercentShare,
  tipsByRecipient,
  tipsTotalByAgent,
  isSubscribed,
} from './economy';

const pc = (n: number) => n as PriceCents;

/**
 * M8 v274 — the CREATOR ECONOMY's reading half.
 *
 * The parallel lane's `monetization.ts` declares the pure types and formatters.
 * This module re-exports those formatters and adds the mapping from wire shapes
 * to display rows (the same pattern as `explore.ts`, `profile.ts`, `trail.ts`).
 */
const sub = (over: Partial<Subscription> = {}) => ({
  creatorId: 'acct-ada' as const,
  planId: 'pro',
  priceCents: pc(1500),
  currency: 'CNY' as const,
  active: true,
  subscribedAt: 1_700_000_000_000,
  expiresAt: 1_800_000_000_000,
  ...over,
});

const tip = (over: Partial<Tip> = {}) => ({
  recipientId: 'acct-ada' as const,
  amountCents: pc(500),
  message: 'great work!',
  anonymous: false,
  ...over,
});

const escape = (text: string) => text.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');

describe('economy — formatters (re-exported from monetization)', () => {
  it('priceText formats cents with symbol', () => {
    expect(priceText(pc(1500), 'CNY')).toBe('¥15.00');
    expect(priceText(pc(0), 'CNY')).toBe('Free');
    expect(priceText(pc(999), 'USD')).toBe('$9.99');
  });

  it('isFreePrice spots zero and negative', () => {
    expect(isFreePrice(pc(0))).toBe(true);
    expect(isFreePrice(pc(-1))).toBe(true);
    expect(isFreePrice(pc(1))).toBe(false);
  });

  it('tipText escapes the message and names the amount', () => {
    const t = tip({ amountCents: pc(500), message: 'a < b & c' });
    expect(tipText(t, escape)).toBe('Someone tipped ¥5.00 — a < b & c');
  });

  it('anonymous tips say Anonymous', () => {
    expect(tipText(tip({ anonymous: true }), escape)).toContain('Anonymous tipped');
  });
});

describe('economy — subscription rows (M8 v274)', () => {
  it('maps a valid subscription to a display row', () => {
    const row = toSubscriptionRow(sub())!;
    expect(row.planId).toBe('pro');
    expect(row.priceText).toBe('¥15.00');
    expect(row.statusText).toBe('Active');
    expect(row.isActive).toBe(true);
  });

  it('an expired subscription says Expired', () => {
    const row = toSubscriptionRow(sub({ active: true, expiresAt: 1_000_000_000_000 }))!;
    expect(row.statusText).toBe('Expired');
    expect(row.isActive).toBe(false);
  });

  it('an inactive subscription says Never', () => {
    const row = toSubscriptionRow(sub({ active: false }))!;
    expect(row.statusText).toBe('Never');
    expect(row.isActive).toBe(false);
  });

  it('daysLeftText shows remaining days or N/A', () => {
    const farFuture = sub({ expiresAt: Date.now() + 10 * 24 * 60 * 60 * 1000 });
    expect(toSubscriptionRow(farFuture)!.daysLeftText).toMatch(/^\d+ d left$/);
    expect(toSubscriptionRow(sub({ expiresAt: null }))!.daysLeftText).toBe('N/A');
    expect(toSubscriptionRow(sub({ expiresAt: 1 }))!.daysLeftText).toBe('Expired');
  });

  it('v327 — names WHO subscribed', () => {
    // The service's wire has carried the subscriber all along, and the creator's list did not show it:
    // a creator reading the subscriptions they received was looking at a plan, a price and a status, and
    // not at the person who had put their money behind it.
    expect(toSubscriptionRow({ ...sub(), subscriberId: 'acct-bob', handle: 'bob' })!.subscriberText).toBe('@bob');
    expect(toSubscriptionRow({ ...sub(), subscriberId: 'acct-bob' })!.subscriberText).toBe('acct-bob');
    // And a subscription with no subscriber at all says "nobody" — never a blank.
    expect(toSubscriptionRow(sub())!.subscriberText).toBe('nobody');
  });

  it('v328 — names WHEN the subscription was taken back', () => {
    // A row that said THAT it ended and never WHEN left a creator asking "who stopped, and when" with
    // half an answer. The instant is the service's own.
    const row = toSubscriptionRow({ ...sub(), endedAt: 1_700_000_000_000 })!;
    expect(row.endedText).toBe('2023-11-14T22:13:20Z');
  });

  it('v328 — and a subscription that was NOT taken back has no ending at all', () => {
    // A standing subscription has no ending, and one that merely ran out of its period ended on its
    // expiry — a different date and a different fact. The row says nothing rather than guessing.
    expect(toSubscriptionRow(sub())!.endedText).toBeNull();
    expect(toSubscriptionRow({ ...sub(), endedAt: null })!.endedText).toBeNull();
  });

  it('v329 — names WHEN the support began', () => {
    // The other half of the pair v328 completed: a creator could see when a subscription ENDED and not
    // when it STARTED, and a relationship is two dates.
    const row = toSubscriptionRow({ ...sub(), subscribedAt: 1_700_000_000_000 })!;
    expect(row.startedText).toBe('2023-11-14T22:13:20Z');
  });

  it('v329 — and a wire with no start says nothing rather than guessing', () => {
    expect(toSubscriptionRow({ ...sub(), subscribedAt: null })!.startedText).toBeNull();
  });

  it('v330 — names WHOSE plan it backs', () => {
    // A plan id is an ADDRESS, and a supporter reading their own list should not have to know which
    // address belongs to the person whose work they are backing.
    const row = toSubscriptionRow({ ...sub(), creatorHandle: 'ada' })!;
    expect(row.creatorText).toBe('@ada');
  });

  it('v330 — and a wire with no name shows the account id rather than a blank', () => {
    // A creator is a PUBLIC identity (their name is in the byline of everything they publish), and an
    // address is better than a blank.
    expect(toSubscriptionRow(sub())!.creatorText).toBe('acct-ada');
  });

  it('v331 — a tip names WHO sent it', () => {
    // "a supporter" is a category; the name is the person, and the service has been sending the payer's
    // name since the tip's own beginning.
    expect(tipPayerText({ anonymous: false, handle: 'bob', payerId: 'acct-bob' })).toBe('@bob');
  });

  it('v331 — an ANONYMOUS tip says "Anonymous" and shows no name at all', () => {
    // That is the payer's own choice about their own money: the recipient is told the tip is anonymous
    // rather than being shown a name the payer withheld.
    expect(tipPayerText({ anonymous: true, handle: 'bob', payerId: 'acct-bob' })).toBe('Anonymous');
  });

  it('v331 — a tip with no name shows the account id rather than a blank', () => {
    expect(tipPayerText({ anonymous: false, payerId: 'acct-bob' })).toBe('acct-bob');
    expect(tipPayerText({ anonymous: false })).toBe('nobody');
  });

  it('v333 — a tip’s receipt says WHEN it was given', () => {
    // A receipt without dates is a receipt without a history. The instant is the service's own clock, and
    // it is formatted in one style everywhere.
    expect(tipGivenText(1_700_000_000_000)).toBe('2023-11-14T22:13:20Z');
  });

  it('v333 — and a tip with no date says nothing rather than guessing', () => {
    expect(tipGivenText(null)).toBeNull();
    expect(tipGivenText(undefined)).toBeNull();
  });

  it('v344 — names WHEN the plan was opened', () => {
    // The service has carried the instant since the plan's own beginning, and the profile page's plan bar
    // said it since v342; the creator's OWN panel did not.
    const row = toPlanRow({
      planId: 'pro',
      creatorId: 'acct-ada',
      priceCents: 1500,
      currency: 'CNY',
      period: 'month',
      active: true,
      createdAt: 1_700_000_000_000,
    })!;
    expect(row.openedText).toBe('2023-11-14T22:13:20Z');
  });

  it('v344 — and a wire with NO instant says nothing rather than guessing', () => {
    const row = toPlanRow({
      planId: 'pro',
      creatorId: 'acct-ada',
      priceCents: 1500,
      currency: 'CNY',
      period: 'month',
      active: true,
      createdAt: null as unknown as number,
    })!;
    expect(row.openedText).toBeNull();
  });

  it('v367 — says WHAT PERIOD the subscription is for', () => {
    // The row has kept the plan's period as a snapshot since v300, and the wire now carries it: a reader
    // who saw "¥15.00" could not tell a monthly pledge from a yearly one.
    const row = toSubscriptionRow({ ...sub(), period: 'month' })!;
    expect(row.periodText).toBe('per month');
  });

  it('v367 — and a wire with NO period says nothing rather than guessing', () => {
    // An unknown period is passed through as it arrived — a panel that labelled it "per month" would be
    // claiming a term nobody set.
    const row = toSubscriptionRow({ ...sub(), period: 'fortnight' })!;
    expect(row.periodText).toBe('fortnight');
  });

  it('v368 — says the totals PER PERIOD, because a monthly and a yearly one do not add up', () => {
    const text = subscriptionsTotalText([
      { period: 'month', currency: 'CNY', totalCents: 1500 },
      { period: 'year', currency: 'CNY', totalCents: 3000 },
    ]);
    expect(text).toContain('per month');
    expect(text).toContain('per year');
  });

  it('v369 — and each amount says the CURRENCY it is in', () => {
    // Money in two currencies does not add up to one number, so the totals are grouped by currency too
    // and each amount is written in its own.
    const text = subscriptionsTotalText([
      { period: 'month', currency: 'CNY', totalCents: 1500 },
      { period: 'year', currency: 'USD', totalCents: 3000 },
    ]);
    expect(text).toContain('¥15.00');
    expect(text).toContain('$30.00');
  });

  it('v368 — and NO totals says NOTHING rather than inventing a total', () => {
    expect(subscriptionsTotalText([])).toBe('');
    expect(subscriptionsTotalText(undefined)).toBe('');
  });

  it('v370 — says when the rows on the screen are the WHOLE list, and when they are not', () => {
    // The count beside a list of subscriptions is the whole table's (v359) and the rows are the
    // service's window (v359), so a panel that showed "3 subscription(s)" and two rows without saying
    // so let a reader take the two for all of them.
    expect(subscriptionsWindowText(3, 2)).toBe('showing the 2 newest of 3');
  });

  it('v371 — a subscription says its terms are the ones that were AGREED', () => {
    // The subscription is a snapshot of the plan (v300): a creator may since have repriced the plan
    // (v317), so the row has to say which terms it is showing.
    const row = toSubscriptionRow({ ...sub(), period: 'month' })!;
    expect(row.termsText).toBe('as agreed');
  });

  it('v371/v374 — and a PLAN says its terms are the ones on offer NOW', () => {
    // v374 — the wording is a PAIR with the subscription's side: "as agreed" is what was promised and
    // "on offer now" is what is on sale.
    const row = toPlanRow({ planId: 'pro', priceCents: 1500, period: 'month', active: true })!;
    expect(row.termsText).toBe('on offer now');
  });

  it('v371 — and a RETIRED plan says no such thing: its terms are the last ones it offered', () => {
    const row = toPlanRow({ planId: 'pro', priceCents: 1500, period: 'month', active: false })!;
    expect(row.termsText).toBeNull();
  });

  it('v373 — says how many plans there are, and that the list is a WINDOW', () => {
    // The count is the whole table's (v372) and the list is the service's window, so a panel that showed
    // three plans and a creator who offers five must say so.
    expect(planCountText(5, 3)).toBe('5 plans · showing the 3 newest of 5');
  });

  it('v373 — and a list that shows EVERYONE says no such thing', () => {
    expect(planCountText(3, 3)).toBe('3 plans');
  });

  it('v373 — and a count that could not be read says NOTHING rather than a zero', () => {
    // A count of zero would say the creator offers nothing, which is a different fact from "the count
    // could not be read".
    expect(planCountText(null, 3)).toBe('');
    expect(planCountText(undefined, 3)).toBe('');
  });

  it('v370 — and a list that shows EVERYONE says no such thing', () => {
    expect(subscriptionsWindowText(3, 3)).toBe('');
    expect(subscriptionsWindowText(0, 0)).toBe('');
    expect(subscriptionsWindowText(undefined, 2)).toBe('');
  });

  it('a row it cannot display honestly is dropped', () => {
    expect(toSubscriptionRow(null)).toBeNull();
    expect(toSubscriptionRow('string')).toBeNull();
    expect(toSubscriptionRow(sub({ planId: '' }))).toBeNull();
    expect(toSubscriptionRow({ planId: 'x', priceCents: 'fifteen', currency: 'CNY', active: true, subscribedAt: 1, expiresAt: null })).toBeNull();
    expect(toSubscriptionRow({ planId: 'x', priceCents: Number.NaN, currency: 'CNY', active: true, subscribedAt: 1, expiresAt: null })).toBeNull();
  });
});

describe('economy — tip rows (M8 v274)', () => {
  it('maps a valid tip to a display row', () => {
    const row = toTipRow(tip(), escape)!;
    expect(row.recipientId).toBe('acct-ada');
    expect(row.amountText).toBe('¥5.00');
    expect(row.messageText).toBe('great work!');
    expect(row.anonymous).toBe(false);
  });

  it('escapes the message in the row', () => {
    const row = toTipRow(tip({ message: '<script>' }), escape)!;
    expect(row.messageText).toBe('<script>');
  });

  it('anonymous tips are marked', () => {
    expect(toTipRow(tip({ anonymous: true }), escape)!.anonymous).toBe(true);
  });

  it('a row it cannot display honestly is dropped', () => {
    expect(toTipRow(null, escape)).toBeNull();
    expect(toTipRow(tip({ recipientId: '' }), escape)).toBeNull();
    expect(toTipRow({ recipientId: 'x', amountCents: 'five hundred', message: '', anonymous: false }, escape)).toBeNull();
    expect(toTipRow({ recipientId: 'x', amountCents: Number.NaN, message: '', anonymous: false }, escape)).toBeNull();
  });
});

describe('economy — whole lists (M8 v274)', () => {
  it('drops bad rows and keeps good ones', () => {
    const rows = toSubscriptionRows([sub({ planId: 'good' }), sub({ planId: '' }), sub({ planId: 'also' })]);
    expect(rows.map((r) => r.planId)).toEqual(['good', 'also']);
  });

  it('tip rows filter the same way', () => {
    const rows = toTipRows([tip({ recipientId: 'a' }), tip({ recipientId: '' }), tip({ recipientId: 'b' })], escape);
    expect(rows.map((r) => r.recipientId)).toEqual(['a', 'b']);
  });
});

describe('economy — aggregates (re-exported from monetization)', () => {
  it('tipsTotalByAgent sums per recipient', () => {
    const out = tipsTotalByAgent([tip({ recipientId: 'a', amountCents: pc(100) }), tip({ recipientId: 'a', amountCents: pc(200) }), tip({ recipientId: 'b', amountCents: pc(50) })]);
    expect(out['a']).toBe(300);
    expect(out['b']).toBe(50);
  });

  it('tipCount counts tips', () => {
    expect(tipCount([tip(), tip(), tip()])).toBe(3);
    expect(tipCount([])).toBe(0);
  });

  it('tipPercentShare avoids divide by zero', () => {
    expect(tipPercentShare(tip({ amountCents: pc(50) }), 0)).toBe(0);
    expect(tipPercentShare(tip({ amountCents: pc(25) }), 100)).toBe(25);
  });

  it('tipsByRecipient filters without mutating', () => {
    const arr = [tip({ recipientId: 'a' }), tip({ recipientId: 'b' }), tip({ recipientId: 'a' })];
    const filtered = tipsByRecipient(arr, 'a');
    expect(filtered.length).toBe(2);
    expect(arr.length).toBe(3);
  });

  it('tipsTotal sums all tips', () => {
    expect(tipsTotal([tip({ amountCents: pc(100) }), tip({ amountCents: pc(200) })])).toBe(300);
  });

  it('subscriptionActiveText reads active/expired/never', () => {
    const now = Date.now();
    expect(subscriptionActiveText(null, now)).toBe('Never');
    expect(subscriptionActiveText({ active: false, expiresAt: null, creatorId: 'x', planId: 'p', priceCents: pc(0), currency: 'CNY', subscribedAt: null }, now)).toBe('Never');
    expect(subscriptionActiveText({ active: true, expiresAt: now + 1000, creatorId: 'x', planId: 'p', priceCents: pc(0), currency: 'CNY', subscribedAt: null }, now)).toBe('Active');
    expect(subscriptionActiveText({ active: true, expiresAt: now - 1000, creatorId: 'x', planId: 'p', priceCents: pc(0), currency: 'CNY', subscribedAt: null }, now)).toBe('Expired');
  });

  it('isSubscribed checks viewer against creator', () => {
    const s = sub({ creatorId: 'acct-ada' });
    expect(isSubscribed(s, 'acct-ada')).toBe(true);
    expect(isSubscribed(s, 'acct-other')).toBe(false);
    expect(isSubscribed(s, null)).toBe(false);
    expect(isSubscribed(null, 'acct-ada')).toBe(false);
  });

describe('economy — the subscription’s STANDING (M7 v308)', () => {
  it('the SERVICE’s word wins over the client’s own clock', () => {
    // The service says "expired" even though the row still says active and the client’s own clock has not
    // reached the expiry: the service computes the standing against ITS clock, and that clock is the
    // system of record’s.
    const row = toSubscriptionRow({ ...sub({ active: true, expiresAt: Date.now() + 10_000_000 }), status: 'expired' })!;
    expect(row.statusText).toBe('Expired');
    expect(row.isActive).toBe(false);
  });

  it('a service that says nothing leaves the client’s own computation in charge', () => {
    const row = toSubscriptionRow(sub({ active: true, expiresAt: Date.now() + 10_000_000 }))!;
    expect(row.statusText).toBe('Active');
    expect(row.isActive).toBe(true);
  });

  it('the service’s "cancelled" reads Never — the word this surface has always used', () => {
    const row = toSubscriptionRow({ ...sub({ active: true, expiresAt: Date.now() + 10_000_000 }), status: 'cancelled' })!;
    expect(row.statusText).toBe('Never');
    expect(row.isActive).toBe(false);
  });
});

describe('economy — the renewal NOTE (M7 v313)', () => {
  it('a subscription that ENDED says why there is no button to press', () => {
    // A panel that said only "Expired" would leave the reader hunting for a button that does not exist.
    const row = toSubscriptionRow(sub({ active: true, expiresAt: 1_000_000_000_000 }))!;
    expect(row.renewNote).toContain('cannot renew it');
    expect(row.renewNote).toContain('no billing');
  });

  it('a STANDING subscription carries no note', () => {
    const row = toSubscriptionRow(sub())!;
    expect(row.renewNote).toBeNull();
  });

  it('a CANCELLED subscription carries it too — the rule is the same', () => {
    const row = toSubscriptionRow(sub({ active: false }))!;
    expect(row.renewNote).toContain('cannot renew it');
  });
});
});