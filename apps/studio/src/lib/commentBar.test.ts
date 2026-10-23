import { describe, expect, it } from 'vitest';

import { toCommentRow, toCommentRows, renderCommentsHtml } from './commentBar';
import { commentIdFromSearch, uncommentIdFromSearch } from './commentIntent';

/**
 * M7 v286 — the COMMENTS on the artifact page.
 *
 * Two rules the suite grades: the body is escaped AGAIN on the way out (the service stored it verbatim),
 * and a REMOVED comment is shown as removed rather than hidden or shown as its text.
 */
const entry = (over: Record<string, unknown> = {}) => ({
  id: 'c-1',
  accountId: 'acct-ada',
  projectId: 'pub-1',
  body: 'nice work',
  createdAt: 1_776_000_000_000,
  deleted: false,
  handle: 'ada',
  assurance: 'unsigned-local',
  ...over,
});

describe('commentIntent — the URL names the publication (M7 v286)', () => {
  it('reads the comment id out of the query', () => {
    expect(commentIdFromSearch('?comment=pub-1')).toBe('pub-1');
    expect(commentIdFromSearch('comment=pub-1')).toBe('pub-1');
    expect(commentIdFromSearch('?a=1&comment=pub-2')).toBe('pub-2');
  });

  it('decodes the id', () => {
    expect(commentIdFromSearch('?comment=' + encodeURIComponent('my pub/id'))).toBe('my pub/id');
  });

  it('answers null for ABSENCE', () => {
    expect(commentIdFromSearch('?comment=')).toBeNull();
    expect(commentIdFromSearch('?comment=%20')).toBeNull();
    expect(commentIdFromSearch('')).toBeNull();
    expect(commentIdFromSearch('?like=pub-1')).toBeNull();
  });
});

describe('commentBar — one comment becomes one row (M7 v286)', () => {
  it('names the author with the assurance, and the instant', () => {
    const row = toCommentRow(entry())!;
    expect(row.id).toBe('c-1');
    expect(row.authorText).toBe('@ada · unsigned-local');
    expect(row.timeText).toBe('2026-04-12T13:20:00Z');
    expect(row.deleted).toBe(false);
  });

  it('falls back to the ACCOUNT id when there is no handle', () => {
    const row = toCommentRow(entry({ handle: null }))!;
    expect(row.authorText).toBe('acct-ada · unsigned-local');
  });

  it('ESCAPES the body again on the way out', () => {
    // The service stored it verbatim (the client escaped it on the way in). A page that trusted the
    // stored bytes would render whatever was in them.
    const row = toCommentRow(entry({ body: '<script>x</script>' }))!;
    expect(row.bodyText).toBe('&lt;script&gt;x&lt;/script&gt;');
    expect(row.bodyText).not.toContain('<script>');
  });

  it('a row it cannot display honestly is dropped', () => {
    expect(toCommentRow(null)).toBeNull();
    expect(toCommentRow('a string')).toBeNull();
    expect(toCommentRow(entry({ id: '' }))).toBeNull();
    expect(toCommentRow(entry({ body: undefined }))).toBeNull();
    expect(toCommentRow(entry({ createdAt: 'yesterday' }))).toBeNull();
    expect(toCommentRow(entry({ createdAt: Number.NaN }))).toBeNull();
  });

  it('the list keeps the service’s order and drops only what it cannot show', () => {
    const rows = toCommentRows([entry({ id: 'c-2' }), entry({ id: 'broken', body: undefined }), entry({ id: 'c-1' })]);
    expect(rows.map((r) => r.id)).toEqual(['c-2', 'c-1']);
  });
});

describe('commentBar — the section on the page (M7 v286)', () => {
  it('lists the comments with their authors and bodies', () => {
    const rows = toCommentRows([entry()]);
    const html = renderCommentsHtml(rows, 1, 'pub-1');
    expect(html).toContain('data-comments="1"');
    expect(html).toContain('data-comment="c-1"');
    expect(html).toContain('@ada · unsigned-local');
    expect(html).toContain('nice work');
  });

  it('a REMOVED comment is shown as removed — not hidden, and not as its text', () => {
    const rows = toCommentRows([entry({ deleted: true })]);
    const html = renderCommentsHtml(rows, 0, 'pub-1');
    expect(html).toContain('this comment was removed by its author');
    expect(html).not.toContain('nice work');
    expect(html).toContain('data-comment-deleted="true"');
  });

  it('v321 — it offers the TAKING-BACK, as a link to the Studio', () => {
    // The service has had the take-back since v289, and the studio has had no door for it: a comment its
    // author could not take back was a comment that could only be lived with.
    const rows = toCommentRows([entry()]);
    const html = renderCommentsHtml(rows, 1, 'pub-1');
    expect(html).toContain('href="/?uncomment=c-1"');
    expect(html).toContain('Take it back');
  });

  it('v321 — and a comment that is ALREADY removed carries no link', () => {
    // There is nothing to take back, so offering it would be an offer of a thing that does not exist.
    const rows = toCommentRows([entry({ deleted: true })]);
    const html = renderCommentsHtml(rows, 0, 'pub-1');
    expect(html).not.toContain('uncomment=');
  });

  it('v321 — the uncomment intent reads the id out of the query, and never collides with the composer', () => {
    expect(uncommentIdFromSearch('?uncomment=c-1')).toBe('c-1');
    expect(uncommentIdFromSearch('?uncomment=' + encodeURIComponent('c/1'))).toBe('c/1');
    expect(uncommentIdFromSearch('?uncomment=')).toBeNull();
    expect(commentIdFromSearch('?uncomment=c-1')).toBeNull();
    expect(uncommentIdFromSearch('?comment=c-1')).toBeNull();
  });

  it('states the VISIBLE count beside the rows', () => {
    // v354 — the count is the THREAD's (the service counts the whole thread now) and the note says how
    // many of the shown rows were taken back, so the two numbers cannot be confused.
    const rows = toCommentRows([entry({ id: 'c-1' }), entry({ id: 'c-2', deleted: true })]);
    const html = renderCommentsHtml(rows, 1, 'pub-1');
    expect(html).toContain('1 comment(s) visible');
    expect(html).toContain('1 of them were taken back by their authors');
  });

  it('an empty thread says so, and says why it is not a one-click thing', () => {
    const html = renderCommentsHtml([], 0, 'pub-1');
    expect(html).toContain('data-comments="0"');
    expect(html).toContain('No comments yet');
    expect(html).toContain('needs an account');
  });

  it('and the EMPTY thread still offers the composer — a thread with no comments is the one to start', () => {
    const html = renderCommentsHtml([], 0, 'pub-1');
    expect(html).toContain('href="/?comment=pub-1"');
    expect(html).toContain('Add a comment');
  });

  it('offers the composer as a link to the Studio', () => {
    const rows = toCommentRows([entry()]);
    const html = renderCommentsHtml(rows, 1, 'pub-1');
    expect(html).toContain('href="/?comment=pub-1"');
    expect(html).toContain('Add a comment');
  });

  it('encodes the project id in the link', () => {
    const rows = toCommentRows([entry()]);
    expect(renderCommentsHtml(rows, 1, 'a/b c')).toContain('href="/?comment=a%2Fb%20c"');
  });

  it('escapes caller-controlled text in the author line', () => {
    const rows = toCommentRows([entry({ handle: '<script>x</script>' })]);
    const html = renderCommentsHtml(rows, 1, 'pub-1');
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
  });
});

describe('commentBar — the thread PAGES (M7 v399)', () => {
  // The thread has been a WINDOW since v286 (the service caps at a hundred) and said so since v354 —
  // but the artifact page could only ever show the head of it. It pages now, in rows, as LINKS: the
  // page is server-rendered and holds no session (ADR 0018), so the route builds the URL and the
  // section draws an <a>.
  const pageHref = (offset: number) => `/p/pub-1?commentOffset=${offset}`;
  const twoComments = () => toCommentRows([entry({ id: 'c-1' }), entry({ id: 'c-2', body: 'second' })]);

  it('the first window says it is the newest, and not the only', () => {
    const html = renderCommentsHtml(twoComments(), 5, 'pub-1', 2, { offset: 0, total: 5, pageHref });
    expect(html).toContain('5 comment(s) visible');
    expect(html).toContain('showing the 2 newest');
  });

  it('a later window says WHICH rows it is showing', () => {
    // "the 2 newest" is a true thing about the first window and a false thing about the third
    // (v386's correction, the shared wording the tip and plan bars received in v395 and v396). The
    // range is in ROWS because the window is rows — the removed ones among them are counted here.
    const html = renderCommentsHtml(twoComments(), 5, 'pub-1', 2, { offset: 4, total: 5, pageHref });
    expect(html).toContain('showing rows 5–6 of 5');
    expect(html).not.toContain('newest');
  });

  it('the ROW count is the end, not the visible count — removed comments still page', () => {
    // A thread of fifty comments of which thirty were taken back has thirty VISIBLE and fifty ROWS. A
    // pager that used the visible count as its end would stop a reader twenty rows short of it.
    const rows = toCommentRows([entry({ id: 'c-1' }), entry({ id: 'c-2', deleted: true, body: '' })]);
    const html = renderCommentsHtml(rows, 30, 'pub-1', 20, { offset: 20, total: 50, pageHref });
    expect(html).toContain('30 comment(s) visible');
    expect(html).toContain('showing rows 21–22 of 50');
    expect(html).toContain('data-comments-page="older" href="/p/pub-1?commentOffset=40"');
  });

  it('an empty window past the end says so — it is not "no comments yet"', () => {
    // v286's empty state is the honest answer to a question about the FIRST window. A window PAST the
    // end is a different fact about a different thing: the page, not the publication.
    const html = renderCommentsHtml([], 5, 'pub-1', 2, { offset: 4, total: 5, pageHref });
    expect(html).toContain('this page is past the end — the service answered an empty window');
    expect(html).toContain('5 comment(s) visible in the whole thread');
    expect(html).not.toContain('No comments yet');
  });

  it('but an empty FIRST window is still "no comments yet"', () => {
    const html = renderCommentsHtml([], 0, 'pub-1', 2, { offset: 0, total: 0, pageHref });
    expect(html).toContain('No comments yet');
    expect(html).not.toContain('past the end');
  });

  it('the pager is links, and a boundary is a span with no href', () => {
    const first = renderCommentsHtml(twoComments(), 5, 'pub-1', 2, { offset: 0, total: 5, pageHref });
    expect(first).toContain('<span class="nexus-comments-page" data-comments-page="newer"');
    expect(first).toContain('<a class="nexus-comments-page" data-comments-page="older" href="/p/pub-1?commentOffset=2"');
    const last = renderCommentsHtml(twoComments(), 5, 'pub-1', 2, { offset: 4, total: 5, pageHref });
    expect(last).toContain('<a class="nexus-comments-page" data-comments-page="newer" href="/p/pub-1?commentOffset=2"');
    expect(last).toContain('<span class="nexus-comments-page" data-comments-page="older"');
  });

  it('"Older" is not offered when the next window would hold nothing', () => {
    // v398's one rule, the same one every other pager in the Studio now ends on.
    const html = renderCommentsHtml([], 5, 'pub-1', 2, { offset: 4, total: 5, pageHref });
    expect(html).toContain('<span class="nexus-comments-page" data-comments-page="older"');
    expect(html).not.toContain('data-comments-page="older" href');
  });

  it('a section with no URL builder draws no pager — only the window line', () => {
    const html = renderCommentsHtml(twoComments(), 5, 'pub-1', 2, { offset: 0, total: 5 });
    expect(html).toContain('showing the 2 newest');
    expect(html).not.toContain('nexus-comments-pager');
  });

  it('a window that holds the whole thread gets no pager at all', () => {
    const html = renderCommentsHtml(twoComments(), 2, 'pub-1', 100, { offset: 0, total: 2, pageHref });
    expect(html).not.toContain('nexus-comments-pager');
    expect(html).not.toContain('showing');
  });

  it('a thread with no row count on the wire keeps the visible count as its witness', () => {
    // The fallback for a service that does not answer with one: v354's rule was the only witness
    // before v399, and it stays the one for a wire that carries no total.
    const html = renderCommentsHtml(twoComments(), 5, 'pub-1', 2, { offset: 0, pageHref });
    expect(html).toContain('showing the 2 newest');
    expect(html).not.toContain('nexus-comments-pager');
  });
});
