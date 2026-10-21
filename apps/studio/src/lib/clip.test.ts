import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  createEmptyDocument,
  frameNode,
  groupNode,
  layoutPage,
  ops,
  rectNode,
  type DesignDocument,
  type DesignNode,
  type Paint,
} from '@nexus/design-model';
import { clipBoxFor, clipStyleFor, intersectClips, turnedBounds, type ClipBox } from './clip';
import { drawScene } from './render';
import { docToSvg } from './thumbnail';
import { renderPreviewHtml } from './preview';

interface Call {
  fn: string;
  args: unknown[];
}

/** Minimal recording CanvasRenderingContext2D stand-in — the canvas is witnessed through its call stream. */
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
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

/**
 * The box a `clip` call was built from, read back off the stream: walk back to the `beginPath` that opened
 * its path and take the bounds of the points it laid down. Reading the geometry out of the calls the canvas
 * actually made — rather than trusting that a clip happened somewhere — is what makes these cases bite.
 */
function clipBoundsOf(calls: Call[], clip: Call): ClipBox {
  const at = calls.indexOf(clip);
  expect(at, 'the clip call is on the stream').toBeGreaterThan(0);
  const xs: number[] = [];
  const ys: number[] = [];
  let radius = 0;
  for (let i = at - 1; i > 0 && calls[i]!.fn !== 'beginPath'; i--) {
    const c = calls[i]!;
    const num = (k: number) => Number(c.args[k]);
    if (c.fn === 'moveTo') {
      xs.push(num(0));
      ys.push(num(1));
    } else if (c.fn === 'arcTo') {
      xs.push(num(0), num(2));
      ys.push(num(1), num(3));
      radius = num(4);
    } else if (c.fn === 'rect') {
      xs.push(num(0), num(0) + num(2));
      ys.push(num(1), num(1) + num(3));
    }
  }
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y, radius };
}

const red: Paint = { kind: 'solid', color: { r: 0.9, g: 0.2, b: 0.2, a: 1 } };

function build(name: string, nodes: DesignNode[]): DesignDocument {
  const doc0 = createEmptyDocument(name);
  return applyBatch(doc0, { id: 'b1', ops: [ops.addSubtree(doc0.activePageId, 0, nodes)], provenance: { mode: 'user' }, timestamp: 0 });
}

/** A frame (frames are born `clipContent: true`) whose only child is authored 150px past its right edge. */
function spillDoc() {
  const frame = frameNode('Card', undefined, { id: 'fr', x: 100, y: 100, width: 200, height: 120 });
  const child = rectNode('Spill', { id: 'ch', x: 250, y: 50, width: 180, height: 90, fills: [red] });
  frame.childIds = [child.id];
  child.parentId = frame.id;
  const doc = build('Spill', [frame, child]);
  return { doc, frame: doc.nodes['fr']!, child: doc.nodes['ch']! };
}

/** A turned, rounded frame around a smaller rounded frame around a turned leaf that overflows the inner one. */
function nestedDoc() {
  const outer = frameNode('Outer', undefined, { id: 'ou', x: 80, y: 80, width: 300, height: 200, rotation: 30, cornerRadius: 12 });
  const inner = frameNode('Inner', undefined, { id: 'in', x: 20, y: 20, width: 120, height: 60, cornerRadius: 6 });
  const leaf = rectNode('Leaf', { id: 'lf', x: 40, y: 10, width: 200, height: 40, rotation: 15, fills: [red] });
  outer.childIds = [inner.id];
  inner.parentId = outer.id;
  inner.childIds = [leaf.id];
  leaf.parentId = inner.id;
  const doc = build('Nested', [outer, inner, leaf]);
  return { doc, outer: doc.nodes['ou']!, inner: doc.nodes['in']!, leaf: doc.nodes['lf']! };
}

function canvasOf(doc: DesignDocument) {
  const pageId = doc.activePageId;
  const { ctx, calls } = fakeCtx();
  drawScene(ctx, {
    doc,
    pageId,
    layout: layoutPage(doc, pageId),
    viewport: { x: 0, y: 0, zoom: 1 },
    selection: [] as string[],
    showChrome: false,
  } as never, 900, 700, 1);
  return { pageId, calls, clips: calls.filter((c) => c.fn === 'clip') };
}

describe('turnedBounds: the box a turned container clips to', () => {
  const r = { x: 10, y: 10, width: 80, height: 60 };

  it('leaves an unturned box exactly as authored, as a copy', () => {
    const b = turnedBounds(r, 0);
    expect(b).toEqual(r);
    expect(b).not.toBe(r);
  });

  it('swaps the sides and keeps the centre across a quarter turn', () => {
    for (const deg of [90, 270]) {
      const b = turnedBounds(r, deg);
      expect(b.width, `turned ${deg}: width becomes the height`).toBeCloseTo(r.height, 9);
      expect(b.height, `turned ${deg}: height becomes the width`).toBeCloseTo(r.width, 9);
      expect(b.x + b.width / 2, 'the turn is about the centre').toBeCloseTo(r.x + r.width / 2, 9);
      expect(b.y + b.height / 2).toBeCloseTo(r.y + r.height / 2, 9);
    }
  });

  it('sweeps a 30° frame of 300×200 at (80,80) out to the measured bounds', () => {
    const b = turnedBounds({ x: 80, y: 80, width: 300, height: 200 }, 30);
    expect(b.x).toBeCloseTo(50.09618943233421, 9);
    expect(b.y).toBeCloseTo(18.397459621556138, 9);
    expect(b.width).toBeCloseTo(359.8076211353316, 9);
    expect(b.height).toBeCloseTo(323.20508075688775, 9);
  });
});

describe('clipBoxFor: who is allowed to cut', () => {
  it('a frame with children cuts, and carries its own corner radius', () => {
    const { doc, frame } = spillDoc();
    expect(clipBoxFor(frame, layoutPage(doc, doc.activePageId))).toEqual({ x: 100, y: 100, width: 200, height: 120, radius: 0 });
  });

  it('a childless frame cuts nothing', () => {
    const empty = frameNode('Empty', undefined, { id: 'fr', x: 10, y: 10, width: 50, height: 50 });
    const doc = build('Empty', [empty]);
    expect(clipBoxFor(empty, layoutPage(doc, doc.activePageId))).toBeNull();
  });

  it('a group cuts nothing, however much it holds', () => {
    const g = groupNode('G', { id: 'gr', x: 0, y: 0, width: 40, height: 40 });
    const kid = rectNode('Kid', { id: 'ch', x: 100, y: 100, width: 10, height: 10 });
    g.childIds = [kid.id];
    kid.parentId = g.id;
    const doc = build('Group', [g, kid]);
    expect(clipBoxFor(doc.nodes['gr']!, layoutPage(doc, doc.activePageId))).toBeNull();
  });

  it('the page cuts nothing — clipping is a container\'s declaration, not the canvas\'s', () => {
    const { doc } = spillDoc();
    expect(clipBoxFor(doc.nodes[doc.activePageId]!, layoutPage(doc, doc.activePageId))).toBeNull();
  });

  it('a turned container cuts to its turned bounds, not its authored rect', () => {
    const { doc, outer } = nestedDoc();
    const box = clipBoxFor(outer, layoutPage(doc, doc.activePageId))!;
    expect(box.width).toBeGreaterThan(300);
    expect(box.radius, 'the frame keeps its own corner radius whatever its turn').toBe(12);
  });

  it('a container with no layout rect cuts nothing', () => {
    const { frame } = spillDoc();
    expect(clipBoxFor(frame, {})).toBeNull();
  });
});

describe('intersectClips: the cut a nested container hands down', () => {
  const box = (x: number, y: number, width: number, height: number, radius = 0): ClipBox => ({ x, y, width, height, radius });

  it('a missing bound is unbounded, so the other one always wins', () => {
    const b = box(1, 2, 3, 4);
    expect(intersectClips(null, b)).toBe(b);
    expect(intersectClips(b, null)).toBe(b);
    expect(intersectClips(null, null)).toBeNull();
  });

  it('keeps the tighter rect', () => {
    expect(intersectClips(box(0, 0, 100, 100), box(20, 30, 40, 50))).toEqual({ x: 20, y: 30, width: 40, height: 50, radius: 0 });
  });

  it('the innermost frame keeps its corner shape, and the ancestor only when it sits wholly inside', () => {
    expect(intersectClips(box(50, 50, 300, 200, 12), box(60, 60, 120, 60, 6))!.radius, 'inner ⊆ outer: the inner frame binds').toBe(6);
    expect(intersectClips(box(0, 0, 10, 10, 8), box(0, 0, 100, 100, 2))!.radius, 'outer ⊆ inner: only the outer corner survives').toBe(8);
    expect(intersectClips(box(0, 0, 50, 50, 4), box(0, 0, 50, 50, 9))!.radius, 'the same box twice: innermost wins').toBe(9);
  });

  it('a disjoint pair leaves a box with nothing in it', () => {
    const i = intersectClips(box(0, 0, 10, 10), box(100, 100, 10, 10))!;
    expect(i.width, 'no width survives').toBe(0);
    expect(i.height).toBe(0);
  });
});

describe('clipStyleFor: the same cut in the artifact\'s one vocabulary', () => {
  it('a node inside every clipping ancestor gets no clip-path at all', () => {
    expect(clipStyleFor({ x: 10, y: 10, width: 20, height: 20 }, null)).toBeNull();
    expect(clipStyleFor({ x: 10, y: 10, width: 20, height: 20 }, { x: 0, y: 0, width: 100, height: 100, radius: 0 })).toBeNull();
  });

  it('reads the spill as inset distances from the child\'s own edges', () => {
    expect(clipStyleFor({ x: 50, y: 50, width: 100, height: 100 }, { x: 100, y: 100, width: 100, height: 100, radius: 0 })).toBe('inset(50px 0px 0px 50px)');
  });

  it('a child that sits wholly past the frame is cut by an inset wider than its own box', () => {
    expect(clipStyleFor({ x: 350, y: 150, width: 180, height: 90 }, { x: 100, y: 100, width: 200, height: 120, radius: 0 })).toBe('inset(0px 230px 20px 0px)');
  });

  it('a rounded frame rounds the cut', () => {
    expect(clipStyleFor({ x: 140, y: 110, width: 200, height: 40 }, { x: 100, y: 100, width: 120, height: 60, radius: 6 })).toBe('inset(0px 120px 0px 0px round 6px)');
  });
});

describe('one clip, three renderers', () => {
  it('a child spilling out of its frame is cut by the canvas, the SVG thumb and the artifact alike', () => {
    const { doc, frame, child } = spillDoc();
    const layout = layoutPage(doc, doc.activePageId);
    const authored = clipBoxFor(frame, layout)!;

    const { calls, clips } = canvasOf(doc);
    expect(clips, 'the page clip and the frame clip — no more, no less').toHaveLength(2);
    expect(clipBoundsOf(calls, clips[1]!), 'the canvas clips to the container clipBoxFor names').toEqual(authored);

    const svg = docToSvg(doc, doc.activePageId);
    expect(svg).toContain(`<clipPath id="clip1" clipPathUnits="userSpaceOnUse"><rect x="${authored.x}" y="${authored.y}" width="${authored.width}" height="${authored.height}" rx="${authored.radius}"/></clipPath>`);
    expect(svg).toContain(`<g clip-path="url(#clip1)"><rect x="${layout[child.id]!.x}"`);

    const html = renderPreviewHtml(doc, doc.activePageId);
    expect(html).toContain('clip-path:inset(0px 230px 20px 0px)');
  });

  it('a child that stays inside its frame is cut by nothing that changes its look', () => {
    const frame = frameNode('Card', undefined, { id: 'fr', x: 100, y: 100, width: 200, height: 120 });
    const child = rectNode('Neat', { id: 'ch', x: 10, y: 10, width: 50, height: 50, fills: [red] });
    frame.childIds = [child.id];
    child.parentId = frame.id;
    const doc = build('Neat', [frame, child]);

    // Measured: the canvas and the SVG ask for the cut anyway, because `clipContent` is a DECLARATION the
    // container makes about its children, not a spill the renderer detected. Only the artifact — which has
    // to state a cut as distances on each child — stays silent, because `clipStyleFor` finds nothing to cut.
    const { clips } = canvasOf(doc);
    expect(clips, 'the page clip and the frame\'s declared clip').toHaveLength(2);
    const svg = docToSvg(doc, doc.activePageId);
    expect(svg.match(/<clipPath /g), 'one declared cut, wrapped').toHaveLength(1);
    expect(svg.match(/<g clip-path=/g)).toHaveLength(1);
    expect(renderPreviewHtml(doc, doc.activePageId), 'no inset: the child is inside every ancestor box').not.toContain('clip-path');
  });

  it('a nested pair nests in the canvas and the SVG, and folds to the innermost radius in the artifact', () => {
    const { doc, outer, inner } = nestedDoc();
    const layout = layoutPage(doc, doc.activePageId);
    const outerBox = clipBoxFor(outer, layout)!;
    const innerBox = clipBoxFor(inner, layout)!;

    const { calls, clips } = canvasOf(doc);
    expect(clips, 'page, then outer, then inner').toHaveLength(3);
    expect(clipBoundsOf(calls, clips[1]!).width, 'the turned frame clips wider than it looks').toBeCloseTo(outerBox.width, 6);
    expect(clipBoundsOf(calls, clips[2]!)).toEqual(innerBox);
    expect(calls.filter((c) => c.fn === 'save').length, 'every clip is taken back down').toBe(calls.filter((c) => c.fn === 'restore').length);

    const svg = docToSvg(doc, doc.activePageId);
    // The walk paints children before it wraps them, so the INNER cut is defined first and referenced outermost.
    expect(svg).toContain(`<clipPath id="clip1" clipPathUnits="userSpaceOnUse"><rect x="${innerBox.x}" y="${innerBox.y}" width="${innerBox.width}" height="${innerBox.height}" rx="${innerBox.radius}"/></clipPath>`);
    expect(svg).toContain('<g clip-path="url(#clip2)"><rect');
    expect(svg.match(/<g clip-path=/g), 'one wrapper per clipping container').toHaveLength(2);

    const html = renderPreviewHtml(doc, doc.activePageId);
    expect(html.match(/clip-path:/g), 'the leaf alone spills; the inner frame sits inside the turned outer').toHaveLength(1);
    expect(html).toContain('clip-path:inset(0px 120px 0px 0px round 6px)');
  });

  it('the artifact cuts the same box the model declares, so a turned child\'s inset turns with it', () => {
    const { doc, leaf } = nestedDoc();
    const layout = layoutPage(doc, doc.activePageId);
    const html = renderPreviewHtml(doc, doc.activePageId);
    const leafRect = layout[leaf.id]!;
    const cut = clipStyleFor(leafRect, clipBoxFor(doc.nodes['in']!, layout))!;
    expect(html, 'the inset the artifact emits is the one clipStyleFor derives from the unrotated rect').toContain('transform:rotate(15deg)');
    expect(html).toContain(cut);
  });

  it('the same document drawn twice answers with the same bytes', () => {
    const { doc } = nestedDoc();
    const page = doc.activePageId;
    expect(docToSvg(doc, page), 'clip ids are per-call, so a thumb of the same page never drifts').toBe(docToSvg(doc, page));
    expect(renderPreviewHtml(doc, page)).toBe(renderPreviewHtml(doc, page));
  });
});
