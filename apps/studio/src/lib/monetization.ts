/**
 * Stage D — 创作者经济：订阅与打赏的客户端类型（预设计，受 ADR 0018 阻塞）。
 *
 * 纯前端，不引入 fetch、localStorage、session 或支付 SDK。不处理支付，只定义
 * “客户端将来会展示什么”，价格与激活状态均由服务端下发，客户端不自行判定。
 *
 * 与 ADR 0018 §60 一致：无 signedIn 徽章、无会话、无支付令牌；消费者按 `assurance`
 * 自行判定数据价值，不凭客户端注释信任。
 */

import type { AccountId } from './community';

/** 价格以分为单位，> 0，纯展示用。服务端下发，客户端不计算、不折算。 */
export type PriceCents = number & { __brand: 'PriceCents' };

export type Currency = 'CNY' | 'USD' | 'JPY';

/** 订阅：active 与 subscribedAt 由服务端下发，客户端只读、只展示。expiresAt 为 null 表示不过期。 */
export interface Subscription {
  creatorId: AccountId;
  planId: string;
  priceCents: PriceCents;
  currency: Currency;
  active: boolean;
  subscribedAt: number | null;
  expiresAt: number | null;
}

/** 打赏：message 由发送者填写，客户端展示前必须 escape；anonymous 决定是否显示发送方 handle。 */
export interface Tip {
  recipientId: AccountId;
  amountCents: PriceCents;
  message: string;
  anonymous: boolean;
}

/** 订阅卡片的价格行，例如 `¥15.00 / 月`。priceCents 为 0 时展示 `Free`，不展示分额。 */
export function priceText(priceCents: PriceCents, currency: Currency): string {
  if (!priceCents || priceCents <= 0) return 'Free';
  const units = priceCents / 100;
  const symbol = currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : '¥';
  return `${symbol}${units.toFixed(2)}`;
}

/** 把一个 Tip 渲染为显示文本，message 必须由 caller 先 escape（与 explore/artifact 复用同一套规则）。 */
export function tipText(tip: Tip, escape: (text: string) => string): string {
  const amount = priceText(tip.amountCents, 'CNY'); // tips 当前仅 CNY，后续按货币字段扩展
  const who = tip.anonymous ? 'Anonymous' : 'Someone';
  const msg = tip.message ? ` — ${escape(tip.message)}` : '';
  return `${who} tipped ${amount}${msg}`;
}

/** 把一个 Tip 的金额渲为展示文本（tips 当前仅 CNY，后续按货币字段扩展）。 */
export function tipAmountText(tip: Tip): string {
  return priceText(tip.amountCents, 'CNY');
}

/** 判断价格是否为免费（0 分），供客户端卡片决定是否展示价格行。 */
export function isFreePrice(priceCents: PriceCents): boolean {
  return !priceCents || priceCents <= 0;
}

/** 判断一条 Subscription 对当前 viewer 是否有效（active 且已订阅），纯判断，不改状态。 */
export function isSubscribed(sub: Subscription | null, viewerId: AccountId | null): boolean {
  if (!viewerId || !sub) return false;
  return sub.active && sub.creatorId === viewerId;
}

/** 订阅状态展示文本。active 且 subscribedAt 已设 → "Active"；否则 "Inactive"；null → "Never subscribed"。 */
export function subscriptionStatusText(sub: Subscription | null): string {
  if (!sub) return 'Never subscribed';
  return sub.active ? 'Active' : 'Inactive';
}

/** 打赏列表的总金额（分），用于展示“累计打赏”。 */
export function tipsTotal(tips: ReadonlyArray<Tip>): PriceCents {
  return tips.reduce((sum, t) => sum + t.amountCents, 0) as unknown as PriceCents;
}

/** 订阅剩余天数展示文本。expiresAt 为 null → "N/A"；已过期 → "Expired"；否则 "N d left"。 */
export function subscriptionDaysLeftText(sub: Subscription | null, now: number): string {
  if (!sub || sub.expiresAt === null) return 'N/A';
  if (sub.expiresAt <= now) return 'Expired';
  return `${Math.ceil((sub.expiresAt - now) / (1000 * 60 * 60 * 24))} d left`;
}