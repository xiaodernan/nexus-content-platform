/**
 * M7 v304 — the OWNER'S DESK, as pure data.
 *
 * A report filed against your work is a complaint, and a complaint nobody reads is a counter. This module
 * turns the service's desk rows into the facts a panel can show, and it is PURE so the rules can be
 * tested without a browser or a service.
 *
 * **What this module refuses to do:**
 *
 * - **It does not name the reporter.** The service's desk does not carry the reporter's id or handle (that
 *   is the service's decision, and the reason is written down there), so there is nothing here that could
 *   print one. A row that arrived with a reporter's name in it is DROPPED rather than shown: a desk that
 *   said "so-and-so reported your work" would be the public accusation that v296 refused to build.
 * - **A failed read is NOT an empty desk.** "No reports" and "the desk could not be read" are different
 *   facts, and a panel that showed the first when it knew the second would tell an owner that nobody had
 *   complained — which is the one thing an owner must not be misled about.
 */
import { reportReasonText, reportStatusText } from './reportBar';

// The vocabulary is the REPORT's, and the desk speaks the report's language — re-exported so a caller of
// the desk does not have to know where the word came from.
export { reportStatusText };

/** One report, in the service's desk shape. */
export interface DeskEntry {
  reportId?: unknown;
  targetProjectId?: unknown;
  targetTitle?: unknown;
  reason?: unknown;
  detail?: unknown;
  status?: unknown;
  createdAt?: unknown;
}

/** A report, reduced to the facts an owner can act on. */
export interface DeskRow {
  /** The report's own id — what the acknowledgement names. */
  reportId: string;
  /** Which of the owner's publications it is about. */
  targetProjectId: string;
  /** That publication's title, so an owner with twenty works need not remember the ids. */
  targetTitle: string;
  /** The reason, as the service's own word. */
  reason: string;
  /** The reason in a reader's words. */
  reasonText: string;
  /** The reporter's own words, verbatim. */
  detail: string;
  /** The status, as the service's own word. */
  status: string;
  /** The status in a reader's words. */
  statusText: string;
  /** Whether the report is still waiting to be acknowledged. */
  open: boolean;
  /**
   * v349 — WHEN the report was made, in a reader's words — or null when the wire did not say.
   *
   * <p>The service has carried the instant since the report's own beginning, and the desk says everything
   * else about a report — the reason, the words, the status, the publication it is about — and not when it
   * arrived. A queue of complaints with no dates is a queue nobody can triage.
   *
   * <p>The desk is a PRIVATE view: the owner's own complaints about their own work, and the reporter's own
   * complaints — so the instant is shown to the two people it belongs to, and not on the public page (v307
   * keeps the identity off that page, and a precise instant is a thin identifier too).
   */
  filedText: string | null;
}

/**
 * One report, or `null` when it cannot be shown honestly.
 *
 * A desk row needs the report's id (it is what the acknowledgement names), the publication it is about
 * (a complaint about nothing is not a complaint) and a reason (a report with no reason says nothing about
 * what it is about). Everything else may be missing: a report with no words is still a report, and the
 * panel says so rather than dropping it.
 */
/**
 * WHEN a report was made, in a reader's words — or null when the wire did not say.
 *
 * <p>The instant is the service's own, in UTC, in the same style as every other date in the product: one
 * clock, one style, so a reader comparing a report's date with a tip's date is reading two dates written
 * the same way.
 */
function reportFiledTextOf(createdAt: unknown): string | null {
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return null;
  return new Date(createdAt).toISOString().replace('.000Z', 'Z');
}

export function toDeskRow(entry: unknown): DeskRow | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const r = entry as DeskEntry;
  if (typeof r.reportId !== 'string' || r.reportId.length === 0) return null;
  if (typeof r.targetProjectId !== 'string' || r.targetProjectId.length === 0) return null;
  if (typeof r.reason !== 'string' || r.reason.length === 0) return null;
  const status = typeof r.status === 'string' && r.status.length > 0 ? r.status : 'open';
  return {
    reportId: r.reportId,
    targetProjectId: r.targetProjectId,
    targetTitle: typeof r.targetTitle === 'string' && r.targetTitle.length > 0 ? r.targetTitle : r.targetProjectId,
    reason: r.reason,
    reasonText: reportReasonText(r.reason),
    detail: typeof r.detail === 'string' ? r.detail : '',
    status,
    statusText: reportStatusText(status),
    open: status === 'open',
    // v349 — and when it was made: the instant is the service's own, in UTC, in the same style as every
    // other date in the product (v341-v343, v333). A wire with no instant says nothing.
    filedText: reportFiledTextOf(r.createdAt),
  };
}

/** The desk's rows, in the order the service gave them. */
export function toDeskRows(entries: readonly unknown[]): DeskRow[] {
  const rows: DeskRow[] = [];
  for (const entry of entries) {
    const row = toDeskRow(entry);
    if (row) rows.push(row);
  }
  return rows;
}

/**
 * The desk's tally: how many reports there are, and how many are still waiting.
 *
 * <p>The tally is over the rows the answer carried, so it is a count of what the owner can SEE — not a
 * count of every report that exists. The service's own count is the number of every report; this is the
 * number in front of the owner, and the panel says which one it is showing.
 */
/**
 * The TALLY of the reports against an account's work — the service's own counts.
 *
 * <p>It is a separate read from the desk (v312) because the desk is a WINDOW (the most recent hundred) and
 * the tally counts every report: a number computed from a window would be wrong in exactly the direction a
 * creator acts on.
 */
export interface TallyFacts {
  /** How many reports there are against the account's work, in all. */
  total: number;
  /** How many of them are still waiting to be acknowledged. */
  open: number;
  /** How many by reason — only the reasons that OCCUR. */
  byReason: Record<string, number>;
  /** How many by status. */
  byStatus: Record<string, number>;
}

/**
 * The tally, as the panel says it.
 *
 * <p>The reasons are in the order they came — the service's order — and only the reasons that OCCUR: a
 * tally padded with zeroes is noise, and a reader learns to skip it.
 *
 * <p>v377 — the tally counts the ROWS ON THE SCREEN, and the desk is a WINDOW (the service caps at a
 * hundred and the panel asks for twenty) — so a bare "5 report(s)" was a fact about twenty rows and
 * not about the whole desk. A reader who was told how many there are cannot mistake it for the lot.
 */
export function tallyText(tally: TallyFacts, shown?: number): string {
  const parts: string[] = [];
  parts.push(`${tally.total} report(s)`);
  if (tally.open > 0) parts.push(`${tally.open} still waiting`);
  for (const [reason, count] of Object.entries(tally.byReason)) {
    parts.push(`${count} ${reportReasonText(reason)}`);
  }
  const tallyStr = parts.join(' · ');
  // v377 — the tally counts the ROWS ON THE SCREEN, and the desk is a WINDOW
  if (typeof shown === 'number' && Number.isFinite(shown) && shown >= 0) {
    return `of these ${shown} rows: ${tallyStr}`;
  }
  return tallyStr;
}

/**
 * That the desk's rows are a WINDOW, and how many there are in all.
 *
 * <p>v378 — the panel's tally above counts EVERY report (v309 ✓ · v312 ✓) and the line under it counted
 * the WINDOW's rows ✓ — so one screen carried two different "report(s)" numbers and nothing said which
 * was which ✓. This says it: "showing the 3 newest of 5" ✓.
 *
 * <p>v389 — and the window says WHICH rows it is. "The 3 newest of 5" is a fact about the FIRST window
 * that read like a fact about the list; on a later page it would be a lie, so past the first window the
 * line gives the position instead: "showing 21–40 of 37" — the same correction the filed list got in
 * v386. A reader on page three must be able to tell page three from the whole.
 *
 * <p>A list that shows EVERYONE says nothing ✓ — the tally above already says how many there are ✓ — and
 * an unknown total says nothing either ✓ (a count of the window's own length would be the lie this
 * increment removes ✓).
 */
export function deskWindowText(shown: number, total: number | null | undefined, offset: number = 0): string {
  if (typeof total !== 'number' || !Number.isFinite(total)) return '';
  if (shown <= 0 || total <= shown) return '';
  if (offset <= 0) return `showing the ${shown} newest of ${total}`;
  return `showing ${offset + 1}–${offset + shown} of ${total}`;
}

export function deskSummary(rows: readonly DeskRow[]): { total: number; open: number } {
  let open = 0;
  for (const row of rows) {
    if (row.open) open += 1;
  }
  return { total: rows.length, open };
}
