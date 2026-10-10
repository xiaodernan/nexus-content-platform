import { describe, expect, it } from 'vitest';
import {
  compileRpg,
  fleshedOutCount,
  gameCounts,
  playtestRpg,
  validateGame,
  xpToNext,
  type GameEntityKind,
} from '@nexus/game-model';
import {
  GAME_DRAFT_FALLBACK_NAME,
  GAME_DRAFT_NAME_MAX,
  GAME_DRAFT_NOT_LANDED_NOTE,
  GAME_DRAFT_SEED,
  GAME_DRAFT_SPEC,
  GAME_DRAFT_SUMMARY,
  draftNameFromGoal,
  fnv1a,
  gameDraft,
} from '../src/lib/agent-game-draft';

/**
 * §52 Game Agent 那份**确定性草稿**的纯层测试。
 *
 * 这一片要证明的主张只有两条，都不需要库：
 * 1. **它是配方不是理解**（§159/§160）：目标文本不许动任何一个数值——所以这里把两份
 *    截然不同目标的草稿逐字节比过（去掉标题之后），它们必须完全相同。
 * 2. **它是可玩的**（§50/§51）：`compileRpg` 说得出这条循环跑得起，而且说明里写的那些算术
 *    （两刀一个敌人、22 点经验够升到 2 级）真的成立。说明与数值不一致时这一片会红，
 *    而不是让"三刀才倒"这种句子留在文字里骗人。
 *
 * 确定性单列一组：草稿要随步骤结论存进任务行、刷新后复看、再被接受写库，
 * id 一旦来自时钟或随机数，"库里这一份是不是那一次跑出来的那一份"就没有答案了。
 */

const AT = '2026-10-10T00:00:00.000Z';

const draft = (goal: string, seed?: string) => gameDraft({ goal, at: AT, ...(seed ? { seed } : {}) });

describe('§52 草稿是配方给的，不是理解出来的', () => {
  it('目标文本只改标题：两份不同目标的草稿去掉名字之后逐字节相同', () => {
    const a = draft('做一个哥特风 boss 战原型');
    const b = draft('给儿童做的寻宝小游戏');
    // 这条断言就是"不许假 AI"的那一寸：如果哪天有人把 goal 喂进数值选择，这里立刻红
    expect({ ...b, name: a.name }).toEqual(a);
  });

  it('标题来自目标：压掉换行与连续空白、截到 schema 上限、空目标给兜底名', () => {
    expect(draftNameFromGoal('  上架前\n检查   一个\t寻宝  ')).toBe('上架前 检查 一个 寻宝'.replace(/\s+/g, ' '));
    expect(draftNameFromGoal('')).toBe(GAME_DRAFT_FALLBACK_NAME);
    expect(draftNameFromGoal('   ')).toBe(GAME_DRAFT_FALLBACK_NAME);
    const long = '洞'.repeat(GAME_DRAFT_NAME_MAX + 40);
    expect(draftNameFromGoal(long)).toHaveLength(GAME_DRAFT_NAME_MAX);
    // 截断必须发生在 schema 之前：过长的名字进 zod 会变成一次写库失败，那不该由用户的目标文本触发
    expect(validateGame(draft(long))).toEqual([]);
  });

  it('summary 自己承认是确定性配方，并说清还没有写进项目', () => {
    expect(GAME_DRAFT_SUMMARY).toContain('确定性配方');
    expect(GAME_DRAFT_SUMMARY).toContain('没有真 provider');
    expect(GAME_DRAFT_NOT_LANDED_NOTE).toContain('还没有写进项目');
    // 界面上不许出现"已生成/已可试玩"那种把草稿说成产物的措辞
    for (const phrase of ['已生成', '可直接试玩', '已可在 Game Studio']) {
      expect(`${GAME_DRAFT_SUMMARY}${GAME_DRAFT_NOT_LANDED_NOTE}`).not.toContain(phrase);
    }
  });

  it('默认不属于任何项目：存在任务行里的产物与项目真值是两件事', () => {
    expect(draft('寻宝').projectId).toBeNull();
    expect(draft('寻宝', 'task-1').projectId).toBeNull();
    expect(gameDraft({ goal: '寻宝', at: AT, projectId: 'p_1' }).projectId).toBe('p_1');
  });
});

describe('§52 草稿的确定性', () => {
  it('同一入参两次调用逐字节相同（id 不来自时钟也不来自随机数）', () => {
    expect(JSON.stringify(draft('寻宝', 'task-9'))).toBe(JSON.stringify(draft('寻宝', 'task-9')));
  });

  it('换时间戳不动 id，只动时间字段；换种子才换 id', () => {
    const at = gameDraft({ goal: '寻宝', at: '2020-01-01T00:00:00.000Z', seed: 'task-9' });
    const later = gameDraft({ goal: '寻宝', at: AT, seed: 'task-9' });
    expect(at.entities.map((e) => e.id)).toEqual(later.entities.map((e) => e.id));
    expect(at.id).toBe(later.id);
    expect(later.updatedAt).toBe(AT);
    expect(later.entities.every((e) => e.updatedAt === AT)).toBe(true);
    // 另一条作业（另一个 seed）必须给出另一套 id：否则两条任务的草稿在库里分不开
    expect(gameDraft({ goal: '寻宝', at: AT, seed: 'task-10' }).id).not.toBe(later.id);
  });

  it('缺省种子是常量，且散列稳定', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('abc')).toBe(fnv1a('abc'));
    expect(fnv1a('abc')).not.toBe(fnv1a('abd'));
    expect(gameDraft({ goal: '寻宝', at: AT }).id).toBe(`game_${fnv1a(`${GAME_DRAFT_SEED}#document`).toString(16).padStart(8, '0').slice(0, 8)}`);
  });
});

describe('§52 草稿的结构与可玩性', () => {
  const doc = draft('上架前检查');

  it('结构校验一条问题都没有（引用不悬空、名字不空、时间戳合法）', () => {
    expect(validateGame(doc)).toEqual([]);
  });

  it('八个实体各就各位，每类数量来自同一张表', () => {
    const counts = gameCounts(doc);
    const expected: Partial<Record<GameEntityKind, number>> = {
      player: 1,
      enemy: 2,
      weapon: 1,
      item: 1,
      quest: 1,
      trigger: 1,
      npc: 1,
    };
    for (const [kind, value] of Object.entries(expected)) {
      expect(counts[kind as GameEntityKind]).toBe(value);
    }
    expect(doc.entities).toHaveLength(GAME_DRAFT_SPEC.length);
    // §54 的 11 类里剩下那三类（对话/镜头/动画/粒子）不参与判定，这里刻意不放：
    // 放了就是拿模板名字冒充内容
    expect(counts.dialogue ?? 0).toBe(0);
    expect(counts.camera ?? 0).toBe(0);
  });

  it('没有一个实体是"只有名字的模板"：说明与数值都填了', () => {
    expect(fleshedOutCount(doc)).toBe(doc.entities.length);
    expect(doc.entities.every((e) => e.notes.trim().length > 0)).toBe(true);
    expect(doc.entities.every((e) => Object.keys(e.stats).length > 0)).toBe(true);
  });

  it('引用指对了方向：武器到玩家、任务到两个敌人与洞口', () => {
    const byId = new Map(doc.entities.map((e) => [e.id, e.name]));
    const weapon = doc.entities.find((e) => e.kind === 'weapon')!;
    const quest = doc.entities.find((e) => e.kind === 'quest')!;
    const trigger = doc.entities.find((e) => e.kind === 'trigger')!;
    expect(weapon.refs.map((r) => byId.get(r.to))).toEqual(['主角']);
    expect(quest.refs.map((r) => byId.get(r.to))).toEqual(['巡逻兵', '洞口守卫', '洞口']);
    expect(trigger.refs.map((r) => byId.get(r.to))).toEqual(['药包']);
  });

  it('compileRpg 说这条循环能跑：有玩家、无敌对牵连、任务可判定', () => {
    const plan = compileRpg(doc);
    expect(plan.playable).toBe(true);
    expect(plan.blockers).toEqual([]);
    expect(plan.base.quests.every((q) => q.judgeable)).toBe(true);
    expect(plan.base.quests[0]!.goals.map((g) => g.kind)).toEqual(['defeat', 'defeat', 'activate']);
    // 通关条件只有一条任务，且它引用了 3 个对象
    expect(plan.base.quests).toHaveLength(1);
  });

  it('伤害来源是武器而不是玩家自己：provenance 必须是 design', () => {
    const plan = compileRpg(doc);
    const player = plan.base.player!;
    expect(player.damage).toBe(2);
    expect(player.provenance.damage).toBe('design');
    expect(player.reach).toBe(40);
    expect(player.reachIsDesign).toBe(true);
  });

  it('两个敌人的经验都是作者写的（没有兜底），合起来跨过升到 2 级那条线', () => {
    const plan = compileRpg(doc);
    expect(plan.enemyXp).toHaveLength(2);
    expect(plan.enemyXp.every((e) => e.from === 'design')).toBe(true);
    const total = plan.enemyXp.reduce((sum, e) => sum + e.xp, 0);
    expect(total).toBe(22);
    // 说明里那句"刚好跨过 20 点的线"要真成立，否则等级门会把通关锁死。
    // 比的是升到 2 级那一条（xpToNext(plan, 1) = 20），不是 2 到 3 级那一条（35）
    expect(xpToNext(plan, 1)).toBe(20);
    expect(total).toBeGreaterThanOrEqual(xpToNext(plan, 1));
    expect(total).toBeLessThan(xpToNext(plan, 1) + xpToNext(plan, 2));
    expect(plan.quests[0]!.requiredLevel).toBe(2);
    expect(plan.quests[0]!.xpReward).toBe(12);
  });

  it('说明里写下的算术与数值一致：两刀一个巡逻兵、三刀一个守卫', () => {
    const plan = compileRpg(doc);
    const damage = plan.base.player!.damage;
    const hits = (name: string) => {
      const enemy = plan.base.enemies.find((e) => e.name === name)!;
      return Math.ceil(enemy.health / damage);
    };
    expect(damage).toBe(2);
    expect(hits('巡逻兵')).toBe(2);
    expect(hits('洞口守卫')).toBe(3);
    // 玩家 5 点血、守卫每下 2 点：挨三下就死，这是"先升级再打守卫"这句说明的依据
    expect(plan.base.player!.health).toBe(5);
    expect(plan.base.enemies.find((e) => e.name === '洞口守卫')!.damage).toBe(2);
  });

  it('没有实体被标成未设计的模板（试玩时不会说"这些是模板名字"）', () => {
    const plan = compileRpg(doc);
    const actors = [plan.base.player, ...plan.base.enemies, ...plan.base.items, ...plan.base.npcs].filter(
      (actor): actor is NonNullable<typeof actor> => actor !== null,
    );
    expect(actors.length).toBeGreaterThan(0);
    expect(actors.every((actor) => actor.template === false)).toBe(true);
    expect(plan.notes.some((note) => note.includes('只是 §54 预置的模板名字'))).toBe(false);
  });

  it('触发器的半径与任务的等级门都来自作者写的数（不是投影兜底）', () => {
    const plan = compileRpg(doc);
    expect(plan.base.triggers).toHaveLength(1);
    expect(plan.base.triggers[0]!.radiusIsDesign).toBe(true);
    expect(plan.base.triggers[0]!.affects?.name).toBe('药包');
  });

  it('配方表自己不能有指向表外槽位的引用（改坏时要在生成这一处炸）', () => {
    expect(() => gameDraft({ goal: 'x', at: AT })).not.toThrow();
    // 这条测试是对上一条的反向控制：槽位名写错时，抛出的那句话点名槽位，
    // 而不是留一份悬空引用进库
    const slots = new Set(GAME_DRAFT_SPEC.map((s) => s.slot));
    for (const spec of GAME_DRAFT_SPEC) {
      for (const ref of spec.refs ?? []) expect(slots.has(ref.slot)).toBe(true);
    }
  });

  it('四种脚本走法真跑过一遍：等级门是走得过的门，不是锁', () => {
    // 这一条是整片里唯一"跑过"的证据：`playtestRpg` 走的是 `rpgStep`，与 HUD、手动试玩同一个函数。
    // 上面那些算术（22 点经验、要 20 点才够 2 级）在这里变成"真有一位走法升到了 2 级并交了任务"。
    const report = playtestRpg(compileRpg(draft('上架前检查')));
    const beeline = report.runs.find((run) => run.policy === 'beeline')!;
    expect(beeline.status).toBe('won');
    expect(beeline.level).toBe(2);
    expect(beeline.questsDone).toBe(1);
    expect(beeline.gatedPassed).toEqual(['清场后打开洞口']);
    // 站着不动与一路逃跑的两种不该通关：它们没打过敌人，等级门因此把任务扣住
    expect(report.runs.find((run) => run.policy === 'idle')!.status).toBe('playing');
    expect(report.runs.find((run) => run.policy === 'flee')!.questsDone).toBe(0);
    // 报告里那句"没门可过"的发现不许出现——它一旦出现就说明等级门被写成了死锁
    expect(report.findings.some((line) => line.includes('一次都没过门'))).toBe(false);
    expect(report.winnableBy).toBeGreaterThanOrEqual(1);
  });
});
