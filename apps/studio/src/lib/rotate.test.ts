import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  createEmptyDocument,
  frameNode,
  layoutPage,
  ops,
  rectNode,
  type OpBatch,
} from '@nexus/design-model';
import { ROTATE_HANDLE_GAP, handleHitTest, handlePoints, hitRotated, normalizeDeg, rectCenter, rotateHandlePoint, rotationFromDrag, snapAngleDeg, subtreeRotatePlan } from './rotate';

const R = { x: 0, y: 0, width: 200, height: 100 }; // centre (100,50)

describe('rotate: centre + normalise + snap', () => {
  it('rectCenter is the AABB centre', () => {
    expect(rectCenter(R)).toEqual({ x: 100, y: 50 });
  });

  it('normalizeDeg wraps any angle into [0,360)', () => {
    expect(normalizeDeg(-90)).toBe(270);
    expect(normalizeDeg(360)).toBe(0);
    expect(normalizeDeg(450)).toBe(90);
  });

  it('snapAngleDeg rounds to the nearest 15°', () => {
    expect(snapAngleDeg(14)).toBe(15);
    expect(snapAngleDeg(7)).toBe(0);
    expect(snapAngleDeg(83)).toBe(90);
    expect(snapAngleDeg(358)).toBe(0); // wraps
  });
});

describe('rotate: handle point + drag angle', () => {
  it('unrotated grip sits above top-centre by the gap', () => {
    const p = rotateHandlePoint(R, 0, 24);
    expect(p.x).toBeCloseTo(100, 6);
    expect(p.y).toBeCloseTo(-24, 6); // cy 50 - (h/2 50 + gap 24)
  });

  it('a 90° rotation carries the grip to the +x side', () => {
    const p = rotateHandlePoint(R, 90, 24);
    expect(p.x).toBeCloseTo(174, 6); // 100 + (50+24)
    expect(p.y).toBeCloseTo(50, 6);
  });

  it('a quarter-turn drag adds 90° to the start rotation', () => {
    const c = rectCenter(R);
    const start = { x: 100, y: -74 }; // straight up
    const current = { x: 174, y: 50 }; // to the right
    const deg = rotationFromDrag(c, start, current, 0);
    expect(deg).toBeCloseTo(90, 4);
  });
});

describe('rotate: point-in-rotated-rect', () => {
  it('at 0° matches the AABB', () => {
    expect(hitRotated(R, 0, { x: 150, y: 60 })).toBe(true);
    expect(hitRotated(R, 0, { x: 260, y: 60 })).toBe(false);
  });

  it('a long-axis point misses once the rect is rotated 90°', () => {
    // (180, 50) is inside the 200-wide AABB but, after 90°, the long axis is vertical so it falls out.
    expect(hitRotated(R, 0, { x: 180, y: 50 })).toBe(true);
    expect(hitRotated(R, 90, { x: 180, y: 50 })).toBe(false);
    // ...while a point near the top edge (inside after the turn) now hits.
    expect(hitRotated(R, 90, { x: 100, y: 120 })).toBe(true);
  });
});

describe('rotate: rotation-aware resize-handle hits', () => {
  it('at 0° it matches the plain corner test', () => {
    expect(handleHitTest(R, 0, { x: 2, y: 2 }, 5)?.[2]).toBe('nw');
    expect(handleHitTest(R, 0, { x: 100, y: 50 }, 5)).toBeNull();
  });

  it('after a 90° turn the grip of the painted nw corner still grabs', () => {
    // rotPoint(centre,(0,0),90°) paints nw at (150,-50); the inverse rotation must map it back.
    const hit = handleHitTest(R, 90, { x: 150, y: -50 }, 2);
    expect(hit?.[2]).toBe('nw');
    expect(hit?.[0]).toBeCloseTo(0, 6);
    expect(hit?.[1]).toBeCloseTo(0, 6);
    // the *old* AABB corner location is empty space now — no accidental resize
    expect(handleHitTest(R, 90, { x: 0, y: 0 }, 2)).toBeNull();
  });

  it('handlePoints returns the four local corners in nw/ne/sw/se order', () => {
    expect(handlePoints(R).map(([, , c]) => c)).toEqual(['nw', 'ne', 'sw', 'se']);
  });
});

const batch = (opsList: OpBatch['ops']): OpBatch => ({
  id: 'b',
  ops: opsList,
  provenance: { mode: 'user' },
  timestamp: 0,
  summary: 'test',
});

describe('subtreeRotatePlan (rigid rotation)', () => {
  function fixture() {
    let doc = createEmptyDocument();
    const frame = frameNode('Box', undefined, { x: 100, y: 100, width: 200, height: 200 });
    const a = rectNode('a', { x: 10, y: 10, width: 40, height: 40 });
    const lock = rectNode('lock', { x: 120, y: 120, width: 40, height: 40 });
    lock.locked = true;
    const hid = rectNode('hid', { x: 60, y: 60, width: 20, height: 20 });
    hid.visible = false;
    const row = frameNode('Row', {
      mode: 'horizontal',
      gap: 5,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      primaryAxis: 'start',
      counterAxis: 'start',
    }, { x: 40, y: 140, width: 120, height: 40 });
    const kid = rectNode('kid', { x: 0, y: 0, width: 20, height: 20 });
    kid.parentId = row.id;
    row.childIds = [kid.id];
    a.parentId = lock.parentId = hid.parentId = row.parentId = frame.id;
    frame.childIds = [a.id, lock.id, hid.id, row.id];
    doc = applyBatch(doc, batch([ops.addSubtree(doc.activePageId, 0, [frame, a, lock, hid, row, kid])]));
    return { doc, frame, a, lock, hid, row, kid };
  }

  it('turns every descendant centre about the root centre and composes rotation', () => {
    const { doc, frame, a } = fixture();
    const layout = layoutPage(doc, doc.activePageId);
    const plan = subtreeRotatePlan(doc, layout, frame.id, 90);
    // a: abs centre (130,130) about pivot (200,200) → (270,130) → top-left (250,110)
    const pa = plan[a.id]!;
    expect(pa.x).toBeCloseTo(250);
    expect(pa.y).toBeCloseTo(110);
    expect(pa.width).toBe(40);
    expect(pa.rotation).toBeCloseTo(90);
    expect(plan[frame.id]).toBeUndefined(); // the root is not part of its own plan
  });

  it('skips locked and hidden nodes, and stops at flow-placed children', () => {
    const { doc, frame, lock, hid, row, kid } = fixture();
    const layout = layoutPage(doc, doc.activePageId);
    const plan = subtreeRotatePlan(doc, layout, frame.id, 90);
    expect(plan[lock.id]).toBeUndefined();
    expect(plan[hid.id]).toBeUndefined();
    expect(plan[row.id]).toBeTruthy(); // the flow container itself is absolutely placed → rigid
    expect(plan[kid.id]).toBeUndefined(); // its children are flow-placed → x/y would be ignored
  });

  it('is empty at 0° (identity short-circuit)', () => {
    const { doc, frame } = fixture();
    const layout = layoutPage(doc, doc.activePageId);
    expect(subtreeRotatePlan(doc, layout, frame.id, 0)).toEqual({});
  });

  it('is empty for an unknown root or a root with no layout entry', () => {
    const { doc, frame } = fixture();
    const layout = layoutPage(doc, doc.activePageId);
    expect(subtreeRotatePlan(doc, layout, 'ghost-root', 90)).toEqual({});
    expect(subtreeRotatePlan(doc, {}, frame.id, 90)).toEqual({});
  });
});

describe('rotate — angle and hit edges', () => {
  it('snapAngleDeg honours a custom step', () => {
    expect(snapAngleDeg(30, 45)).toBe(45);
    expect(snapAngleDeg(20, 45)).toBe(0);
    expect(snapAngleDeg(210, 45)).toBe(225);
  });

  it('rotationFromDrag composes the start rotation and wraps the other way', () => {
    const c = { x: 100, y: 50 };
    const up = { x: 100, y: -24 };
    const right = { x: 174, y: 50 };
    const left = { x: 26, y: 50 };
    expect(rotationFromDrag(c, up, right, 90)).toBeCloseTo(180, 4);
    expect(rotationFromDrag(c, up, left, 0)).toBeCloseTo(270, 4);
  });

  it('handleHitTest misses just outside the tolerance, hits just inside', () => {
    expect(handleHitTest(R, 0, { x: 2, y: 2 }, 1)).toBeNull();
    expect(handleHitTest(R, 0, { x: 2, y: 2 }, 5)?.[2]).toBe('nw');
  });
});

describe('rotate: the handle gap constant, graded directly (v473)', () => {
  it('the constant is the pinned screen-space gap, and the historical literal was this constant all along', () => {
    expect(ROTATE_HANDLE_GAP).toBe(24);
    expect(Number.isInteger(ROTATE_HANDLE_GAP)).toBe(true);
    expect(ROTATE_HANDLE_GAP).toBeGreaterThan(0);
    // the cases above painted the grip with a literal 24 — the same number, now named
    expect(rotateHandlePoint(R, 0, ROTATE_HANDLE_GAP)).toEqual(rotateHandlePoint(R, 0, 24));
    expect(rotateHandlePoint(R, 90, ROTATE_HANDLE_GAP)).toEqual(rotateHandlePoint(R, 90, 24));
  });

  it('at rest the grip sits exactly the constant above the top edge, on the centre line', () => {
    const grip = rotateHandlePoint(R, 0, ROTATE_HANDLE_GAP);
    const topMid = { x: rectCenter(R).x, y: R.y };
    expect(grip.x).toBeCloseTo(topMid.x, 10);
    expect(grip.y).toBeCloseTo(R.y - ROTATE_HANDLE_GAP, 10);
    expect(Math.hypot(grip.x - topMid.x, grip.y - topMid.y)).toBeCloseTo(ROTATE_HANDLE_GAP, 10);
  });

  it('the gap rides every rotation — the stem is exactly the constant long at any angle', () => {
    const c = rectCenter(R);
    for (let deg = 0; deg < 360; deg += 1) {
      const rad = deg * (Math.PI / 180);
      const topMid = { x: c.x + Math.sin(rad) * (R.height / 2), y: c.y - Math.cos(rad) * (R.height / 2) };
      const grip = rotateHandlePoint(R, deg, ROTATE_HANDLE_GAP);
      expect(Math.hypot(grip.x - topMid.x, grip.y - topMid.y)).toBeCloseTo(ROTATE_HANDLE_GAP, 9);
    }
  });

  it('the constant is screen-space: divided by zoom, the painted stem is the constant at every zoom', () => {
    for (const z of [0.25, 0.5, 1, 2, 4]) {
      const grip = rotateHandlePoint(R, 0, ROTATE_HANDLE_GAP / z);
      const topMid = { x: rectCenter(R).x, y: R.y };
      expect(Math.hypot(grip.x - topMid.x, grip.y - topMid.y) * z).toBeCloseTo(ROTATE_HANDLE_GAP, 9);
    }
  });

  it('the gap does not scale with the node — every height keeps the same constant stem', () => {
    for (const height of [4, 40, 100, 1000]) {
      const r = { x: 0, y: 0, width: 200, height };
      const grip = rotateHandlePoint(r, 0, ROTATE_HANDLE_GAP);
      expect(Math.hypot(grip.x - (r.x + r.width / 2), grip.y - r.y)).toBeCloseTo(ROTATE_HANDLE_GAP, 9);
    }
  });
});