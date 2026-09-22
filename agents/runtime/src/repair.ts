import { runVisualQa, type QaInput, type QaRect, type QaReport } from './visualQa.js';

/**
 * M2 v12 (§63 auto-fix, structural edition): deterministic repair proposals derived from
 * the visual-QA report. Pure rect math — the same input always produces byte-identical
 * repairs, and what they FIX is stated per repair. No aesthetic claims (§60): repairs
 * only undo geometry the QA flagged. v25 adds opt-in alignment nudges for the v24
 * near-miss lints — deterministic mover choice, stated px, still never automatic.
 */
export interface Repair {
  targetId: string;
  action: 'move-inside' | 'nudge-below' | 'resize-min' | 'align-nudge' | 'center-nudge';
  from: QaRect;
  to: QaRect;
  reason: string;
}

export interface RepairResult {
  repairs: Repair[];
  /** QA re-run over the repaired rects — the loop closes here: remaining flags ≤ input flags. */
  remaining: QaReport;
  passes: number;
}

export interface RepairOptions {
  /**
   * v25: opt-in alignment nudges for the v24 near-miss lints. OFF by default — a 1px slip
   * is measurable, but whether to move WHICH layer is the human's call unless the host
   * explicitly asks for nudge proposals (they still pass the §28 approval gate).
   */
  alignRepairs?: boolean;
}

const MIN_SIDE = 8;
const GUTTER = 16;
const MAX_PASSES = 3;

const clone = (r: QaRect): QaRect => ({ x: r.x, y: r.y, width: r.width, height: r.height });
const areaOf = (r: QaRect): number => Math.max(0, r.width) * Math.max(0, r.height);

function clampInside(r: QaRect, page: QaRect): QaRect {
  const maxX = page.x + Math.max(0, page.width - r.width);
  const maxY = page.y + Math.max(0, page.height - r.height);
  return { ...r, x: Math.min(Math.max(r.x, page.x), maxX), y: Math.min(Math.max(r.y, page.y), maxY) };
}

export function proposeRepairs(input: QaInput, opts: RepairOptions = {}): RepairResult {
  const rects: Record<string, QaRect> = Object.fromEntries(Object.entries(input.rects).map(([k, v]) => [k, clone(v)]));
  const repairs: Repair[] = [];
  let report = runVisualQa(input);
  let passes = 0;

  while (report.flags.length > 0 && passes < MAX_PASSES) {
    passes++;
    const before = report.flags.length;
    for (const flag of report.flags) {
      if (flag.code === 'zero-size') {
        const id = flag.ids[0]!;
        const cur = rects[id]!;
        const to = { ...cur, width: Math.max(cur.width, MIN_SIDE), height: Math.max(cur.height, MIN_SIDE) };
        repairs.push({ targetId: id, action: 'resize-min', from: clone(cur), to, reason: `zero-size: grown to at least ${MIN_SIDE}px on each side` });
        rects[id] = to;
      } else if (flag.code === 'overlap') {
        const [a, b] = flag.ids as [string, string];
        const cur = rects[b]!;
        const anchor = rects[a]!;
        const to = clampInside({ ...cur, x: cur.x, y: anchor.y + anchor.height + GUTTER }, input.page);
        repairs.push({ targetId: b, action: 'nudge-below', from: clone(cur), to, reason: `overlap with ${a}: moved below it (+${GUTTER}px gutter)` });
        rects[b] = to;
      } else if (flag.code === 'near-align' && opts.alignRepairs) {
        const [ida, idb] = flag.ids as [string, string];
        const aA = areaOf(rects[ida]!);
        const aB = areaOf(rects[idb]!);
        // Deterministic mover choice: smaller area moves; on equal area the later id moves.
        const [moverId, anchorId] = aA === aB ? (ida < idb ? [idb, ida] : [ida, idb]) : aA < aB ? [ida, idb] : [idb, ida];
        const m = rects[moverId]!;
        const an = rects[anchorId]!;
        const tol = input.alignTolerance ?? 0;
        const edges: Array<['left' | 'right' | 'top' | 'bottom', number]> = [
          ['left', m.x - an.x],
          ['right', m.x + m.width - (an.x + an.width)],
          ['top', m.y - an.y],
          ['bottom', m.y + m.height - (an.y + an.height)],
        ];
        const hit = edges.find(([, gap]) => gap !== 0 && Math.abs(gap) <= tol);
        if (hit) {
          const [edge, gap] = hit;
          const moved =
            edge === 'left' ? { ...m, x: an.x } :
            edge === 'right' ? { ...m, x: an.x + an.width - m.width } :
            edge === 'top' ? { ...m, y: an.y } :
            { ...m, y: an.y + an.height - m.height };
          const to = clampInside(moved, input.page);
          repairs.push({ targetId: moverId, action: 'align-nudge', from: clone(m), to, reason: `near-align with ${anchorId}: ${Math.abs(gap).toFixed(1)}px ${edge} slip snapped to exact` });
          rects[moverId] = to;
        }
      } else if (flag.code === 'near-center' && opts.alignRepairs) {
        const id = flag.ids[0]!;
        const m = rects[id]!;
        const page = input.page;
        const ctol = input.centerTolerance ?? 0;
        const hGap = m.x - page.x - (page.x + page.width - (m.x + m.width)); // signed left−right
        const vGap = m.y - page.y - (page.y + page.height - (m.y + m.height));
        const axes: string[] = [];
        let to = clone(m);
        if (hGap !== 0 && Math.abs(hGap) <= ctol && m.x - page.x > 0 && page.x + page.width - (m.x + m.width) > 0) {
          to = { ...to, x: page.x + (page.width - m.width) / 2 };
          axes.push(`horizontally (${Math.abs(hGap).toFixed(1)}px)`);
        }
        if (vGap !== 0 && Math.abs(vGap) <= ctol && m.y - page.y > 0 && page.y + page.height - (m.y + m.height) > 0) {
          to = { ...to, y: page.y + (page.height - m.height) / 2 };
          axes.push(`vertically (${Math.abs(vGap).toFixed(1)}px)`);
        }
        if (axes.length > 0) {
          to = clampInside(to, page);
          repairs.push({ targetId: id, action: 'center-nudge', from: clone(m), to, reason: `near-center: centered ${axes.join(' and ')}` });
          rects[id] = to;
        }
      } else if (flag.code === 'off-page' || flag.code === 'overflow') {
        for (const id of flag.ids) {
          const cur = rects[id]!;
          const to = clampInside(cur, input.page);
          if (to.x !== cur.x || to.y !== cur.y) {
            repairs.push({ targetId: id, action: 'move-inside', from: clone(cur), to, reason: `${flag.code}: pulled back inside the page` });
            rects[id] = to;
          }
        }
      }
    }
    report = runVisualQa({ ...input, rects });
    if (report.flags.length >= before) break; // no progress → stop honestly with what remains
  }

  return { repairs: dedupe(repairs), remaining: report, passes };
}

/** Keep only the final state per target: one repair per node, from = original rect. */
function dedupe(repairs: Repair[]): Repair[] {
  const first = new Map<string, Repair>();
  for (const r of repairs) {
    const kept = first.get(r.targetId);
    if (kept) kept.to = r.to;
    else first.set(r.targetId, { ...r, from: clone(r.from) });
  }
  return [...first.values()].sort((a, b) => a.targetId.localeCompare(b.targetId));
}
