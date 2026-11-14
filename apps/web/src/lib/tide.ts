/**
 * 「世界潮汐」——作者声明的扰模如何压向这个世界（v710 §B）。
 *
 * 本模块是「扰模 → 投影」的**纯函数核心**：零依赖、零 IO、零随机、零 provider。
 * 作者声明从哪来：世界文档目前**没有** pressure 字段（2026-11-14 现状）——
 * 本片先把引擎立住、单测钉死、确定性证明过，再让作者能落笔声明；取舍记 ADR-0267。
 *
 * 不变量（与 chronicle / constellation / ephemeris / era-ties 同一套纪律）：
 * - 每种扰模一个独立判定函数——不共享状态、不交叉污染；
 * - 结论只用真数：命中多少节点、落进哪些 kind 各几笔——绝不编造叙事、不生成散文；
 * - `severity` 是作者的着墨（1 要闻 / 2 季节 / 3 纪元），**不参与任何计数**——
 *   算法不给作者缩水，也不给作者放大；
 * - 确定性：同样输入永远同样输出（节点保输入序；id 字典序只在"最活跃"并列时做裁判）。
 * - 非法声明不静默：全部列进 `invalid` 里——写错了就写错了，作者下一眼就能看见。
 */

/** 潮汐五扰模的权威清单在 @nexus/world-model 与 packages/schemas（模型与契约两处对齐）。 */
import { WORLD_TIDE_PRESSURE_KINDS } from '@nexus/world-model';

export const TIDE_PRESSURE_KINDS = WORLD_TIDE_PRESSURE_KINDS;
export type TidePressureKind = (typeof TIDE_PRESSURE_KINDS)[number];

/** 作者声明的一条扰模（id trim 后非空、唯一；label 限 40 字；severity 1..3）。 */
export interface TidePressure {
  id: string;
  kind: TidePressureKind;
  label: string;
  severity: 1 | 2 | 3;
}

export interface TideNodeInput {
  id: string;
  kind: string;
  title: string;
  body: string;
  updatedAt?: string | null;
}

/** 一条扰模的真实投影结果（全部数字来自输入，无散文）。 */
export interface TideEffect {
  pressureId: string;
  kind: TidePressureKind;
  label: string;
  severity: 1 | 2 | 3;
  /** 命中的节点 id（输入顺序、去重） */
  affectedNodeIds: string[];
  /** 命中数——单一来源：affectedNodeIds.length */
  hits: number;
  /** 命中的 kind → 计数（仅出现过的 kind 进来） */
  byKind: Record<string, number>;
}

export interface TideProjection {
  effects: TideEffect[];
  /** 声明总数（= effects.length + invalid.length） */
  declared: number;
  /** 至少命中一个节点的扰模数 */
  active: number;
  /** 命中最多者 id；并列 → id 字典序最小；全空 → null */
  mostActiveId: string | null;
  invalid: { pressureId: string; reason: string }[];
}

// ─── 词典（glaze：子串匹配、大小写无关；命中的才算命中，没有模糊分） ───

const WATER_LEXICON = [
  '海', '河', '湖', '溪', '泉', '井', '雨', '潮', '水', '湾', '港', '沼', '冰', '雪',
  'sea', 'river', 'lake', 'spring', 'rain', 'tide', 'water', 'harbor', 'harbour', 'ice', 'snow', 'swamp', 'ocean',
] as const;
const PROGENY_LEXICON = [
  '幼', '卵', '雏', '崽', '孕', '产', '族', '新生', '诞生', '孵',
  'spawn', 'hatch', 'birth', 'nest', 'brood', 'newborn', 'cub', 'egg', 'breed',
] as const;
const RUMOR_LEXICON = [
  '传言', '谣', '消息', '风声', '流言', '传闻',
  'rumor', 'rumour', 'whisper', 'hearsay', 'news', 'tale', 'echo',
] as const;

/* 通胀只落在账本上：items/factions 一律暴露，不认词典（价格不会凭空跳过某一代商人）。
   干旱只认水：任何落笔节点，title+body 命中水词典即加压（干旱不会遍布全图）。
   寂蚀只认薄：body 长度 < EROSION_BODY_LIMIT 的一切落笔节点。
   繁衍只认幼：creatures/characters/factions 且命中繁衍词典。
   潮声只认叙事线：story/history 且命中传闻词典。 */
function includesAny(haystack: string, lexicon: readonly string[]): boolean {
  const flat = haystack.toLowerCase();
  return lexicon.some((word) => flat.includes(word.toLowerCase()));
}

const ECONOMIC_KINDS = new Set(['items', 'factions']);
const NONFICTION_KINDS = new Set(['story', 'history']);
const PROGENY_KINDS = new Set(['creatures', 'characters', 'factions']);
export const EROSION_BODY_LIMIT = 120;

function pressureMatches(kind: TidePressureKind, node: TideNodeInput): boolean {
  if (!node || typeof node.id !== 'string' || node.id.trim() === '') return false;
  if (typeof node.body !== 'string' || node.body.trim().length === 0) return false;
  const flat = `${node.title ?? ''}\n${node.body}`;
  switch (kind) {
    case 'drought':
      // 只认水——干旱不会遍布全图，只压住与水有关的地方
      return includesAny(flat, WATER_LEXICON);
    case 'progeny':
      return PROGENY_KINDS.has(node.kind) && includesAny(flat, PROGENY_LEXICON);
    case 'inflation':
      // 账本暴露：items/factions 一律受影响，不认词典（价格不会凭空跳过某一代商人）
      return ECONOMIC_KINDS.has(node.kind);
    case 'erosion':
      return node.body.trim().length < EROSION_BODY_LIMIT;
    case 'murmur':
      return NONFICTION_KINDS.has(node.kind) && includesAny(flat, RUMOR_LEXICON);
    default:
      return false;
  }
}

/** 校验一条作者声明；合法则返回 null，否则返回拒绝原因（作者可直接读到）。 */
export function validatePressure(raw: {
  id?: unknown;
  kind?: unknown;
  label?: unknown;
  severity?: unknown;
}): string | null {
  const id = typeof raw?.id === 'string' ? raw.id.trim() : '';
  if (id.length === 0) return '扰模 id 为空';
  if (id.length > 80) return '扰模 id 超过 80 字';
  if (typeof raw?.kind !== 'string' || !(TIDE_PRESSURE_KINDS as readonly string[]).includes(raw.kind)) {
    const kindStr = typeof raw?.kind === 'string' ? raw.kind : typeof raw?.kind === 'number' ? String(raw.kind) : typeof raw?.kind === 'boolean' ? String(raw.kind) : 'unknown';
    return `扰模 kind 不认识：${kindStr}（可用：${TIDE_PRESSURE_KINDS.join(' / ')}）`;
  }
  const label = typeof raw?.label === 'string' ? raw.label.trim() : '';
  if (label.length === 0) return '扰模没有取名（label 为空）';
  if (label.length > 40) return '扰模 label 超过 40 字';
  const severity = raw?.severity;
  if (severity !== 1 && severity !== 2 && severity !== 3) return `扰模 severity 必须是 1 / 2 / 3（收到 ${String(severity)}）`;
  return null;
}

/**
 * 把作者声明的投影到这个世界的落笔节点上。
 * - 输入顺序即输出顺序；affectedNodeIds 保留同序、同 kind 按计数；
 * - 非法声明进 `invalid`，不混进 effects；
 * - 全输入空白 ⇒ effects 有，hits 全 0，mostActiveId 为 null。
 */
export function buildTide(
  nodes: readonly TideNodeInput[],
  pressures: readonly { id: string; kind: string; label: string; severity: number }[],
): TideProjection {
  const invalid: { pressureId: string; reason: string }[] = [];
  const valid: TidePressure[] = [];
  const seenIds = new Set<string>();

  for (const raw of pressures) {
    const reason = validatePressure(raw);
    const trimmed = typeof raw?.id === 'string' ? raw.id.trim() : '';
    const id = trimmed.length > 0 ? trimmed : '(未命名)';
    if (reason) {
      invalid.push({ pressureId: id, reason });
      continue;
    }
    if (seenIds.has(id)) {
      invalid.push({ pressureId: id, reason: `扰模 id 重复（${id} 出现了两次）` });
      continue;
    }
    seenIds.add(id);
    valid.push({
      id,
      kind: raw.kind as TidePressureKind,
      label: String(raw.label).trim(),
      severity: raw.severity as 1 | 2 | 3,
    });
  }

  // 去重守护：同输入不可能进来两次，但数组里有重复 id 也防御一次（第一条赢）
  const guarded: TideNodeInput[] = [];
  const seenNodeIds = new Set<string>();
  for (const node of nodes) {
    if (node && typeof node.id === 'string' && node.id.trim() !== '' && !seenNodeIds.has(node.id)) {
      seenNodeIds.add(node.id);
      guarded.push(node);
    }
  }

  const effects: TideEffect[] = valid.map((pressure) => {
    const affected: string[] = [];
    const byKind = new Map<string, number>();
    for (const node of guarded) {
      if (!pressureMatches(pressure.kind, node)) continue;
      affected.push(node.id);
      byKind.set(node.kind, (byKind.get(node.kind) ?? 0) + 1);
    }
    return {
      pressureId: pressure.id,
      kind: pressure.kind,
      label: pressure.label,
      severity: pressure.severity,
      affectedNodeIds: affected,
      hits: affected.length,
      byKind: Object.fromEntries([...byKind.entries()].sort(([a], [b]) => a.localeCompare(b))),
    };
  });

  const declared = valid.length + invalid.length;
  const active = effects.filter((effect) => effect.hits > 0).length;
  let mostActiveId: string | null = null;
  let best = 0;
  for (const effect of effects) {
    if (effect.hits > best || (effect.hits === best && effect.hits > 0 && effect.pressureId < (mostActiveId ?? '￿'))) {
      best = effect.hits;
      mostActiveId = effect.pressureId;
    }
  }
  if (effects.every((effect) => effect.hits === 0)) mostActiveId = null;
  return { effects, declared, active, mostActiveId, invalid };
}
