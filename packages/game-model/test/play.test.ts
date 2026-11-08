import { describe, expect, it } from "vitest";
import {
  ACTOR_RADIUS,
  ARENA,
  PLAY_DEFAULTS,
  PLAY_PROVENANCE_FALLBACK_TEXT,
  PLAY_PROVENANCE_LABELS,
  PLAY_PROVENANCE_SLOTS,
  POSITION_STAT_KEYS,
  addEntity,
  authoredPosition,
  clampToArena,
  compileGame,
  createGame,
  entitiesOfKind,
  hasAuthoredPosition,
  linkEntities,
  setStat,
  updateEntity,
  type GameDocument,
} from "../src/index";

/**
 * §50-§54 的关卡投影。纯函数，所以这里钉的全是"会不会说谎"：
 * 位置从哪来、兜底值有没有被当成设计的数值、判不出来的完成条件有没有被偷偷算成能完成。
 *
 * 每条负面断言都配一个同一次运行里的正向对照——一个恒返回 `design` 的 provenance、
 * 或一个恒返回 `judgeable: true` 的任务判定，只有对照能抓出来。
 */

function write(document: GameDocument, entityId: string, key: string, value: number): GameDocument {
  const result = setStat(document, entityId, key, value);
  if (result.reason) throw new Error(`前置数值写入失败：${result.reason}`);
  return result.document;
}

function link(document: GameDocument, from: string, to: string, role: string): GameDocument {
  const result = linkEntities(document, from, to, role);
  if (result.reason) throw new Error(`前置引用失败：${result.reason}`);
  return result.document;
}

/**
 * 读回**这份文档此刻**的实体。`entitiesOfKind` 拿到的对象是写入之前的快照，
 * 拿快照去问「写没写坐标」会永远得到否答案——谓词的输入必须是最终文档里的那一个。
 */
function entityOf(document: GameDocument, id: string) {
  const found = document.entities.find((entity) => entity.id === id);
  if (!found) throw new Error(`测试底稿里没有实体 ${id}`);
  return found;
}

describe('compileGame 的确定性', () => {
  it('同一份文档两次编译逐字段相同；改一个数值不会挪动任何东西', () => {
    let doc = createGame('确定性');
    const enemy = entitiesOfKind(doc, 'enemy')[0]!;
    doc = write(doc, enemy.id, 'health', 7);
    const first = compileGame(doc);
    const second = compileGame(write(doc, enemy.id, 'damage', 2));
    // 位置与数值无关：改了 damage 不该挪动任何东西（notes 会变，因为"几个实体没填数值"变了，
    // 所以这里比的是位置表而不是整份计划——比整份计划会让那条诚实的计数变成"不确定"）
    const places = (plan: ReturnType<typeof compileGame>) =>
      [plan.player, ...plan.enemies, ...plan.items, ...plan.npcs]
        .filter((a): a is NonNullable<typeof a> => a !== null)
        .map((a) => [a.id, a.x, a.y]);
    expect(places(second)).toEqual(places(first));
    expect(second.enemies[0]!.health).toBe(7);
    // 反向对照：位置确实与数值无关，但**数值本身**读得出来——不是把整份计划算成一个常量
    expect(second.enemies[0]!.damage).toBe(2);
  });

  it('所有个体都在场地内、半径一致，哪怕塞 60 个敌人', () => {
    let doc = createGame('很多敌人');
    for (let i = 0; i < 60; i += 1) doc = addEntity(doc, { kind: 'enemy', name: `敌${i}` });
    const plan = compileGame(doc);
    expect(plan.enemies.length).toBeGreaterThan(60);
    for (const actor of [plan.player, ...plan.enemies, ...plan.items, ...plan.npcs].filter(Boolean)) {
      expect(actor!.x).toBeGreaterThanOrEqual(ACTOR_RADIUS);
      expect(actor!.x).toBeLessThanOrEqual(ARENA.width - ACTOR_RADIUS);
      expect(actor!.y).toBeGreaterThanOrEqual(ACTOR_RADIUS);
      expect(actor!.y).toBeLessThanOrEqual(ARENA.height - ACTOR_RADIUS);
      // 大小一律相同：模型里没有尺寸字段，谁比谁大都是编出来的
      expect(actor!.radius).toBe(ACTOR_RADIUS);
    }
  });
});

describe('数值从哪来（provenance）', () => {
  it('写了的算作者的，没写的算兜底，并且模板实体被点名', () => {
    let doc = createGame('兜底与真值');
    doc = addEntity(doc, { kind: 'enemy', name: '没填任何东西的敌B' });
    const [designed, plain] = entitiesOfKind(doc, 'enemy');
    doc = write(doc, designed!.id, 'health', 12);
    doc = write(doc, designed!.id, 'speed', 40);
    const plan = compileGame(doc);

    const a = plan.enemies.find((e) => e.id === designed!.id)!;
    const b = plan.enemies.find((e) => e.id === plain!.id)!;
    expect(a.health).toBe(12);
    expect(a.provenance.health).toBe('design');
    expect(a.provenance.damage).toBe('default');
    expect(b.health).toBe(PLAY_DEFAULTS.health);
    expect(b.provenance.health).toBe('default');
    // 同一个敌人内部也分开：写了 speed 就 design，没写 senseRadius 就 default
    expect(a.provenance.speed).toBe('design');
    expect(a.provenance.senseRadius).toBe('default');
    // 模板（一个数值都没填）必须被点名，否则"场上有个敌人"会被读成"作者设计了敌人"
    expect(b.template).toBe(true);
    expect(a.template).toBe(false);
    expect(plan.notes.join(' ')).toContain('兜底值');
  });
});

describe('玩家能不能打', () => {
  it('自己的 attackPower 优先；否则用引用到玩家身上的武器 damage；两处都没有就是 0 并说明', () => {
    const doc = createGame('伤害来源');
    const player = entitiesOfKind(doc, 'player')[0]!;
    const weapon = entitiesOfKind(doc, 'weapon')[0]!;

    // 一：玩家自己有 attackPower
    const own = compileGame(write(doc, player.id, 'attackPower', 9));
    expect(own.player!.damage).toBe(9);
    expect(own.player!.provenance.damage).toBe('design');

    // 二：玩家没写，但武器引用了他
    const viaWeapon = compileGame(write(link(doc, weapon.id, player.id, '装备于'), weapon.id, 'damage', 5));
    expect(viaWeapon.player!.damage).toBe(5);
    expect(viaWeapon.player!.provenance.damage).toBe('design');

    // 三：武器在文档里但没连到玩家——那不算"拿着"，投影不替设计编一个攻击力
    const nothing = compileGame(write(doc, weapon.id, 'damage', 5));
    expect(nothing.player!.damage).toBe(0);
    expect(nothing.notes.join(' ')).toContain('只能躲、不能打');
    // 反向对照：同一条 note 不会因为"其实有伤害来源"而出现
    expect(own.notes.join(' ')).not.toContain('只能躲、不能打');
  });

  it('删掉玩家实体就是开不了场，blockers 说清原因', () => {
    let doc = createGame('没有玩家');
    const player = entitiesOfKind(doc, 'player')[0]!;
    doc = updateEntity(doc, player.id, { kind: 'npc', name: '路过的' });
    const plan = compileGame(doc);
    expect(plan.playable).toBe(false);
    expect(plan.player).toBe(null);
    expect(plan.blockers.join(' ')).toContain('没有玩家实体');
    // 反向对照：模板文档（玩家还在）不该报这条
    expect(compileGame(createGame('有玩家')).blockers).toHaveLength(0);
  });

  it('两个玩家实体：只用第一个，并把这件事写在 notes 里', () => {
    let doc = createGame('多玩家');
    doc = addEntity(doc, { kind: 'player', name: '第二个玩家' });
    const plan = compileGame(doc);
    expect(plan.player!.name).toBe(doc.entities.find((e) => e.kind === 'player')!.name);
    expect(plan.notes.join(' ')).toContain('只用第一个');
  });
});

describe('任务的完成条件判不判得出来', () => {
  it('引用敌人/物品才有可判定的条件；引用别的或什么都不引用就明说判不出来', () => {
    let doc = createGame('任务条件');
    const [enemy] = entitiesOfKind(doc, 'enemy');
    const [item] = entitiesOfKind(doc, 'item');
    const [dialogue] = entitiesOfKind(doc, 'dialogue');
    const questable = entitiesOfKind(doc, 'quest')[0]!;
    doc = link(doc, questable.id, enemy!.id, '讨伐');
    doc = link(doc, questable.id, item!.id, '收集');
    // 第二条任务只引用了一段对话：投影没有"对话说完"这种状态可判
    doc = addEntity(doc, { kind: 'quest', name: '听完那句话' });
    const questTalk = entitiesOfKind(doc, 'quest').find((q) => q.name === '听完那句话')!;
    doc = link(doc, questTalk.id, dialogue!.id, '触发对话');
    // 第三条任务什么都没引用
    doc = addEntity(doc, { kind: 'quest', name: '自己想' });
    const questEmpty = entitiesOfKind(doc, 'quest').find((q) => q.name === '自己想')!;

    const plan = compileGame(doc);
    const byId = new Map(plan.quests.map((q) => [q.id, q]));
    const a = byId.get(questable.id)!;
    expect(a.judgeable).toBe(true);
    expect(a.goals.map((g) => g.kind).sort()).toEqual(['collect', 'defeat']);
    const t = byId.get(questTalk.id)!;
    expect(t.judgeable).toBe(false);
    expect(t.why).toContain('不是敌人、物品或触发器');
    const e = byId.get(questEmpty.id)!;
    expect(e.judgeable).toBe(false);
    expect(e.why).toContain('没有引用任何对象');
    // 反向对照：存在一条可判定的任务时，不该出现"这一版没有赢"那句
    expect(plan.notes.join(' ')).not.toContain('没有"赢"');
    // 反向对照：一份什么都没连的文档（模板任务都没有引用）才会说没有赢
    const noWin = compileGame(createGame('都没条件'));
    expect(noWin.quests.every((q) => !q.judgeable)).toBe(true);
    expect(noWin.notes.join(' ')).toContain('没有"赢"');
  });

  it('引用指向一个已经不存在的实体：那条目标跳过，任务明说判不出来', () => {
    // 仪器点名的 `play.ts:383` 是 quest 的 refs 里那句 `if (!target) continue`——
    // 「引用还挂着、被引用的实体已经没了」这一格从没走过（删实体那条链确实会留下这种引用）。
    // 它必须既不高高兴兴算成「完成了一个目标」，也不炸：投影对不存在的目标只能说「判不出来」。
    const doc = createGame('引用落空');
    const quest = entitiesOfKind(doc, 'quest')[0]!;
    const [enemy] = entitiesOfKind(doc, 'enemy');
    const dangling: GameDocument = {
      ...doc,
      entities: doc.entities.map((entity) =>
        entity.id === quest.id ? { ...entity, refs: [{ id: 'ref-ghost', to: '已经不在了', role: '讨伐' }] } : entity,
      ),
    };
    const plan = compileGame(dangling);
    const q = plan.quests.find((x) => x.id === quest.id)!;
    expect(q.goals).toHaveLength(0);
    expect(q.judgeable).toBe(false);
    expect(q.why).toContain('不是敌人、物品或触发器');
    // 正向对照：同一条引用把 to 换成真存在的敌人就立刻可判——红的是那个 id，不是引用的形状
    const linked = compileGame(link(doc, quest.id, enemy!.id, '讨伐'));
    const ok = linked.quests.find((x) => x.id === quest.id)!;
    expect(ok.goals.map((g) => g.kind)).toEqual(['defeat']);
    expect(ok.judgeable).toBe(true);
  });

  it('timeLimit 存在才声明"按秒解释"，不存在就不提', () => {
    let doc = createGame('限时');
    const [quest] = entitiesOfKind(doc, 'quest');
    expect(compileGame(doc).notes.join(' ')).not.toContain('按**秒**解释');
    doc = write(doc, quest!.id, 'timeLimit', 90);
    const plan = compileGame(doc);
    expect(plan.quests[0]!.timeLimit).toBe(90);
    expect(plan.notes.join(' ')).toContain('按**秒**解释');
  });
});

describe('触发器', () => {
  it('引用了已放置的对象就锚在它身上；没引用就排在环上，radius 的来路分开标', () => {
    let doc = createGame('触发器');
    const [trigger] = entitiesOfKind(doc, 'trigger');
    const [item] = entitiesOfKind(doc, 'item');
    doc = addEntity(doc, { kind: 'trigger', name: '没连上的' });
    const loose = entitiesOfKind(doc, 'trigger').find((t) => t.name === '没连上的')!;
    doc = link(doc, trigger!.id, item!.id, '触发后播放');
    doc = write(doc, trigger!.id, 'radius', 220);
    const plan = compileGame(doc);
    const anchored = plan.triggers.find((t) => t.id === trigger!.id)!;
    const other = plan.triggers.find((t) => t.id === loose.id)!;
    const placedItem = plan.items.find((i) => i.id === item!.id)!;
    expect({ x: anchored.x, y: anchored.y }).toEqual({ x: placedItem.x, y: placedItem.y });
    expect(anchored.affects).toEqual({ id: item!.id, name: item!.name });
    expect(anchored.radius).toBe(220);
    expect(anchored.radiusIsDesign).toBe(true);
    // 反向对照：没引用的那条既不在物品上，radius 也是兜底值
    expect({ x: other.x, y: other.y }).not.toEqual({ x: placedItem.x, y: placedItem.y });
    expect(other.radius).toBe(PLAY_DEFAULTS.triggerRadius);
    expect(other.radiusIsDesign).toBe(false);
    expect(other.affects).toBe(null);
  });
});

/**
 * §52 链第三格（Level Design）的地基：位置可以是**文档里写着的值**。
 * 这里钉的是投影会不会说谎，四条都要有反方向对照：
 * 认作者摆的位置、场外钳回、半套坐标不算摆过、没写坐标时行为逐字节不变。
 */
describe('位置从哪来（作者摆的 x / y vs 同心环）', () => {
  it('写了 x 与 y 就用作者的位置并标成 design；只写一个键整体退回同心环', () => {
    let doc = createGame('位置');
    const [placed] = entitiesOfKind(doc, 'enemy');
    doc = addEntity(doc, { kind: 'enemy', name: '没摆过的敌人' });
    const [untouched] = entitiesOfKind(doc, 'enemy').slice(1);
    const halfOnly = entitiesOfKind(doc, 'item')[0]!;
    // 先量一份「谁都没摆过」的：后面拿它当同心环的基准，而不是凭公式猜
    const before = compileGame(doc);
    doc = write(doc, placed!.id, POSITION_STAT_KEYS.x, 233);
    doc = write(doc, placed!.id, POSITION_STAT_KEYS.y, 97);
    doc = write(doc, halfOnly.id, POSITION_STAT_KEYS.x, 480);
    const plan = compileGame(doc);

    const a = plan.enemies.find((e) => e.id === placed!.id)!;
    expect({ x: a.x, y: a.y }).toEqual({ x: 233, y: 97 });
    expect(a.provenance.position).toBe('design');
    const b = plan.enemies.find((e) => e.id === untouched!.id)!;
    const bBefore = before.enemies.find((e) => e.id === untouched!.id)!;
    expect(b.provenance.position).toBe('default');
    // 反向对照一：没写坐标的那个仍然在投影排的环位置上（不是被作者的数带着走）
    expect({ x: b.x, y: b.y }).toEqual({ x: bBefore.x, y: bBefore.y });
    expect([a.x, a.y]).not.toEqual([bBefore.x, bBefore.y]);

    // 反向对照二：半套坐标与「什么都没写」那一份逐字节同位置——认半个作者值就是说谎
    const c = plan.items.find((i) => i.id === halfOnly.id)!;
    const cBefore = before.items.find((i) => i.id === halfOnly.id)!;
    expect(c.provenance.position).toBe('default');
    expect({ x: c.x, y: c.y }).toEqual({ x: cBefore.x, y: cBefore.y });

    // 判据只有一把尺：投影认的位置与导出的那两个谓词必须一致，否则布局格与投影会有两种读数
    // 输入取最终文档里的实体快照，而不是写入之前抓的那一份
    expect(hasAuthoredPosition(entityOf(doc, placed!.id))).toBe(true);
    expect(hasAuthoredPosition(entityOf(doc, halfOnly.id))).toBe(false);
    expect(hasAuthoredPosition(entityOf(doc, untouched!.id))).toBe(false);
    expect(authoredPosition(entityOf(doc, placed!.id))).toEqual({ x: 233, y: 97, clamped: false });
    expect(authoredPosition(entityOf(doc, halfOnly.id))).toBe(null);
    expect(authoredPosition(entityOf(doc, untouched!.id))).toBe(null);
  });

  it('判位置的尺子也接得住「没有实体」：undefined 说不，不抛错也不当成摆过', () => {
    // 第十八片的仪器点名 `play.ts:231` 那段 `return false` 从没走过——今天三个调用点都递得出实体。
    // 签名收 `GameEntity | undefined`（`entities.find(...)` 就是这么交出来的），不钉这一条，
    // 将来谁把 find 的结果直接递进来，就没有任何东西知道「没实体」那一格没人看过。
    expect(hasAuthoredPosition(undefined)).toBe(false);
    // 正向对照：同一把尺子量到有实体的那一份，说的不是同一个字（上面那条不是恒 false）
    const doc = createGame('有实体');
    const [player] = entitiesOfKind(doc, 'player');
    const placed = write(write(doc, player!.id, POSITION_STAT_KEYS.x, 120), player!.id, POSITION_STAT_KEYS.y, 80);
    expect(hasAuthoredPosition(entityOf(placed, player!.id))).toBe(true);
    expect(hasAuthoredPosition(entityOf(placed, player!.id))).not.toBe(hasAuthoredPosition(undefined));
  });

  it('场外的坐标钳回场地内并写进 notes；场内的那份不该出现这句话', () => {
    // 两份对照都从同一个 base 派生：createGame 每次给新 id，拿另一份的 id 去写会写空
    const base = createGame('场外');
    const [enemy] = entitiesOfKind(base, 'enemy');
    const outside = write(write(base, enemy!.id, POSITION_STAT_KEYS.x, ARENA.width + 500), enemy!.id, POSITION_STAT_KEYS.y, -900);
    const plan = compileGame(outside);
    const a = plan.enemies.find((e) => e.id === enemy!.id)!;
    expect({ x: a.x, y: a.y }).toEqual({ x: ARENA.width - ACTOR_RADIUS, y: ACTOR_RADIUS });
    // 钳过之后仍然是「作者摆的」：来路问的是文档写没写，不是写的是不是合法位置
    expect(a.provenance.position).toBe('design');
    expect(plan.notes.join(' ')).toContain('钳回了场地内');
    expect(authoredPosition(entityOf(outside, enemy!.id))).toEqual({ x: ARENA.width - ACTOR_RADIUS, y: ACTOR_RADIUS, clamped: true });
    // 反向对照：同一个体把坐标挪进场内，那条 note 就不该在
    const inside = write(write(base, enemy!.id, POSITION_STAT_KEYS.x, 300), enemy!.id, POSITION_STAT_KEYS.y, 200);
    expect(compileGame(inside).notes.join(' ')).not.toContain('钳回了场地内');
    expect(authoredPosition(entityOf(inside, enemy!.id))).toEqual({ x: 300, y: 200, clamped: false });
  });

  it('notes 说清这一版有几个位置来自文档，没写坐标时保持老那句话', () => {
    const plain = compileGame(createGame('都没摆过'));
    expect(plain.notes.join(' ')).toContain('位置是投影按类别排在同心环上的');
    let doc = createGame('摆了一个');
    const [enemy] = entitiesOfKind(doc, 'enemy');
    doc = write(doc, enemy!.id, POSITION_STAT_KEYS.x, 300);
    doc = write(doc, enemy!.id, POSITION_STAT_KEYS.y, 200);
    const plan = compileGame(doc);
    expect(plan.notes.join(' ')).toContain('来自文档里写的');
    expect(plan.notes.join(' ')).not.toContain('位置是投影按类别排在同心环上的');
    // 计数读得出来：一个摆过、其余仍走环
    expect(plan.notes.find((n) => n.includes('来自文档里写的'))).toMatch(/有 1 个来自文档里写的/);
  });

  it('玩家写坐标就站在那儿，没写站场地正中；机关写了坐标就不再跟着引用的东西', () => {
    const base = createGame('玩家与机关');
    const player = entitiesOfKind(base, 'player')[0]!;
    const [trigger] = entitiesOfKind(base, 'trigger');
    const [item] = entitiesOfKind(base, 'item');
    let doc = link(base, trigger!.id, item!.id, '触发后播放');
    doc = write(doc, player.id, POSITION_STAT_KEYS.x, 140);
    doc = write(doc, player.id, POSITION_STAT_KEYS.y, 660);
    doc = write(doc, trigger!.id, POSITION_STAT_KEYS.x, 900);
    doc = write(doc, trigger!.id, POSITION_STAT_KEYS.y, 120);
    const plan = compileGame(doc);
    expect({ x: plan.player!.x, y: plan.player!.y }).toEqual({ x: 140, y: 660 });
    const anchored = plan.triggers.find((t) => t.id === trigger!.id)!;
    const placedItem = plan.items.find((i) => i.id === item!.id)!;
    // 作者给机关摆了位置：它不再锚到物品上，但引用关系照旧报得出影响谁
    expect({ x: anchored.x, y: anchored.y }).toEqual({ x: 900, y: 120 });
    expect(anchored.positionIsDesign).toBe(true);
    expect(anchored.affects).toEqual({ id: item!.id, name: item!.name });
    expect({ x: placedItem.x, y: placedItem.y }).not.toEqual({ x: 900, y: 120 });
    // 反向对照：没写坐标的那一份，机关跟着物品、玩家站正中
    const before = compileGame(link(base, trigger!.id, item!.id, '触发后播放'));
    const loose = before.triggers.find((t) => t.id === trigger!.id)!;
    const looseItem = before.items.find((i) => i.id === item!.id)!;
    expect({ x: loose.x, y: loose.y }).toEqual({ x: looseItem.x, y: looseItem.y });
    expect(loose.positionIsDesign).toBe(false);
    expect({ x: before.player!.x, y: before.player!.y }).toEqual({ x: ARENA.width / 2, y: ARENA.height / 2 });
  });

  it('钳位函数按半径钳：贴边的个体不会有一半画在屏幕外', () => {
    expect(clampToArena(-50, ARENA.width, ACTOR_RADIUS)).toBe(ACTOR_RADIUS);
    expect(clampToArena(ARENA.width + 50, ARENA.width, ACTOR_RADIUS)).toBe(ARENA.width - ACTOR_RADIUS);
    expect(clampToArena(600, ARENA.width, ACTOR_RADIUS)).toBe(600);
  });

  it('provenance 的槽位表每个槽都有中文名与兜底读数，且包含 position', () => {
    expect(PLAY_PROVENANCE_SLOTS).toContain('position');
    for (const slot of PLAY_PROVENANCE_SLOTS) {
      expect(PLAY_PROVENANCE_LABELS[slot].length).toBeGreaterThan(0);
      expect(PLAY_PROVENANCE_FALLBACK_TEXT[slot].length).toBeGreaterThan(0);
    }
    // 位置那格的兜底不是一个数而是「排在同心环上」：界面照 this 说，不用另写一套
    expect(PLAY_PROVENANCE_FALLBACK_TEXT.position).toContain('同心环');
    // 反向对照：槽表不是空表，也不是靠手写清单——每个 actor 的 provenance 键与槽表逐字相同
    const plan = compileGame(createGame('槽位'));
    expect(Object.keys(plan.player!.provenance).sort()).toEqual([...PLAY_PROVENANCE_SLOTS].sort());
  });
});
