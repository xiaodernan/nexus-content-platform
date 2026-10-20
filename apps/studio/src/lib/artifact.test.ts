import { describe, expect, it } from 'vitest';
import { applyBatch, createEmptyDocument, ops, solid, textNode } from '@nexus/design-model';
import { injectRemixBar, injectMetaBar, renderArtifactHtml, renderArtifactMissing, renderArtifactUnavailable } from './artifact';

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

  it('the stage is the PAGE’s size, so the drawing is not clipped into a 100px chip', () => {
    // A new document's page used to be sized by the generic node default (100×100) while the Studio's
    // "+" makes 1440×900 pages: a published drawing kept its own coordinates but the stage clipped it.
    const doc = createEmptyDocument('Harbour');
    const html = renderArtifactHtml({ title: 'Harbour', document: doc });
    expect(html).toContain('width:1440px;height:900px');
    expect(html).not.toContain('width:100px;height:100px');
  });

  it('draws a text node’s fill as the LETTER colour, not as a box behind it', () => {
    // styleFor used to paint every node's first fill as a background. A text node's fill is already its
    // letter colour, so the words sat behind a bar of their own colour: readable in the Studio canvas,
    // a solid block in the artifact.
    let doc = createEmptyDocument('Harbour');
    const t = textNode('Headline', 'Harbour at dusk', {
      fontFamilyToken: 'font.family.body',
      sizeToken: 'font.size.xl',
      weight: 700,
      lineHeight: 1.2,
      letterSpacing: 0,
      align: 'left',
    }, { x: 10, y: 20, width: 300, height: 60 });
    t.fills = [solid({ r: 1, g: 1, b: 1, a: 1 })];
    doc = applyBatch(doc, {
      id: 'b',
      ops: [ops.addSubtree(doc.activePageId, 0, [t])],
      provenance: { mode: 'user' },
      timestamp: 0,
      summary: 'test',
    });

    const html = renderArtifactHtml({ document: doc });
    const div = html.match(/<div style="[^"]*">Harbour at dusk<\/div>/)?.[0] ?? '';
    expect(div).toContain('color:rgba(255, 255, 255, 1)');
    expect(div).not.toContain('background:rgba(255, 255, 255, 1)');
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

describe('artifact — the REMIX bar lets a VISITOR take the work (M7 v234)', () => {
  it('injects a remix link naming the project, with the id encoded', () => {
    const doc = createEmptyDocument('Harbour');
    const html = renderArtifactHtml({ projectId: 'my pub/1', document: doc });
    expect(html).toContain('Remix in NEXUS Studio');
    expect(html).toContain('href="/?remix=my%20pub%2F1"');
    // The drawing is untouched: the bar is injected before </body>, after the stage.
    expect(html).toContain('class="stage"');
    expect(html.indexOf('nexus-remix')).toBeLessThan(html.indexOf('</body>'));
  });

  it('adds NO bar when the caller names no project', () => {
    const doc = createEmptyDocument('Harbour');
    const html = renderArtifactHtml({ title: 'Harbour', document: doc });
    expect(html).not.toContain('nexus-remix');
  });

  it('returns the html unchanged when there is no </body> to inject before', () => {
    expect(injectRemixBar('<div>no body tag</div>', 'p1')).toBe('<div>no body tag</div>');
  });

  it('encodes the id so a quote cannot break out of the attribute', () => {
    const out = injectRemixBar('<body></body>', 'a"b');
    expect(out).toContain('href="/?remix=a%22b"');
    expect(out).not.toContain('a"b');
  });
});

describe('artifact — the META bar shows author and remix source (M7 v245)', () => {
  const doc = createEmptyDocument('Harbour at dusk');

  it('injects `by <handle> · <assurance>` and `remixed from <id>` when both are recorded', () => {
    const html = renderArtifactHtml(
      { projectId: 'pub-1', title: 'Harbour at dusk', version: 2, document: doc },
      { handle: 'ada', assurance: 'unsigned-local' },
      'pub-alpha',
    );
    expect(html).toContain('by ada · unsigned-local');
    expect(html).toContain('remixed from pub-alpha');
    expect(html).toContain('class="stage"');
    expect(html.indexOf('nexus-meta')).toBeLessThan(html.indexOf('</body>'));
  });

  it('injects ONLY the author line when there is no lineage', () => {
    const html = renderArtifactHtml(
      { projectId: 'pub-1', title: 'Harbour at dusk', document: doc },
      { handle: 'ada', assurance: 'unsigned-local' },
      null,
    );
    expect(html).toContain('by ada · unsigned-local');
    expect(html).not.toContain('remixed from');
  });

  it('injects ONLY the lineage line when there is no claim', () => {
    const html = renderArtifactHtml(
      { projectId: 'pub-1', title: 'Harbour at dusk', document: doc },
      null,
      'pub-alpha',
    );
    expect(html).toContain('remixed from pub-alpha');
    expect(html).not.toContain('by ');
  });

  it('injects NO meta bar when neither is recorded', () => {
    const html = renderArtifactHtml(
      { projectId: 'pub-1', title: 'Harbour at dusk', document: doc },
      null,
      null,
    );
    expect(html).not.toContain('nexus-meta');
    expect(html).toContain('class="stage"');
  });

  it('escapes caller-controlled meta text', () => {
    const html = renderArtifactHtml(
      { projectId: 'pub-1', title: 'Harbour at dusk', document: doc },
      { handle: '<script>x</script>', assurance: 'unsigned-local' },
      '<script>y</script>',
    );
    expect(html).toContain('by &lt;script&gt;x&lt;/script&gt; · unsigned-local');
    expect(html).toContain('remixed from &lt;script&gt;y&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('returns the html unchanged when there is no </body> to inject before', () => {
    expect(injectMetaBar('<div>no body tag</div>', { handle: 'ada', assurance: 'unsigned-local' }, 'pub-alpha')).toBe('<div>no body tag</div>');
  });

  it('injectMetaBar adds nothing when both owner and lineage are absent', () => {
    expect(injectMetaBar('<body></body>', null, null)).toBe('<body></body>');
  });
});

describe('artifact — missing and unavailable pages', () => {
  it('renderArtifactMissing names the id (escaped) and states the not-published fact', () => {
    const html = renderArtifactMissing('<script>x</script>');
    expect(html).toContain('Nothing published here');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('taken down');
  });

  it('renderArtifactUnavailable states the reason (escaped) and the service fact', () => {
    const html = renderArtifactUnavailable('<img src=x onerror=alert(1)>');
    expect(html).toContain('The publication service is not answering');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img');
  });
});
