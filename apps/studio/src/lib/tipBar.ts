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
  /**
   * v395 — WHICH window of the tips the bar is showing, in rows from the newest — the same
   * rows the service pages by (v391). The list was already a WINDOW over the whole table (v350);
   * a window with no position cannot say which tips it is the window OF.
   */
  offset?: number;
  /**
   * v395 — the window's SIZE, as the service answered it. A pager that does not know how big a
   * window is cannot name the page it would offer, so without this there is no pager — only the
   * count.
   */
  limit?: number;
  /**
   * v395 — how to build the URL of another window. The profile page is server-rendered and holds
   * no session (ADR 0018 is why), so its pager is a LINK and not a button: the page that knows the
   * URL builds it and the bar draws an <a>. A bar given no builder draws no pager at all — a link
   * it cannot build is a link it does not draw.
   */
  pageHref?: (offset: number) => string;
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
  // v395 — the window's POSITION, in rows from the newest (the same rows the service pages by,
  // v391). v350 said "the N newest"; past the first window that is a true thing about the first
  // window and a false thing about the third (v386's correction, the same one the filed list and
  // the economy panel got), so the line says WHICH rows: "showing 101–150 of 150".
  const offset =
    typeof facts.offset === 'number' && Number.isFinite(facts.offset) && facts.offset > 0 ? Math.floor(facts.offset) : 0;
  let more = '';
  if (count > shown) {
    if (shown <= 0) {
      // v395 — an empty window PAST the first page is not an empty tip list: the service counted
      // the tips and this window holds none of them — a fact about the page, not about the
      // account. On the first window an empty list is the honest "no tips yet", and says nothing
      // extra.
      more = offset > 0 ? ' · this page is past the end — the service answered an empty window' : '';
    } else if (offset <= 0) {
      more = ` · showing the ${shown} newest of ${count}`;
    } else {
      more = ` · showing ${offset + 1}–${offset + shown} of ${count}`;
    }
  }
  // v395 — the PAGER, and it is made of LINKS: the profile page is server-rendered and cannot act
  // (it does not know who the device is — ADR 0018 is why there is no session), so the page that
  // knows the URL builds it and the bar draws an <a>. At a boundary there is no page to offer and
  // the control is a <span>: a link that went nowhere would be a lie with an href. "Older" is
  // offered only when the NEXT window would hold something — the whole-table count rides on every
  // answer (v355), so a page the service has already counted as empty is a page the bar does not
  // offer.
  const windowSize =
    typeof facts.limit === 'number' && Number.isFinite(facts.limit) && facts.limit > 0 ? Math.floor(facts.limit) : null;
  const hrefFor = typeof facts.pageHref === 'function' ? facts.pageHref : null;
  const pageControl = (direction: 'newer' | 'older', target: number | null): string => {
    const text = direction === 'newer' ? '‹ Newer' : 'Older ›';
    const title = direction === 'newer' ? 'the newer tips' : 'the older tips';
    if (target === null || hrefFor === null) {
      return `<span class="nexus-tips-page" data-tips-page="${direction}" title="${title}">${text}</span>`;
    }
    return `<a class="nexus-tips-page" data-tips-page="${direction}" href="${escapeHtml(hrefFor(target))}" title="${title}">${text}</a>`;
  };
  const pager =
    windowSize !== null && hrefFor !== null && (offset > 0 || count > shown)
      ? `<div class="nexus-tips-pager">
${pageControl('newer', offset > 0 ? Math.max(offset - windowSize, 0) : null)}
${pageControl('older', offset + windowSize < count ? offset + windowSize : null)}
</div>`
      : '';
  return `<div class="nexus-tips" data-tips="${count}" data-tip-total="${facts.totalCents}">
<span class="nexus-tips-count">${escapeHtml(label)} \u00b7 ${escapeHtml(total)}${more}</span>
<a class="nexus-tips-action" href="${escapeHtml(href)}" title="give this account a tip from the Studio">Tip</a>
${list}
${pager}
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
.nexus-tips-pager{flex-basis:100%;display:flex;gap:10px;align-items:center;margin-top:2px}
.nexus-tips-page{color:#f59e0b;font-weight:600;text-decoration:none}
.nexus-tips-page:hover{text-decoration:underline}
.nexus-tips-pager span.nexus-tips-page{color:#5b6472;font-weight:400}
</style>`;
