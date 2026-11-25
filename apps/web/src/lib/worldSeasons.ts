/**
 * §WORLD-SEASONS · 世界赛季（/world/<id>）——新玩法：给世界确定性地铺出赛季节律。
 *
 * 纪律与 §WORLD-INQUIRY / §WORLD-WAYPOINT 同一流派：零 provider、零写库、零 Math.random；
 * 节律只来自 `world.id` 的哈希偏移与序号，`daysPerSeason` 默认给定，无编造。
 */
import type { WorldDocument } from '@nexus/world-model';

export interface Season {
  /** 可指认：「赛季 N」式名称，含世界 id，调用方按需拼（无额外编写）。 */
  name: string;
  index: number;
  /** 季节开始日偏移（随世界 id 确定性进轮） */
  startDayOffset: number;
  mood: '热烈' | '稳固' | '缓慢' | '歌唱';
  /** 允许的说话强度：探索/收获（quest drop-rate 口径见 Usage 侧） */
  talks: boolean;
}

function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h || 1) >>> 0;
}

const DAYS_PER_SEASON = 7; // 按天计的一个赛季长度；往后可跟随世界 tide 轮转。
const MOODS = ['热烈', '稳固', '缓慢', '歌唱'] as const;

/** 给定世界 id 和天偏移，返回该世界的赛季表（默认起点 0，可换）。 */
export function buildWorldSeasons(world: WorldDocument, dayCount = 28): Season[] {
  if (!world || dayCount < 0) return [];
  const base = hashSeed(world.id) % 4;
  const seasons: Season[] = [];
  for (let i = 0; i < 4 && i < dayCount; i++) {
    const index = (base + i) % 4;
    seasons.push({
      name: `S${index + 1}`,
      index,
      startDayOffset: i * DAYS_PER_SEASON,
      mood: MOODS[index]!,
      talks: index % 2 === 0,
    });
  }
  return seasons;
}

/** 该天属于哪个赛季（无第 n 季则返回 null）。 */
export function seasonAtDay(world: WorldDocument, dayOffset: number): Season | null {
  if (!world) return null;
  return buildWorldSeasons(world, Math.max(4, Math.abs(dayOffset) + 1)).find(
    (s) => s.startDayOffset <= dayOffset && dayOffset < s.startDayOffset + DAYS_PER_SEASON,
  ) ?? null;
}
