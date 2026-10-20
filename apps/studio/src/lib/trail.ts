/**
 * M9 v272 (ADR 0016 amendment 272) — the AUDIT TRAIL's READING half.
 *
 * v271 gave the service a trail: an entry for every publication verb that SUCCEEDED, in order, with the
 * actor exactly as the request named it. The door exists (`GET /audit`) and the client's own `ops.ts`
 * `AuditEntry` already declares the same wire shape. What did not exist is a way for anyone to SEE it —
 * and an audit trail nobody can read is a table nobody audits.
 *
 * PURE and string-returning, like `explore.ts`, `artifact.ts` and `profile.ts`: the lane fetches, the panel
 * renders, and everything in between is here — where the suite can assert it without a server, a service or
 * a browser.
 *
 * **Two limits this module keeps visible instead of papering over:**
 *
 * - **The trail names ACCOUNT IDS, not handles.** The service holds no account table (v270's finding): an
 *   account exists in it only as far as publications NAME it. The trail's actor for a take-down never
 *   published anything, so there is no row anywhere that carries a handle for it — and borrowing the
 *   publication's owner as the actor's name would attribute an action to somebody who did not do it.
 * - **A row that cannot be displayed honestly is DROPPED, not faked.** The panel states the service's own
 *   count next to what it rendered, so a drop is visible as a discrepancy rather than invisible.
 */

/** The wire shape `GET /audit` answers with — the client's own `AuditEntry`, field for field. */
export interface TrailEntry {
  id?: unknown;
  action?: unknown;
  actorId?: unknown;
  targetId?: unknown;
  createdAt?: unknown;
  assurance?: unknown;
}

/** One entry, reduced to the facts a person can act on. */
export interface TrailRow {
  /** The entry's own id. */
  id: string;
  /** The service's own word for what happened — never replaced with something better-sounding. */
  action: string;
  /** The display verb, or the raw action when this build does not know the word. */
  actionText: string;
  /** `acct-ada · unsigned-local`, or `nobody (anonymous)` when the request named no one. */
  actorText: string;
  /** True when the entry names no actor at all — an anonymous action, not a missing one. */
  anonymous: boolean;
  /** The project the entry happened to. */
  targetId: string;
  /** The instant, in epoch milliseconds as the service sent it. */
  createdAt: number;
  /** The instant as UTC text, second precision. */
  timeText: string;
}

/**
 * The display verb for an action.
 *
 * A KNOWN action is spelled the way a person would say it; an action this build has never seen is passed
 * through as it arrived, because a panel that cannot recognise an action must not invent one for it — a
 * trail that silently mislabelled `follow` as `published` would be worse than no trail.
 */
export function trailActionText(action: string): string {
  switch (action) {
    case 'publish':
      return 'published';
    case 'unpublish':
      return 'took down';
    // v289 — the SOCIAL verbs (the service records them since v289). Each has its own word, and the un-verbs
    // are NOT folded into the verbs: "liked" and "took the like back" are different facts, and a trail that
    // merged them would be losing one of them.
    case 'like':
      return 'liked';
    case 'unlike':
      return 'took the like back';
    case 'comment':
      return 'commented';
    case 'uncomment':
      return 'removed the comment';
    default:
      return action;
  }
}

/**
 * The actor, as the service recorded it.
 *
 * `actorId` is NULLABLE in the service's own record — an anonymous publish names nobody — and this is the
 * one place the client's `ops.ts` type disagrees: it declares `actorId: AccountId`, non-null. The service
 * will not fake an actor to fit a type (v271), so the reading half says `nobody` here.
 */
export function trailActorText(actorId: string, assurance: string | null): string {
  if (assurance) return `${actorId} · ${assurance}`;
  return actorId;
}

/**
 * ONE entry, or `null` when it cannot be shown honestly.
 *
 * A row needs an id (so the panel can key it), an action (so it can say what happened), a target (so it can
 * say what it happened to) and a finite instant (so it can say when). Missing any of those is not a row with
 * a blank column — it is a row this build would have to invent values for, so it is dropped instead.
 */
export function toTrailRow(entry: unknown): TrailRow | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const e = entry as TrailEntry;
  if (typeof e.id !== 'string' || e.id.length === 0) return null;
  if (typeof e.action !== 'string' || e.action.length === 0) return null;
  if (typeof e.targetId !== 'string' || e.targetId.length === 0) return null;
  if (typeof e.createdAt !== 'number' || !Number.isFinite(e.createdAt)) return null;

  const actorId = typeof e.actorId === 'string' && e.actorId.length > 0 ? e.actorId : null;
  const assurance = typeof e.assurance === 'string' && e.assurance.length > 0 ? e.assurance : null;

  return {
    id: e.id,
    action: e.action,
    actionText: trailActionText(e.action),
    actorText: actorId ? trailActorText(actorId, assurance) : 'nobody (anonymous)',
    anonymous: actorId === null,
    targetId: e.targetId,
    createdAt: e.createdAt,
    timeText: new Date(e.createdAt).toISOString().replace('.000Z', 'Z'),
  };
}

/**
 * The whole trail, in order.
 *
 * The service answers NEWEST FIRST, and the order is preserved rather than re-sorted: an audit trail's
 * order is part of what it asserts, and a panel that re-sorted by action or by target would be telling a
 * different story than the one that happened.
 */
export function toTrailRows(entries: readonly unknown[]): TrailRow[] {
  const rows: TrailRow[] = [];
  for (const entry of entries) {
    const row = toTrailRow(entry);
    if (row) rows.push(row);
  }
  return rows;
}

/**
 * v281 — the trail's own tally, from the rows the answer carried.
 *
 * The panel states the SERVICE'S count and this tally side by side, and the two are different numbers on
 * purpose: the service counts everything in the answer, and this counts what could be displayed. A reader
 * comparing them can see a drop.
 *
 * The categories are the ones the trail actually records today, and anything else is counted as `other`
 * rather than being folded into one of them: a verb this build does not know must not be counted as a
 * verb it does.
 *
 * v289 — the SOCIAL verbs have their own buckets (`liked`, `commented`) rather than falling into
 * `other`: they are the product's own verbs, the trail records them, and a tally that called a like
 * "other" would be hiding the very thing the panel is for.
 */
export interface TrailSummary {
  /** How many rows were published. */
  published: number;
  /** How many rows were taken down. */
  tookDown: number;
  /** How many rows were likes (v289). */
  liked: number;
  /** How many rows were likes taken back (v289). */
  unliked: number;
  /** How many rows were comments (v289). */
  commented: number;
  /** How many rows were comments removed by their author (v289). */
  uncommented: number;
  /** How many rows carry an action this build does not know. */
  other: number;
  /** The total: the buckets above, added up. */
  total: number;
}

export function trailSummaryOf(rows: readonly TrailRow[]): TrailSummary {
  let published = 0;
  let tookDown = 0;
  let liked = 0;
  let unliked = 0;
  let commented = 0;
  let uncommented = 0;
  let other = 0;
  for (const row of rows) {
    if (row.action === 'publish') published += 1;
    else if (row.action === 'unpublish') tookDown += 1;
    else if (row.action === 'like') liked += 1;
    else if (row.action === 'unlike') unliked += 1;
    else if (row.action === 'comment') commented += 1;
    else if (row.action === 'uncomment') uncommented += 1;
    else other += 1;
  }
  return {
    published,
    tookDown,
    liked,
    unliked,
    commented,
    uncommented,
    other,
    total: published + tookDown + liked + unliked + commented + uncommented + other,
  };
}

/**
 * v281 — the tally, as the panel says it.
 *
 * Only the buckets that are NOT ZERO are said: a line that always carried every bucket would grow a
 * dozen "0 took down"s as the social verbs arrived, and a reader would learn to skip it. A tally that
 * shows what happened is worth reading; a tally padded with zeroes is noise.
 */
export function trailSummaryText(summary: TrailSummary): string {
  const parts: string[] = [];
  if (summary.published > 0) parts.push(`${summary.published} published`);
  if (summary.tookDown > 0) parts.push(`${summary.tookDown} took down`);
  if (summary.liked > 0) parts.push(`${summary.liked} liked`);
  if (summary.unliked > 0) parts.push(`${summary.unliked} unliked`);
  if (summary.commented > 0) parts.push(`${summary.commented} commented`);
  if (summary.uncommented > 0) parts.push(`${summary.uncommented} uncommented`);
  if (summary.other > 0) parts.push(`${summary.other} other`);
  return parts.length === 0 ? 'nothing yet' : parts.join(' · ');
}

/**
 * v281 — the rows of ONE action, or all of them.
 *
 * `action` is the service's own word, not the display verb: the panel's filter asks the trail in the
 * trail's language, and the mapping to "published" / "took down" happens when the row is RENDERED. A
 * filter that matched on the display verb would break the moment the display verb changed.
 */
export function filterTrailRows(rows: readonly TrailRow[], action: string | null): TrailRow[] {
  if (action === null || action === '') return [...rows];
  return rows.filter((row) => row.action === action);
}
