/**
 * M7 v298 — the TIPS bar on the profile page.
 *
 * A tip is for an ACCOUNT, not for a work, so the bar belongs on the PROFILE \u2014 the page a reader lands on
 * when they want to know about a person. The page is server-rendered and cannot act (it does not know who
 * the device is \u2014 ADR 0018 is why there is no session), so it shows the numbers and links to the Studio,
 * which is where the account lives.
 *
 * PURE and string-returning, like every other renderer here.
 *
 * **What the bar refuses to say:**
 *
 * - **A failed read is NOT zero tips.** "no tips" and "the tips could not be read" are different facts,
 *   and a page that showed the first when it knew the second would tell a reader that nobody ever gave
 *   anything \u2014 which is the one thing a creator\u2019s page must not get wrong.
 * - **The bar does not name the PAYER.** The service records who gave what, and a page that printed the
 *   payer\u2019s name would turn a small gesture into a public list of who supports whom. The count and the
 *   total are the facts; the identities are the reader\u2019s business.
 */
import { escapeHtml } from './pageShell';
import { priceText } from './economy';
import type { Currency, PriceCents } from './monetization';

/** One tip, in the service's own wire shape. */
export interface TipEntry {
  id?: unknown;
  recipientId?: unknown;
  payerId?: unknown;
  amountCents?: unknown;
  currency?: unknown;
  message?: unknown;
  anonymous?: unknown;
  createdAt?: unknown;
  handle?: unknown;
  assurance?: unknown;
}

/** A tip reduced to the facts a reader can act on. */
export interface TipRow {
  id: string;
  /** The amount, in cents. */
  amountCents: number;
  /** The amount as a reader sees it \u2014 \u00a515.00. */
  amountText: string;
  /** The payer's message, escaped. */
  messageText: string;
  /** Whether the tip was anonymous. */
  anonymous: boolean;
  /**
   * v341 — WHEN the tip was given, in a reader's words — or null when the wire did not say.
   *
   * <p>The service has carried the instant since the tip's own beginning, and the ECONOMY panel has said
   * it since v333; the PROFILE page — the page a reader lands on when they want to know about a person —
   * did not. It is the same wire and the same clock, and a gift with no date on it is a gift without a
   * history.
   */
  givenText: string | null;
}

/**
 * One tip, or `null` when it cannot be shown honestly.
 *
 * A tip needs an id and a finite amount: the id is what the row is keyed by, and an amount with no number
 * is not an amount.
 */
/**
 * WHEN a tip was given, in a reader's words — or null when the wire did not say.
 *
 * <p>The instant is the service's own, in UTC, formatted the same way the economy panel formats the
 * subscription's two dates (v328, v329) and the tip receipt (v333): one clock, one style, so a reader
 * comparing a tip's date with a subscription's date is reading two dates written the same way.
 */
function tipGivenTextOf(createdAt: unknown): string | null {
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return null;
  return new Date(createdAt).toISOString().replace('.000Z', 'Z');
}

export function toTipRow(entry: unknown): TipRow | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const t = entry as TipEntry;
  if (typeof t.id !== 'string' || t.id.length === 0) return null;
  if (typeof t.amountCents !== 'number' || !Number.isFinite(t.amountCents)) return null;
  const currency = typeof t.currency === 'string' && t.currency.length > 0 ? (t.currency as Currency) : 'CNY';
  return {
    id: t.id,
    amountCents: t.amountCents,
    amountText: priceText(t.amountCents as PriceCents, currency),
    messageText: typeof t.message === 'string' ? escapeHtml(t.message) : '',
    anonymous: t.anonymous === true,
    // v341 — and when it was given. The instant is the service's own (v333's rule: the same clock, one
    // style), and a wire with no instant says nothing rather than guessing.
    givenText: tipGivenTextOf(t.createdAt),
  };
}

/** The tips, in the order the service gave them. */
export function toTipRows(entries: readonly unknown[]): TipRow[] {
  const rows: TipRow[] = [];
  for (const entry of entries) {
    const row = toTipRow(entry);
    if (row) rows.push(row);
  }
  return rows;
}

/** What the bar needs to know. */
export interface TipBarFacts {
  /** The account the bar is for. */
  accountId: string;
  /** How many tips the answer carried, or null when the count could not be read. */
  count: number | null;
  /** How much the account was given, in cents \u2014 the DATABASE\u2019s sum. */
  totalCents: number | null;
  /** The tips themselves \u2014 the amounts and the messages, without the payers. */
  tips?: TipRow[];
}

/**
 * The bar, as a section of HTML \u2014 or an empty string when there is nothing honest to say.
 */
export function renderTipBar(facts: TipBarFacts): string {
  if (facts.count === null || facts.totalCents === null) {
    return '';
  }
  const count = facts.count;
  const label = count === 1 ? '1 tip' : `${count} tips`;
  const total = priceText(facts.totalCents as PriceCents, 'CNY');
  const href = `/?tip=${encodeURIComponent(facts.accountId)}`;
  const rows = (facts.tips ?? [])
    .map((t) => {
      const message = t.messageText ? ` \u2014 ${t.messageText}` : '';
      // v341 — and WHEN it was given. The instant, not "3 days ago": a relative date goes stale the
      // moment it is written, and a gift is a fact about the past that does not move.
      const when = t.givenText ? ` <span class="nexus-tip-when">· on ${escapeHtml(t.givenText)}</span>` : '';
      return `<li data-tip="${escapeHtml(t.id)}"><span class="nexus-tip-amount">${escapeHtml(t.amountText)}</span><span class="nexus-tip-note">${message}</span>${when}</li>`;
    })
    .join('\n');
  const list = rows ? `<ul class="nexus-tips-list">\n${rows}\n</ul>` : '';
  // v350 — the count is the WHOLE number and the list is a WINDOW, so the bar says how many it is not
  // showing: a reader who sees "12 tips" and five messages would otherwise read the five as all of them.
  const shown = (facts.tips ?? []).length;
  const more = shown > 0 && count > shown ? ` · showing the ${shown} newest of ${count}` : '';
  return `<div class="nexus-tips" data-tips="${count}" data-tip-total="${facts.totalCents}">
<span class="nexus-tips-count">${escapeHtml(label)} \u00b7 ${escapeHtml(total)}${more}</span>
<a class="nexus-tips-action" href="${escapeHtml(href)}" title="give this account a tip from the Studio">Tip</a>
${list}
</div>`;
}

/**
 * Insert the bar into the page, before `</body>`.
 *
 * PURE and testable, like the other injections here: a page without a closing body tag is returned
 * unchanged rather than corrupted.
 */
export function injectTipBar(html: string, bar: string): string {
  if (!bar) return html;
  if (!html.includes('</body>')) return html;
  return html.replace('</body>', `${bar}</body>`);
}

/** The styles the bar carries with it \u2014 the profile page\u2019s shell belongs to the gallery builder. */
export const TIP_BAR_STYLES = `<style>
.nexus-tips{position:fixed;left:16px;top:16px;z-index:10;display:flex;flex-wrap:wrap;gap:10px;align-items:center;max-width:320px;background:#12151b;border:1px solid #262b34;border-radius:6px;padding:8px 12px;color:#9aa3b2;font:11px Inter,system-ui,sans-serif}
.nexus-tips-count{color:#e6e8ec;font-weight:600}
.nexus-tips-action{color:#f59e0b;font-weight:600;text-decoration:none}
.nexus-tips-action:hover{text-decoration:underline}
.nexus-tips-list{list-style:none;margin:0;padding:0;flex-basis:100%;display:flex;flex-direction:column;gap:2px;max-height:110px;overflow:auto}
.nexus-tip-amount{color:#cfd6e4;font-weight:600}
.nexus-tip-note{color:#9aa3b2}
</style>`;
