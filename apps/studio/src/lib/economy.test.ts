import { describe, expect, it } from 'vitest';

import type { PriceCents, Tip, Subscription } from './monetization';

import {
  tipGivenText,
  tipPayerText,
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