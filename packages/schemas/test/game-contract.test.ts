import { describe, expect, it } from 'vitest';
import { GameDocumentSchema, GameEntityKindSchema, GameKindSchema, GameSaveRequestSchema } from '../src/index';
import {
  GAME_ENTITY_KINDS,
  GAME_KINDS,
  addEntity,
  createGame,
  linkEntities,
  removeEntity,
  setStat,
  updateEntity,
  validateGame,
} from '@nexus/game-model';

/**
 * 游戏文档的 zod 契约与 @nexus/game-model 不许漂移（边界纪律 6）。
 * 和 world-contract 同一套理由：清单写两遍，就要有一条测试盯着它俩说的是不是同一件事。
 */

describe('游戏文档契约（§54）', () => {
  it('11 类的清单与模型完全一致，顺序也算', () => {
    expect([...GameEntityKindSchema.options]).toEqual([...GAME_ENTITY_KINDS]);
  });

  it('§51 的类型清单与模型完全一致，顺序也算', () => {
    expect([...GameKindSchema.options]).toEqual([...GAME_KINDS]);
  });

  it('类型能往返：客户端写了 kind，解析后还在（这一格加进来前它会被当未知键剥掉）', () => {
    const game = { ...createGame('往返'), kind: 'visual-novel' as const };
    const parsed = GameDocumentSchema.safeParse(game);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.kind).toBe('visual-novel');
  });

  it('老文档（§51 这一格之前存的、以及历史发布版本）没有 kind，按 2d 读而不是 parse 失败', () => {
    const { kind: _dropped, ...legacy } = createGame('老文档');
    const parsed = GameDocumentSchema.safeParse(legacy);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.kind).toBe('2d');
    // 反向对照：不是"缺省值恰好是 2d 所以看不出差别"——写了别的类型就要照原样留下
    const other = GameDocumentSchema.safeParse({ ...legacy, kind: 'puzzle' });
    if (other.success) expect(other.data.kind).toBe('puzzle');
  });

  it('清单之外的类型进不了库，报错落在 kind 这一格', () => {
    const game = { ...createGame('脏类型'), kind: 'open-world' };
    const parsed = GameDocumentSchema.safeParse(game);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0]?.path).toEqual(['kind']);
  });

  it('模型造的文档过得了契约，模板不编内容', () => {
    const game = createGame('星屑航线', 'proj-1');
    const parsed = GameDocumentSchema.safeParse(game);
    expect(parsed.success).toBe(true);
    expect(game.entities).toHaveLength(GAME_ENTITY_KINDS.length);
    // 骨架不是设计：notes / stats / refs 全空，填了才算内容
    expect(
      game.entities.every((e) => e.notes === '' && Object.keys(e.stats).length === 0 && e.refs.length === 0),
    ).toBe(true);
  });

  it('模型改过的文档仍然自洽：加实体、写数值、连引用、删实体', () => {
    let game = createGame('编辑测试');
    game = addEntity(game, { kind: 'weapon', name: '折跃刃' });
    const blade = game.entities.find((e) => e.name === '折跃刃')!;
    const stat = setStat(game, blade.id, 'damage', 34);
    expect(stat.reason).toBeNull();
    game = stat.document;
    expect(GameDocumentSchema.safeParse(game).success).toBe(true);
    const player = game.entities.find((e) => e.kind === 'player')!;
    const linked = linkEntities(game, blade.id, player.id, '装备于');
    expect(linked.reason).toBeNull();
    game = linked.document;
    expect(validateGame(game)).toEqual([]);
    expect(GameDocumentSchema.safeParse(game).success).toBe(true);

    const removed = removeEntity(game, player.id);
    expect(GameDocumentSchema.safeParse(removed).success).toBe(true);
    // 删掉被指向的一方，指向它的引用必须一起消失，否则契约里就留着悬空端点
    expect(removed.entities.flatMap((e) => e.refs.map((r) => r.to))).not.toContain(player.id);
  });

  it('模型拒收的数值，契约同样拒收：两边对 NaN 的口径要一致', () => {
    const game = createGame('数值口径');
    const target = game.entities[0]!;
    expect(setStat(game, target.id, 'damage', Number.NaN).reason).toContain('有限数');
    expect(GameSaveRequestSchema.safeParse({
      document: { ...game, entities: [{ ...target, stats: { damage: Number.NaN } }] },
    }).success).toBe(false);
  });

  it('脏数据进不了库：未知类型、空白名、非有限数值、超长引用表都被拒', () => {
    const game = createGame('脏数据');
    const first = game.entities[0]!;
    const bad = (patch: Record<string, unknown>) =>
      GameSaveRequestSchema.safeParse({ document: { ...game, entities: [{ ...first, ...patch }, ...game.entities.slice(1)] } }).success;
    expect(bad({ kind: 'vibes' })).toBe(false);
    expect(bad({ name: '  ' })).toBe(false);
    expect(bad({ stats: { damage: Number.NaN } })).toBe(false);
    expect(bad({ stats: { damage: Number.POSITIVE_INFINITY } })).toBe(false);
    expect(bad({ stats: { damage: '34' } })).toBe(false);
    expect(bad({ stats: { '  ': 1 } })).toBe(false);
    expect(bad({ refs: [{ id: 'r1', to: 'ghost', role: 'x'.repeat(121) }] })).toBe(false);
    expect(GameSaveRequestSchema.safeParse({ document: { ...game, name: '' } }).success).toBe(false);
    // 正常写法仍然过：契约不该顺手把合法文档挡了
    expect(bad({ notes: '一把会自己找脖子的刀' })).toBe(true);
    expect(updateEntity(game, first.id, { name: '玩家二号' }).entities[0]!.name).toBe('玩家二号');
  });
});
