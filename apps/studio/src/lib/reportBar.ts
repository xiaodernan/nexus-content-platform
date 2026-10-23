/**
 * M7 v296 — the REPORTS bar on the artifact page.
 *
 * A publication that has been reported is a fact a reader should be able to see — and a reader should be
 * able to ADD one. The artifact page is server-rendered and cannot act (it does not know who the device
 * is — ADR 0018 is why there is no session), so the page shows the COUNT and links to the Studio, which is
 * where the account lives.
 *
 * PURE and string-returning, like every other renderer here.
 *
 * **What the bar refuses to say:**
 *
 * - **A failed read is NOT zero reports.** "0 reports" and "the reports could not be read" are different
 *   facts, and a page that showed the first when it knew the second would tell a reader that nobody had
 *   complained — which is the one thing a reader must not be misled about.
 * - **The bar does not say WHO reported.** The service records the reporter's account id and the name the
 *   claim carried, and a page that named the reporter would turn a report into a public accusation with
 *   no moderation behind it. The count is the fact; the identity is the moderator's business.
 */
import { escapeHtml } from './pageShell';

/** One report, in the service's own wire shape. */
export interface ReportEntry {
  id?: unknown;
  targetId?: unknown;
  reason?: unknown;
  detail?: unknown;
  status?: unknown;
  createdAt?: unknown;
}

/** A report reduced to the facts a reader can act on. */
export interface ReportRow {
  id: string;
  /** The reason, as the service's own word. */
  reason: string;
  /** The reason in a reader's words. */
  reasonText: string;
  /** Whether the reporter withdrew the report. */
  withdrawn: boolean;
  /**
   * v305 — the report's STATUS, as the service's own word.
   *
   * <p>The bar on the artifact page only ever needed "withdrawn or not". The REPORTER's view needs the
   * whole vocabulary, because the thing a reporter wants to know is where their complaint stands now.
   */
  status: string;
  /** The status in a reader's words. */
  statusText: string;
  /** The publication the report is about — a reporter with several complaints needs to tell them apart. */
  targetId: string;
  /** v381 — when the report was filed, as the service's own createdAt. A reporter with several complaints needs to tell them apart by WHEN, not only by what. Leave undefined when the service did not supply one: a reporter is told the facts the service gave, never a made-up date.
 */
  filedAt?: number;
  /**
   * v323 — the reporter's OWN WORDS, as they were written.
   *
   * <p>The owner's desk has shown them since v304 — a complaint without its words is a category, not a
   * complaint — and the reporter's own view did not: a reporter looking at their own complaint could
   * not see what they had actually said. The wire has carried the words all along; the row simply
   * dropped them.
   */
  detail: string;
}

/** The reasons a report may carry \u2014 the client's own four, and no others. */
export const REPORT_REASONS = ['spam', 'harassment', 'illegal', 'other'] as const;

/**
 * The reason in a reader's words.
 *
 * A KNOWN reason is spelled the way a person would say it; an unknown one is passed through as it
 * arrived \u2014 a bar that labelled an unknown reason as "spam" would be making a claim the service never made.
 */
export function reportReasonText(reason: string): string {
  switch (reason) {
    case 'spam':
      return 'spam';
    case 'harassment':
      return 'harassment';
    case 'illegal':
      return 'illegal';
    case 'other':
      return 'something else';
    default:
      return reason;
  }
}

/**
 * The report's STATUS in a reader's words.
 *
 * A KNOWN status is spelled the way a person would say it; an unknown one is passed through as it arrived
 * — a row that labelled an unknown status as "acknowledged" would be claiming a disposition the service
 * never made.
 *
 * `reviewed` and `resolved` are a MODERATOR's vocabulary: this build has no moderator, so the service
 * never sets them. They are spelled in the service's own word rather than translated, because a panel that
 * turned them into "not acknowledged yet" would be quietly rewriting a status it does not have.
 */
export function reportStatusText(status: string): string {
  switch (status) {
    case 'open':
      return 'not acknowledged yet';
    case 'acknowledged':
      return 'acknowledged';
    case 'rejected':
      return 'withdrawn by the reporter';
    default:
      return status;
  }
}

/**
 * One report, or `null` when it cannot be shown honestly.
 *
 * A report needs an id and a reason: the id is what the row is keyed by, and a report with no reason
 * says nothing about what it is about.
 */
export function toReportRow(entry: unknown): ReportRow | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const r = entry as ReportEntry;
  if (typeof r.id !== 'string' || r.id.length === 0) return null;
  if (typeof r.reason !== 'string' || r.reason.length === 0) return null;
  const status = typeof r.status === 'string' && r.status.length > 0 ? r.status : 'open';
  return {
    id: r.id,
    reason: r.reason,
    reasonText: reportReasonText(r.reason),
    withdrawn: status === 'rejected',
    status,
    statusText: reportStatusText(status),
    targetId: typeof r.targetId === 'string' ? r.targetId : '',
    filedAt: typeof r.createdAt === 'number' ? r.createdAt : undefined,
    detail: typeof r.detail === 'string' ? r.detail : '',
  };
}

/** The reports, in the order the service gave them. */
export function toReportRows(entries: readonly unknown[]): ReportRow[] {
  const rows: ReportRow[] = [];
  for (const entry of entries) {
    const row = toReportRow(entry);
    if (row) rows.push(row);
  }
  return rows;
}

/** What the bar needs to know. */
export interface ReportBarFacts {
  /** The publication the bar is for. */
  projectId: string;
  /** How many reports there are, or null when the count could not be read. */
  count: number | null;
  /** The reports themselves \u2014 the reasons, without naming the reporters. */
  reports?: ReportRow[];
}

/**
 * The bar, as a section of HTML \u2014 or an empty string when there is nothing honest to say.
 */
export function renderReportBar(facts: ReportBarFacts): string {
  if (facts.count === null) {
    return '';
  }
  const count = facts.count;
  const label = count === 1 ? '1 report' : `${count} reports`;
  const href = `/?report=${encodeURIComponent(facts.projectId)}`;
  const reasons = (facts.reports ?? [])
    .map((r) => {
      const text = r.withdrawn ? `${r.reasonText} (withdrawn)` : r.reasonText;
      const when = r.filedAt !== undefined ? `<span class="nexus-report-when">提交于 ${new Date(r.filedAt).toLocaleString()}</span>` : '';
      return `<li data-report="${escapeHtml(r.id)}" data-report-reason="${escapeHtml(r.reason)}"><span class="nexus-report-reason">${escapeHtml(text)}</span>${when}</li>`;
    })
    .join('\n');
  const list = reasons ? `<ul class="nexus-reports-list">\n${reasons}\n</ul>` : '';
  return `<div class="nexus-reports" data-reports="${count}">
<span class="nexus-reports-count">${escapeHtml(label)}</span>
<a class="nexus-reports-action" href="${escapeHtml(href)}" title="report this publication from the Studio">Report</a>
${list}
</div>`;
}

/**
 * Insert the bar into the page, before `</body>`.
 *
 * PURE and testable, like the other injections here: a page without a closing body tag is returned
 * unchanged rather than corrupted.
 */
export function injectReportBar(html: string, bar: string): string {
  if (!bar) return html;
  if (!html.includes('</body>')) return html;
  return html.replace('</body>', `${bar}</body>`);
}

/** The styles the bar carries with it \u2014 the artifact page's shell belongs to the PREVIEW renderer. */
export const REPORT_BAR_STYLES = `<style>
.nexus-reports{position:fixed;right:16px;bottom:56px;z-index:10;display:flex;flex-wrap:wrap;gap:10px;align-items:center;max-width:300px;background:#12151b;border:1px solid #262b34;border-radius:6px;padding:8px 12px;color:#9aa3b2;font:11px Inter,system-ui,sans-serif}
.nexus-reports-count{color:#e6e8ec;font-weight:600}
.nexus-reports-action{color:#f59e0b;font-weight:600;text-decoration:none}
.nexus-reports-action:hover{text-decoration:underline}
.nexus-reports-list{list-style:none;margin:0;padding:0;flex-basis:100%;display:flex;flex-direction:column;gap:2px}
.nexus-report-reason{color:#cfd6e4}
 .nexus-report-when{color:#8a93a2;font-size:10px;white-space:nowrap}
</style>`;

