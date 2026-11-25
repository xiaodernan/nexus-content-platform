import { describe, expect, it } from 'vitest';
import type { WorldDocument } from '@nexus/world-model';
import { buildWorldSeasons, seasonAtDay } from '@/lib/worldSeasons';

const world: WorldDocument = {
  id: 'world-season-1',
  projectId: null,
  name: '测试世界',
  summary: 's',
  nodes: [],
  links: [],
  positions: {},
  createdAt: '2026-11-25T00:00:00Z',
  updatedAt: '2026-11-25T00:00:00Z',
};

describe('worldSeasons（世界赛季节律·确定性）', () => {
  it('同一世界同输出；每种 Season 有 name/index/startDayOffset/mood/talks', () => {
    const ss = buildWorldSeasons(world);
    expect(ss).toEqual(buildWorldSeasons(world));
    expect(ss.length).toBeGreaterThan(0);
    expect(new Set(ss.map((s) => s.index)).size).toBe(ss.length);
    for (const s of ss) {
      expect(typeof s.name).toBe('string');
      expect(['热烈', '稳固', '缓慢', '歌唱']).toContain(s.mood);
      expect(typeof s.talks).toBe('boolean');
    }
  });

  it('dayCount 0 → 空；dayCount 负 → 空', () => {
    expect(buildWorldSeasons(world, 0)).toEqual([]);
    expect(buildWorldSeasons(world, -3)).toEqual([]);
  });

  it('seasonAtDay 在赛季范围内命中，找不到返回 null', () => {
    const inRange = seasonAtDay(world, 0);
    expect(inRange).not.toBeNull();
    expect(seasonAtDay(world, -999)).toBeNull();
    const s0 = buildWorldSeasons(world)[0]!;
    expect(seasonAtDay(world, s0.startDayOffset)?.index).toBe(s0.index);
  });
});
