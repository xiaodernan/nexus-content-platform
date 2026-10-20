/**
 * M9 v280 (ADR 0016 amendment 280) — the AUDIT TRAIL, read at the THING it records.
 *
 * v272 put the trail in the Studio's toolbar: every entry, newest first, for the author to read. But the
 * toolbar answers "what happened to the publications" and the ARTIFACT PAGE answers "what is this" — and a
 * reader who opens a publication has no way to ask "what happened to THIS one?". The trail's whole value is
 * that it outlives the row it witnessed (v272's proof: the publication answers 404 and its entries remain),
 * and the place where that matters most is the publication's own page.
 *
 * PURE and string-returning, like `trail.ts` and `artifact.ts`: the route fetches, this module decides what
 * to show and how to say it. Keeping the rendering pure is what lets the suite assert the rules without a
 * server, a service or a browser.
 *
 * **Two limits this module keeps visible instead of papering over:**
 *
 * - **The trail is FILTERED BY TARGET, and the filter is exact.** An entry names ONE project id, and only
 *   the entries for the project at hand are shown. A row that named no target would belong to no
 *   publication, and showing it on every page would be a lie about what happened to this one.
 * - **A page with no entries says so, and says WHY it might.** A publication that was published once and
 *   never touched has exactly one entry (the publish). A publication published before the trail existed has
 *   none — and the page must not pretend that "no history" means "nothing happened".
 */
import { escapeHtml } from './pageShell';
import { toTrailRows, type TrailRow } from './trail';

/** One audit entry, in the shape the service sends. */
export interface HistoryEntry {
  id?: unknown;
  action?: unknown;
  actorId?: unknown;
  targetId?: unknown;
  createdAt?: unknown;
  assurance?: unknown;
}

/**
 * v280 — insert the HISTORY section into the artifact page, before `</body>`.
 *
 * PURE and testable, like `injectRemixBar`: it asserts nothing about the document, only that the preview
 * renderer's output ends the way it always does. A preview that does not contain `</body>` is returned
 * unchanged rather than corrupted — the artifact is still the artifact, and a missing section is better
 * than a broken page.
 *
 * An EMPTY history is not inserted at all: a failed read of the trail must not put a heading on the page
 * with nothing under it, which would read as "this publication has no history" — a claim the failed read
 * knows nothing about.
 */
export function injectHistory(html: string, history: string): string {
  if (!history) return html;
  if (!html.includes('</body>')) return html;
  return html.replace('</body>', `${history}</body>`);
}

/**
 * The entries for ONE publication, newest first.
 *
 * The trail's order is the service's own (newest first), and the filter preserves it: an audit trail's
 * order is part of what it asserts, and a history that re-sorted by action would be telling a different
 * story than the one that happened.
 */
export function historyRowsOf(entries: readonly unknown[], targetId: string): TrailRow[] {
  if (!targetId) return [];
  const rows = toTrailRows(entries);
  return rows.filter((row) => row.targetId === targetId);
}

/**
 * The artifact's own history, as a section of HTML.
 *
 * `rows` is what the service's answer carried FOR THIS PUBLICATION, and `carried` is how many entries the
 * whole answer held — so a reader can tell "this publication has one entry" from "the answer was cut short
 * before this publication's entries appeared". The second is a real possibility: the trail is capped, and
 * an old publication's entries can be past the cap.
 */
export function renderHistoryHtml(rows: TrailRow[], carried: number): string {
  if (rows.length === 0) {
    return `<section class="nexus-history" data-history="empty">
<h2>HISTORY</h2>
<p class="nexus-history-note">No audit entries name this publication. That is not the same as "nothing happened": the trail only records what happened AFTER it began, and a publication published before the trail existed has no entries at all.</p>
</section>${HISTORY_STYLES}`;
  }
  const items = rows
    .map((row) => {
      const action = row.actionText;
      const actor = row.anonymous ? 'nobody (anonymous)' : row.actorText;
      return `<li data-history-row="${escapeHtml(row.id)}" data-history-action="${escapeHtml(row.action)}">
<span class="nexus-history-action">${escapeHtml(action)}</span>
<span class="nexus-history-actor">${escapeHtml(actor)}</span>
<span class="nexus-history-time">${escapeHtml(row.timeText)}</span>
</li>`;
    })
    .join('\n');
  // The count beside the rows: the answer CARRIED `carried` entries in all, and `rows.length` of them name
  // this publication. The two numbers are both stated, so a cap that cut the answer short is visible rather
  // than silently reading as "this is the whole history".
  const more = carried > rows.length
    ? `<p class="nexus-history-note">${rows.length} entr(y/ies) for this publication · the answer carried ${carried} in all — the trail is capped, so older entries may be past the cap.</p>`
    : `<p class="nexus-history-note">${rows.length} entr(y/ies) for this publication · the answer carried ${carried} in all.</p>`;
  return `<section class="nexus-history" data-history="rows">
<h2>HISTORY</h2>
<ul class="nexus-history-list">
${items}
</ul>
${more}
</section>${HISTORY_STYLES}`;
}

/**
 * The styles the history section carries with it.
 *
 * The artifact page's shell belongs to the PREVIEW renderer — this section is a guest in it, and a guest
 * that assumed it could restyle the host would be a guest that could break the drawing. So the styles
 * travel with the section, scoped to its own class names.
 */
export const HISTORY_STYLES = `<style>
.nexus-history{position:fixed;left:16px;bottom:16px;z-index:10;max-width:380px;background:#12151b;border:1px solid #262b34;border-radius:6px;padding:10px 12px;color:#9aa3b2;font:11px Inter,system-ui,sans-serif}
.nexus-history h2{margin:0 0 6px;font-size:11px;letter-spacing:.4px;color:#e6e8ec}
.nexus-history-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px}
.nexus-history-list li{display:flex;gap:8px;align-items:baseline}
.nexus-history-action{color:#3b82f6;font-weight:600}
.nexus-history-actor{color:#cfd6e4}
.nexus-history-time{margin-left:auto;color:#6b7280}
.nexus-history-note{margin:6px 0 0;font-size:10px;line-height:1.4}
</style>`;
