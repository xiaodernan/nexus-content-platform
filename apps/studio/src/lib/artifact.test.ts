import { describe, expect, it } from 'vitest';
import { applyBatch, componentNode, createEmptyDocument, expandComponentInstances, instanceNode, ops, rectNode, solid, textNode, type DesignDocument, type DesignNode, type Paint } from '@nexus/design-model';
import { injectRemixBar, injectMetaBar, renderArtifactHtml, renderArtifactMissing, renderArtifactUnavailable } from './artifact';
import { docToSvg } from './thumbnail';

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

  it('rotates a node the way the canvas rotates it — about its own centre', () => {
    // The Studio spins a node with the rotate grip or the Rotation field and paints it turned; the artifact
    // renderer never read `rotation`, so the published page showed the unturned box.
    let doc = createEmptyDocument('Harbour');
    const box = rectNode('Frame', { x: 100, y: 100, width: 200, height: 80 });
    doc = applyBatch(doc, { id: 'b', ops: [ops.addSubtree(doc.activePageId, 0, [box])], provenance: { mode: 'user' }, timestamp: 0, summary: 'test' });
    const id = Object.values(doc.nodes).find((n) => n.type === 'rectangle')!.id;
    doc = applyBatch(doc, { id: 'b2', ops: [ops.updateNode(id, { rotation: 30 })], provenance: { mode: 'user' }, timestamp: 0, summary: 'turn' });

    const html = renderArtifactHtml({ document: doc });
    const div = html.match(/<div style="[^"]*left:100px[^"]*"><\/div>/)?.[0] ?? '';
    expect(div).toContain('transform:rotate(30deg)');
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

describe('artifact — a posted value cannot wear an attribute (M7 v295)', () => {
  /**
   * A publication is JSON a client posted, and the service stores the object verbatim — v294's leg §5 read a
   * malformed style back OUT of the store to prove the carrier is real. The artifact resolves a token's
   * `$value` and writes it into a `style` attribute (`colorToCss` returns a string unchanged,
   * `resolveTextStyle` reads the family with `String(...)`), so the exposure is per INTERPOLATION SITE.
   * Measured on shipped bytes before this grant: all 9 of the document-derived fields that reach a `style`
   * attribute ended that attribute, and all 3 that reach the page's own `<style>` element ended that element.
   *
   * The witness is the START TAG: `/^<div style="[^"]*">$/` says the element carries the ONE attribute the
   * renderer wrote. A document that reached `ARTn=` with a raw quote in front of it made the drawing gain an
   * ATTRIBUTE, and that tag no longer matches. Each case then reads the value back through the decoding a
   * browser applies to an attribute, so a "fix" that deleted the hostile characters instead of carrying them
   * would fail the drawing's own claim.
   */
  const evil = (n: number) => `EVIL${n}" ART${n}="x`;
  const asNumber = (n: number) => evil(n) as unknown as number;
  const startTagWith = (html: string, n: number) =>
    [...html.matchAll(/<div [^>]*>/g)].map((m) => m[0]).find((t) => t.includes(`ART${n}=`)) ?? '';
  const styleValueOf = (tag: string) => /^<div style="([^"]*)">$/.exec(tag)?.[1] ?? '';
  /** What a browser READS out of the attribute — the escape has to be reversible, not lossy. */
  const decoded = (value: string) => value
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  /**
   * The two claims every attribute site has to carry, in one place: the element gained no ATTRIBUTE (its
   * start tag is still the one `style` the renderer wrote), and the document's value is still on the page as
   * DATA at the declaration that names it. A "fix" that deleted the hostile characters would pass the first
   * and fail the second.
   */
  const carriedAsData = (html: string, n: number, at: string) => {
    const tag = startTagWith(html, n);
    expect(tag, `the document’s value reaches the page at ${at}`).not.toBe('');
    expect(tag, `ART${n} stayed inside a value, so the element carries the ONE attribute`).toMatch(/^<div style="[^"]*">$/);
    const value = decoded(styleValueOf(tag));
    expect(value, `${at} carries the value the document named`).toContain(evil(n));
    expect(value, `${at} is the declaration that carries it`).toContain(at);
  };

  /** Reach into the document's OWN token tree and rewrite one `$value`; the tests never retype a token. */
  function poisonToken(doc: DesignDocument, path: string[], value: unknown): DesignDocument {
    const set = (group: Record<string, unknown>, keys: string[]): Record<string, unknown> => {
      const [head, ...rest] = keys;
      if (head === undefined) return group;
      if (!rest.length) return { ...group, [head]: { ...(group[head] as object), $value: value } };
      return { ...group, [head]: set(group[head] as Record<string, unknown>, rest) };
    };
    return { ...doc, tokens: set(doc.tokens as unknown as Record<string, unknown>, path) as DesignDocument['tokens'] };
  }
  function oneText(doc0: DesignDocument, words: string, fills: Paint[]): DesignDocument {
    const t = textNode('T', words, {
      fontFamilyToken: 'font.family.body', sizeToken: 'font.size.xs',
      weight: 400, lineHeight: 1.2, letterSpacing: 0, align: 'left',
    }, { id: 'tx', x: 10, y: 10, width: 200, height: 40, fills });
    return applyBatch(doc0, { id: 'b', ops: [ops.addSubtree(doc0.activePageId, 0, [t])], provenance: { mode: 'user' }, timestamp: 0 });
  }
  function oneBox(doc0: DesignDocument, geom: Partial<DesignNode>): DesignDocument {
    const box = rectNode('Box', { id: 'bx', x: 10, y: 10, width: 100, height: 40, ...geom } as never);
    return applyBatch(doc0, { id: 'b', ops: [ops.addSubtree(doc0.activePageId, 0, [box])], provenance: { mode: 'user' }, timestamp: 0 });
  }

  it('carries a family token that contains a quote as the letter’s data, not as an attribute', () => {
    const doc = poisonToken(oneText(createEmptyDocument('Harbour'), 'WORDS_1', [{ kind: 'token', ref: 'color.text' }]),
      ['font', 'family', 'body'], evil(1));
    carriedAsData(renderArtifactHtml({ projectId: 'pub-1', title: 'Harbour', document: doc }), 1, 'font:');
  });

  it('carries a colour token that contains a quote as data, in the letter and in the box', () => {
    // One resolved value, two branches of the same renderer: a text node takes it as the letter colour, any
    // other node as `background`. `colorToCss` returns a string `$value` VERBATIM, so both were open.
    const letter = poisonToken(oneText(createEmptyDocument('a'), 'WORDS_2', [{ kind: 'token', ref: 'color.text' }]), ['color', 'text'], evil(2));
    carriedAsData(renderArtifactHtml({ document: letter }), 2, 'color:');

    const box = poisonToken(oneBox(createEmptyDocument('b'), { fills: [{ kind: 'token', ref: 'color.text' }] as Paint[] }), ['color', 'text'], evil(3));
    carriedAsData(renderArtifactHtml({ document: box }), 3, 'background:');
  });

  it('carries a paint alpha that is not a number as data — in a letter, a box border', () => {
    // `rgbaCss` interpolates `a` raw and the model's `RGBA['a']` is a TYPE, not a check on posted bytes; a
    // string there is legal JSON. `r/g/b` are rounded through `Math.round`, which a string cannot survive —
    // the alpha is the colour channel that travels.
    const letter = oneText(createEmptyDocument('a'), 'WORDS_4', [solid({ r: 1, g: 0, b: 0, a: asNumber(4) })]);
    carriedAsData(renderArtifactHtml({ document: letter }), 4, 'rgba(255, 0, 0,');

    const bordered = oneBox(createEmptyDocument('b'), { strokes: [{ color: { r: 0, g: 0, b: 0, a: asNumber(5) }, weight: 1, align: 'inside' }] as never });
    carriedAsData(renderArtifactHtml({ document: bordered }), 5, 'solid rgba(0, 0, 0,');
  });

  it('carries geometry, opacity, rotation and a radius that are not numbers as data', () => {
    // All four are typed as NUMBER, and `layoutPage` computes `origin.x + node.x` — string concatenation, not
    // a NaN — so the authored bytes reach the declaration verbatim and each needed its own witness.
    const doc = oneBox(createEmptyDocument('Harbour'), {
      x: asNumber(6), opacity: asNumber(7), rotation: asNumber(8), cornerRadius: asNumber(9),
    });
    const html = renderArtifactHtml({ document: doc });
    const sites = [['left:', 6], ['opacity:', 7], ['rotate(', 8], ['border-radius:', 9]] as const;
    for (const [at, n] of sites) carriedAsData(html, n, at);
  });

  it('refuses to let a token value close the `<style>` block the page writes about itself', () => {
    const clean = renderArtifactHtml({ document: oneText(createEmptyDocument('clean'), 'WORDS', []) });
    // The document's token tree is printed as CSS custom properties INSIDE a `<style>` element. A `$value`
    // carrying markup used to close that element and start another — a stored document writing an `<img>` into
    // whoever opens its page. HTML entities would be the wrong tool here: CSS does not decode them.
    const doc = poisonToken(oneText(createEmptyDocument('evil'), 'WORDS', []), ['color', 'text'],
      'red;}body{display:none}</style><img src=x onerror="ART20">');
    const html = renderArtifactHtml({ document: doc });

    expect((html.match(/<\/style>/g) ?? []).length, 'the document added no style element')
      .toBe((clean.match(/<\/style>/g) ?? []).length);
    expect((html.match(/}/g) ?? []).length, 'the document added no rule boundary to the block')
      .toBe((clean.match(/}/g) ?? []).length);
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('body{display:none}');
    // And the value survives as CSS' own spelling: `\3b `, `\7b `, `\7d `, `\3c ` read back as the characters
    // they name when the custom property is substituted — which is why this is not the HTML escaper's job.
    expect(html).toContain('red\\3b \\7d body\\7b display:none\\7d \\3c /style\\3e ');
  });

  it('escapes a token NAME, not only its value', () => {
    const doc0 = oneText(createEmptyDocument('Harbour'), 'WORDS', []);
    // An object KEY is whatever the client posted, and the custom property name is built from it.
    const doc = { ...doc0, tokens: { ...(doc0.tokens as object), 'x}</style><img src=y>': { note: { $value: 1 } } } } as unknown as DesignDocument;
    const html = renderArtifactHtml({ document: doc });

    expect(html).not.toContain('<img src=y');
    expect(html, 'the NAME still travels as data').toContain('img src=y');
    expect(html).toContain('\\3c /style\\3e ');
    expect((html.match(/<\/style>/g) ?? []).length, 'one style element, written by the renderer').toBe(1);
  });

  it('refuses to let the page’s own width reach the stage rule as markup', () => {
    const doc0 = createEmptyDocument('Harbour');
    // The stage rule is the one place the PAGE node's authored geometry is written, and `layoutPage` passes it
    // through unrounded — so the block that styles the whole page was open from the same JSON.
    const doc = { ...doc0, nodes: { ...doc0.nodes, [doc0.activePageId]: { ...doc0.nodes[doc0.activePageId], width: '1440}</style><img src=z onerror="ART22">' } } } as unknown as DesignDocument;
    const html = renderArtifactHtml({ document: doc });

    expect(html).not.toContain('<img src=z');
    expect(html).toContain('\\22 ART22\\22 ');
    expect((html.match(/<\/style>/g) ?? []).length, 'one style element, written by the renderer').toBe(1);
  });

  it('is inert for a drawing the editor could author — the page carries no entity at all', () => {
    // The escape is a boundary, not a rewrite: a well-formed CSS value holds none of `& < > " '`, so a real
    // publication’s bytes must not gain a single entity. Red the day someone escapes a value that has to be
    // read by the CSS parser as something else.
    const doc = oneText(createEmptyDocument('Harbour'), 'Harbour at dusk', [solid({ r: 1, g: 1, b: 1, a: 1 })]);
    const html = renderArtifactHtml({ projectId: 'pub-1', title: 'Harbour', document: doc });

    expect(html.match(/&(quot|amp|lt|gt|#39);/g) ?? [], 'no entity anywhere in the page').toEqual([]);
    expect(html).toContain('font:400 12px/1.2 Inter, system-ui, sans-serif');
    expect(html).toContain('width:1440px;height:900px');
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

describe('artifact — a publication draws the page the CANVAS drew (v296)', () => {
  /**
   * A component master with one body, and an instance of it on the page — the shape the Studio paints every
   * day. The canvas reaches it through `store.instanceView`, i.e. AFTER `expandComponentInstances`; a page
   * that renders the stored bytes sees the instance's SHELL and none of its bodies. Measured on shipped bytes
   * before the renderers projected: the artifact drew 1 `<div>` and the card 2 rects where the canvas drew 2
   * elements and 3 rects.
   */
  function instanceDoc(shiftX = 0): DesignDocument {
    const d0 = createEmptyDocument('Harbour');
    const cmp = componentNode('Chip', { id: 'cmp' });
    const body = rectNode('body', { id: 'body', x: 5, y: 5, width: 120, height: 40, fills: [solid({ r: 0.2, g: 0.4, b: 0.6, a: 1 })] });
    body.parentId = cmp.id;
    cmp.childIds = [body.id];
    const inst = instanceNode('Chip 1', 'cmp', { id: 'i1', x: 20, y: 30, width: 130, height: 50 });
    if (shiftX) inst.overrides = { body: { x: shiftX } };
    const withMaster = applyBatch(d0, { id: 'b1', ops: [ops.addSubtree(d0.rootId, 0, [cmp, body])], provenance: { mode: 'user' }, timestamp: 0 });
    return applyBatch(withMaster, { id: 'b2', ops: [ops.addSubtree(d0.activePageId, 0, [inst])], provenance: { mode: 'user' }, timestamp: 0 });
  }

  it('draws the instance’s BODY, not only its shell', () => {
    // The clone lands at the instance's origin plus the master child's authored offset: 20+5, 30+5. Only a
    // renderer that knows the projection can place it — which is why this box appears nowhere in the old page.
    const html = renderArtifactHtml({ document: instanceDoc() });
    expect((html.match(/left:25px;top:35px/g) ?? []).length, 'one clone, drawn once').toBe(1);
    expect(html).toContain('left:20px;top:30px'); // the instance shell is still there
  });

  it('paints the body’s fill ONCE — the master stays off the page', () => {
    // Both would carry the same colour, so the count is the witness: a card or page that projected AND walked
    // the master would show two. The master lives under the document root, not under the page, so the walk
    // never reaches it.
    const html = renderArtifactHtml({ document: instanceDoc() });
    expect((html.match(/rgba\(51, 102, 153/g) ?? []).length, 'the clone paints the master’s fill; the master itself does not paint').toBe(1);
    expect(html, 'the master’s own authored offset never reaches the page').not.toContain('left:5px');
  });

  it('is the same bytes for a document that was already projected', () => {
    // `DiffCard` calls `docToSvg(expandComponentInstances(doc).doc, …)`, and the projection now runs inside
    // the renderer too. Two projections must be one picture, or the before/after card disagrees with the page.
    const doc = instanceDoc();
    const twice = expandComponentInstances(expandComponentInstances(doc).doc).doc;
    expect(renderArtifactHtml({ document: twice })).toBe(renderArtifactHtml({ document: doc }));
    expect((renderArtifactHtml({ document: twice }).match(/left:25px;top:35px/g) ?? []).length, 'and not two clones').toBe(1);
  });

  it('moves the clone with an instance override — and the card moves with it', () => {
    // The override is a DELTA on the master child (x 5 + 40), placed under the instance at 20 → 65. Reading the
    // page and then requiring the card to agree is the parity claim; retyping 65 into both would pass while the
    // two drifted apart.
    const doc = instanceDoc(40);
    const html = renderArtifactHtml({ document: doc });
    const clone = /left:(\d+(?:\.\d+)?)px;top:35px/.exec(html);
    expect(clone, 'the page drew the clone at its overridden x').not.toBeNull();
    expect(docToSvg(doc, doc.activePageId)).toContain(`x="${clone![1]}" y="35"`);
    expect(html).not.toContain('left:25px');
  });
});
