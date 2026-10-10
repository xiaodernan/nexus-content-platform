import { validateGame, type GameDocument, type GameEntityKind } from '@nexus/game-model';

/**
 * §52 Game Agent 在**没有真 provider** 时能诚实给出的那一份产物：一个 RPG 原型的最小可玩草稿。
 *
 * 为什么不是"从目标文本理解出来的设计"：那要真模型（§105 还挡在 key 上）。§159 的口径是
 * 不许把规则配方说成理解——所以这一份的名字、说明与数值全部来自下面那张写死的表，
 * 目标文本只影响**文档标题**与 id 的散列种子，不影响任何一个数值。
 * 界面上每一步都要照这个口径说话（GamePanel 那句"provider 未接入前这里不做假生成"是同一条纪律）。
 *
 * 为什么不是 `createGame` 那个模板骨架：骨架是 11 类各一个空壳，`compileRpg` 跑起来
 * 场上只有名字、没有任何可判定的事情。这一份给的是**一条能跑完的循环**（两刀一个敌人、
 * 攒够经验升级、踩下洞口结算任务），而且每个数都带一句"这个数意味着什么"，
 * 让用户改的时候知道自己在改什么。它是草稿，不是平衡结果——这句话写在 summary 里，不只写在注释里。
 *
 * **确定性是这一片的硬要求**：草稿要随步骤结论存进任务行、刷新后复看、再被接受写入项目。
 * 如果 id 来自 `Date.now()` 或随机数，同一目标两次跑会给出两份不同的文档，
 * "库里这一份就是那次跑出来的那一份"就没有答案了。所以 id 只从 `seed` 派生，
 * 时间戳由调用方传入（纯函数不读时钟，与 §164 的 notify-plan 同一口径）。
 */

/** 种子的默认值：改配方就换这里，别改散列算法——老任务行里的草稿 id 要还能对得上 */
export const GAME_DRAFT_SEED = 'agent-game-draft-v1';

/** 文档名的上限：`GameDocumentSchema` 的 name 是 trim + 1..120，这里必须先到 120 */
export const GAME_DRAFT_NAME_MAX = 120;

/** 目标为空时的那句兜底名 */
export const GAME_DRAFT_FALLBACK_NAME = '未命名 RPG 原型';

/**
 * id 用的散列：FNV-1a 32 位。
 *
 * 选它只因为三件事：纯 JS、无依赖、同一输入永远同一输出。不是密码学哈希，
 * 也**不需要**是——这里没有对抗输入，只有"别每次都换一个 id"。
 */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    // 乘完取低 32 位：Math.imul 给的就是这个，移位相加的写法在 JS 里会漂到浮点
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** 取散列的短十六进制段：8 位足够让这一表的槽位不撞，又不至于把 id 撑长 */
function digest(seed: string, salt = ''): string {
  return fnv1a(`${seed}#${salt}`).toString(16).padStart(8, '0').slice(0, 8);
}

/** 每句说明都带的落款：数值是配方给的，不是从别的设计推出来的 */
const RECIPE_TAG = '配方给的起点，不是平衡结果';

interface DraftEntitySpec {
  /** 这条实体在表里的位置名：id 由它派生，引用也用它写目标（所以引用不能指到表外） */
  slot: string;
  kind: GameEntityKind;
  name: string;
  notes: string;
  stats: Record<string, number>;
  refs?: readonly { slot: string; role: string }[];
}

/**
 * 这张表就是草稿的全部内容——想改设计就改这里，别在别处再拼一份。
 *
 * 数值之间是有算术关系的（下面的说明逐句写着这些关系），所以改动要成套：
 * `apps/web/test/agent-game-draft.test.ts` 把这些关系钉成了可执行的断言，
 * 表与说明不一致时测试会红，而不是留在注释里等人读。
 */
export const GAME_DRAFT_SPEC: readonly DraftEntitySpec[] = [
  {
    slot: 'player',
    kind: 'player',
    name: '主角',
    stats: { health: 5, speed: 210 },
    notes:
      `5 点生命、比默认快一档（210 对投影兜底的 170）。${RECIPE_TAG}。` +
      '身上没有 attackPower：伤害只能来自那把引用到玩家的武器，这是"武器要握在手里"的模型表达。',
  },
  {
    slot: 'weapon',
    kind: 'weapon',
    name: '短刃',
    stats: { damage: 2, range: 40 },
    refs: [{ slot: 'player', role: '装备于' }],
    notes: `伤害 2 是玩家唯一的伤害来源；range 40 加上两边半径 16，意思是"要贴到半个身位内才打得到"。${RECIPE_TAG}。`,
  },
  {
    slot: 'enemy-patrol',
    kind: 'enemy',
    name: '巡逻兵',
    stats: { health: 3, damage: 1, speed: 150, detectionRange: 140, xpReward: 12 },
    notes: `生命 3 除以短刃的 2 等于两刀；比主角慢（150 对 210），追得上也甩得掉。死的这一下给 12 点经验。${RECIPE_TAG}。`,
  },
  {
    slot: 'enemy-guard',
    kind: 'enemy',
    name: '洞口守卫',
    stats: { health: 6, damage: 2, speed: 120, detectionRange: 160, xpReward: 10 },
    notes:
      `三刀才倒，挨一下掉 2 点血（主角一共 5 点）；察觉半径比巡逻兵大，是先把玩家逼向升级的那一个。` +
      `两个敌人的经验合起来 22 点，刚好跨过升到 2 级那条 20 点的线（曲线在投影里，不是这张表写的）。${RECIPE_TAG}。`,
  },
  {
    slot: 'item-pouch',
    kind: 'item',
    name: '药包',
    stats: { stackSize: 1, value: 5 },
    notes: `走到它上面就算拾取，任务判定只读"还没被拾取"这件事——本投影不会因为它回血（想要回复语义得先加进管线）。${RECIPE_TAG}。`,
  },
  {
    slot: 'trigger-cave',
    kind: 'trigger',
    name: '洞口',
    stats: { radius: 70, delay: 1, cooldown: 2 },
    refs: [{ slot: 'item-pouch', role: '贴着' }],
    notes:
      '踩进 70 像素的范围算"激活"。它引用药包只决定自己被画在哪（贴着药包摆），' +
      '§54 的模型没有"触发之后发生什么"，所以这里没有开门、没有传送。',
  },
  {
    slot: 'quest-clear',
    kind: 'quest',
    name: '清场后打开洞口',
    stats: { xpReward: 12, requiredLevel: 2 },
    refs: [
      { slot: 'enemy-patrol', role: '需要打倒' },
      { slot: 'enemy-guard', role: '需要打倒' },
      { slot: 'trigger-cave', role: '需要激活' },
    ],
    notes:
      '三条目标都可判定（两个击败＋一个激活），所以这是这一版唯一能通向"通关"的条件。' +
      'requiredLevel 2 是等级门：条件凑齐但没到级就不结算，升到 2 级才补记——两个敌人给的 22 点经验够到 2 级。',
  },
  {
    slot: 'npc-wanderer',
    kind: 'npc',
    name: '受伤的旅人',
    stats: { health: 1, interactRange: 90 },
    notes:
      '站桩：非敌对实体不追击，模型里没有 NPC 的移动语义。interactRange 90 目前只是投影的察觉半径，' +
      '对话、动画、粒子都不参与判定，所以走近不会说话。',
  },
];

/** 文档级的那句话：界面上的 summary 读它，别在组件里再写一遍（两处各写迟早不一样） */
export const GAME_DRAFT_SUMMARY =
  '由确定性配方生成的 RPG 原型草稿：结构与数值来自写死的表，目标文本只影响标题，不影响任何一个数。' +
  '没有真 provider 参与（§160 的 DEMO 标识），也没有跑过 Playtest，所以这不是平衡过的设计——' +
  '接受进项目之后可以随便改，改完它就是你的设计。';

/** 这一步在界面上说的那句话：草稿存在任务行里，写不写进项目由用户点「接受」决定 */
export const GAME_DRAFT_NOT_LANDED_NOTE =
  '这份草稿存在这一条作业里（任务行的这一步），还没有写进项目——点这一步上的「接受进项目」才会进 Game Studio。';

export interface GameDraftInput {
  /** 作业目标：只用来取文档标题，不参与任何数值决定 */
  goal: string;
  /** 时间戳由调用方给：纯函数不读时钟，同一入参要给出逐字节相同的文档 */
  at: string;
  /** 散列种子；缺省用 `GAME_DRAFT_SEED`。同一 seed + 同一目标 = 同一份 id */
  seed?: string;
  /**
   * 这份草稿属于哪个项目。**默认 null**——"存在任务行里的一次产物"与"项目里的真值"是两件事，
   * 只有接受那一步（写库）才把后者点亮。`saveGame` 仍会按路径核对归属。
   */
  projectId?: string | null;
}

/** 目标文本 → 文档名：压掉换行与连续空白，截到 schema 的上限，空目标给兜底名 */
export function draftNameFromGoal(goal: string): string {
  const collapsed = goal.replace(/\s+/g, ' ').trim();
  if (!collapsed) return GAME_DRAFT_FALLBACK_NAME;
  return collapsed.slice(0, GAME_DRAFT_NAME_MAX);
}

/**
 * 生成草稿。纯函数：同一份入参两次调用逐字节相同（有测试钉这条）。
 *
 * 引用表里的 `slot` 找不到对应实体就抛——那说明有人改了表却忘了改引用，
 * 这种草稿写进库就是悬空引用（画不出图、试玩判不出来），宁可让那一步直接红。
 * 结构校验也在这一处跑：配方改坏了要在生成时炸，而不是等到写库才被拒（那时已经跑完一整轮作业）。
 */
export function gameDraft(input: GameDraftInput): GameDocument {
  const seed = input.seed ?? GAME_DRAFT_SEED;
  const idOf = new Map(GAME_DRAFT_SPEC.map((spec) => [spec.slot, `ge_${digest(seed, spec.slot)}_${spec.slot}`]));
  const entities = GAME_DRAFT_SPEC.map((spec) => {
    const refs = (spec.refs ?? []).map((ref) => {
      const to = idOf.get(ref.slot);
      if (!to) throw new Error(`§52 草稿配方里有一条引用指向不存在的槽位：${ref.slot}（来自 ${spec.slot}）`);
      return { id: `gr_${digest(seed, `${spec.slot}>${ref.slot}`)}`, to, role: ref.role };
    });
    return {
      id: idOf.get(spec.slot)!,
      kind: spec.kind,
      name: spec.name,
      notes: spec.notes,
      tags: ['agent-draft'],
      stats: { ...spec.stats },
      refs,
      updatedAt: input.at,
    };
  });

  const document: GameDocument = {
    id: `game_${digest(seed, 'document')}`,
    projectId: input.projectId ?? null,
    name: draftNameFromGoal(input.goal),
    summary: GAME_DRAFT_SUMMARY,
    kind: 'rpg-prototype',
    entities,
    createdAt: input.at,
    updatedAt: input.at,
  };
  const issues = validateGame(document);
  if (issues.length) {
    throw new Error(`§52 草稿配方结构校验没过：${issues.map((issue) => issue.message).join('；')}`);
  }
  return document;
}
