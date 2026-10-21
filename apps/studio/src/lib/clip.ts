import { rotatePointAbout, type AbsRect, type DesignNode, type NexusId } from '@nexus/design-model';

/**
 * One clipping container's cut, in page space — the same box the container itself is painted inside,
 * widened to the axis-aligned bounds when the container is turned.
 *
 * `axis` is deliberately axis-aligned in ALL THREE renderers: the canvas clips with a rect path, the SVG
 * with a `<clipPath>` on a `<rect>`, and the artifact with `clip-path: inset()` — which can only speak in
 * sides. A turned frame could be clipped to its true quad in the first two, but then the artifact would
 * disagree, and "the three renderers of one Design Model answer alike" (ADR 0005) is the property this
 * lane keeps paying down. So a turned frame clips a little wider than it looks, and hit-testing stays
 * quad-accurate (`containsRotated`).
 */
export interface ClipBox {
  x: number;
  y: number;
  width: number;
  height: number;
  /** The container's own corner radius, so the cut follows a rounded frame instead of squaring it off. */
  radius: number;
}

/**
 * The container's authored box turned about its own centre, reduced to the axis-aligned bounds of the
 * four swept corners — the clip geometry all three renderers share. `layoutPage` emits the UNROTATED
 * rect (ADR 0005), so a turned container's clip has to be widened here rather than read off the layout.
 */
export function turnedBounds(r: AbsRect, rotationDeg: number): AbsRect {
  if (!rotationDeg) return { x: r.x, y: r.y, width: r.width, height: r.height };
  const c = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  const corners = [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height },
    { x: r.x, y: r.y + r.height },
  ].map((p) => rotatePointAbout(p, c, rotationDeg));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

/**
 * The cut a node applies to its OWN children, or null when it applies none. Only containers declare
 * `clipContent` (frame/component are born true, group/page false), and an empty container has nothing to
 * cut — treating it as no clip keeps a childless frame from emitting a clip path three renderers must agree on.
 */
export function clipBoxFor(node: DesignNode, layout: Record<NexusId, AbsRect>): ClipBox | null {
  if (!('clipContent' in node) || node.clipContent !== true) return null;
  if (node.childIds.length === 0) return null;
  const r = layout[node.id];
  if (!r || !Number.isFinite(r.x) || r.width <= 0 || r.height <= 0) return null;
  const b = turnedBounds(r, node.rotation);
  return { ...b, radius: 'cornerRadius' in node ? node.cornerRadius : 0 };
}

/**
 * The tighter of two cuts; a null bound is unbounded, so it never wins against a real one.
 *
 * `inset()` can only carry ONE corner radius, so a nested pair of rounded frames has no exact CSS answer.
 * The radius travels from the innermost container — the frame the child actually sits in — and comes back
 * out of the ancestor only when that ancestor's box lies wholly inside it, i.e. when the ancestor alone
 * binds. Maxing the two instead would round a square inner frame's cut by its ancestor's radius; the
 * canvas and the SVG nest their clips and get both corner shapes, so this is where the artifact alone
 * approximates.
 */
export function intersectClips(a: ClipBox | null, b: ClipBox | null): ClipBox | null {
  if (!a) return b;
  if (!b) return a;
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const width = Math.max(0, right - x);
  const height = Math.max(0, bottom - y);
  const ancestorArea = a.width * a.height;
  // `a` sits wholly inside `b` only when the intersection still IS `a`'s box and `b` is the larger frame;
  // every other shape of overlap — including a tie — hands the corner to `b`, the innermost container.
  const ancestorBinds = width * height <= ancestorArea + 1e-9 && ancestorArea < b.width * b.height;
  return { x, y, width, height, radius: ancestorBinds ? a.radius : b.radius };
}

/**
 * The CSS that cuts a node's own box down to `clip`, as `inset()` distances read from that box's edges.
 * Returns null when there is nothing to cut — a node wholly inside every clipping ancestor gets no
 * `clip-path` at all, which is what keeps this invisible to the 99% of pages that never spill.
 */
export function clipStyleFor(rect: AbsRect, clip: ClipBox | null): string | null {
  if (!clip) return null;
  const top = Math.max(0, clip.y - rect.y);
  const left = Math.max(0, clip.x - rect.x);
  const right = Math.max(0, rect.x + rect.width - (clip.x + clip.width));
  const bottom = Math.max(0, rect.y + rect.height - (clip.y + clip.height));
  if (!(top || left || right || bottom)) return null;
  const round = clip.radius > 0 ? ` round ${clip.radius}px` : '';
  return `inset(${top}px ${right}px ${bottom}px ${left}px${round})`;
}
