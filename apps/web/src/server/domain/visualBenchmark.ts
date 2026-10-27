import { decodePngPixels } from './visualDna';

/**
 * §86 视觉基准的**本地确定性**实现：参考图 × 生成图 → 一组结构化指标。
 *
 * 纪律与 `visualDna` 同一条：只做能自证的计算，每个分数都能回指到一张网格或一个直方图，
 * 测不出的维度（字号、字重、组件语义）如实列在 `notMeasured` 里，不编数（§159）。
 * §86 明确说"不要只使用 pixel-perfect comparison"——像素差在这里只是一个**原始读数**，
 * 不是总分；结构性的判断由布局 / 间距 / 对齐 / 颜色四组指标各自承担。
 *
 * 所有指标在 32×32 的归一网格上算：两张图各按自己的尺寸独立映射到同一张网格，
 * 不把一张重采样成另一张的尺寸（重采样本身会制造差异）。±1 格 ≈ 边长的 3.1%，
 * 这是这套指标自带的分辨率上限，写在 `meaning` 里让人一起读。
 */

export const GRID = 32;
/** 与"背景"的距离超过这个值（0..441.67 欧氏）算内容墨水 */
const INK_DISTANCE = 60;
/** 对齐比较时一条边允许错开多少格（±2 格 ≈ 6.25% 边长） */
const EDGE_TOLERANCE = 2;

export interface PaletteEntry {
  color: string;
  share: number;
}

export interface VisualBenchmarkResult {
  reference: { width: number; height: number };
  candidate: { width: number; height: number };
  /** 宽高比差超过 5%：两张图形状不同，下面的指标只在这个前提下才可读 */
  shapeMismatch: boolean;
  metrics: {
    layout: {
      score: number;
      refInkCells: number;
      candInkCells: number;
      meaning: string;
    };
    spacing: {
      vertical: number;
      horizontal: number;
      meaning: string;
    };
    alignment: {
      score: number;
      refEdges: number;
      candEdges: number;
      matched: number;
      meaning: string;
    };
    color: {
      score: number;
      luminanceDelta: number;
      warmthDelta: number;
      refPalette: PaletteEntry[];
      candPalette: PaletteEntry[];
      meaning: string;
    };
    pixel: {
      meanAbsLuminanceDiff: number;
      meaning: string;
    };
  };
  notMeasured: { area: string; reason: string }[];
}

export type VisualBenchmarkComparison =
  | { ok: true; result: VisualBenchmarkResult }
  | { ok: false; reason: string };

interface Plane {
  width: number;
  height: number;
  /** 每格平均亮度 0..1 */
  lum: Float32Array;
  /** 每格墨水占比 0..1（半透明像素不计） */
  ink: Float32Array;
  /** 行/列的墨水总占比：间距节奏的投影 */
  rowInk: Float32Array;
  colInk: Float32Array;
  palette: PaletteEntry[];
  meanLuminance: number;
  warmth: number;
  samples: number;
}

function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function hex(r: number, g: number, b: number): string {
  const part = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

function colorDistance(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

/** 全图出现最多的 5bit/通道 颜色桶的均色当"背景"；大面积照片上这个判定会失真，由调用方披露 */
function backgroundColor(width: number, height: number, rgba: Uint8Array): { r: number; g: number; b: number } {
  const step = Math.max(1, Math.round(Math.sqrt((width * height) / 60_000)));
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const at = (y * width + x) * 4;
      if (rgba[at + 3]! < 128) continue;
      const r = rgba[at]!;
      const g = rgba[at + 1]!;
      const b = rgba[at + 2]!;
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.count += 1;
        bucket.r += r;
        bucket.g += g;
        bucket.b += b;
      } else {
        buckets.set(key, { count: 1, r, g, b });
      }
    }
  }
  let best: { count: number; r: number; g: number; b: number } | undefined;
  for (const bucket of buckets.values()) {
    if (!best || bucket.count > best.count) best = bucket;
  }
  // 全透明的图到不了这里（调用方先查 samples）
  return { r: best!.r / best!.count, g: best!.g / best!.count, b: best!.b / best!.count };
}

/** 主色：5bit 桶计数 + 贪心合并近色（<30 视为同一色），与 visualDna 的量法同一口径 */
function paletteOf(width: number, height: number, rgba: Uint8Array, samples: number): PaletteEntry[] {
  const step = Math.max(1, Math.round(Math.sqrt((width * height) / 60_000)));
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const at = (y * width + x) * 4;
      if (rgba[at + 3]! < 128) continue;
      const r = rgba[at]!;
      const g = rgba[at + 1]!;
      const b = rgba[at + 2]!;
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.count += 1;
        bucket.r += r;
        bucket.g += g;
        bucket.b += b;
      } else {
        buckets.set(key, { count: 1, r, g, b });
      }
    }
  }
  const ranked = [...buckets.values()]
    .map((bucket) => ({ color: hex(bucket.r / bucket.count, bucket.g / bucket.count, bucket.b / bucket.count), count: bucket.count }))
    .sort((a, b) => b.count - a.count);
  const dist = (a: string, b: string) => {
    const d = (i: number) => parseInt(a.slice(1 + i * 2, 3 + i * 2), 16) - parseInt(b.slice(1 + i * 2, 3 + i * 2), 16);
    return Math.sqrt(d(0) ** 2 + d(1) ** 2 + d(2) ** 2);
  };
  const picked: PaletteEntry[] = [];
  for (const entry of ranked) {
    if (picked.length >= 6) break;
    if (picked.some((p) => dist(p.color, entry.color) < 30)) continue;
    picked.push({ color: entry.color, share: samples ? entry.count / samples : 0 });
  }
  return picked;
}

function planeOf(width: number, height: number, rgba: Uint8Array): Plane | string {
  const step = Math.max(1, Math.round(Math.sqrt((width * height) / 60_000)));
  let samples = 0;
  let sumL = 0;
  let sumWarm = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const at = (y * width + x) * 4;
      if (rgba[at + 3]! < 128) continue;
      samples += 1;
      const l = luminance(rgba[at]!, rgba[at + 1]!, rgba[at + 2]!);
      sumL += l;
      sumWarm += (rgba[at]! - rgba[at + 2]!) / 255;
    }
  }
  if (!samples) return '整张图都是透明的，没有可统计的像素';
  const bg = backgroundColor(width, height, rgba);

  const lum = new Float32Array(GRID * GRID);
  const ink = new Float32Array(GRID * GRID);
  const rowInk = new Float32Array(GRID);
  const colInk = new Float32Array(GRID);
  const cellW = width / GRID;
  const cellH = height / GRID;
  for (let gy = 0; gy < GRID; gy += 1) {
    for (let gx = 0; gx < GRID; gx += 1) {
      const x0 = Math.floor(gx * cellW);
      const x1 = Math.max(x0 + 1, Math.floor((gx + 1) * cellW));
      const y0 = Math.floor(gy * cellH);
      const y1 = Math.max(y0 + 1, Math.floor((gy + 1) * cellH));
      // 每格最多采 256 个点：格再大读数也稳定，格小（图小）就逐点
      const stepX = Math.max(1, Math.floor((x1 - x0) / 16));
      const stepY = Math.max(1, Math.floor((y1 - y0) / 16));
      let seen = 0;
      let sumCellL = 0;
      let inked = 0;
      for (let y = y0; y < y1; y += stepY) {
        for (let x = x0; x < x1; x += stepX) {
          const at = (y * width + x) * 4;
          if (rgba[at + 3]! < 128) continue;
          seen += 1;
          const r = rgba[at]!;
          const g = rgba[at + 1]!;
          const b = rgba[at + 2]!;
          sumCellL += luminance(r, g, b);
          if (colorDistance({ r, g, b }, bg) > INK_DISTANCE) inked += 1;
        }
      }
      if (seen) {
        lum[gy * GRID + gx] = sumCellL / seen;
        ink[gy * GRID + gx] = inked / seen;
        rowInk[gy] = (rowInk[gy] ?? 0) + inked / seen;
        colInk[gx] = (colInk[gx] ?? 0) + inked / seen;
      }
    }
  }
  return {
    width,
    height,
    lum,
    ink,
    rowInk,
    colInk,
    palette: paletteOf(width, height, rgba, samples),
    meanLuminance: sumL / samples,
    warmth: sumWarm / samples,
    samples,
  };
}

/** 软 Jaccard：Σmin / Σmax。两张全空图（都没有内容）按"布局相同"给 1 */
function softIoU(a: Float32Array, b: Float32Array): number {
  let min = 0;
  let max = 0;
  for (let i = 0; i < a.length; i += 1) {
    min += Math.min(a[i]!, b[i]!);
    max += Math.max(a[i]!, b[i]!);
  }
  if (max === 0) return 1;
  return min / max;
}

function meanAbsDiff(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i]! - b[i]!);
  return sum / a.length;
}

/** 投影里"空 ⇄ 有内容"的穿越位置（格序号）：对齐比较用的就是这些条带边 */
function bandEdges(profile: Float32Array): number[] {
  const edges: number[] = [];
  let empty = profile[0]! <= 0.02;
  for (let i = 1; i < profile.length; i += 1) {
    const nowEmpty = profile[i]! <= 0.02;
    if (nowEmpty !== empty) edges.push(i);
    empty = nowEmpty;
  }
  return edges;
}

function matchEdges(refEdges: number[], candEdges: number[]): number {
  let matched = 0;
  for (const edge of refEdges) {
    if (candEdges.some((c) => Math.abs(c - edge) <= EDGE_TOLERANCE)) matched += 1;
  }
  return matched;
}

/**
 * 纯比较：字节进、指标出，不碰库也不碰存储。
 * 拒绝都带原因——解不开的图就是解不开，不返回一份空指标冒充成功（§159）。
 */
export function compareVisuals(referenceBytes: Uint8Array, candidateBytes: Uint8Array): VisualBenchmarkComparison {
  const ref = decodePngPixels(referenceBytes);
  if (typeof ref === 'string') return { ok: false, reason: `参考图解不开：${ref}` };
  const cand = decodePngPixels(candidateBytes);
  if (typeof cand === 'string') return { ok: false, reason: `生成图解不开：${cand}` };
  const a = planeOf(ref.width, ref.height, ref.rgba);
  if (typeof a === 'string') return { ok: false, reason: `参考图：${a}` };
  const b = planeOf(cand.width, cand.height, cand.rgba);
  if (typeof b === 'string') return { ok: false, reason: `生成图：${b}` };

  const refRatio = ref.width / ref.height;
  const candRatio = cand.width / cand.height;
  const shapeMismatch = Math.abs(refRatio - candRatio) / refRatio > 0.05;

  const refInkCells = [...a.ink].filter((v) => v > 0.35).length;
  const candInkCells = [...b.ink].filter((v) => v > 0.35).length;
  const layoutScore = softIoU(a.ink, b.ink);
  const verticalScore = 1 - meanAbsDiff(a.rowInk, b.rowInk);
  const horizontalScore = 1 - meanAbsDiff(a.colInk, b.colInk);
  const refRowEdges = bandEdges(a.rowInk);
  const candRowEdges = bandEdges(b.rowInk);
  const refColEdges = bandEdges(a.colInk);
  const candColEdges = bandEdges(b.colInk);
  const refEdges = refRowEdges.length + refColEdges.length;
  const candEdges = candRowEdges.length + candColEdges.length;
  const matched = matchEdges(refRowEdges, candRowEdges) + matchEdges(refColEdges, candColEdges);
  const alignmentScore = refEdges === 0 ? (candEdges === 0 ? 1 : 0) : matched / refEdges;

  // 颜色：参考图的每种主色按占比在候选主色里找最近色，距离越远扣得越多
  let colorScore = 0;
  for (const entry of a.palette) {
    const d = (p: PaletteEntry) => {
      const pa = parseInt(p.color.slice(1, 3), 16);
      const pb = parseInt(p.color.slice(3, 5), 16);
      const pc = parseInt(p.color.slice(5, 7), 16);
      const qa = parseInt(entry.color.slice(1, 3), 16);
      const qb = parseInt(entry.color.slice(3, 5), 16);
      const qc = parseInt(entry.color.slice(5, 7), 16);
      return Math.sqrt((pa - qa) ** 2 + (pb - qb) ** 2 + (pc - qc) ** 2);
    };
    const nearest = b.palette.length ? Math.min(...b.palette.map(d)) : 441.67;
    colorScore += entry.share * (1 - Math.min(1, nearest / 441.67));
  }

  return {
    ok: true,
    result: {
      reference: { width: ref.width, height: ref.height },
      candidate: { width: cand.width, height: cand.height },
      shapeMismatch,
      metrics: {
        layout: {
          score: layoutScore,
          refInkCells,
          candInkCells,
          meaning: `两张图各按自己的尺寸映射到 ${GRID}×${GRID} 网格后的内容占比软 IoU（Σmin/Σmax）；±1 格 ≈ 边长 3.1% 的分辨率上限`,
        },
        spacing: {
          vertical: verticalScore,
          horizontal: horizontalScore,
          meaning: '行/列墨水投影的 1-平均差：留白节奏是不是同一套，不是在量间距的绝对值',
        },
        alignment: {
          score: alignmentScore,
          refEdges: refEdges,
          candEdges: candEdges,
          matched,
          meaning: `参考图的内容条带边有多少条在候选图 ±${EDGE_TOLERANCE} 格内找到对应；两边都没有条带时是 1`,
        },
        color: {
          score: colorScore,
          luminanceDelta: b.meanLuminance - a.meanLuminance,
          warmthDelta: b.warmth - a.warmth,
          refPalette: a.palette,
          candPalette: b.palette,
          meaning: '参考图每种主色按占比在候选主色里找最近色的加权得分（0..1）；差值是候选减参考',
        },
        pixel: {
          meanAbsLuminanceDiff: meanAbsDiff(a.lum, b.lum),
          meaning: '网格上逐格平均亮度的平均绝对差（0..1）：一个原始读数，不是总分——§86 明确不要只看它',
        },
      },
      notMeasured: [
        {
          area: 'typography',
          reason: '字号、字重、字体从位图测不出来（要视觉 provider 或矢量信息），这里不给数',
        },
        {
          area: 'componentCorrectness',
          reason: '"这块是不是那个组件"需要语义判断，本地像素统计答不了；这一格等 provider',
        },
      ],
    },
  };
}
