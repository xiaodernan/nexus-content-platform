import type { AbsRect, Point } from '@nexus/design-model';
import { containsRotated } from '@nexus/design-model';

const DEG = Math.PI / 180;

/** Screen-space gap (px) from a node's top edge to its rotate grip; divided by zoom for world units. */
export const ROTATE_HANDLE_GAP = 24;

export function rectCenter(r: AbsRect): Point {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

/** Normalise any angle to [0, 360). */
export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Round to the nearest `step` degrees (default 15°, the Shift key), then normalise. */
export function snapAngleDeg(deg: number, step = 15): number {
  return normalizeDeg(Math.round(deg / step) * step);
}

/**
 * World-space position of the rotate grip: `gap` units outward from the top-centre edge, carried
 * around with the node's own rotation (same clockwise/y-down convention the canvas `ctx.rotate`
 * uses, so the grip sits exactly where it is painted).
 */
export function rotateHandlePoint(r: AbsRect, rotationDeg: number, gap: number): Point {
  const c = rectCenter(r);
  const rad = rotationDeg * DEG;
  const reach = r.height / 2 + gap;
  return { x: c.x + Math.sin(rad) * reach, y: c.y - Math.cos(rad) * reach };
}

/**
 * Absolute rotation (deg) implied by dragging a grabbed point around the node centre, starting from
 * `startRotationDeg`. The angular delta tracks the pointer so the grabbed corner follows the cursor.
 */
export function rotationFromDrag(center: Point, start: Point, current: Point, startRotationDeg: number): number {
  const a0 = Math.atan2(start.y - center.y, start.x - center.x);
  const a1 = Math.atan2(current.y - center.y, current.x - center.x);
  return normalizeDeg(startRotationDeg + (a1 - a0) / DEG);
}

/** Point-in-rotated-rect — the canonical hit predicate now lives in the model (ADR 0005 amended). */
export function hitRotated(r: AbsRect, rotationDeg: number, p: Point): boolean {
  return containsRotated(r, rotationDeg, p);
}

/** The four resize corners of an (unrotated) rect as [x, y, corner-name] triples. */
export function handlePoints(r: AbsRect): [number, number, string][] {
  const { x, y, width: w, height: h } = r;
  return [
    [x, y, 'nw'],
    [x + w, y, 'ne'],
    [x, y + h, 'sw'],
    [x + w, y + h, 'se'],
  ];
}

/**
 * Which resize corner is grabbed, matching the *painted* (rotation-aware) chrome:
 * the pointer is inverse-rotated about the node centre before the corner test.
 */
export function handleHitTest(
  r: AbsRect,
  rotationDeg: number,
  p: Point,
  tol: number,
): (readonly [number, number, string]) | null {
  const c = rectCenter(r);
  const rad = -rotationDeg * DEG;
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  const lp: Point = {
    x: c.x + dx * Math.cos(rad) - dy * Math.sin(rad),
    y: c.y + dx * Math.sin(rad) + dy * Math.cos(rad),
  };
  for (const [hx, hy, corner] of handlePoints(r)) {
    if (Math.abs(lp.x - hx) <= tol && Math.abs(lp.y - hy) <= tol) return [hx, hy, corner];
  }
  return null;
}
