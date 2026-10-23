import { describe, expect, it } from 'vitest';
import { renderExploreCards, renderExploreHtml, renderExploreUnavailable, toExploreItem, type ExploreItem } from './explore';

const item = (over: Partial<ExploreItem> = {}): ExploreItem => ({
  projectId: 'pub-1',
  title: 'Harbour',
  version: 2,
  publishedAt: '2026-10-01T00:00:00Z',
  thumbnail: 'data:image/svg+xml,%3Csvg%2F%3E',
  ...over,
});

/**
 * M7 v241 — the explore page's rendering rules, kept out of the route so they can be asserted without a
 * server or a service (the same split `/p/{id}` uses).
 */
describe('explore — the gallery of published work (M7 v241)', () => {
  it('renders one card per item, with a thumbnail and both actions', () => {
    const html = renderExploreHtml([item(), item({ projectId: 'pub-2', title: 'Ridge' })], { count: 2, limit: 24, offset: 0, query: "" });
    expect(html).toContain('data-explore-card="pub-1"');
    expect(html).toContain('data-explore-card="pub-2"');
    expect(html).toContain('<img src="data:image/svg+xml,%3Csvg%2F%3E"');
    // the two doors the community loop needs
    expect(html).toContain('href="/p/pub-1"');
    expect(html).toContain('href="/?remix=pub-1"');
    expect(html).toContain('v2 · 2026-10-01T00:00:00Z');
  });

  it('encodes the id in both links', () => {
    const html = renderExploreHtml([item({ projectId: 'a/b c' })], { count: 1, limit: 24, offset: 0, query: "" });
    expect(html).toContain('href="/p/a%2Fb%20c"');
    expect(html).toContain('href="/?remix=a%2Fb%20c"');
  });

  it('shows the reason instead of a blank thumbnail when there is none', () => {
    const html = renderExploreHtml([item({ thumbnail: undefined, note: 'nothing to draw' })], { count: 1, limit: 24, offset: 0, query: "" });
    expect(html).not.toContain('<img');
    expect(html).toContain('nothing to draw');
  });

  it('escapes caller-controlled text', () => {
    const html = renderExploreHtml([item({ title: '<script>x</script>', projectId: 'p"1' })], { count: 1, limit: 24, offset: 0, query: "" });
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('data-explore-card="p"1"');
  });

  it('states the cap rather than implying the list is complete', () => {
    const html = renderExploreHtml([item()], { count: 1, limit: 24, offset: 0, query: "" });
    expect(html).toContain('caps at 24');
  });

  it('an empty listing is its own state, not an empty grid', () => {
    const html = renderExploreHtml([], { count: 0, limit: 24, offset: 0, query: "" });
    expect(html).toContain('Nothing is published yet');
    expect(html).not.toContain('class="grid"');
  });

  it('a down service is a DIFFERENT page from an empty gallery', () => {
    const html = renderExploreUnavailable('nexus-api unreachable');
    expect(html).toContain('Explore is unavailable');
    expect(html).toContain('nexus-api unreachable');
    expect(html).not.toContain('Nothing is published yet');
  });

  it('shows the recorded owner as `by <handle> · <assurance>` when a claim was attached', () => {
    const html = renderExploreHtml([item({ owner: { accountId: 'acct-ada', handle: 'ada', assurance: 'unsigned-local' } })], { count: 1, limit: 24, offset: 0, query: "" });
    expect(html).toContain('by ada · unsigned-local');
    expect(html).toContain('v2 · 2026-10-01T00:00:00Z');
  });

  it('v270 — the byline is a LINK to that account\'s profile, because a name is not an address', () => {
    const html = renderExploreHtml([item({ owner: { accountId: 'acct-ada', handle: 'ada', assurance: 'unsigned-local' } })], { count: 1, limit: 24, offset: 0, query: "" });
    expect(html).toContain('href="/u/acct-ada"');
  });

  it('escapes caller-controlled owner text', () => {
    const html = renderExploreHtml([item({ owner: { accountId: 'acct-ada', handle: '<script>x</script>', assurance: 'unsigned-local' } })], { count: 1, limit: 24, offset: 0, query: "" });
    expect(html).toContain('by &lt;script&gt;x&lt;/script&gt; · unsigned-local');
    expect(html).not.toContain('<script>');
  });

  it('shows no author line when the row names nobody (pre-claim row)', () => {
    const html = renderExploreHtml([item({ owner: null })], { count: 1, limit: 24, offset: 0, query: "" });
    expect(html).not.toContain('by ');
    expect(html).toContain('v2 · 2026-10-01T00:00:00Z');
  });

  it('shows `remixed from <source>` when the document carries a lineage', () => {
    const html = renderExploreHtml([item({ remixedFrom: 'pub-alpha' })], { count: 1, limit: 24, offset: 0, query: "" });
    expect(html).toContain('remixed from pub-alpha');
    expect(html).toContain('v2 · 2026-10-01T00:00:00Z');
  });

  it('makes `remixed from <source>` a link to the source artifact page, id encoded', () => {
    const html = renderExploreHtml([item({ remixedFrom: 'pub/a b' })], { count: 1, limit: 24, offset: 0, query: "" });
    expect(html).toContain('href="/p/pub%2Fa%20b"');
    expect(html).toContain('remixed from pub/a b');
  });

  it('escapes caller-controlled remixed-from text', () => {
    const html = renderExploreHtml([item({ remixedFrom: '<script>z</script>' })], { count: 1, limit: 24, offset: 0, query: "" });
    expect(html).toContain('remixed from &lt;script&gt;z&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('escapes caller-controlled lineage source', () => {
    const html = renderExploreHtml([item({ remixedFrom: '<script>y</script>' })], { count: 1, limit: 24, offset: 0, query: "" });
    expect(html).toContain('remixed from &lt;script&gt;y&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('shows no lineage line when there is none', () => {
    const html = renderExploreHtml([item({ remixedFrom: null })], { count: 1, limit: 24, offset: 0, query: "" });
    expect(html).not.toContain('remixed from');
    expect(html).toContain('v2 · 2026-10-01T00:00:00Z');
  });

  it('falls back to the default no-preview note when neither thumbnail nor note is present', () => {
    const html = renderExploreHtml([item({ thumbnail: undefined })], { count: 1, limit: 24, offset: 0, query: "" });
    expect(html).toContain('no preview');
    expect(html).not.toContain('<img');
  });

  it('the header states how many are SHOWN, not just how many exist', () => {
    const html = renderExploreHtml([item(), item({ projectId: 'pub-2' })], { count: 5, limit: 24, offset: 0, query: "" });
    expect(html).toContain('2 publication(s) shown');
  });

  it('escapes caller-controlled reason in the unavailable page', () => {
    const html = renderExploreUnavailable('<script>alert(1)</script>');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});

/**
 * M7 v265 — the service-answer → card mapping, in the pure half.
 *
 * The renderer had byline cases, and the mapping that FEEDS it had none: it lived in the route, where a
 * dropped owner would make every publication look anonymous and nothing would say so. These cases grade the
 * whole path — the service's own answer shape in, the page's HTML out — so the byline is proven to ARRIVE
 * and not merely to be renderable.
 */
describe('explore — the service answer becomes a card (M7 v265)', () => {
  /** A listing row exactly as the SERVICE sends it: the owner carries the whole claim. */
  const row = (over: Partial<Parameters<typeof toExploreItem>[0]> = {}) => ({
    projectId: 'pub-1',
    title: 'Harbour',
    version: 2,
    publishedAt: '2026-10-01T00:00:00Z',
    owner: { accountId: 'acct-ada', handle: 'ada', assurance: 'unsigned-local', claimedAt: 1_700_000_000_000 },
    ...over,
  });

  it('an owned row reaches the PAGE as a byline — the whole path, not just the renderer', () => {
    const card = toExploreItem(row(), { ok: true, document: { pages: [] } }, 'data:image/svg+xml,%3Csvg%2F%3E');
    // v270 — the owner carries the ACCOUNT ID as well: the byline is a link to that account's profile, and a
    // link needs an address, not a name.
    expect(card.owner).toEqual({ accountId: 'acct-ada', handle: 'ada', assurance: 'unsigned-local' });
    const html = renderExploreHtml([card], { count: 1, limit: 24, offset: 0, query: "" });
    expect(html).toContain('by ada · unsigned-local');
  });

  it('a row the service recorded NO owner for reaches the page as NO byline', () => {
    const card = toExploreItem(row({ owner: null }), { ok: true }, 'data:image/svg+xml,%3Csvg%2F%3E');
    expect(card.owner).toBeNull();
    expect(renderExploreHtml([card], { count: 1, limit: 24, offset: 0, query: "" })).not.toContain('by ');
  });

  it('a MALFORMED owner is shown as no owner, never as a broken byline', () => {
    // The service refuses a blank handle, but the client is the only party that can meet a shape it did not
    // expect — and a card that says `by undefined` is worse than a card that says nothing.
    const halfBroken = toExploreItem(row({ owner: { handle: 'ada', assurance: null } }), { ok: true });
    expect(halfBroken.owner).toBeNull();
    const noHandle = toExploreItem(row({ owner: { handle: null, assurance: 'unsigned-local' } }), { ok: true });
    expect(noHandle.owner).toBeNull();
    expect(renderExploreHtml([noHandle], { count: 1, limit: 24, offset: 0, query: "" })).not.toContain('undefined');
  });

  it('a document carrying a lineage reaches the card as its source', () => {
    const card = toExploreItem(row(), { ok: true, document: { _lineage: { sourceProjectId: 'pub-alpha' } } });
    expect(card.remixedFrom).toBe('pub-alpha');
    expect(renderExploreHtml([card], { count: 1, limit: 24, offset: 0, query: "" })).toContain('remixed from pub-alpha');
  });

  it('a document with NO lineage reaches the card as no source', () => {
    expect(toExploreItem(row(), { ok: true, document: { pages: [] } }).remixedFrom).toBeNull();
  });

  it('a row that could not be drawn says WHY, and never renders an empty image', () => {
    const failed = toExploreItem(row(), { ok: false, reason: 'the service is down' });
    expect(failed.note).toBe('the service is down');
    expect(failed.thumbnail).toBeUndefined();
    const unreadable = toExploreItem(row(), { ok: true });
    expect(unreadable.note).toBe('nothing to draw');
    const html = renderExploreHtml([failed], { count: 1, limit: 24, offset: 0, query: "" });
    expect(html).not.toContain('<img');
    expect(html).toContain('the service is down');
  });
});

describe('renderExploreCards — the card grid the gallery and the profile share (v454)', () => {
  // v270 exported the grid so the profile page draws the SAME cards; until now the grid itself was
  // reached only through renderExploreHtml, so what one card IS was never asked directly.
  const card = (over: Partial<ExploreItem> = {}): ExploreItem => ({
    projectId: 'proj-1',
    title: 'Neon Dashboard',
    version: 3,
    publishedAt: '2026-10-01T00:00:00.000Z',
    ...over,
  });

  it('one li.card per item, each carrying data-explore-card — the hook a reader finds a card by', () => {
    const html = renderExploreCards([card(), card({ projectId: 'proj-2' })]);
    expect(html.startsWith('<ul class="grid">')).toBe(true);
    expect(html.endsWith('</ul>')).toBe(true);
    expect(html.match(/data-explore-card=/g)).toHaveLength(2);
    expect(html).toContain('data-explore-card="proj-1"');
    expect(html).toContain('data-explore-card="proj-2"');
    // Two li.card elements — counted by their opening tag, not by lines (a card is several lines).
    expect(html.match(/<li class="card"/g)).toHaveLength(2);
  });

  it('a card with a thumbnail draws the IMG, and the absence note stays off the card', () => {
    const html = renderExploreCards([card({ thumbnail: 'data:image/png;base64,AAAA', note: 'nothing to draw' })]);
    expect(html).toContain('<img src="data:image/png;base64,AAAA" alt="Neon Dashboard">');
    expect(html).not.toContain('nothing to draw');
    expect(html).not.toContain('class="empty"');
  });

  it('a card with NO thumbnail SHOWS the note — a blank card lies', () => {
    const withNote = renderExploreCards([card({ note: 'preview unavailable' })]);
    expect(withNote).toContain('<span class="empty">preview unavailable</span>');
    expect(withNote).not.toContain('<img');
    // No note at all falls back to the declared words rather than an empty span.
    const noNote = renderExploreCards([card()]);
    expect(noNote).toContain('<span class="empty">no preview</span>');
  });

  it('the byline is a LINK to the author’s profile — a name becomes an address', () => {
    const html = renderExploreCards([
      card({ owner: { accountId: 'acct-ada', handle: 'ada', assurance: 'signed' } }),
    ]);
    expect(html).toContain('<a class="by" href="/u/acct-ada">by ada · signed</a>');
    // An owner the service did not record means NO byline — never `by undefined`.
    const anon = renderExploreCards([card({ owner: null })]);
    expect(anon).not.toContain('class="by"');
    expect(anon).not.toContain('by undefined');
  });

  it('a remixed card names its source with a link; a non-remix carries no such line', () => {
    const remix = renderExploreCards([card({ remixedFrom: 'proj parent/1' })]);
    expect(remix).toContain('<a class="remixed" href="/p/proj%20parent%2F1">remixed from proj parent/1</a>');
    const plain = renderExploreCards([card({ remixedFrom: null })]);
    expect(plain).not.toContain('remixed from');
  });

  it('the two actions are open and remix, both addressed by encoded project id', () => {
    const html = renderExploreCards([card({ projectId: 'proj 1/2' })]);
    expect(html).toContain('<a href="/p/proj%201%2F2">open</a>');
    expect(html).toContain('<a class="remix" href="/?remix=proj%201%2F2">remix</a>');
  });

  it('caller-controlled text is ESCAPED on its way into the card', () => {
    // A title is a stranger's words: it lands in a text node and an attribute, so it is escaped
    // rather than interpolated — the one rule every server-rendered page in this app shares.
    const html = renderExploreCards([card({ title: '<script>alert(\"x\")</script> & \'quoted\'' })]);
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;quoted&#39;');
    expect(html).not.toContain('<script>');
  });

  it('an empty gallery still renders the grid — an empty list is not a missing page', () => {
    expect(renderExploreCards([])).toBe('<ul class="grid"></ul>');
  });
});
