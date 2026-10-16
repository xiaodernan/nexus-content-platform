import { describe, expect, it } from 'vitest';
import type { AccountId } from './community';
import {
  isSubscribed,
  priceText,
  tipText,
} from './monetization';
import type { Subscription, Tip } from './monetization';

const sub: Subscription = {
  creatorId: 'acct-creator' as AccountId,
  planId: 'pro-monthly',
  priceCents: 1500 as PriceCentsBrand,
  currency: 'CNY',
  active: true,
  subscribedAt: 1_700_000_000_000,
};

const tip: Tip = {
  recipientId: 'acct-creator' as AccountId,
  amountCents: 500 as PriceCentsBrand,
  message: 'great work',
  anonymous: false,
};

describe('monetization — priceText', () => {
  it('formats CNY price', () => {
    expect(priceText(1500 as PriceCentsBrand, 'CNY')).toBe('¥15.00');
  });

  it('formats USD price', () => {
    expect(priceText(1500 as PriceCentsBrand, 'USD')).toBe('$15.00');
  });

  it('formats JPY price', () => {
    expect(priceText(1500 as PriceCentsBrand, 'JPY')).toBe('¥15.00');
  });

  it('zero price shows Free', () => {
    expect(priceText(0 as PriceCentsBrand, 'CNY')).toBe('Free');
  });

  it('negative price shows Free', () => {
    expect(priceText(-100 as PriceCentsBrand, 'CNY')).toBe('Free');
  });
});

describe('monetization — tipText', () => {
  const escape = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  it('renders tipped amount with message', () => {
    expect(tipText(tip, escape)).toBe('Someone tipped ¥5.00 — great work');
  });

  it('anonymous hides sender', () => {
    const anon: Tip = { ...tip, anonymous: true };
    expect(tipText(anon, escape)).toBe('Anonymous tipped ¥5.00 — great work');
  });

  it('escapes message text', () => {
    const evil: Tip = { ...tip, message: '<script>' };
    expect(tipText(evil, escape)).toBe('Someone tipped ¥5.00 — &lt;script&gt;');
  });

  it('omits message when empty', () => {
    const noMsg: Tip = { ...tip, message: '' };
    expect(tipText(noMsg, escape)).toBe('Someone tipped ¥5.00');
  });
});

describe('monetization — isSubscribed', () => {
  it('true when active and creator matches viewer', () => {
    expect(isSubscribed(sub, 'acct-creator' as AccountId)).toBe(true);
  });

  it('false when not active', () => {
    const inactive: Subscription = { ...sub, active: false };
    expect(isSubscribed(inactive, 'acct-creator' as AccountId)).toBe(false);
  });

  it('false when creator mismatch', () => {
    expect(isSubscribed(sub, 'acct-other' as AccountId)).toBe(false);
  });

  it('false when null or no viewer', () => {
    expect(isSubscribed(null, 'acct-creator' as AccountId)).toBe(false);
    expect(isSubscribed(sub, null)).toBe(false);
  });
});

// Branded type helper used only in tests.
type PriceCentsBrand = number & { __brand: 'PriceCents' };