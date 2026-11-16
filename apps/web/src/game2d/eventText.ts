import type { SimEvent } from '@nexus/game-model';
import type { Locale } from '@/lib/i18n';

/**
 * §FE-GM：结束原因的双语渲染。与 `gameEventText` 同一套结构化 i18n 描述。
 * `outcome` 原文保留（产物对账钉在上面）；英文模式按 `outcomeI18n` 重组。
 */
export function gameOutcomeText(
  state: { outcome: string | null; outcomeI18n?: { key: string; params: Record<string, string | number> } | null },
  locale: Locale,
): string | null {
  if (!state.outcome) return null;
  const i18n = state.outcomeI18n;
  if (locale !== 'en' || !i18n) return state.outcome;
  const p = i18n.params;
  switch (i18n.key) {
    case 'outcomeNoPlayer':
      return 'There is no player entity — this cannot run.';
    case 'outcomeLostHp':
      return `Health reached zero (${p.t}s, took ${p.damage} damage).`;
    case 'outcomeWonAll':
      return `All ${p.count} judgeable quest(s) completed (${p.t}s).`;
    case 'outcomeTimedOut':
      return `Quest "${String(p.name)}" timed out (timeLimit=${p.timeLimit}, interpreted as seconds).`;
    default:
      return state.outcome;
  }
}

/**
 * §FE-GM：事件流的双语渲染。
 *
 * 模型（sim.ts / rpg.ts）在每一条事件上都带了结构化的 `i18n` 描述（键 + 参数）；这里按 locale 重组英文。
 * 中文模式直接念模型原文——同一次模拟、同一份数据，不是两套规则、不是两条流水线（§16）。
 * 结构化描述缺失时（旧调用方/旧数据）降级显示模型原文，绝不编译期凭空造英文。
 */
export function gameEventText(event: SimEvent, locale: Locale): string {
  if (locale !== 'en' || !event.i18n) return event.text;
  const p = event.i18n.params;
  const name = String(p.name ?? '');
  switch (event.i18n.key) {
    case 'enemyHitPlayer':
      return `${name} hits you for ${p.damage}`;
    case 'enemyDefeated':
      return `Defeated ${name}`;
    case 'itemPicked':
      return `Picked up ${name}`;
    case 'questDone':
      return `Quest "${name}" complete`;
    case 'triggerStepped': {
      const first = Number(p.first) === 1;
      const affects = p.affects ? ` — it references ${String(p.affects)} (no "what happens after" semantics in the model)` : '';
      return `${first ? 'Activated' : 'Stepped on again'} trigger ${name}${affects}`;
    }
    case 'questLevelGated':
      return `Quest "${name}" condition met, but it needs level ${p.requiredLevel} to turn in (now level ${p.level}) — the completion is held back`;
    case 'enemyDefeatedXp':
      return `Defeated ${name} +${p.xp} XP${Number(p.fallback) === 1 ? ' (projection default)' : ''}`;
    case 'questDoneXp':
      return `Quest "${name}" complete +${p.xp} XP`;
    case 'levelUp':
      return `Reached level ${p.level}: max health +${p.maxHealth}, damage +${p.damage} (curve from the projection, not the design)`;
    default:
      return event.text;
  }
}
