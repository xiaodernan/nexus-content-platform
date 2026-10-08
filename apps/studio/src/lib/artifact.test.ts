import { describe, expect, it } from 'vitest';
import { createEmptyDocument } from '@nexus/design-model';
import { renderArtifactHtml, renderArtifactMissing, renderArtifactUnavailable } from './artifact';

/**
 * M7 v196 — the artifact page's rendering rules.
 *
 * These are the decisions the route makes, kept out of the route so they can be asserted without starting a
 * server: what an artifact looks like, and what the two failure pages say. The end-to-end probe
 * (`tools/harness/studio-publish.mjs`) is what proves the route is wired to them and reachable over HTTP.
 */

describe('artifact — a publication renders as the DOCUMENT', () => {
  it('draws the document with the Studio’s own preview renderer', () => {
    const doc = createEmptyDocument('Harbour at dusk');
    const html = renderArtifactHtml({ title: 'Harbour at dusk', version: 2, document: doc });

    // The renderer's own shell, not a second one: a page built here would be a second answer to "what does
    // this document look like", and the two would drift.
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('class="stage"');
    // The document's name reaches the page through the renderer, not through this module.
    expect(html).toContain('</html>');
  });

  it('a document that is not an object gets the UNAVAILABLE page, not an empty stage', () => {
    // An empty stage would look like an artifact that happens to be blank rather than a broken record.
    const html = renderArtifactHtml({ title: 'x', document: null });
    expect(html).toContain('Artifact unavailable');
    expect(html).not.toContain('class="stage"');

    expect(renderArtifactHtml({ document: 'not a document' })).toContain('Artifact unavailable');
    expect(renderArtifactHtml({ document: [1, 2] })).toContain('Artifact unavailable');
  });

  it('a document that names no page it holds gets the UNAVAILABLE page too', () => {
    const doc = createEmptyDocument('x');
    const broken = { ...doc, activePageId: 'page-that-does-not-exist' };
    const html = renderArtifactHtml({ document: broken });

    expect(html).toContain('Artifact unavailable');
    expect(html).toContain('names no page to draw');
    expect(html).not.toContain('class="stage"');
  });
});

describe('artifact — the two failure pages say DIFFERENT things', () => {
  it('“nothing published here” is its own page, and escapes the id', () => {
    const html = renderArtifactMissing('doc-1<script>alert(1)</script>');

    expect(html).toContain('Nothing published here');
    expect(html).toContain('may have been taken down');
    // The id is caller-controlled, so it is escaped rather than interpolated.
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('“the service is not answering” is a DIFFERENT page, and escapes the reason', () => {
    const html = renderArtifactUnavailable('nexus-api unreachable at http://x: <b>boom</b>');

    expect(html).toContain('The publication service is not answering');
    expect(html).toContain('the artifact itself may be perfectly fine');
    expect(html).not.toContain('<b>boom</b>');
    expect(html).toContain('&lt;b&gt;boom&lt;/b&gt;');
    // The distinction the status codes carry is also carried in the words.
    expect(html).not.toContain('Nothing published here');
  });
});
