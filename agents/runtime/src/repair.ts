import { runVisualQa, type QaInput, type QaRect, type QaReport } from './visualQa.js';

/**
 * M2 v12 (§63 auto-fix, structural edition): deterministic repair proposals derived from
 * the visual-QA report. Pure rect math — the same input always produces byte-identical
 * repairs, and what they FIX is stated per repair. No aesthetic claims (§60): repairs
 * only undo geometry the QA flagged.
 */
export interface Repair {
  targetId: string;
  action: 'move-inside' | 'nudge-below' | 'resize-min';
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

const MIN_SIDE = 8;
const GUTTER = 16;
const MAX_PASSES = 3;

const clone = (r: QaRect): QaRect => ({ x: r.x, y: r.y, width: r.width, height: r.height });

function clampInside(r: QaRect, page: QaRect): QaRect {
  const maxX = page.x + Math.max(0, page.width - r.width);
  const maxY = page.y + Math.max(0, page.height - r.height);
  return { ...r, x: Math.min(Math.max(r.x, page.x), maxX), y: Math.min(Math.max(r.y, page.y), maxY) };
}

export function proposeRepairs(input: QaInput): RepairResult {
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
      } else {
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
