import { describe, expect, it } from 'vitest';
import {
  addEntity,
  countRefsFor,
  createGame,
  entitiesOfKind,
  findEntity,
  fleshedOutCount,
  GAME_ENTITY_KINDS,
  GAME_ENTITY_LABELS,
  gameCounts,
  isGameEntityKind,
  isUsableStatValue,
  linkEntities,
  referenceGraph,
  removeEntity,
  removeRef,
  removeStat,
  setStat,
  STAT_HINTS,
  updateEntity,
  validateGame,
  type GameDocument,
} from '@nexus/game-model';

/**
 * §54 的 11 类实体、模板骨架、引用完整性与投影。
 * 这些都是纯函数，所以先把"确定性"和"不编内容"这两条钉死。
 */

function entityNamed(document: GameDocument, name: string) {
  const entity = document.entities.find((e) => e.name === name);
  if (!entity) throw new Error(`模板里没有实体 ${name}`);
  return entity;
}

describe('§54 的 11 类实体', () => {
  it('类清单与中文名一一对应，没有漏译或多译', () => {
    expect(GAME_ENTITY_KINDS).toHaveLength(11);
    expect(Object.keys(GAME_ENTITY_LABELS).sort()).toEqual([...GAME_ENTITY_KINDS].sort());
    expect(Object.keys(STAT_HINTS).sort()).toEqual([...GAME_ENTITY_KINDS].sort());
  });

  it('原文列出的 11 类一个不少', () => {
    // 照 §54 原文逐字核对，防止"改着改着少了一类"
    for (const kind of [
      'player',
      'enemy',
      'weapon',
      'item',
      'quest',
      'dialogue',
      'trigger',
      'npc',
      'camera',
      'animation',
      'particle',
    ]) {
      expect(isGameEntityKind(kind)).toBe(true);
    }
    expect(isGameEntityKind('boss')).toBe(false);
    expect(isGameEntityKind(42)).toBe(false);
  });
});

describe('createGame 模板骨架', () => {
  it('11 类各一个空实体，名字就是类名', () => {
    const game = createGame('低语诸王的战斗');
    expect(game.entities).toHaveLength(11);
    expect(gameCounts(game)).toEqual(Object.fromEntries(GAME_ENTITY_KINDS.map((k) => [k, 1])));
    for (const kind of GAME_ENTITY_KINDS) {
      const found = entitiesOfKind(game, kind);
      expect(found).toHaveLength(1);
      expect(found[0]!.name).toBe(GAME_ENTITY_LABELS[kind]);
    }
  });

  it('不编内容：说明、数值、引用、标签一律为空（§159 不许假生成）', () => {
    const game = createGame('空骨架');
    for (const entity of game.entities) {
      expect(entity.notes).toBe('');
      expect(entity.stats).toEqual({});
      expect(entity.refs).toEqual([]);
      expect(entity.tags).toEqual([]);
    }
    expect(game.summary).toBe('');
    // 没有任何实体是"填过内容"的
    expect(fleshedOutCount(game)).toBe(0);
  });

  it('没有名字时给一个明确的占位，而不是空串', () => {
    expect(createGame('   ').name).toBe('未命名游戏');
    expect(createGame('  龙   ').name).toBe('龙');
  });

  it('骨架本身是合法的', () => {
    expect(validateGame(createGame('干净的骨架'))).toEqual([]);
  });
});

describe('CRUD 是不可变更新', () => {
  it('addEntity 返回新文档，原文档不动', () => {
    const before = createGame('g');
    const after = addEntity(before, { kind: 'enemy', name: '守钟人' });
    expect(before.entities).toHaveLength(11);
    expect(after.entities).toHaveLength(12);
    expect(before.entities).not.toBe(after.entities);
    expect(after.entities.some((e) => e.name === '守钟人')).toBe(true);
  });

  it('addEntity 不给名字时退回类名', () => {
    const after = addEntity(createGame('g'), { kind: 'weapon' });
    const added = after.entities[after.entities.length - 1]!;
    expect(added.name).toBe(GAME_ENTITY_LABELS.weapon);
  });

  it('updateEntity 改名字/说明/标签/类，且不动原文档', () => {
    const before = createGame('g');
    const target = entityNamed(before, '敌人');
    const after = updateEntity(before, target.id, { name: '苍雪卫', notes: '慢，但一下能打死人', tags: ['精英'] });
    expect(entityNamed(before, '敌人').notes).toBe('');
    const updated = findEntity(after, target.id)!;
    expect(updated.name).toBe('苍雪卫');
    expect(updated.notes).toBe('慢，但一下能打死人');
    expect(updated.tags).toEqual(['精英']);
    expect(updated.kind).toBe('enemy');
  });

  it('updateEntity 找不到目标时原样返回，不谎报改动', () => {
    const before = createGame('g');
    expect(updateEntity(before, '不存在', { name: 'x' })).toBe(before);
  });

  it('tags 是复制进去的，外部数组后续改动不会渗进文档', () => {
    const game = createGame('g');
    const player = entityNamed(game, '玩家');
    const tags = ['a'];
    const after = updateEntity(game, player.id, { tags });
    tags.push('b');
    expect(findEntity(after, player.id)!.tags).toEqual(['a']);
  });
});

describe('数值（stats）', () => {
  it('写入有限数成功', () => {
    const game = createGame('g');
    const target = entityNamed(game, '敌人');
    const { document, reason } = setStat(game, target.id, 'health', 320);
    expect(reason).toBeNull();
    expect(findEntity(document, target.id)!.stats).toEqual({ health: 320 });
    expect(findEntity(game, target.id)!.stats).toEqual({});
  });

  it('NaN / Infinity / 字符串 / 布尔都被拒，且文档不变', () => {
    const game = createGame('g');
    const target = entityNamed(game, '敌人');
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '100', true, null]) {
      const { document, reason } = setStat(game, target.id, 'health', bad);
      expect(document).toBe(game);
      expect(reason).toMatch(/有限数/);
    }
  });

  it('空键名被拒', () => {
    const game = createGame('g');
    const { document, reason } = setStat(game, entityNamed(game, '敌人').id, '   ', 1);
    expect(document).toBe(game);
    expect(reason).toMatch(/键名/);
  });

  it('实体不存在时不写，并说清原因', () => {
    const game = createGame('g');
    const { document, reason } = setStat(game, '不存在', 'health', 1);
    expect(document).toBe(game);
    expect(reason).toMatch(/不在文档里/);
  });

  it('键名两侧空白被裁掉；0 与负数都是合法有限数', () => {
    const game = createGame('g');
    const id = entityNamed(game, '粒子').id;
    const a = setStat(game, id, '  lifetime  ', 0).document;
    const b = setStat(a, id, 'drag', -0.5).document;
    expect(findEntity(b, id)!.stats).toEqual({ lifetime: 0, drag: -0.5 });
  });

  it('removeStat 摘掉一个键，其他键留着', () => {
    const game = createGame('g');
    const id = entityNamed(game, '敌人').id;
    const withStats = setStat(setStat(game, id, 'health', 100).document, id, 'speed', 3).document;
    const after = removeStat(withStats, id, 'health');
    expect(findEntity(after, id)!.stats).toEqual({ speed: 3 });
    // 不存在的键：原样返回
    expect(removeStat(after, id, 'health')).toBe(after);
  });

  it('isUsableStatValue 只认有限数', () => {
    expect(isUsableStatValue(0)).toBe(true);
    expect(isUsableStatValue(-1.5)).toBe(true);
    expect(isUsableStatValue(Number.NaN)).toBe(false);
    expect(isUsableStatValue(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isUsableStatValue('1')).toBe(false);
  });
});

describe('实体之间的引用', () => {
  function linked() {
    const game = createGame('g');
    const weapon = entityNamed(game, '武器');
    const player = entityNamed(game, '玩家');
    const { document, reason } = linkEntities(game, weapon.id, player.id, '装备于');
    expect(reason).toBeNull();
    return { game, document, weapon, player };
  }

  it('连一条有向引用', () => {
    const { document, weapon, player } = linked();
    const refs = findEntity(document, weapon.id)!.refs;
    expect(refs).toHaveLength(1);
    expect(refs[0]!.to).toBe(player.id);
    expect(refs[0]!.role).toBe('装备于');
    // 方向性：被指向的一方不该凭空多出一条出边
    expect(findEntity(document, player.id)!.refs).toEqual([]);
  });

  it('不能自己指自己', () => {
    const game = createGame('g');
    const id = entityNamed(game, '玩家').id;
    const { document, reason } = linkEntities(game, id, id, '自指');
    expect(document).toBe(game);
    expect(reason).toMatch(/不能自己指向自己/);
  });

  it('端点不存在时不连', () => {
    const game = createGame('g');
    const id = entityNamed(game, '玩家').id;
    expect(linkEntities(game, id, '不存在').reason).toMatch(/端点不在这个文档里/);
    expect(linkEntities(game, '不存在', id).reason).toMatch(/端点不在这个文档里/);
  });

  it('同一对之间同样的关系不重复连', () => {
    const { document, weapon, player } = linked();
    const again = linkEntities(document, weapon.id, player.id, '装备于');
    expect(again.document).toBe(document);
    expect(again.reason).toMatch(/已经这样引用着/);
  });

  it('同一对之间可以有多条不同关系，并按引用 id 单独摘除', () => {
    const { document, weapon, player } = linked();
    const second = linkEntities(document, weapon.id, player.id, '由玩家挥动').document;
    expect(findEntity(second, weapon.id)!.refs).toHaveLength(2);
    const firstRef = findEntity(second, weapon.id)!.refs[0]!;
    const after = removeRef(second, weapon.id, firstRef.id);
    const refs = findEntity(after, weapon.id)!.refs;
    expect(refs).toHaveLength(1);
    expect(refs[0]!.role).toBe('由玩家挥动');
  });

  it('删实体时两头都清：自己发出的引用没了，别人指向它的引用也摘掉', () => {
    const game = createGame('g');
    const weapon = entityNamed(game, '武器');
    const player = entityNamed(game, '玩家');
    const npc = entityNamed(game, 'NPC');
    // weapon → player，npc → player
    let document = linkEntities(game, weapon.id, player.id, '装备于').document;
    document = linkEntities(document, npc.id, player.id, '对话对象').document;
    expect(countRefsFor(document, player.id)).toBe(2);

    const after = removeEntity(document, player.id);
    expect(findEntity(after, player.id)).toBeUndefined();
    // 出边随武器自己留着（武器还在），入边必须被摘掉
    expect(findEntity(after, weapon.id)!.refs).toEqual([]);
    expect(findEntity(after, npc.id)!.refs).toEqual([]);
    expect(validateGame(after)).toEqual([]);
  });

  it('删实体也带走它自己发出的引用', () => {
    const { document, weapon, player } = linked();
    const after = removeEntity(document, weapon.id);
    expect(after.entities.some((e) => e.id === weapon.id)).toBe(false);
    // 玩家本来没有出边，删掉武器后仍然没有
    expect(findEntity(after, player.id)!.refs).toEqual([]);
    expect(validateGame(after)).toEqual([]);
  });

  it('删不存在的实体原样返回', () => {
    const game = createGame('g');
    expect(removeEntity(game, '不存在')).toBe(game);
  });

  it('摘掉入边时，被改动的实体时间戳跟着更新（面板不该显示旧时间）', () => {
    const game = createGame('g');
    const weapon = entityNamed(game, '武器');
    const player = entityNamed(game, '玩家');
    const linked = linkEntities(game, weapon.id, player.id, '装备于').document;
    const before = findEntity(linked, weapon.id)!.updatedAt;
    // 把时间戳人为压旧，避免同毫秒内看不出差别
    const aged: GameDocument = {
      ...linked,
      entities: linked.entities.map((e) => (e.id === weapon.id ? { ...e, updatedAt: '2020-01-01T00:00:00.000Z' } : e)),
    };
    expect(findEntity(aged, weapon.id)!.updatedAt).toBe('2020-01-01T00:00:00.000Z');
    const after = removeEntity(aged, player.id);
    const updated = findEntity(after, weapon.id)!;
    expect(updated.refs).toEqual([]);
    expect(updated.updatedAt).not.toBe('2020-01-01T00:00:00.000Z');
    expect(Number.isNaN(Date.parse(updated.updatedAt))).toBe(false);
    expect(updated.updatedAt >= before).toBe(true);
  });

  it('countRefsFor 数出边与入边之和', () => {
    const { document, weapon, player } = linked();
    expect(countRefsFor(document, weapon.id)).toBe(1);
    expect(countRefsFor(document, player.id)).toBe(1);
    expect(countRefsFor(document, entityNamed(document, '粒子').id)).toBe(0);
  });
});

describe('validateGame', () => {
  it('干净的骨架没有 issue', () => {
    expect(validateGame(createGame('g'))).toEqual([]);
  });

  it('非对象直接报出来', () => {
    expect(validateGame(null as unknown as GameDocument)[0]!.code).toBe('missing-name');
  });

  it('没有名字 / 实体没名字', () => {
    const game = createGame('g');
    const broken: GameDocument = { ...game, name: '  ' };
    expect(validateGame(broken).some((i) => i.code === 'missing-name')).toBe(true);

    const id = entityNamed(game, '敌人').id;
    const emptyName = updateEntity(game, id, { name: '' });
    const issues = validateGame(emptyName);
    expect(issues.some((i) => i.code === 'empty-name' && i.entityId === id)).toBe(true);
  });

  it('类不在 11 类之内 / id 重复 / 时间非法', () => {
    const game = createGame('g');
    const bad = {
      ...game,
      entities: [
        { ...game.entities[0]!, kind: 'boss' as never },
        { ...game.entities[1]!, id: game.entities[0]!.id },
        { ...game.entities[2]!, updatedAt: '不是时间' },
      ],
    } as GameDocument;
    const codes = validateGame(bad).map((i) => i.code);
    expect(codes).toContain('bad-kind');
    expect(codes).toContain('duplicate-id');
    expect(codes).toContain('bad-timestamp');
  });

  it('数值非法（含 NaN）会被报出来，且消息里带实体名与键名', () => {
    const game = createGame('g');
    const id = entityNamed(game, '敌人').id;
    const broken: GameDocument = {
      ...game,
      entities: game.entities.map((e) => (e.id === id ? { ...e, stats: { health: Number.NaN } } : e)),
    };
    const issues = validateGame(broken);
    const hit = issues.find((i) => i.code === 'bad-stat')!;
    expect(hit.entityId).toBe(id);
    expect(hit.message).toContain('health');
    expect(hit.message).toContain('敌人');
  });

  it('自引用 / 悬空引用 / 重复引用', () => {
    const game = createGame('g');
    const player = entityNamed(game, '玩家');
    const broken: GameDocument = {
      ...game,
      entities: game.entities.map((e) =>
        e.id === player.id
          ? {
              ...e,
              refs: [
                { id: 'r1', to: player.id, role: '自指' },
                { id: 'r2', to: '不存在的实体', role: '悬空' },
                { id: 'r3', to: entityNamed(game, '敌人').id, role: '敌对' },
                { id: 'r4', to: entityNamed(game, '敌人').id, role: '敌对' },
              ],
            }
          : e,
      ),
    };
    const codes = validateGame(broken).map((i) => i.code);
    expect(codes).toContain('self-ref');
    expect(codes).toContain('missing-ref-target');
    expect(codes).toContain('duplicate-ref');
  });

  it('同一条引用在 role 不同时不算重复', () => {
    const { document } = (() => {
      const game = createGame('g');
      const weapon = entityNamed(game, '武器');
      const player = entityNamed(game, '玩家');
      let doc = linkEntities(game, weapon.id, player.id, '装备于').document;
      doc = linkEntities(doc, weapon.id, player.id, '由玩家挥动').document;
      return { document: doc };
    })();
    expect(validateGame(document)).toEqual([]);
  });
});

describe('投影', () => {
  it('referenceGraph 丢掉指向已删实体的边，但校验仍报得出来', () => {
    const game = createGame('g');
    const weapon = entityNamed(game, '武器');
    const player = entityNamed(game, '玩家');
    const withRef = linkEntities(game, weapon.id, player.id, '装备于').document;
    // 绕过 removeEntity 直接造一条悬空引用，模拟"库里的旧数据"
    const dangling: GameDocument = {
      ...withRef,
      entities: withRef.entities.map((e) =>
        e.id === weapon.id ? { ...e, refs: [...e.refs, { id: 'ghost', to: '已删除', role: '' }] } : e,
      ),
    };
    expect(referenceGraph(dangling).edges).toHaveLength(1);
    expect(validateGame(dangling).some((i) => i.code === 'missing-ref-target')).toBe(true);
  });

  it('referenceGraph 的节点带上已填数值个数', () => {
    const game = createGame('g');
    const id = entityNamed(game, '敌人').id;
    const withStats = setStat(setStat(game, id, 'health', 100).document, id, 'speed', 2).document;
    const node = referenceGraph(withStats).nodes.find((n) => n.id === id)!;
    expect(node.statCount).toBe(2);
    expect(node.kind).toBe('enemy');
  });

  it('gameCounts 覆盖全部 11 类，缺的补 0', () => {
    const game = createGame('g');
    const after = removeEntity(game, entityNamed(game, '粒子').id);
    const counts = gameCounts(after);
    expect(counts.particle).toBe(0);
    expect(Object.keys(counts)).toHaveLength(11);
  });

  it('fleshedOutCount 只数真的填过说明或数值的实体', () => {
    const game = createGame('g');
    const a = entityNamed(game, '敌人').id;
    const b = entityNamed(game, '任务').id;
    let doc = setStat(game, a, 'health', 1).document;
    doc = updateEntity(doc, b, { notes: '主线' });
    expect(fleshedOutCount(doc)).toBe(2);
    // 只改名字不算"填过内容"
    doc = updateEntity(doc, entityNamed(doc, '镜头').id, { name: '过肩' });
    expect(fleshedOutCount(doc)).toBe(2);
  });
});
