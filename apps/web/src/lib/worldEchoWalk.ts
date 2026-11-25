/**
 * 回声步道：把世界条目里已写下的感官记忆（lore.memory）串成一条可巡礼的步道。
 *
 * 用户要"辽阔土地上有足够多细节可探索"——记忆回声正是最细的那一层（声音/味道/触感/光线）。
 * 这里只做确定性投影：每条回声都来自作者写下的真实 memory + 标题，标出 sourceId；
 * 不编造记忆、不写库、零 provider、零随机。同一个世界永远同一条步道。
 */
import type { WorldDocument } from '@nexus/world-model';

export type EchoStep = { index: number; sourceId: string; title: string; memory: string; era?: string };
export type EchoWalk = { steps: EchoStep[]; total: number; hasMore: boolean };

export function buildEchoWalk(world: WorldDocument, limit = 8): EchoWalk {
  const withMemory = world.nodes
    .filter((n) => (n.lore?.memory || '').trim().length > 0)
    // 稳定顺序：有纪元的先按 era 排，再按 order，最后 id 兜底——巡礼顺序可复现
    .sort((a, b) => {
      const ea = a.lore?.era?.trim() ?? '';
      const eb = b.lore?.era?.trim() ?? '';
      if (ea !== eb) {
        if (!ea) return 1;  // 未标纪元的排在最后
        if (!eb) return -1;
        return ea < eb ? -1 : 1;
      }
      const oa = a.lore?.order ?? Number.MAX_SAFE_INTEGER;
      const ob = b.lore?.order ?? Number.MAX_SAFE_INTEGER;
      if (oa !== ob) return oa - ob;
      return a.id.localeCompare(b.id);
    });
  const n = Math.max(0, Math.min(limit, 20));
  const steps = withMemory.slice(0, n).map((node, i) => ({
    index: i + 1,
    sourceId: node.id,
    title: node.title,
    memory: (node.lore?.memory || '').trim(),
    ...(node.lore?.era?.trim() ? { era: node.lore.era.trim() } : {}),
  }));
  return { steps, total: withMemory.length, hasMore: withMemory.length > n };
}

export function formatEchoStep(step: EchoStep, locale: 'zh' | 'en'): string {
  const head = locale === 'zh' ? `第 ${step.index} 回响 · ${step.title}` : `Echo ${step.index} · ${step.title}`;
  const era = step.era ? (locale === 'zh' ? `（${step.era}）` : ` (${step.era})`) : '';
  return `${head}${era}：${step.memory}`;
}
