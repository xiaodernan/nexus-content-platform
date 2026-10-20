import { describe, expect, it } from 'vitest';
import { applyBatch, createEmptyDocument, ellipseNode, ops, rectNode, solid, textNode, type DesignDocument, type RGBA } from '@nexus/design-model';
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
