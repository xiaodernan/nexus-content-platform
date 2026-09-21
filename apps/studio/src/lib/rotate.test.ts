import { describe, expect, it } from 'vitest';
import { handleHitTest, handlePoints, hitRotated, normalizeDeg, rectCenter, rotateHandlePoint, rotationFromDrag, snapAngleDeg } from './rotate';

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
