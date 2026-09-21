import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  createEmptyDocument,
  layoutPage,
  ops,
  rectNode,
  type DesignDocument,
  type NexusId,
} from '@nexus/design-model';
import { drawScene } from './render';
import { rotateHandlePoint } from './rotate';

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
