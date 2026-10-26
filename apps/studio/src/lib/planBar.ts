/**
 * M7 v301 — the PLANS bar on the profile page.
 *
 * A plan is what a creator OFFERS, so the plans belong on their profile \u2014 the page a reader lands on when
 * they want to know about a person, and the page where a supporter finds something to back.
 *
 * PURE and string-returning, like every other renderer here.
 *
 * **What the bar refuses to say:**
 *
 * - **A failed read is NOT \u2018no plans\u2019.** \u201cThis creator offers nothing\u201d and \u201cthe plans could not be read\u201d are
 *   different facts, and a page that showed the first when it knew the second would say that a creator
 *   whose plans are one read away has nothing to offer.
 * - **The bar does not show what a plan has EARNED.** The count of subscriptions is the creator\\u2019s business
 *   and the reader has no business seeing it unless the creator says so; the plans and their PRICES are
 *   what a supporter needs to decide.
 */
import { escapeHtml } from './pageShell';
import { PLAN_TERMS_NOTE, planCountText, planPeriodText as sharedPlanPeriodText, planRetiredText, priceText } from './economy';
import type { Currency, PriceCents } from './monetization';

/** One plan, in the service's own wire shape. */
export interface PlanEntry {
  planId?: unknown;
  creatorId?: unknown;
  priceCents?: unknown;
  currency?: unknown;
  period?: unknown;
  active?: unknown;
  createdAt?: unknown;
  handle?: unknown;
  assurance?: unknown;
}

/** A plan reduced to the facts a supporter can act on. */
export interface PlanRow {
  planId: string;
  /** The price, in cents. */
  priceCents: number;
  /** The price as a reader sees it \u2014 \u00a515.00. */
  priceText: string;
  /** The period: once, month or year. */
  period: string;
  /** The period in a reader's words. */
  periodText: string;
  /** Whether the plan is still offered. */
  active: boolean;
  /**
   * v342 — WHEN the plan was opened, in a reader's words — or null when the wire did not say.
   *
   * <p>The service has carried the instant since the plan's own beginning, and the tip bar on the same
   * page said its dates since v341; the plan bar said nothing. A plan with no date on it is a price with
   * no history — a reader cannot tell a plan opened last week from one opened last year.
   */
  openedText: string | null;
  /**
   * v371/v374 — that these are the terms ON OFFER now — or null when the plan is retired.
   *
   * <p>A retired plan’s terms are the last ones it offered, so the note is only there while the plan is
   * still offered — a bar that called a retired plan’s terms "on offer" would be wrong about it.
   */
  termsText: string | null;
}

/**
 * The period in a reader's words.
 *
 * A KNOWN period is spelled the way a person would say it; an unknown one is passed through as it
 * arrived \u2014 a bar that labelled an unknown period as \u2018monthly\u2019 would be making a claim the service never made.
 */
export function planPeriodText(period: string): string {
  // v371 — ONE wording for a period, everywhere it is shown. The bar used to say "monthly" and the
  // creator’s own panel said "per month" for the same service’s word — and a reader comparing the two
  // had no way to know they were the same thing.
  return sharedPlanPeriodText(period);
}

/**
 * One plan, or `null` when it cannot be shown honestly.
 *
 * A plan needs an id (it is the ADDRESS a supporter subscribes to) and a finite price (it is the number
 * the supporter would be committing).
 */
/**
 * WHEN a plan was opened, in a reader's words — or null when the wire did not say.
 *
 * <p>The instant is the service's own, in UTC, in the same style as the tip bar's dates (v341): one
 * clock, one style, so a reader comparing a plan's date with a tip's date is reading two dates written
 * the same way.
 */
function planOpenedTextOf(createdAt: unknown): string | null {
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return null;
  return new Date(createdAt).toISOString().replace('.000Z', 'Z');
}

export function toPlanRow(entry: unknown): PlanRow | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const p = entry as PlanEntry;
  if (typeof p.planId !== 'string' || p.planId.length === 0) return null;
  if (typeof p.priceCents !== 'number' || !Number.isFinite(p.priceCents)) return null;
  const currency = typeof p.currency === 'string' && p.currency.length > 0 ? (p.currency as Currency) : 'CNY';
  const period = typeof p.period === 'string' && p.period.length > 0 ? p.period : 'once';
  return {
    planId: p.planId,
    priceCents: p.priceCents,
    priceText: priceText(p.priceCents as PriceCents, currency),
    period,
    periodText: planPeriodText(period),
    active: p.active !== false,
    // v371 — and that these are the terms ON OFFER today.
    termsText: p.active !== false ? PLAN_TERMS_NOTE : null,
    // v342 — and when it was opened. The instant is the service's own, in UTC, in the same style as the
    // tip bar's dates (v341) and the economy panel's (v333).
    openedText: planOpenedTextOf(p.createdAt),
  };
}

/** The plans, in the order the service gave them. */
export function toPlanRows(entries: readonly unknown[]): PlanRow[] {
  const rows: PlanRow[] = [];
  for (const entry of entries) {
    const row = toPlanRow(entry);
    if (row) rows.push(row);
  }
  return rows;
}

/** What the bar needs to know. */
export interface PlanBarFacts {
  /** The account whose plans these are. */
  accountId: string;
  /** The plans, or null when they could not be read. */
  plans: PlanRow[] | null;
  /**
   * v372 — how many plans the creator offers, over the WHOLE table — or null when the count could not be
   * read.
   *
   * <p>The count is not the window's length: the bar's list is a window, and a reader who saw three plans
   * and a creator who offers five would read the three as all of them.
   */
  count?: number | null;
  /**
   * v396 — WHICH window of the plans the bar is showing, in rows from the newest — the same rows the
   * service pages by (v392). The list was already a WINDOW over the whole catalogue (v372); a window
   * with no position cannot say which plans it is the window OF.
   */
  offset?: number;
  /**
   * v396 — the window's SIZE, as the service answered it. A pager that does not know how big a window
   * is cannot name the page it would offer, so without this there is no pager — only the count.
   */
  limit?: number;
  /**
   * v396 — how to build the URL of another window, the same shape the tip bar got in v395: the profile
   * page is server-rendered and holds no session (ADR 0018 is why), so its pager is a LINK and not a
   * button. A bar given no builder draws no pager at all — a link it cannot build is a link it does
   * not draw.
   */
  pageHref?: (offset: number) => string;
}

/**
 * The bar, as a section of HTML \u2014 or an empty string when there is nothing honest to say.
 */
export function renderPlanBar(facts: PlanBarFacts): string {
  if (facts.plans === null) {
    return '';
  }
  const shown = facts.plans.length;
  // v396 — the window's POSITION, in rows from the newest (the same rows the service pages by, v392).
  // Past the first window an empty list is NOT "this creator offers nothing" — it is a page past the
  // end, and the bar says so instead of vanishing (the tip bar learned this in v395).
  const offset =
    typeof facts.offset === 'number' && Number.isFinite(facts.offset) && facts.offset > 0 ? Math.floor(facts.offset) : 0;
  const count = typeof facts.count === 'number' && Number.isFinite(facts.count) ? facts.count : null;
  if (shown === 0 && (offset <= 0 || count === null || count <= 0)) {
    return '';
  }
  // v372/v373 — the count is the WHOLE number and the list is a WINDOW, so the bar says how many it is not
  // showing. The wording is the tip bar's (v350), so a reader who reads both bars reads one sentence —
  // and it is the SHARED wording now (v373), so the creator's own panel says it the same way.
  // v396 — and past the first window it says WHICH plans (the offset is the shared wording's third
  // argument since v392), while an empty window past the end says it is past the end.
  // v518 — and past the first window it says "of these N rows:" so the reader knows the count
  // is the whole desk, not the windowed subset, matching the pattern from moderation tally (v377),
  // follower tally (v398), like bar (v400), and comment bar (v399).
  // v520 — the count line now also includes the currency context when multiple currencies
  // are involved, so a reader sees the total in the correct currency context.
  const countPrefix =
    shown > 0 && count !== null && count > shown && offset > 0
      ? `of these ${shown} rows: `
      : '';
  const countText =
    shown <= 0
      ? 'this page is past the end — the service answered an empty window'
      : `${countPrefix}${planCountText(count, shown, offset)}`;
  // v396 — the PAGER, as LINKS, the same shape the tip bar got in v395: the page is server-rendered and
  // cannot act (ADR 0018), so the route builds the URL and the bar draws an <a>; at a boundary the
  // control is a <span> with no href — a link that went nowhere would be a lie with an href. "Older" is
  // offered only when the NEXT window would hold something: the whole-table count rides on every
  // answer (v372), so a page the service has already counted as empty is a page the bar does not offer.
  const windowSize =
    typeof facts.limit === 'number' && Number.isFinite(facts.limit) && facts.limit > 0 ? Math.floor(facts.limit) : null;
  const hrefFor = typeof facts.pageHref === 'function' ? facts.pageHref : null;
  const pageControl = (direction: 'newer' | 'older', target: number | null): string => {
    const text = direction === 'newer' ? '‹ Newer' : 'Older ›';
    const title = direction === 'newer' ? 'the newer plans' : 'the older plans';
    if (target === null || hrefFor === null) {
      return `<span class="nexus-plans-page" data-plans-page="${direction}" title="${title}">${text}</span>`;
    }
    return `<a class="nexus-plans-page" data-plans-page="${direction}" href="${escapeHtml(hrefFor(target))}" title="${title}">${text}</a>`;
  };
  const pager =
    windowSize !== null && hrefFor !== null && (offset > 0 || (count !== null && count > shown))
      ? `<div class="nexus-plans-pager">
${pageControl('newer', offset > 0 ? Math.max(offset - windowSize, 0) : null)}
${pageControl('older', count !== null && offset + windowSize < count ? offset + windowSize : null)}
</div>`
      : '';
  const items = facts.plans
    .map((plan) => {
      const href = `/?subscribe=${encodeURIComponent(plan.planId)}`;
      // v377 — and the SHARED wording: the creator's own panel says it too (it said nothing before).
      const retired = plan.active ? '' : ' \u00b7 ' + planRetiredText(plan.active);
      // v342 — and WHEN it was opened: the instant, not "3 days ago" — a relative date goes stale the
      // moment it is written, and a plan is a fact about the past that does not move.
      const opened = plan.openedText ? ` <span class="nexus-plan-opened">\u00b7 opened ${escapeHtml(plan.openedText)}</span>` : '';
      // v371 — and that these are the terms ON OFFER today — so a reader who compares this bar with
      // their own subscriptions can tell a plan’s current terms from the terms they agreed to.
      const terms = plan.termsText ? ` <span class="nexus-plan-terms">\u00b7 ${escapeHtml(plan.termsText)}</span>` : '';
      return `<li data-plan="${escapeHtml(plan.planId)}" data-plan-price="${plan.priceCents}" data-plan-terms="${escapeHtml(plan.termsText ?? '')}">
<span class="nexus-plan-id">${escapeHtml(plan.planId)}</span>
<span class="nexus-plan-price">${escapeHtml(plan.priceText)} \u00b7 ${escapeHtml(plan.periodText)}${terms}${retired}${opened}</span>
${plan.active ? `<a class="nexus-plan-action" href="${escapeHtml(href)}" title="back this plan from the Studio">Back it</a>` : ''}
</li>`;
    })
    .join('\n');
  return `<div class="nexus-plans" data-plans="${shown}" data-plan-count="${count ?? ''}">
<div style={{ fontWeight: 600, marginBottom: 4 }}>Plans</div>
${countText ? `<div class="nexus-plans-count">${escapeHtml(countText)}</div>` : ''}
${items ? `<ul class="nexus-plans-list">
${items}
</ul>` : ''}
${pager}
</div>`;
}

/**
 * Insert the bar into the page, before `</body>`.
 *
 * PURE and testable, like the other injections here: a page without a closing body tag is returned
 * unchanged rather than corrupted.
 */
export function injectPlanBar(html: string, bar: string): string {
  if (!bar) return html;
  if (!html.includes('</body>')) return html;
  return html.replace('</body>', `${bar}</body>`);
}

/** The styles the bar carries with it \u2014 the profile page\u2019s shell belongs to the gallery builder. */
export const PLAN_BAR_STYLES = `<style>
.nexus-plans{position:fixed;left:16px;bottom:16px;z-index:10;max-width:320px;background:#12151b;border:1px solid #262b34;border-radius:6px;padding:8px 12px;color:#9aa3b2;font:11px Inter,system-ui,sans-serif}
.nexus-plans-count{color:#9aa3b2;margin-bottom:3px}
.nexus-plans-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px}
.nexus-plan-id{color:#e6e8ec;font-weight:600}
.nexus-plan-price{color:#9aa3b2;margin-left:8px}
.nexus-plan-terms{color:#9aa3b2;margin-left:6px}
.nexus-plan-opened{color:#9aa3b2;margin-left:6px}
.nexus-plan-action{color:#3b82f6;font-weight:600;text-decoration:none;margin-left:8px}
.nexus-plan-action:hover{text-decoration:underline}
.nexus-plans-pager{display:flex;gap:10px;align-items:center;margin-top:4px}
.nexus-plans-page{color:#f59e0b;font-weight:600;text-decoration:none}
.nexus-plans-page:hover{text-decoration:underline}
.nexus-plans-pager span.nexus-plans-page{color:#5b6472;font-weight:400}
</style>`;
