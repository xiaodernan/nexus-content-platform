/**
 * §WS-1 潮候步进 · web 侧状态工具（纯函数，浏览器/SSR 通吃）。
 *
 * 持久化：localStorage 的 `nexus-tidewatch-v1`——与潮家族的纪律一致：
 * 这是一次"旅行"，不是一次作业；刷新后旅行接着走。
 * ai-service 端不写业务库（边界纪律 2），状态权威永远在客户端。
 */
export type TidePhase = 'rising' | 'high' | 'falling' | 'low';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export type TidewatchClock = {
  /** 「2026 · 仲秋 · 落潮」 */
  label: string;
  season: Season;
  tide: TidePhase;
};

export type TidewatchMemory = {
  kind: 'oracle' | 'quiz' | 'step' | 'seal' | 'echo';
  text: string;
};

export type TidewatchTraveler = {
  vigor: number;
  depth: number;
  seals: string[];
};

export type TidewatchState = {
  clock: TidewatchClock;
  traveler: TidewatchTraveler;
  memory: TidewatchMemory[];
};

export type WorldStepDelta = {
  vigor: number;
  depth: number;
  seals: string[];
  unlocks: string[];
  risk: 'calm' | 'uneasy' | 'storm';
};

const SEASON_ZH: Record<Season, string> = { spring: '春分', summer: '仲夏', autumn: '仲秋', winter: '冬至' };
const SEASON_EN: Record<Season, string> = { spring: 'spring', summer: 'high summer', autumn: 'autumn', winter: 'winter' };
const TIDE_ZH: Record<TidePhase, string> = { rising: '涨潮', high: '平潮', falling: '落潮', low: '退潮' };
const TIDE_EN: Record<TidePhase, string> = { rising: 'rising tide', high: 'high tide', falling: 'ebb tide', low: 'low tide' };

export function seasonOf(month: number): Season {
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}

export function tideOf(date: Date): TidePhase {
  // 潮相按一天四段：夜里落潮（0–6）、上午涨潮（6–12）、午后平潮（12–15）、黄昏退潮（15–24）
  const h = date.getHours();
  if (h < 6) return 'falling';
  if (h < 12) return 'rising';
  if (h < 15) return 'high';
  return 'low';
}

export function deriveClock(date: Date, locale: 'zh' | 'en' = 'zh'): TidewatchClock {
  const season = seasonOf(date.getMonth() + 1);
  const tide = tideOf(date);
  if (locale === 'zh') {
    return { label: `${date.getFullYear()} · ${SEASON_ZH[season]} · ${TIDE_ZH[tide]}`, season, tide };
  }
  return { label: `${date.getFullYear()} · ${SEASON_EN[season]} · ${TIDE_EN[tide]}`, season, tide };
}

export const TIDEWATCH_STORAGE_KEY = 'nexus-tidewatch-v1';
export const TIDEWATCH_MAX_MEMORY = 6;
export const TIDEWATCH_MAX_SEALS = 12;

export function freshTraveler(): TidewatchTraveler {
  return { vigor: 6, depth: 0, seals: [] };
}

export type TidewatchPersisted = {
  vigor: number;
  depth: number;
  seals: string[];
  unlocks: string[];
  memory: TidewatchMemory[];
};

export function freshPersisted(): TidewatchPersisted {
  return { vigor: 6, depth: 0, seals: [], unlocks: [], memory: [] };
}

/** 夹紧：vigor/depth 0..9，越界出界的永远落回边界（LLM 提议，这里裁决） */
export function applyDelta(state: TidewatchPersisted, delta: WorldStepDelta): TidewatchPersisted {
  const vigor = clamp(0, 9, state.vigor + delta.vigor);
  const depth = clamp(0, 9, state.depth + delta.depth);
  const seals = dedupe([...state.seals, ...delta.seals]).slice(-TIDEWATCH_MAX_SEALS);
  const unlocks = dedupe([...state.unlocks, ...delta.unlocks]);
  return { vigor, depth, seals, unlocks, memory: state.memory };
}

export function pushMemory(state: TidewatchPersisted, entry: TidewatchMemory): TidewatchPersisted {
  const text = entry.text.trim().slice(0, 280);
  if (!text) return state;
  const memory = [...state.memory, { kind: entry.kind, text }].slice(-TIDEWATCH_MAX_MEMORY);
  return { ...state, memory };
}

export function clamp(lo: number, hi: number, value: number): number {
  return Math.max(lo, Math.min(hi, Math.trunc(value)));
}

function dedupe(items: string[]): string[] {
  const out: string[] = [];
  for (const raw of items) {
    const item = raw.trim().slice(0, 40);
    if (item && !out.includes(item)) out.push(item);
  }
  return out;
}

export function readPersisted(raw: string | null): TidewatchPersisted {
  if (!raw) return freshPersisted();
  try {
    const parsed = JSON.parse(raw) as Partial<TidewatchPersisted>;
    return {
      vigor: clamp(0, 9, Number(parsed.vigor ?? 6) || 0),
      depth: clamp(0, 9, Number(parsed.depth ?? 0) || 0),
      seals: dedupe(Array.isArray(parsed.seals) ? parsed.seals.map(String) : []),
      unlocks: Array.isArray(parsed.unlocks) ? dedupe(parsed.unlocks.map(String)) : [],
      memory: (Array.isArray(parsed.memory) ? parsed.memory : [])
        .filter((m): m is TidewatchMemory => Boolean(m && typeof (m as TidewatchMemory).text === 'string' && typeof (m as TidewatchMemory).kind === 'string'))
        .map((m) => ({ kind: m.kind, text: String(m.text).slice(0, 280) }))
        .slice(-TIDEWATCH_MAX_MEMORY),
    };
  } catch {
    return freshPersisted();
  }
}

export function toRequestState(persisted: TidewatchPersisted, clock: TidewatchClock): TidewatchState {
  return {
    clock,
    traveler: { vigor: persisted.vigor, depth: persisted.depth, seals: persisted.seals },
    memory: persisted.memory,
  };
}
