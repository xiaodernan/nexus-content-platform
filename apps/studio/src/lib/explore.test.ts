import { describe, expect, it } from 'vitest';
import { renderExploreHtml, renderExploreUnavailable, type ExploreItem } from './explore';

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
    const html = renderExploreHtml([item(), item({ projectId: 'pub-2', title: 'Ridge' })], { count: 2, limit: 24 });
    expect(html).toContain('data-explore-card="pub-1"');
    expect(html).toContain('data-explore-card="pub-2"');
    expect(html).toContain('<img src="data:image/svg+xml,%3Csvg%2F%3E"');
    // the two doors the community loop needs
    expect(html).toContain('href="/p/pub-1"');
    expect(html).toContain('href="/?remix=pub-1"');
    expect(html).toContain('v2 · 2026-10-01T00:00:00Z');
  });

  it('encodes the id in both links', () => {
    const html = renderExploreHtml([item({ projectId: 'a/b c' })], { count: 1, limit: 24 });
    expect(html).toContain('href="/p/a%2Fb%20c"');
    expect(html).toContain('href="/?remix=a%2Fb%20c"');
  });

  it('shows the reason instead of a blank thumbnail when there is none', () => {
    const html = renderExploreHtml([item({ thumbnail: undefined, note: 'nothing to draw' })], { count: 1, limit: 24 });
    expect(html).not.toContain('<img');
    expect(html).toContain('nothing to draw');
  });

  it('escapes caller-controlled text', () => {
    const html = renderExploreHtml([item({ title: '<script>x</script>', projectId: 'p"1' })], { count: 1, limit: 24 });
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('data-explore-card="p"1"');
  });

  it('states the cap rather than implying the list is complete', () => {
    const html = renderExploreHtml([item()], { count: 1, limit: 24 });
    expect(html).toContain('caps at 24');
  });

  it('an empty listing is its own state, not an empty grid', () => {
    const html = renderExploreHtml([], { count: 0, limit: 24 });
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
    const html = renderExploreHtml([item({ owner: { handle: 'ada', assurance: 'unsigned-local' } })], { count: 1, limit: 24 });
    expect(html).toContain('by ada · unsigned-local');
    expect(html).toContain('v2 · 2026-10-01T00:00:00Z');
  });

  it('escapes caller-controlled owner text', () => {
    const html = renderExploreHtml([item({ owner: { handle: '<script>x</script>', assurance: 'unsigned-local' } })], { count: 1, limit: 24 });
    expect(html).toContain('by &lt;script&gt;x&lt;/script&gt; · unsigned-local');
    expect(html).not.toContain('<script>');
  });

  it('shows no author line when the row names nobody (pre-claim row)', () => {
    const html = renderExploreHtml([item({ owner: null })], { count: 1, limit: 24 });
    expect(html).not.toContain('by ');
    expect(html).toContain('v2 · 2026-10-01T00:00:00Z');
  });
});
