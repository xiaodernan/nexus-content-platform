/**
 * §WORLD-ANNALS · 世界编年（/world/<id>）——新玩法补档（第六条「宏观史诗叙事」）。
 *
 * 纪律：零 provider、零写库、零 Math.random；纪元与标题都取自真实 WorldNode（lore.era / order / title），
 * 缺纪元的条目归入 `未标纪元`（不编年份），排序稳定（era asc, order asc, id asc）。
 */
import type { WorldDocument, WorldNode } from '@nexus/world-model';

export const UNDATED_ERA = '未标纪元';

export interface Annal {
  id: string;
  nodeId: string;
  era: string;
  order: number;
  title: string;
}

const eraOf = (n: WorldNode): string => {
  const era = (n.lore?.era ?? '').trim();
  return era.length > 0 ? era.slice(0, 80) : UNDATED_ERA;
};

/** 编年表：纪元升序；同纪元按 order，再按 id 稳定兜底。 */
export function buildWorldAnnals(world: WorldDocument): Annal[] {
  if (!world || !world.nodes) return [];
  return world.nodes
    .filter((n) => n.id && n.title.trim().length > 0)
    .map((n, index): Annal => ({
      id: `annal-${n.id}`,
      nodeId: n.id,
      era: eraOf(n),
      order: Number.isFinite(n.lore?.order) ? n.lore!.order! : index,
      title: n.title,
    }))
    .sort((a, b) => {
      if (a.era !== b.era) return a.era < b.era ? -1 : 1;
      if (a.order !== b.order) return a.order - b.order;
      return a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0;
    });
}

/** 查某一纪元的大事（无此纪元返回空表，不补位）。 */
export function annalsInEra(world: WorldDocument, era: string): Annal[] {
  return buildWorldAnnals(world).filter((a) => a.era === era);
}
