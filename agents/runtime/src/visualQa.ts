/**
 * M2 v11 — visual QA as pure geometry (§63 first slice). Input is plain rect data (the
 * studio feeds it `layoutPage` output; tests feed literals), so the runtime keeps zero
 * dependencies on the Design Model and nothing here pretends to look at pixels (§60):
 * these are structural checks a canvas screenshot cannot beat but also never contradicts.
 */
export interface QaRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface QaInput {
  page: QaRect;
  /** Top-level areas to check (id → absolute rect). */
  rects: Record<string, QaRect>;
  /** Overlap ratio (of the smaller area) that counts as a stack-up. Default 0.5. */
  overlapThreshold?: number;
  /** How far a rect may hang off the page before it is flagged. Default 8. */
  overflowTolerance?: number;
}

export type QaSeverity = 'error' | 'warn';

export interface QaFlag {
  code: 'zero-size' | 'off-page' | 'overlap' | 'overflow';
  severity: QaSeverity;
  ids: string[];
  detail: string;
}

export interface QaReport {
  verdict: 'ok' | 'flagged';
  checked: number;
  flags: QaFlag[];
}

const area = (r: QaRect): number => Math.max(0, r.width) * Math.max(0, r.height);

function intersect(a: QaRect, b: QaRect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export function runVisualQa(input: QaInput): QaReport {
  const { page } = input;
  const tol = input.overflowTolerance ?? 8;
  const overlapMin = input.overlapThreshold ?? 0.5;
  const ids = Object.keys(input.rects).sort();
  const flags: QaFlag[] = [];

  for (const id of ids) {
    const r = input.rects[id]!;
    if (r.width <= 0 || r.height <= 0) {
      flags.push({ code: 'zero-size', severity: 'warn', ids: [id], detail: `${id} has size ${r.width}×${r.height}` });
      continue;
    }
    const hits = intersect(r, page);
    if (hits === 0) {
      flags.push({ code: 'off-page', severity: 'error', ids: [id], detail: `${id} at (${r.x},${r.y}) shares no pixel area with the page` });
      continue;
    }
    const slack = area(r) - hits;
    if (slack > tol * Math.max(r.width, r.height)) {
      flags.push({ code: 'overflow', severity: 'warn', ids: [id], detail: `${id} hangs ${(slack / Math.max(r.width, r.height)).toFixed(0)}px past the page edge` });
    }
  }

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = input.rects[ids[i]!]!;
      const b = input.rects[ids[j]!]!;
      if (a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) continue;
      const hits = intersect(a, b);
      const ratio = hits / Math.min(area(a), area(b));
      if (ratio >= overlapMin) {
        flags.push({ code: 'overlap', severity: 'error', ids: [ids[i]!, ids[j]!].sort(), detail: `${ids[i]!} covers ${(ratio * 100).toFixed(0)}% of the smaller of ${ids[j]!}` });
      }
    }
  }

  const order: Record<QaSeverity, number> = { error: 0, warn: 1 };
  const sorted = flags.sort((p, q) => order[p.severity] - order[q.severity] || p.code.localeCompare(q.code) || p.ids.join().localeCompare(q.ids.join()));
  return { verdict: sorted.length === 0 ? 'ok' : 'flagged', checked: ids.length, flags: sorted };
}
