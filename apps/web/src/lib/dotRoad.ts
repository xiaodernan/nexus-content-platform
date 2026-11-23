/**
 * ──DOT-ROAD（2026-11-22）· E220《照着点走一遍》的纯逻辑层。
 *
 * 回响里孩子把七页点铺在地上，用粉笔连成一条线，沿点走了十九步，
 * 停在最后一个点之后的空白前。这一页把这十九步做成可以真的走一遍的路：
 * 六个站各挂一句 E220 的锚句，第十九步面朝空白。
 *
 * 纯函数，无 React、无 DOM、无时钟——行为门直接测这一层；
 * 锚句不在这里手写：组件从 `generated.ts` 的 E220 原文里逐字解析。
 */

/** 路一共十九步（E220 原文：数到第十九步时他停下来）。 */
export const DOT_ROAD_STEPS = 19;

/** 六个站落在第几步（1 起算）；站与站之间留出空白，不是每步都有话。 */
export const DOT_ROAD_STATIONS = [2, 5, 8, 11, 14, 17] as const;

/** 第十九步之后的空白：不是第七站，是路自己到头。 */
export const DOT_ROAD_BLANK_STEP = 19;

/** 路尽头的两句话——与 E220 文末逐字一致（行为门会回读原文核对，防止两处漂移）。 */
export const DOT_ROAD_CLOSING = {
  zh: '线不是答案——是有人把一个位置走成了可以去的地方。',
  en: 'The line is not an answer — it is a place someone walked until it could be gone to.',
} as const;

/** 把任意读数夹进 1..19；NaN / 小数 / 越界都收进来，不留半格。 */
export function clampStep(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(DOT_ROAD_STEPS, Math.max(1, Math.trunc(value)));
}

/** 第 step 步是第几站（0..5）；不是站回 null。 */
export function stationIndexOf(step: number): number | null {
  const index = DOT_ROAD_STATIONS.indexOf(clampStep(step) as (typeof DOT_ROAD_STATIONS)[number]);
  return index >= 0 ? index : null;
}

/** 这一步是什么：普通点 / 有锚句的站 / 路尽头的空白。 */
export function stepKind(step: number): 'step' | 'station' | 'blank' {
  const safe = clampStep(step);
  if (safe === DOT_ROAD_BLANK_STEP) return 'blank';
  return stationIndexOf(safe) === null ? 'step' : 'station';
}

/** 是不是路尽头的空白（第 19 步）。 */
export function isBlankStep(step: number): boolean {
  return clampStep(step) === DOT_ROAD_BLANK_STEP;
}

/**
 * 从 E220 的中英原文里逐字解析成对锚句。
 * 与 `BibleMarkdown.extractAnchors` 同一套行首标记，但只保留两边都有的句数；
 * 解析不出就返回空数组——组件的空态会直说，不拿占位句冒充。
 */
export function parseDotRoadAnchors(
  markdownZh: string,
  markdownEn: string,
): ReadonlyArray<{ zh: string; en: string }> {
  const collect = (md: string, marker: string): string[] => {
    const out: string[] = [];
    for (const line of md.split('\n')) {
      const match = new RegExp(`^\\*\\*${marker}\\*\\*[:：]?\\s*(.+)$`).exec(line);
      if (match) out.push(match[1]!.trim());
    }
    return out;
  };
  const zh = collect(markdownZh, '锚句');
  const en = collect(markdownEn, 'Anchor sentence');
  const n = Math.min(zh.length, en.length);
  return Array.from({ length: n }, (_, i) => ({ zh: zh[i]!, en: en[i]! }));
}
