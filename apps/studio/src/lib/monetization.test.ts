import { describe, expect, it } from 'vitest';
import type { AccountId } from './community';
import type { Subscription, PriceCents, Tip } from './monetization';
import {
  currencySymbol,
  isFreePrice,
  isSubscribed,
  priceText,
  subscriptionDaysLeftText,
  subscriptionStatusText,
  tipAmountText,
  tipText,
  tipsTotal,
  tipsTotalByAgent,
  tipCount,
  tipPercentShare,
  tipsByRecipient,
  subscriptionActiveText,
} from './monetization';



const sub: Subscription = {
  creatorId: 'acct-creator' as AccountId,
  planId: 'pro-monthly',
  priceCents: 1500 as PriceCentsBrand,
  currency: 'CNY',
  active: true,
  subscribedAt: 1_700_000_000_000,
  expiresAt: null,
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

describe('monetization — subscriptionStatusText', () => {
  it('Active / Inactive / Never subscribed', () => {
    expect(subscriptionStatusText(sub)).toBe('Active');
    expect(subscriptionStatusText({ ...sub, active: false })).toBe('Inactive');
    expect(subscriptionStatusText(null)).toBe('Never subscribed');
  });
});

describe('monetization — subscriptionDaysLeftText', () => {
  const now = 1_700_000_000_000;

  it('N/A when null sub or null expiresAt', () => {
    expect(subscriptionDaysLeftText(null, now)).toBe('N/A');
    expect(subscriptionDaysLeftText(sub, now)).toBe('N/A');
  });

  it('Expired when past expiresAt', () => {
    const expired: Subscription = { ...sub, expiresAt: now - 1 };
    expect(subscriptionDaysLeftText(expired, now)).toBe('Expired');
  });

  it('N d left when not expired', () => {
    const active: Subscription = { ...sub, expiresAt: now + 1_700_000_000 };
    expect(subscriptionDaysLeftText(active, now)).toBe('20 d left');
  });
});

describe('monetization — tipsTotal', () => {
  it('sums all tip amounts', () => {
    const tips: Tip[] = [
      { ...tip, amountCents: 500 as PriceCentsBrand },
      { ...tip, amountCents: 1200 as PriceCentsBrand },
      { ...tip, amountCents: 300 as PriceCentsBrand },
    ];
    expect(tipsTotal(tips)).toBe(2000 as PriceCentsBrand);
  });

  it('zero for empty list', () => {
    expect(tipsTotal([])).toBe(0 as PriceCentsBrand);
  });
});

describe('monetization — tipAmountText', () => {
  it('renders amount with CNY symbol', () => {
    expect(tipAmountText(tip)).toBe('¥5.00');
  });
});

describe('monetization — isFreePrice', () => {
  it('true when 0 or negative', () => {
    expect(isFreePrice(0 as PriceCentsBrand)).toBe(true);
    expect(isFreePrice(-100 as PriceCentsBrand)).toBe(true);
  });

  it('false when positive', () => {
    expect(isFreePrice(1500 as PriceCentsBrand)).toBe(false);
  });
});

describe('monetization — currencySymbol', () => {
  it('USD -> $, CNY -> ¥', () => {
    expect(currencySymbol('USD')).toBe('$');
    expect(currencySymbol('CNY')).toBe('¥');
  });
});

describe('monetization — tipsTotalByAgent', () => {
  it('sums tips by recipient without mutating input', () => {
    const tips: Tip[] = [
      { ...tip, recipientId: 'r-1' as AccountId, amountCents: 500 as PriceCentsBrand },
      { ...tip, recipientId: 'r-2' as AccountId, amountCents: 700 as PriceCentsBrand },
      { ...tip, recipientId: 'r-1' as AccountId, amountCents: 300 as PriceCentsBrand },
    ];
    const byAgent = tipsTotalByAgent(tips);
    expect(byAgent['r-1']).toBe(800 as PriceCentsBrand);
    expect(byAgent['r-2']).toBe(700 as PriceCentsBrand);
    expect(byAgent['r-3']).toBeUndefined();
    expect(tips.length).toBe(3);
  });

  it('empty for empty list', () => {
    expect(tipsTotalByAgent([])).toEqual({});
  });
});

describe('monetization — tipCount', () => {
  it('counts all tips', () => {
    expect(tipCount([tip, tip, tip])).toBe(3);
    expect(tipCount([])).toBe(0);
  });
});

describe('monetization — subscriptionActiveText', () => {
  const now = 1_700_000_000_000;

  it('Active when active and not expired', () => {
    expect(subscriptionActiveText({ ...sub, active: true, expiresAt: now + 86_400_000 }, now)).toBe(
      'Active',
    );
    expect(subscriptionActiveText({ ...sub, active: true, expiresAt: null }, now)).toBe('Active');
  });

  it('Expired when active but expired', () => {
    expect(subscriptionActiveText({ ...sub, active: true, expiresAt: now - 1 }, now)).toBe(
      'Expired',
    );
  });

  it('Never when null or inactive', () => {
    expect(subscriptionActiveText(null, now)).toBe('Never');
    expect(subscriptionActiveText({ ...sub, active: false, expiresAt: null }, now)).toBe('Never');
  });
});

// Branded type helper used only in tests.
type PriceCentsBrand = number & { __brand: 'PriceCents' };

describe('monetization — tipPercentShare', () => {
  const tip: Tip = { recipientId: 'acct-a', amountCents: 300 as PriceCentsBrand, message: 'nice', anonymous: false };

  it('returns floor percentage of total', () => {
    expect(tipPercentShare(tip, 1000)).toBe(30); // 300/1000 = 30%
  });

  it('returns 0 for zero or negative total', () => {
    expect(tipPercentShare(tip, 0)).toBe(0);
    expect(tipPercentShare(tip, -100)).toBe(0);
  });
});

describe('monetization — tipsByRecipient', () => {
  const t1: Tip = { recipientId: 'acct-a', amountCents: 100 as PriceCentsBrand, message: 'a', anonymous: false };
  const t2: Tip = { recipientId: 'acct-b', amountCents: 200 as PriceCentsBrand, message: 'b', anonymous: false };
  const t3: Tip = { recipientId: 'acct-a', amountCents: 300 as PriceCentsBrand, message: 'c', anonymous: false };
  const tips = [t1, t2, t3];

  it('returns only matching recipient tips as a new array', () => {
    const out = tipsByRecipient(tips, 'acct-a');
    expect(out.map((t) => t.amountCents)).toEqual([100, 300]);
    expect(out.length).toBe(2);
    expect(tips.length).toBe(3); // input untouched
  });

  it('empty for no match', () => {
    expect(tipsByRecipient(tips, 'acct-z')).toEqual([]);
  });
});

describe('monetization — subscriptionDaysLeftText', () => {
  const now = 1_700_000_000_000;
  const sub = (expiresAt: number): Subscription => ({
    creatorId: 'acct-a' as AccountId,
    planId: 'p-1',
    priceCents: 100 as PriceCents,
    currency: 'USD',
    active: true,
    subscribedAt: now,
    expiresAt,
  });

  it('answers N/A for a subscription with no expiry', () => {
    const neverExpires: Subscription = {
      creatorId: 'acct-a' as AccountId,
      planId: 'p-1',
      priceCents: 100 as PriceCents,
      currency: 'USD',
      active: true,
      subscribedAt: now,
      expiresAt: null,
    };
    expect(subscriptionDaysLeftText(neverExpires, now)).toBe('N/A');
    expect(subscriptionDaysLeftText(null, now)).toBe('N/A');
  });

  it('answers Expired when the expiry is at or before now', () => {
    expect(subscriptionDaysLeftText(sub(now - 1), now)).toBe('Expired');
  });

  it('shows whole days left for a future expiry', () => {
    expect(subscriptionDaysLeftText(sub(now + 86_400_000), now)).toBe('1 d left');
  });
});

describe('monetization — currencySymbol', () => {
  it('returns $ for USD', () => {
    expect(currencySymbol('USD')).toBe('$');
  });

  it('returns the symbol for every supported currency', () => {
    expect(currencySymbol('USD')).toBe('$');
    expect(currencySymbol('CNY')).toBe('\u00A5');
    expect(currencySymbol('JPY')).toBe('\u00A5');
  });
});