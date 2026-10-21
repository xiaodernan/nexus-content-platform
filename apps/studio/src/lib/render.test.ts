import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  createEmptyDocument,
  layoutPage,
  ops,
  rectNode,
  textNode,
  type DesignDocument,
  type NexusId,
  type TextStyle,
} from '@nexus/design-model';
import { drawScene } from './render';
import { rotateHandlePoint } from './rotate';
import { resolveTextStyle } from './paint';
import { renderPreviewHtml } from './preview';
import { docToSvg } from './thumbnail';

interface Call {
  fn: string;
  args: unknown[];
}

const DEG = Math.PI / 180;

/** Minimal recording CanvasRenderingContext2D stand-in (no pixels, just the draw call stream). */
function fakeCtx() {
  const calls: Call[] = [];
  const push = (fn: string) => (...args: unknown[]) => {
    calls.push({ fn, args });
    return fn === 'measureText' ? { width: 8 } : undefined;
  };
  const methods = [
    'setTransform', 'fillRect', 'strokeRect', 'save', 'restore', 'translate', 'rotate', 'scale',
    'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'rect', 'clip',
    'fill', 'stroke', 'fillText', 'measureText',
  ];
  const ctx: Record<string, unknown> = {};
  for (const m of methods) ctx[m] = push(m);
  // A text style travels on the context as STATE (`font`, `textAlign`, `letterSpacing`), not as a call, so a
  // recorder that only sees method calls cannot tell whether the renderer honoured it. v294 needs that view.
  for (const prop of ['fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'font', 'textAlign', 'textBaseline', 'letterSpacing']) {
    let value: unknown;
    Object.defineProperty(ctx, prop, {
      enumerable: true,
      get: () => value,
      set: (v: unknown) => {
        value = v;
        calls.push({ fn: `set:${prop}`, args: [v] });
      },
    });
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

function oneRectDoc(rotation?: number): { doc: DesignDocument; id: NexusId } {
  const doc0 = createEmptyDocument('Rot');
  const page = doc0.activePageId;
  const box = rectNode('Box', { x: 10, y: 10, width: 80, height: 60 });
  const withBox = applyBatch(doc0, { id: 'b1', ops: [ops.addSubtree(page, 0, [box])], provenance: { mode: 'user' }, timestamp: 0 });
  const id = Object.values(withBox.nodes).find((n) => n.type === 'rectangle')!.id;
  const doc = rotation
    ? applyBatch(withBox, { id: 'b2', ops: [ops.updateNode(id, { rotation })], provenance: { mode: 'user' }, timestamp: 0 })
    : withBox;
  return { doc, id };
}

function sceneFor(doc: DesignDocument, id: NexusId, extra: Record<string, unknown> = {}) {
  return {
    doc,
    pageId: doc.activePageId,
    layout: layoutPage(doc, doc.activePageId),
    viewport: { x: 0, y: 0, zoom: 1 },
    selection: [] as string[],
    showChrome: true,
    ...extra,
  };
}

describe('render: rotation-aware drawScene', () => {
  it('rotates a node about its own centre using its authored rotation', () => {
    const { doc } = oneRectDoc(90);
    const { ctx, calls } = fakeCtx();
    drawScene(ctx, sceneFor(doc, doc.activePageId) as never, 800, 600, 1);
    const rotates = calls.filter((c) => c.fn === 'rotate');
    expect(rotates).toHaveLength(1);
    expect(rotates[0]!.args[0]).toBeCloseTo(90 * DEG, 10);
    // translate to centre then back: box (10,10,80,60) → centre (50,40)
    const translates = calls.filter((c) => c.fn === 'translate' && c.args[0] === 50 && c.args[1] === 40);
    expect(translates.length).toBeGreaterThanOrEqual(1);
  });

  it('does not rotate nodes authored at 0 degrees', () => {
    const { doc } = oneRectDoc();
    const { ctx, calls } = fakeCtx();
    drawScene(ctx, sceneFor(doc, doc.activePageId) as never, 800, 600, 1);
    expect(calls.filter((c) => c.fn === 'rotate')).toHaveLength(0);
  });

  it('live preview rotation overrides the authored rotation while dragging', () => {
    const { doc, id } = oneRectDoc(0);
    const { ctx, calls } = fakeCtx();
    drawScene(ctx, sceneFor(doc, id, { rotations: { [id]: 45 } }) as never, 800, 600, 1);
    const rotates = calls.filter((c) => c.fn === 'rotate');
    expect(rotates).toHaveLength(1);
    expect(rotates[0]!.args[0]).toBeCloseTo(45 * DEG, 10);
  });

  it('single selection paints the rotate grip at the rotated handle point', () => {
    const { doc, id } = oneRectDoc(90);
    const { ctx, calls } = fakeCtx();
    drawScene(ctx, sceneFor(doc, id, { selection: [id] }) as never, 800, 600, 1);
    const r = { x: 10, y: 10, width: 80, height: 60 };
    const grip = rotateHandlePoint(r, 90, 24); // rot 90°: grip swings to the right of centre
    const arcs = calls.filter((c) => c.fn === 'arc');
    expect(arcs).toHaveLength(1);
    expect(arcs[0]!.args[0]).toBeCloseTo(grip.x, 6);
    expect(arcs[0]!.args[1]).toBeCloseTo(grip.y, 6);
  });

  it('rotated selection chrome renders without throwing', () => {
    const { doc, id } = oneRectDoc(37);
    const { ctx } = fakeCtx();
    expect(() => drawScene(ctx, sceneFor(doc, id, { selection: [id], hoverId: id }) as never, 800, 600, 1)).not.toThrow();
  });
});

const TEXT_STYLE: TextStyle = {
  fontFamilyToken: 'font.family.body',
  sizeToken: 'font.size.2xl',
  weight: 700,
  lineHeight: 1.1,
  letterSpacing: 1.5,
  align: 'center',
};

function textDoc(style: TextStyle = TEXT_STYLE): DesignDocument {
  const doc0 = createEmptyDocument('Text style');
  const t = textNode('T', 'Selected work', style, { x: 100, y: 100, width: 300, height: 96, fills: [{ kind: 'token', ref: 'color.text' }] });
  return applyBatch(doc0, { id: 'b1', ops: [ops.addSubtree(doc0.activePageId, 0, [t])], provenance: { mode: 'user' }, timestamp: 0 });
}

/**
 * M7 v294 — a `TextStyle` declares six members (family, size, weight, line-height, tracking, alignment).
 * The artifact honoured all six from the start; the canvas honoured five and never set `letterSpacing`; the
 * thumbnail honoured NONE and drew letters at a size it invented from the box's height. Measured on the
 * shipped bytes before this grant: `font.size.2xl` (40px) painted at 57.6px in the thumb, tracking nowhere.
 */
describe('render: the declared text style reaches every renderer', () => {
  it('sets the tracking on the context when the model declares it', () => {
    const doc = textDoc();
    const st = resolveTextStyle(doc, TEXT_STYLE);
    const { ctx, calls } = fakeCtx();
    drawScene(ctx, sceneFor(doc, doc.activePageId) as never, 800, 600, 1);
    const tracked = calls.filter((c) => c.fn === 'set:letterSpacing');
    expect(tracked).toHaveLength(1);
    expect(tracked[0]!.args[0]).toBe(`${st.letterSpacing}px`);
    expect(st.letterSpacing).toBe(1.5);
  });

  it('leaves the context alone when the model declares no tracking', () => {
    const doc = textDoc({ ...TEXT_STYLE, letterSpacing: 0 });
    const { ctx, calls } = fakeCtx();
    drawScene(ctx, sceneFor(doc, doc.activePageId) as never, 800, 600, 1);
    expect(calls.filter((c) => c.fn === 'set:letterSpacing')).toHaveLength(0);
  });

  it('draws one declared style with one set of numbers in all three renderers', () => {
    const doc = textDoc();
    // Derived from the resolver the renderers share — plus the absolute pin underneath it, so a resolver that
    // drifts reddens this case instead of moving all three assertions together.
    const st = resolveTextStyle(doc, TEXT_STYLE);
    expect(st.sizePx).toBe(40);

    const { ctx, calls } = fakeCtx();
    drawScene(ctx, sceneFor(doc, doc.activePageId) as never, 800, 600, 1);
    expect(calls.find((c) => c.fn === 'set:font')!.args[0]).toBe(st.font);
    expect(calls.find((c) => c.fn === 'set:textAlign')!.args[0]).toBe('center');
    expect(calls.filter((c) => c.fn === 'set:letterSpacing').map((c) => c.args[0])).toEqual([`${st.letterSpacing}px`]);

    const html = renderPreviewHtml(doc, doc.activePageId);
    expect(html).toContain(`font:${st.weight} ${st.sizePx}px/${st.lineHeight} ${st.family}`);
    expect(html).toContain('letter-spacing:1.5px');
    expect(html).toContain('text-align:center');

    const svg = docToSvg(doc, doc.activePageId);
    expect(svg).toContain(`font-size="${st.sizePx}"`);
    expect(svg).toContain(`font-family="${st.family}"`);
    expect(svg).toContain('letter-spacing="1.5"');
    expect(svg).toContain('text-anchor="middle"');
  });

  it('coerces a style a client posted at the shared seam, so no renderer has to remember to defend itself', () => {
    // `/p/{projectId}` answers with JSON a client put there. `weight`, `lineHeight`, `letterSpacing` and
    // `align` reach the three renderers as WRITTEN values: the canvas concatenates them into `ctx.font`, the
    // artifact writes them into a `style` attribute and the thumbnail into SVG attributes inside an `<img>`
    // on every gallery card. One quote-shaped string would take three shapes of damage; the resolver refuses
    // the shape once instead of trusting three call sites to remember.
    const bad = {
      fontFamilyToken: 42,
      sizeToken: { nope: true },
      weight: 'bold" onload="alert(1)',
      lineHeight: 'roomy',
      letterSpacing: 'wide',
      align: 'middle',
    } as unknown as TextStyle;
    const doc = textDoc(bad);
    expect(resolveTextStyle(doc, bad)).toMatchObject({ sizePx: 16, weight: 400, lineHeight: 1.2, letterSpacing: 0, align: 'left' });

    const { ctx, calls } = fakeCtx();
    drawScene(ctx, sceneFor(doc, doc.activePageId) as never, 800, 600, 1);
    expect(calls.find((c) => c.fn === 'set:font')!.args[0]).toBe('400 16px Inter, sans-serif');
    expect(calls.find((c) => c.fn === 'set:textAlign')!.args[0]).toBe('left');
    expect(calls.filter((c) => c.fn === 'set:letterSpacing')).toHaveLength(0);

    const html = renderPreviewHtml(doc, doc.activePageId);
    expect(html).toContain('font:400 16px/1.2 Inter, sans-serif');
    // The artifact emits tracking even when it is zero, so this is the coerced number reaching it —
    // `'wide'` would have read `letter-spacing:widepx`.
    expect(html).toContain('letter-spacing:0px');
    expect(html).not.toContain('alert');

    const svg = docToSvg(doc, doc.activePageId);
    expect(svg).toContain('font-weight="400"');
    expect(svg).not.toContain('alert');
    expect(svg).not.toContain('text-anchor');
  });
});
