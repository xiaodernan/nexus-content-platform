/**
 * M2 v11 — visual QA as pure geometry (§63 first slice). Input is plain rect data (the
 * studio feeds it `layoutPage` output; tests feed literals), so the runtime keeps zero
 * dependencies on the Design Model and nothing here pretends to look at pixels (§60):
 * these are structural checks a canvas screenshot cannot beat but also never contradicts.
 * v24 adds the opt-in near-miss lints (`near-align`, `near-center`) — measurable "almost
 * coincident" geometry, explicitly NOT an aesthetic opinion. v26 extends the family with
 * `uneven-gaps`: a run of ≥3 rects whose consecutive gaps ALMOST match (spread > 0 and
 * ≤ the opt-in tolerance) lints warn — spacing variance is arithmetic, taste is not.
 */
/** CSS hex (`#rgb`/`#rrggbb`) or an rgb/rgba() string; anything unparsable yields no flag. */
export type QaColor = string;

export interface QaRect {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Optional solid colors; when both are present a computed WCAG 2.1 ratio is checked. */
  fill?: QaColor;
  bg?: QaColor;
}

export interface QaInput {
  page: QaRect;
  /** Top-level areas to check (id → absolute rect). */
  rects: Record<string, QaRect>;
  /** Overlap ratio (of the smaller area) that counts as a stack-up. Default 0.5. */
  overlapThreshold?: number;
  /** How far a rect may hang off the page before it is flagged. Default 8. */
  overflowTolerance?: number;
  /** Minimum contrast ratio to pass. Default 3 (WCAG 2.1 large-text floor). */
  minContrast?: number;
  /**
   * v24 near-miss lint: pairs whose edges ALMOST coincide (gap > 0 and ≤ this many px)
   * are flagged. Default 0 ⇒ rule OFF — tolerances are explicit host inputs, so layouts
   * that never opted in gain no new flags.
   */
  alignTolerance?: number;
  /**
   * v24: a rect ALMOST centered on an axis (|leftGap − rightGap| or |topGap − bottomGap|
   * > 0 and ≤ this many px) is flagged. Default 0 ⇒ rule OFF.
   */
  centerTolerance?: number;
  /**
   * v26: a sorted run of ≥3 on-page rects whose consecutive gaps along an axis all
   * positive and whose max−min spread is > 0 but ≤ this many px is flagged
   * `uneven-gaps`. Default 0 ⇒ rule OFF.
   */
  gapTolerance?: number;
}

export type QaSeverity = 'error' | 'warn';

export interface QaFlag {
  code: 'zero-size' | 'off-page' | 'overlap' | 'overflow' | 'low-contrast' | 'near-align' | 'near-center' | 'uneven-gaps';
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

/** WCAG 2.1 relative luminance of `#rgb`/`#rrggbb`/`rgb()`/`rgba()`; unparsable ⇒ null (no flag invented). */
export function relativeLuminance(color: QaColor): number | null {
  const s = color.trim();
  let r: number;
  let g: number;
  let b: number;
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (hex) {
    let h = hex[1]!;
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  } else {
    const fn = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(s);
    if (!fn) return null;
    r = Number(fn[1]);
    g = Number(fn[2]);
    b = Number(fn[3]);
  }
  if (![r, g, b].every((v) => Number.isFinite(v) && v >= 0 && v <= 255)) return null;
  const chan = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

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
  for (const id of ids) {
    const r = input.rects[id]!;
    if (!r.fill || !r.bg) continue;
    const ratio = contrastRatio(r.fill, r.bg);
    if (ratio !== null && ratio < (input.minContrast ?? 3)) {
      flags.push({ code: 'low-contrast', severity: 'warn', ids: [id], detail: `${id} text ${r.fill} on ${r.bg} has contrast ${ratio.toFixed(2)} (< ${String(input.minContrast ?? 3)})` });
    }
  }

  /* v24 — near-miss lints, arithmetic only (§60: "almost coincident" is measurable; taste is not).
   * Both are opt-in: tolerance 0/absent ⇒ the rule never fires, so existing hosts gain no flags.
   * Rects already zero-size or fully off-page are skipped — they carry stronger flags. */
  const usable = ids.filter((id) => {
    const r = input.rects[id]!;
    return r.width > 0 && r.height > 0 && intersect(r, page) > 0;
  });
  const alignTol = input.alignTolerance ?? 0;
  if (alignTol > 0) {
    for (let i = 0; i < usable.length; i++) {
      for (let j = i + 1; j < usable.length; j++) {
        const a = input.rects[usable[i]!]!;
        const b = input.rects[usable[j]!]!;
        const edges: Array<[string, number]> = [
          ['left', Math.abs(a.x - b.x)],
          ['right', Math.abs(a.x + a.width - (b.x + b.width))],
          ['top', Math.abs(a.y - b.y)],
          ['bottom', Math.abs(a.y + a.height - (b.y + b.height))],
        ];
        const near = edges.filter(([, gap]) => gap > 0 && gap <= alignTol);
        if (near.length > 0) {
          flags.push({
            code: 'near-align',
            severity: 'warn',
            ids: [usable[i]!, usable[j]!].sort(),
            detail: `${usable[i]!}/${usable[j]!} ${near.map(([n, g]) => `${n} ${g.toFixed(1)}px apart`).join(', ')} (≤ ${alignTol}px — nudge to align)`,
          });
        }
      }
    }
  }
  const centerTol = input.centerTolerance ?? 0;
  if (centerTol > 0) {
    for (const id of usable) {
      const r = input.rects[id]!;
      const hGap = Math.abs(r.x - page.x - (page.x + page.width - (r.x + r.width))); // |leftGap − rightGap|
      const vGap = Math.abs(r.y - page.y - (page.y + page.height - (r.y + r.height))); // |topGap − bottomGap|
      const axes: Array<[string, number]> = [];
      // "almost centered" only means something once a rect is centered-ish: both margins positive.
      if (hGap > 0 && hGap <= centerTol && r.x - page.x > 0 && page.x + page.width - (r.x + r.width) > 0) axes.push(['horizontally', hGap]);
      if (vGap > 0 && vGap <= centerTol && r.y - page.y > 0 && page.y + page.height - (r.y + r.height) > 0) axes.push(['vertically', vGap]);
      if (axes.length > 0) {
        flags.push({
          code: 'near-center',
          severity: 'warn',
          ids: [id],
          detail: `${id} is ${axes.map(([n, g]) => `${g.toFixed(1)}px off ${n} center`).join(', ')} (≤ ${centerTol}px — center it)`,
        });
      }
    }
  }

  const gapTol = input.gapTolerance ?? 0;
  if (gapTol > 0) {
    for (const axis of ['x', 'y'] as const) {
      const start = (r: QaRect): number => (axis === 'x' ? r.x : r.y);
      const end = (r: QaRect): number => (axis === 'x' ? r.x + r.width : r.y + r.height);
      const run = [...usable].sort((p, q) => start(input.rects[p]!) - start(input.rects[q]!) || p.localeCompare(q));
      if (run.length < 3) continue;
      const gaps: number[] = [];
      let spaced = true;
      for (let i = 0; i + 1 < run.length; i++) {
        const g = start(input.rects[run[i + 1]!]!) - end(input.rects[run[i]!]!);
        if (g <= 0) {
          spaced = false; // a true gap chain needs positive gaps — overlaps are the overlap rule's business
          break;
        }
        gaps.push(g);
      }
      if (!spaced) continue;
      const spread = Math.max(...gaps) - Math.min(...gaps);
      if (spread > 0 && spread <= gapTol) {
        flags.push({
          code: 'uneven-gaps',
          severity: 'warn',
          ids: run,
          detail: `${run.join('/')} along ${axis}: gaps ${gaps.map((g) => `${g.toFixed(1)}px`).join(', ')} — ${spread.toFixed(1)}px uneven (≤ ${gapTol}px — distribute evenly)`,
        });
      }
    }
  }

  const sorted = flags.sort((p, q) => order[p.severity] - order[q.severity] || p.code.localeCompare(q.code) || p.ids.join().localeCompare(q.ids.join()));
  return { verdict: sorted.length === 0 ? 'ok' : 'flagged', checked: ids.length, flags: sorted };
}
