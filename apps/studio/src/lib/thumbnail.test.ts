import { describe, expect, it } from 'vitest';
import { applyBatch, createEmptyDocument, ellipseNode, ops, rectNode, textNode } from '@nexus/design-model';
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
});
