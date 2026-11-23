import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DOT_ROAD_BLANK_STEP,
  DOT_ROAD_CLOSING,
  DOT_ROAD_STATIONS,
  DOT_ROAD_STEPS,
  clampStep,
  isBlankStep,
  parseDotRoadAnchors,
  stationIndexOf,
  stepKind,
} from '../src/lib/dotRoad';

/**
 * ──DOT-ROAD 行为门（2026-11-22 · E220《照着点走一遍》）
 *
 * 这一层不测 DOM：路是十九步、六个站、尽头一格空白，锚句逐字来自 E220 原文。
 * 所有断言都能被一次真改动打红：改步数、改站序、改锚句、改结尾两句，都会在这里露出来。
 */
const ROOT = process.cwd();
const E220_ZH = join(ROOT, 'docs/world-bible/echoes/E220-潮候院抄本院照着点走一遍.md');
const E220_EN = join(ROOT, 'docs/world-bible/echoes/E220-潮候院抄本院照着点走一遍.en.md');
const mdZh = readFileSync(E220_ZH, 'utf8');
const mdEn = readFileSync(E220_EN, 'utf8');

describe('§DOT-ROAD 路的形状', () => {
  it('十九步、六个站、站序严格递增且都落在普通点上', () => {
    expect(DOT_ROAD_STEPS).toBe(19);
    expect(DOT_ROAD_STATIONS).toHaveLength(6);
    for (let i = 1; i < DOT_ROAD_STATIONS.length; i += 1) {
      expect(DOT_ROAD_STATIONS[i]!).toBeGreaterThan(DOT_ROAD_STATIONS[i - 1]!);
    }
    for (const step of DOT_ROAD_STATIONS) {
      expect(step).toBeGreaterThan(1);
      expect(step).toBeLessThan(DOT_ROAD_BLANK_STEP);
      expect(stationIndexOf(step)).not.toBeNull();
    }
    expect(stationIndexOf(DOT_ROAD_BLANK_STEP)).toBeNull();
  });

  it('clampStep 把越界/小数/NaN 收进 1..19，不留半格', () => {
    expect(clampStep(-3)).toBe(1);
    expect(clampStep(0)).toBe(1);
    expect(clampStep(1.9)).toBe(1);
    expect(clampStep(19)).toBe(19);
    expect(clampStep(99)).toBe(19);
    expect(clampStep(Number.NaN)).toBe(1);
    expect(clampStep(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it('stepKind：站 / 点 / 空白三态互斥', () => {
    expect(stepKind(DOT_ROAD_STATIONS[0]!)).toBe('station');
    expect(stepKind(3)).toBe('step');
    expect(stepKind(DOT_ROAD_BLANK_STEP)).toBe('blank');
    expect(isBlankStep(DOT_ROAD_BLANK_STEP)).toBe(true);
    expect(isBlankStep(DOT_ROAD_STEPS - 1)).toBe(false);
    for (let step = 1; step <= DOT_ROAD_STEPS; step += 1) {
      const kind = stepKind(step);
      expect(['step', 'station', 'blank']).toContain(kind);
      if (kind === 'station') expect(stationIndexOf(step)).not.toBeNull();
      if (kind === 'step') expect(stationIndexOf(step)).toBeNull();
    }
  });
});

describe('§DOT-ROAD 内容是真的 E220', () => {
  it('从 E220 中英原文解析出 6 对锚句，逐字与原文一致', () => {
    const anchors = parseDotRoadAnchors(mdZh, mdEn);
    expect(anchors).toHaveLength(6);
    for (const pair of anchors) {
      expect(pair.zh.length).toBeGreaterThan(0);
      expect(pair.en.length).toBeGreaterThan(0);
      expect(mdZh).toContain(`**锚句**：${pair.zh}`);
      expect(mdEn).toContain(`**Anchor sentence**: ${pair.en}`);
    }
  });

  it('结尾两句与原文文末逐字一致（防止两处漂移）', () => {
    expect(mdZh).toContain(DOT_ROAD_CLOSING.zh);
    expect(mdEn).toContain(DOT_ROAD_CLOSING.en);
  });

  it('解析不出就返回空数组——不拿占位句冒充', () => {
    expect(parseDotRoadAnchors('', '')).toEqual([]);
    expect(parseDotRoadAnchors('**锚句**：只有中文', '')).toEqual([]);
  });

  it('组件不手写任何锚句：正文只从 generated.ts 解析', () => {
    const component = readFileSync(join(ROOT, 'apps/web/src/components/DotRoad.tsx'), 'utf8');
    expect(component).toContain('parseDotRoadAnchors');
    const anchors = parseDotRoadAnchors(mdZh, mdEn);
    for (const pair of anchors) {
      expect(component).not.toContain(pair.zh);
      expect(component).not.toContain(pair.en);
    }
  });
});
