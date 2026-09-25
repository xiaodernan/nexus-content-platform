import { describe, expect, it } from "vitest";
import {
  ACTOR_RADIUS,
  ARENA,
  PLAY_DEFAULTS,
  addEntity,
  compileGame,
  createGame,
  entitiesOfKind,
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
    expect(t.why).toContain('不是敌人也不是物品');
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
