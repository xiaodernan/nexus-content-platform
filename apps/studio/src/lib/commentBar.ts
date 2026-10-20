/**
 * M7 v286 — the COMMENTS on the artifact page.
 *
 * The artifact page is where a reader decides what a publication is worth, and the comments are part of
 * that answer. So the page LISTS them — server-rendered, read through the same server-side hop the
 * publication and the like count came through.
 *
 * PURE and string-returning, like every other renderer here.
 *
 * **Two rules this module keeps visible:**
 *
 * - **The body is escaped AGAIN on the way out.** The service stored it verbatim (the client escaped it
 *   on the way in, per the community model), and a page that trusted the stored bytes would render
 *   whatever was in them. Escaping twice is not a bug: the first escape is the caller's promise, and this
 *   one is the page's own.
 * - **A REMOVED comment is shown as removed, not hidden and not as its text.** "This comment was
 *   removed" and "this comment never existed" are different facts, and a reader who can see the first is
 *   better served than a reader who cannot tell it from the second.
 */
import { escapeHtml } from './pageShell';

/** One comment, in the service's own wire shape. */
export interface CommentEntry {
  id?: unknown;
  accountId?: unknown;
  projectId?: unknown;
  body?: unknown;
  createdAt?: unknown;
  deleted?: unknown;
  handle?: unknown;
  assurance?: unknown;
}

/** A comment reduced to the facts a reader can act on. */
export interface CommentRow {
  id: string;
  /** Who wrote it: the handle beside the assurance, or the account id when there is no handle. */
  authorText: string;
  /** The body, ESCAPED. */
  bodyText: string;
  /** The instant, as UTC text to the second. */
  timeText: string;
  /** Whether the author has taken it back. */
  deleted: boolean;
}

/**
 * One comment, or `null` when it cannot be shown honestly.
 *
 * A row needs an id (so the page can key it), a body and a finite instant. A comment with no body is not
 * a comment, and one with no instant cannot be placed in time.
 */
export function toCommentRow(entry: unknown): CommentRow | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const c = entry as CommentEntry;
  if (typeof c.id !== 'string' || c.id.length === 0) return null;
  if (typeof c.body !== 'string') return null;
  if (typeof c.createdAt !== 'number' || !Number.isFinite(c.createdAt)) return null;

  const handle = typeof c.handle === 'string' && c.handle.length > 0 ? c.handle : null;
  const accountId = typeof c.accountId === 'string' && c.accountId.length > 0 ? c.accountId : null;
  const assurance = typeof c.assurance === 'string' && c.assurance.length > 0 ? c.assurance : null;
  const who = handle ? `@${handle}` : (accountId ?? 'nobody');
  const worth = assurance ? ` · ${assurance}` : '';

  return {
    id: c.id,
    authorText: `${who}${worth}`,
    bodyText: escapeHtml(c.body),
    timeText: new Date(c.createdAt).toISOString().replace('.000Z', 'Z'),
    deleted: c.deleted === true,
  };
}

/** The comments, in the order the service gave them. */
export function toCommentRows(entries: readonly unknown[]): CommentRow[] {
  const rows: CommentRow[] = [];
  for (const entry of entries) {
    const row = toCommentRow(entry);
    if (row) rows.push(row);
  }
  return rows;
}

/**
 * The comments section, as a section of HTML — or an empty string when there is nothing to say.
 *
 * `visible` is the service's count of the comments that are NOT deleted, and it is stated beside the
 * rows: a list of three of which one was removed must not read as "there are three comments".
 */
export function renderCommentsHtml(rows: CommentRow[], visible: number, projectId: string): string {
  const href = `/?comment=${encodeURIComponent(projectId)}`;
  const action = `<a class="nexus-comments-action" href="${escapeHtml(href)}" title="write a comment from the Studio">Add a comment</a>`;
  if (rows.length === 0) {
    // The EMPTY state still offers the composer: a thread with no comments is exactly the thread a
    // reader would want to start, and a section that said "no comments" and offered nothing would be a
    // dead end.
    return `<section class="nexus-comments" data-comments="0">
<h2>COMMENTS</h2>
<p class="nexus-comments-note">No comments yet. A comment needs an account, and it is written from the Studio — the page cannot know who is reading it.</p>
${action}
</section>`;
  }
  const items = rows
    .map((row) => {
      const body = row.deleted
        ? '<em class="nexus-comment-removed">this comment was removed by its author</em>'
        : row.bodyText;
      return `<li class="nexus-comment" data-comment="${escapeHtml(row.id)}" data-comment-deleted="${row.deleted}">
<span class="nexus-comment-author">${escapeHtml(row.authorText)}</span>
<span class="nexus-comment-time">${escapeHtml(row.timeText)}</span>
<div class="nexus-comment-body">${body}</div>
</li>`;
    })
    .join('\n');
  const more = visible < rows.length
    ? `<p class="nexus-comments-note">${visible} comment(s) visible of ${rows.length} shown — the rest were taken back by their authors.</p>`
    : `<p class="nexus-comments-note">${visible} comment(s).</p>`;
  return `<section class="nexus-comments" data-comments="${rows.length}">
<h2>COMMENTS</h2>
<ul class="nexus-comment-list">
${items}
</ul>
${more}
${action}
</section>`;
}

/**
 * The styles the comments section carries with it — the artifact page's shell belongs to the PREVIEW
 * renderer, and a guest that assumed it could restyle the host would be a guest that could break the
 * drawing.
 */
export const COMMENT_STYLES = `<style>
.nexus-comments{position:fixed;left:16px;top:16px;z-index:10;max-width:340px;max-height:44vh;overflow:auto;background:#12151b;border:1px solid #262b34;border-radius:6px;padding:10px 12px;color:#9aa3b2;font:11px Inter,system-ui,sans-serif}
.nexus-comments h2{margin:0 0 6px;font-size:11px;letter-spacing:.4px;color:#e6e8ec}
.nexus-comment-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.nexus-comment{display:flex;flex-direction:column;gap:2px;border-left:2px solid #262b34;padding-left:8px}
.nexus-comment-author{color:#cfd6e4;font-weight:600}
.nexus-comment-time{color:#6b7280;font-size:10px}
.nexus-comment-body{color:#e6e8ec;line-height:1.4;white-space:pre-wrap;word-break:break-word}
.nexus-comment-removed{color:#6b7280;font-style:italic}
.nexus-comments-note{margin:6px 0 0;font-size:10px;line-height:1.4}
.nexus-comments-action{display:inline-block;margin-top:6px;color:#3b82f6;font-weight:600;text-decoration:none}
.nexus-comments-action:hover{text-decoration:underline}
</style>`;
