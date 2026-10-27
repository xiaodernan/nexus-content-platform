import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  componentNode,
  createEmptyDocument,
  ellipseNode,
  imageNode,
  instanceNode,
  ops,
  rectNode,
  solid,
  textNode,
  type DesignDocument,
  type TextStyle,
} from '@nexus/design-model';
import { renderPreviewHtml } from './preview';

/**
 * M7 v410 — the PREVIEW renderer’s own rules, graded directly.
 *
 * The artifact page and the gallery card both render a published document through this function, and
 * every value it writes comes from JSON a client posted — a publication is stored verbatim (v294 read a
 * malformed style back out of the store to prove it). So the escaping is not decoration: a value that
 * could end an attribute or close the style block would turn a published drawing into markup. The
 * renderer’s own comment names the nine document-derived fields that could do it; this file holds the
 * line on all of them, plus the two shape rules the page depends on — an instance’s bodies are
 * PROJECTED (they exist only in the editor otherwise), and an unknown page is an empty stage rather than
 * a crash.
 */
const withNode = (doc: DesignDocument, node: Parameters<typeof ops.addSubtree>[2][number], parent = doc.activePageId) =>
  applyBatch(doc, {
    id: 'b',
    ops: [ops.addSubtree(parent, 0, [node])],
    provenance: { mode: 'user' },
    timestamp: 0,
    summary: 'test',
  });

const STYLE: TextStyle = {
  fontFamilyToken: 'font.family.body',
  sizeToken: 'font.size.xl',
  weight: 700,
  lineHeight: 1.2,
  letterSpacing: 0,
  align: 'left',
};

describe('renderPreviewHtml — the stage and the boxes (v410)', () => {
  it('the stage is the PAGE’s size, from the layout, not a default chip', () => {
    const doc = createEmptyDocument('Harbour');
    const html = renderPreviewHtml(doc, doc.activePageId);
    expect(html).toContain('width:1440px;height:900px');
  });

  it('a rect on the page becomes an absolutely positioned div at its layout rect', () => {
    let doc = createEmptyDocument('Harbour');
    doc = withNode(doc, rectNode('Box', { x: 10, y: 20, width: 100, height: 50, fills: [solid({ r: 1, g: 0, b: 0, a: 1 })] }));
    const html = renderPreviewHtml(doc, doc.activePageId);
    const div = html.match(/<div style="([^"]*)"><\/div>/)?.[1] ?? '';
    expect(div).toContain('position:absolute');
    expect(div).toContain('left:10px');
    expect(div).toContain('top:20px');
    expect(div).toContain('width:100px');
    expect(div).toContain('height:50px');
    expect(div).toContain('background:rgba(255, 0, 0, 1)');
  });

  it('an ellipse is a 50% border-radius and a turned node carries its rotation', () => {
    let doc = createEmptyDocument('Harbour');
    doc = withNode(doc, ellipseNode('Ball', { x: 0, y: 0, width: 40, height: 40, rotation: 30 }));
    const html = renderPreviewHtml(doc, doc.activePageId);
    const div = html.match(/<div style="([^"]*)"><\/div>/)?.[1] ?? '';
    expect(div).toContain('border-radius:50%');
    expect(div).toContain('transform:rotate(30deg)');
  });

  it('a text node carries the full text shorthand and its characters', () => {
    let doc = createEmptyDocument('Harbour');
    doc = withNode(doc, textNode('Headline', 'Harbour at dusk', STYLE, { x: 0, y: 0, width: 300, height: 60 }));
    const html = renderPreviewHtml(doc, doc.activePageId);
    const div = html.match(/<div style="[^"]*">Harbour at dusk<\/div>/)?.[0] ?? '';
    expect(div).toContain('color:');
    expect(div).toContain('font:700');
    expect(div).toContain('letter-spacing:0px');
    expect(div).toContain('text-align:left');
    expect(div).toContain('white-space:pre-wrap');
  });

  it('an image node is the honest placeholder, not a broken picture', () => {
    let doc = createEmptyDocument('Harbour');
    doc = withNode(doc, imageNode('Pic', 'asset-1', { x: 0, y: 0, width: 80, height: 80 }));
    const html = renderPreviewHtml(doc, doc.activePageId);
    expect(html).toContain('>image</div>');
  });

  it('an invisible node is not drawn at all', () => {
    let doc = createEmptyDocument('Harbour');
    doc = withNode(doc, rectNode('Ghost', { x: 0, y: 0, width: 10, height: 10, visible: false }));
    const html = renderPreviewHtml(doc, doc.activePageId);
    expect(html.match(/<div style="position:absolute/g) ?? []).toHaveLength(0);
  });

  it('an instance’s bodies are PROJECTED — the clone is drawn, not just the instance box', () => {
    // Before the projection line, the artifact drew ONE div where the canvas drew two: the master’s
    // children existed only in the editor. The instance box and its clone are both in the page now.
    let doc = createEmptyDocument('Harbour');
    const comp = componentNode('Card', { x: 0, y: 0, width: 120, height: 80, fills: [] });
    const leaf = rectNode('Face', { x: 0, y: 0, width: 120, height: 80, fills: [solid({ r: 0, g: 1, b: 0, a: 1 })] });
    doc = applyBatch(doc, {
      id: 'b1',
      ops: [ops.addSubtree(doc.rootId, 0, [comp]), ops.addSubtree(comp.id, 0, [leaf])],
      provenance: { mode: 'user' },
      timestamp: 0,
      summary: 'master',
    });
    doc = withNode(doc, instanceNode('Card', comp.id, { x: 40, y: 30, width: 120, height: 80 }));
    const html = renderPreviewHtml(doc, doc.activePageId);
    const boxes = html.match(/<div style="position:absolute/g) ?? [];
    expect(boxes).toHaveLength(2);
    expect(html).toContain('background:rgba(0, 255, 0, 1)');
  });

  it('an unknown page id is an empty stage, not a crash', () => {
    const doc = createEmptyDocument('Harbour');
    const html = renderPreviewHtml(doc, 'pg-does-not-exist');
    expect(html).toContain('width:0px;height:0px');
    expect(html.match(/<div style="position:absolute/g) ?? []).toHaveLength(0);
  });
});

describe('renderPreviewHtml — the escaping contract (v410)', () => {
  it('text characters are HTML-escaped — a publication cannot write markup through its words', () => {
    let doc = createEmptyDocument('Harbour');
    doc = withNode(doc, textNode('Evil', '<script>alert(1)</script>', STYLE, { x: 0, y: 0, width: 300, height: 60 }));
    const html = renderPreviewHtml(doc, doc.activePageId);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('a token value cannot end the style attribute — the composed attribute is escaped whole', () => {
    let doc = createEmptyDocument('Harbour');
    (doc.tokens.color as Record<string, unknown>).evil = { $type: 'color', $value: '#fff" onmouseover="alert(1)' };
    doc = withNode(doc, rectNode('Box', { x: 0, y: 0, width: 10, height: 10, fills: [{ kind: 'token', ref: 'color.evil' }] }));
    const html = renderPreviewHtml(doc, doc.activePageId);
    expect(html).toContain('onmouseover=&quot;alert(1)');
    expect(html).not.toContain('" onmouseover="alert(1)');
  });

  it('the :root block is CSS-escaped, not HTML-escaped — CSS does not decode entities', () => {
    const doc = createEmptyDocument('Harbour');
    (doc.tokens.color as Record<string, unknown>).evil = { $type: 'color', $value: 'a<b>c' };
    const html = renderPreviewHtml(doc, doc.activePageId);
    // `<` travels as its CSS escape, so the value survives as one character and the block stays closed.
    expect(html).toContain('a\\3c b\\3e c');
    expect(html).not.toContain('a&lt;b&gt;c');
  });

  it('a token NAME cannot close the style block either — the key is escaped like the value', () => {
    const doc = createEmptyDocument('Harbour');
    (doc.tokens as unknown as Record<string, unknown>)['x}</style><img src=y>'] = { $type: 'color', $value: '#fff' };
    const html = renderPreviewHtml(doc, doc.activePageId);
    expect(html).toContain('\\7d');
    expect(html).not.toContain('}</style><img');
  });

  it('the page’s own tokens reach the :root block as custom properties', () => {
    const doc = createEmptyDocument('Harbour');
    const html = renderPreviewHtml(doc, doc.activePageId);
    expect(html).toContain('--nexus-color-bg:#0b0e14');
    expect(html).toContain('--nexus-font-family-body:Inter, system-ui, sans-serif');
  });
});
