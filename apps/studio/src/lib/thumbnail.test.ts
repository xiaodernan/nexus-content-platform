import { describe, expect, it } from 'vitest';
import { applyBatch, createEmptyDocument, ellipseNode, ops, rectNode, solid, textNode, type DesignDocument, type RGBA, type TextStyle } from '@nexus/design-model';
import { docToSvg, svgToDataUri } from './thumbnail';

function buildDoc(withNodes = true) {
  const doc = createEmptyDocument('Thumb');
  if (!withNodes) return doc;
  const page = doc.activePageId;
  const r = rectNode('Box', { x: 10, y: 10, width: 80, height: 60, cornerRadius: 6 });
  const e = ellipseNode('Dot', { x: 120, y: 10, width: 40, height: 40 });
  const t = textNode('Title', 'Hi <&> world', { fontFamilyToken: 'font.family.body', sizeToken: 'font.size.xl', weight: 700, lineHeight: 1.2, letterSpacing: 0, align: 'left' }, { x: 10, y: 90, width: 200, height: 40 });
  return applyBatch(doc, { id: 'b1', ops: [ops.addSubtree(page, 0, [r]), ops.addSubtree(page, 1, [e]), ops.addSubtree(page, 2, [t])], provenance: { mode: 'user' }, timestamp: 0 });
}

function strokeDoc(weight: number, color: RGBA): DesignDocument {
  const doc0 = createEmptyDocument('Stroked');
  const box = rectNode('Input', { x: 10, y: 10, width: 320, height: 44, strokes: [{ color, weight, align: 'inside' }] });
  const d = applyBatch(doc0, { id: 'b1', ops: [ops.addSubtree(doc0.activePageId, 0, [box])], provenance: { mode: 'user' }, timestamp: 0 });
  return d;
}

function fadedDoc(opacity: number): DesignDocument {
  const doc0 = createEmptyDocument('Faded');
  const box = rectNode('Ghost', { x: 10, y: 10, width: 80, height: 60, fills: [solid({ r: 0.2, g: 0.4, b: 0.9, a: 1 })], opacity });
  return applyBatch(doc0, { id: 'b1', ops: [ops.addSubtree(doc0.activePageId, 0, [box])], provenance: { mode: 'user' }, timestamp: 0 });
}

describe('thumbnail: docToSvg', () => {
  it('emits rect/ellipse/text shapes and a page viewBox from real layout', () => {
    const doc = buildDoc();
    const svg = docToSvg(doc, doc.activePageId);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox=');
    expect(svg).toMatch(/<rect /);
    expect(svg).toMatch(/<ellipse /);
    expect(svg).toMatch(/<text /);
  });

  it('escapes XML-sensitive characters in text nodes', () => {
    const doc = buildDoc();
    const svg = docToSvg(doc, doc.activePageId);
    expect(svg).toContain('Hi &lt;&amp;&gt; world');
    expect(svg).not.toContain('Hi <&> world');
  });

  it('skips invisible nodes', () => {
    const doc = buildDoc();
    const boxId = Object.values(doc.nodes).find((x) => x.type === 'rectangle')!.id;
    const hidden = applyBatch(doc, { id: 'b2', ops: [ops.updateNode(boxId, { visible: false })], provenance: { mode: 'user' }, timestamp: 0 });
    // The only remaining rect-ish shape should not be the hidden box; still a valid svg with ellipse+text.
    const svg = docToSvg(hidden, hidden.activePageId);
    expect(svg).toContain('<ellipse');
    expect(svg).toContain('<text');
  });

  it('returns a minimal placeholder svg for an empty page', () => {
    const doc = buildDoc(false);
    const svg = docToSvg(doc, doc.activePageId);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).not.toContain('<text');
  });
});

describe('thumbnail: svgToDataUri', () => {
  it('produces a decodable data URI with the svg markup url-encoded', () => {
    const doc = buildDoc();
    const svg = docToSvg(doc, doc.activePageId);
    const uri = svgToDataUri(svg);
    expect(uri.startsWith('data:image/svg+xml,')).toBe(true);
    expect(decodeURIComponent(uri.slice('data:image/svg+xml,'.length))).toBe(svg);
  });

  it('yields just the prefix for an empty svg', () => {
    expect(svgToDataUri('')).toBe('data:image/svg+xml,');
  });
});

describe('thumbnail: docToSvg edges', () => {
  it('turns a rotated node about its own centre, like the canvas does', () => {
    // The thumb is the Studio's before/after picture of the same model. It ignored `rotation`, so an edit
    // that only turned a box showed two identical thumbs — the diff card said nothing had happened.
    const doc0 = createEmptyDocument('Rot');
    const box = rectNode('Box', { x: 10, y: 10, width: 80, height: 60 });
    const withBox = applyBatch(doc0, { id: 'b1', ops: [ops.addSubtree(doc0.activePageId, 0, [box])], provenance: { mode: 'user' }, timestamp: 0 });
    const id = Object.values(withBox.nodes).find((n) => n.type === 'rectangle')!.id;
    const doc = applyBatch(withBox, { id: 'b2', ops: [ops.updateNode(id, { rotation: 90 })], provenance: { mode: 'user' }, timestamp: 0 });

    const svg = docToSvg(doc, doc.activePageId);
    // box (10,10,80,60) → centre (50,40)
    expect(svg).toContain('transform="rotate(90 50 40)"');
  });

  it('leaves an unrotated node without a transform attribute', () => {
    // One doc, not `buildDoc()` twice: the second call invents a different page id, and a page the doc does
    // not have makes docToSvg return the empty placeholder — which passes every "does not contain" claim.
    const doc = buildDoc();
    const svg = docToSvg(doc, doc.activePageId);
    expect(svg).toContain('<ellipse');
    expect(svg).not.toContain('rotate(');
  });

  it('strokes a node the way the canvas strokes it', () => {
    // The demo composer puts a 1px border on its auth inputs (composer.ts buildAuth). Both the canvas and
    // the artifact paint it; the thumb dropped it, so a published auth page looked borderless in the gallery.
    const doc = strokeDoc(3, { r: 1, g: 0, b: 0, a: 1 });
    const svg = docToSvg(doc, doc.activePageId);
    expect(svg).toContain('stroke="rgba(255, 0, 0, 1)" stroke-width="3"');
  });

  it('fades a node by its opacity, like the canvas globalAlpha', () => {
    // The inspector's Opacity field writes node.opacity; the canvas sets globalAlpha and the artifact emits
    // `opacity:`. A node faded to 0 on the canvas still showed SOLID in the before/after thumb.
    const doc = fadedDoc(0.25);
    const svg = docToSvg(doc, doc.activePageId);
    expect(svg).toContain('opacity="0.25"');
  });

  it('fades text as well as shapes', () => {
    const doc0 = createEmptyDocument('FadeText');
    const page = doc0.activePageId;
    const t = textNode('Ghost', 'hello', {
      fontFamilyToken: 'font.family.body',
      sizeToken: 'font.size.xl',
      weight: 700,
      lineHeight: 1.2,
      letterSpacing: 0,
      align: 'left',
    }, { x: 10, y: 90, width: 200, height: 40, opacity: 0.4 });
    const doc = applyBatch(doc0, { id: 'b1', ops: [ops.addSubtree(page, 0, [t])], provenance: { mode: 'user' }, timestamp: 0 });
    const svg = docToSvg(doc, page);
    expect(svg).toMatch(/<text[^>]*opacity="0.4"/);
  });

  it('leaves an opaque, unbordered node without stroke or opacity attributes', () => {
    // The control: defaults must keep emitting the same bytes, so only authored strokes/fades change the picture.
    const doc = buildDoc();
    const svg = docToSvg(doc, doc.activePageId);
    expect(svg).toContain('<ellipse');
    expect(svg).not.toContain('stroke=');
    expect(svg).not.toContain('opacity=');
  });

  it('truncates long text content to 80 characters', () => {
    const doc = createEmptyDocument('LongText');
    const page = doc.activePageId;
    const t = textNode('Long', 'A'.repeat(100), {
      fontFamilyToken: 'font.family.body',
      sizeToken: 'font.size.xl',
      weight: 700,
      lineHeight: 1.2,
      letterSpacing: 0,
      align: 'left',
    }, { x: 10, y: 90, width: 300, height: 40 });
    const d2 = applyBatch(doc, { id: 'b1', ops: [ops.addSubtree(page, 0, [t])], provenance: { mode: 'user' }, timestamp: 0 });
    const svg = docToSvg(d2, d2.activePageId);
    expect(svg).toContain('A'.repeat(80));
    expect(svg).not.toContain('A'.repeat(81));
  });
});

/**
 * M7 v294 — the thumbnail is the only renderer that used to draw text with numbers the model never gave it.
 * It sized the letters from the BOX (`height * 0.6`), so a headline the document sets to `font.size.2xl`
 * = 40px painted at 57.6px in every gallery card, a 20px subhead at 38.4px, `weight` never appeared, the
 * family was hardcoded instead of read from `font.family.body`, and left/center/right all drew at the same
 * x. It also cut the text at 80 characters WITHOUT saying it had.
 *
 * The rule now: the thumb resolves the same `TextStyle` the canvas and the artifact resolve (through
 * `paint.resolveTextStyle`, tokens included) and says so when it must drop the tail.
 */
function textDoc(style: Partial<TextStyle> & { sizeToken: string }, box: { width: number; height: number }, chars = 'Selected work'): DesignDocument {
  const doc0 = createEmptyDocument('Text style');
  const full: TextStyle = { fontFamilyToken: 'font.family.body', weight: 400, lineHeight: 1.2, letterSpacing: 0, align: 'left', ...style };
  const t = textNode('T', chars, full, { id: 'tx', x: 100, y: 100, ...box, fills: [{ kind: 'token', ref: 'color.text' }] });
  return applyBatch(doc0, { id: 'b1', ops: [ops.addSubtree(doc0.activePageId, 0, [t])], provenance: { mode: 'user' }, timestamp: 0 });
}

// One doc, drawn by the same call: a second `textDoc()` invents a different page id, and a page the document
// does not have makes docToSvg return the empty placeholder — which passes every "does not contain" claim.
const textSvg = (style: Parameters<typeof textDoc>[0], box: { width: number; height: number }, chars?: string) => {
  const doc = textDoc(style, box, chars);
  return docToSvg(doc, doc.activePageId);
};

const sizeOf = (svg: string) => Number(/font-size="([\d.]+)"/.exec(svg)![1]);

describe('thumbnail: the declared text style', () => {
  it('paints the size the model declares, not one derived from the box', () => {
    // The composer's hero headline: `font.size.2xl` in an 820x96 box (composer.ts:133). Measured before this
    // grant: the thumb painted 57.6px — 1.44x the document's own number.
    const svg = textSvg({ sizeToken: 'font.size.2xl' }, { width: 820, height: 96 });
    expect(sizeOf(svg)).toBe(40);
    expect(svg).not.toContain('57.6');
  });

  it('reads the family and the weight off the style instead of hardcoding them', () => {
    const svg = textSvg({ sizeToken: 'font.size.lg', weight: 700 }, { width: 640, height: 64 });
    expect(svg).toContain('font-family="Inter, system-ui, sans-serif"');
    expect(svg).toContain('font-weight="700"');
  });

  it.each([
    ['left', { x: '100', anchor: null }],
    ['center', { x: '250', anchor: 'middle' }],
    ['right', { x: '400', anchor: 'end' }],
  ] as const)('gives align=%s its own anchor', (align, want) => {
    const svg = textSvg({ sizeToken: 'font.size.lg', align }, { width: 300, height: 28 });
    expect(/<text[^>]*\bx="([\d.]+)"/.exec(svg)![1]).toBe(want.x);
    if (want.anchor) expect(svg).toContain(`text-anchor="${want.anchor}"`);
    else expect(svg).not.toContain('text-anchor');
  });

  it('breaks the author’s newlines onto their own lines with the declared leading', () => {
    // 20px x lineHeight 1.3 → the second line sits 26px under the first. The thumb cannot measure glyphs,
    // so it breaks only where the AUTHOR broke — the divergence from the canvas' wrap is stated in the module.
    const svg = textSvg({ sizeToken: 'font.size.lg', lineHeight: 1.3 }, { width: 300, height: 60 }, 'one\ntwo');
    const dys = [...svg.matchAll(/<tspan[^>]*\bdy="([\d.]+)"/g)].map((m) => m[1]);
    expect(dys).toEqual(['16', '26']);
  });

  it('emits tracking when the style declares it', () => {
    expect(textSvg({ sizeToken: 'font.size.lg', letterSpacing: 1.5 }, { width: 300, height: 28 })).toContain('letter-spacing="1.5"');
  });

  it('emits no tracking attribute for the default zero', () => {
    expect(textSvg({ sizeToken: 'font.size.lg' }, { width: 300, height: 28 })).not.toContain('letter-spacing');
  });

  it('marks the cut when it has to drop the tail', () => {
    // The cap is real (a thumb ships as a data URI inside an <img>), but the SILENCE was the lie: a card that
    // paints 80 of 102 characters without saying so tells the viewer the words ended where they did not.
    const svg = textSvg({ sizeToken: 'font.size.xl' }, { width: 300, height: 40 }, 'A'.repeat(100));
    expect(svg).toContain(`${'A'.repeat(80)}…`);
    expect(svg).not.toContain('A'.repeat(81));
  });

  it('keeps the spaces the author typed', () => {
    const svg = textSvg({ sizeToken: 'font.size.lg' }, { width: 300, height: 28 }, 'Ford  —  ridge');
    expect(svg).toContain('xml:space="preserve"');
    expect(svg).toContain('Ford  —  ridge');
  });

  it('falls back to 16px when the document names a size token it does not have', () => {
    // A published document is JSON a client posted. `resolveToken` used to throw on a reference that is not
    // a path at all, which took the whole gallery down over one malformed style; a missing token already
    // meant "use the fallback", and now a non-path means the same.
    expect(sizeOf(textSvg({ sizeToken: 'font.size.does-not-exist' }, { width: 300, height: 28 }))).toBe(16);
  });

  it('draws a style whose members are not of the declared types instead of pasting them into the card', () => {
    // The thumb is one of three readers, so the members are coerced at the SHARED resolver (paint.ts), not
    // per renderer. This leg runs through the thumb because the thumb is the reader that emits the values
    // into MARKUP: `/explore` puts the SVG in an `<img src="data:…">` on every visitor's page.
    const doc0 = createEmptyDocument('Malformed');
    const bad = {
      fontFamilyToken: 42,
      sizeToken: { nope: true },
      weight: 'bold" onload="x',
      lineHeight: 'roomy',
      letterSpacing: 'wide',
      align: 'middle',
    } as unknown as TextStyle;
    const t = textNode('T', 'hi there', bad, { id: 'tx', x: 100, y: 100, width: 300, height: 28, fills: [{ kind: 'token', ref: 'color.text' }] });
    const doc = applyBatch(doc0, { id: 'b1', ops: [ops.addSubtree(doc0.activePageId, 0, [t])], provenance: { mode: 'user' }, timestamp: 0 });
    const svg = docToSvg(doc, doc.activePageId);
    expect(svg).toContain('font-size="16"');
    expect(svg).toContain('font-family="Inter, sans-serif"');
    expect(svg).toContain('font-weight="400"');
    expect(svg).not.toContain('letter-spacing');
    expect(svg).not.toContain('onload');
    // `middle` is not one of the three alignments the model declares; the word must not travel into the markup.
    expect(svg).not.toContain('middle');
  });
});

describe('thumbnail — a posted value cannot wear an attribute (M7 v295)', () => {
  /**
   * The card is SVG bytes that `/explore` hands to every visitor inside `<img src="data:…">`, so a value that
   * closes an attribute here corrupts the PICTURE rather than the page — a smaller blast radius than the
   * artifact's, and the same one-line rule. v295 measured the asymmetry per site on shipped bytes: the four
   * values that reach an attribute as TEXT were open (a token's `$value` as the fill, a paint's alpha, a
   * stroke's weight, a node's opacity), while the geometry was already closed because `n()` refuses a
   * non-number. Both halves are pinned here — the escape where the measurement said the value travelled, and
   * the refusal where it did not, so the next reader does not have to re-derive which is which.
   */
  const evil = (k: string) => `EVIL_${k}" ART_${k}="x`;
  const raw = (k: string) => evil(k) as unknown as never;

  function cardDoc(overrides: NonNullable<Parameters<typeof rectNode>[1]>, poisonTokens?: (t: DesignDocument['tokens']) => DesignDocument['tokens']): DesignDocument {
    const doc0 = createEmptyDocument('Card');
    const box = rectNode('Box', {
      id: 'bx', x: 10, y: 10, width: 120, height: 60,
      fills: [solid({ r: 0.2, g: 0.4, b: 0.9, a: 1 })], ...overrides,
    });
    const doc = applyBatch(doc0, { id: 'b1', ops: [ops.addSubtree(doc0.activePageId, 0, [box])], provenance: { mode: 'user' }, timestamp: 0 });
    return poisonTokens ? { ...doc, tokens: poisonTokens(doc.tokens) } : doc;
  }

  /** Rewrite one `$value` in the document's OWN token tree — the tests never retype a token. */
  const poison = (tokens: DesignDocument['tokens'], path: string[], value: unknown): DesignDocument['tokens'] => {
    const set = (g: Record<string, unknown>, keys: string[]): Record<string, unknown> => {
      const [head, ...rest] = keys;
      if (head === undefined) return g;
      if (!rest.length) return { ...g, [head]: { ...(g[head] as object), $value: value } };
      return { ...g, [head]: set(g[head] as Record<string, unknown>, rest) };
    };
    return set(tokens as unknown as Record<string, unknown>, path) as DesignDocument['tokens'];
  };

  it('carries a colour token that contains a quote as the fill’s data, not as an attribute', () => {
    // `colorToCss` returns a string `$value` VERBATIM, so the token the document named went straight into
    // `fill="…"` — the same resolver seam the artifact writes through, measured in the card that shares it.
    const doc = cardDoc({ fills: [{ kind: 'token', ref: 'color.text' }] }, (t) => poison(t, ['color', 'text'], evil('fill')));
    const svg = docToSvg(doc, doc.activePageId);
    expect(svg, 'the value survived, as data').toContain('fill="EVIL_fill&quot; ART_fill=&quot;x"');
    expect(svg, 'no attribute opened where the value continues').not.toContain('" ART_fill="');
  });

  it('carries a paint alpha, a stroke weight and an opacity that are not numbers as data', () => {
    // Three more attributes built from a POSTED value: `rgbaCss` interpolates `a` raw, and the weight and the
    // fade are emitted unrounded on purpose (v292), so whatever the document said is what the attribute said.
    const doc = cardDoc({
      fills: [solid({ r: 1, g: 0, b: 0, a: raw('alpha') })],
      strokes: [{ color: { r: 0, g: 0, b: 0, a: 1 }, weight: raw('weight'), align: 'inside' }],
      opacity: raw('fade'),
    });
    const svg = docToSvg(doc, doc.activePageId);
    for (const k of ['alpha', 'weight', 'fade']) {
      expect(svg, `the ${k} reached an attribute as text`).toContain(evil(k).replace(/"/g, '&quot;'));
      expect(svg, `the ${k} opened no attribute`).not.toContain(`" ART_${k}="`);
    }
    expect(svg).toContain('<rect ');
  });

  it('refuses a non-number where the model types geometry, so those sites needed no escape', () => {
    const doc = cardDoc({ x: raw('geom'), width: raw('geom'), cornerRadius: raw('geom') });
    const svg = docToSvg(doc, doc.activePageId);
    expect(svg, 'the authored geometry never reaches the markup').not.toContain('EVIL_geom');
    expect(svg).toContain('<rect x="0"');
  });
});
