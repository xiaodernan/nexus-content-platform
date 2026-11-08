import {
  createGame,
  addEntity,
  updateEntity,
  setStat,
  removeStat,
  removeEntity,
  countRefsFor,
  linkEntities,
  removeRef,
  validateGame,
  gameCounts,
  referenceGraph,
  fleshedOutCount,
  isGameKind,
  isGameEntityKind,
  isUsableStatValue,
  pipelineOfKind,
  GAME_ENTITY_KINDS,
} from '../../packages/game-model/src/index.ts';
import { EvalRecorder } from '../lib/recorder.ts';
import type { EvalSuite } from '../types.ts';
import type { GameDocument, GameRef } from '../../packages/game-model/src/index.ts';

/**
 * §54 / §51 · 游戏设计系统投影自洽——"建游戏 → 11 类骨架 → 填实体/数值 → 连引用 →
 * 校验 → 投影成引用图 / 管线分派"整条确定链。
 *
 * 与 world-build 同一条理由进 eval：单测断**点**，这条钉**面**——
 *   1. 建游戏给的是**骨架**而非内容（说明/数值一律空，不替用户做平衡，§159 不许假生成）；
 *   2. 删实体**两头清引用**（自己发出的 + 别人指向它的入边，否则留一地悬空引用）；
 *   3. 数值只收有限数（NaN/Infinity 被门禁挡下）、键名非空；
 *   4. 引用门禁（不自指 / 不悬空 / 不重复）与 validateGame 的缺陷码同源；
 *   5. `pipelineOfKind` 单点分派（§16：同一份模型不许有两个出口）、`referenceGraph` 删点后对应边自然消失；
 *   6. 类型判定 `isGameKind`/`isGameEntityKind`/`isUsableStatValue` 边界正确。
 * 这种"链级"不变式单测网罩不到；破了，试玩页会显示出一份对不上文档的设计。
 */
export const gameBuildSuite: EvalSuite = {
  name: 'game-build',
  dimension: '代码正确性 / 游戏设计系统投影自洽（§54/§51）',
  needsDatabase: false,

  run() {
    const rec = new EvalRecorder();
    console.log('\n== 游戏设计系统投影自洽（§54/§51）· 建游戏→11 类骨架→实体/数值→引用→校验→引用图/管线分派 ==');

    // 1. 建游戏给骨架：11 类各一条、名字即类名、数值空、kind 默认 2d
    {
      const g = createGame('魂系 Boss 战原型');
      const kindsOk = g.entities.length === GAME_ENTITY_KINDS.length && GAME_ENTITY_KINDS.every((k) => g.entities.some((e) => e.kind === k));
      const emptyStats = g.entities.every((e) => Object.keys(e.stats).length === 0);
      rec.structural('createGame：11 类骨架各一条', kindsOk, `${g.entities.length}/${GAME_ENTITY_KINDS.length}`);
      rec.structural('createGame：数值一律空（骨架非内容，不假生成）', emptyStats, emptyStats ? 'all-empty' : 'HAS-STATS');
      rec.structural('createGame：kind 默认 2d', g.kind === '2d', g.kind);
    }

    // 2. 增 / 改实体
    {
      const g = createGame('增删');
      const added = addEntity(g, { kind: 'enemy', name: 'Boss' });
      rec.structural('addEntity：实体 +1', added.entities.length === g.entities.length + 1, `${added.entities.length}`);
      const last = added.entities[added.entities.length - 1]!;
      const updated = updateEntity(added, last.id, { notes: '会二阶段变身' });
      rec.structural('updateEntity：说明更新', updated.entities.find((e) => e.id === last.id)?.notes === '会二阶段变身', 'notes updated');
    }

    // 3. 数值写入纪律：有限数写入、NaN/Infinity/字符串/空键/实体不存在拒绝
    {
      const g = createGame('数值');
      const e = g.entities[0]!;
      const ok = setStat(g, e.id, 'hp', 100);
      rec.structural('setStat：有限数写入', ok.reason === null && ok.document.entities.find((x) => x.id === e.id)?.stats.hp === 100, String(ok.reason));
      const nan = setStat(g, e.id, 'hp', Number.NaN);
      rec.structural('setStat：NaN 拒绝', nan.reason !== null, String(nan.reason));
      const inf = setStat(g, e.id, 'hp', Number.POSITIVE_INFINITY);
      rec.structural('setStat：Infinity 拒绝', inf.reason !== null, String(inf.reason));
      const str = setStat(g, e.id, 'hp', '100');
      rec.structural('setStat：非数拒绝', str.reason !== null, String(str.reason));
      const emptyKey = setStat(g, e.id, '', 1);
      rec.structural('setStat：空键名拒绝', emptyKey.reason !== null, String(emptyKey.reason));
      const ghost = setStat(g, 'ghost', 'hp', 1);
      rec.structural('setStat：实体不存在拒绝', ghost.reason !== null, String(ghost.reason));
      const dropped = removeStat(ok.document, e.id, 'hp');
      rec.structural('removeStat：键被摘掉', (dropped.entities.find((x) => x.id === e.id)?.stats.hp) === undefined, 'stat removed');
    }

    // 4. 引用门禁
    {
      const g = createGame('引用门禁');
      const x = g.entities[0]!;
      const y = g.entities[1]!;
      const self = linkEntities(g, x.id, x.id);
      rec.structural('linkEntities：拒绝自指', self.reason !== null && self.document.entities.find((e) => e.id === x.id)!.refs.length === 0, String(self.reason));
      const missing = linkEntities(g, x.id, 'ghost');
      rec.structural('linkEntities：拒绝悬空端点', missing.reason !== null, String(missing.reason));
      const ok = linkEntities(g, x.id, y.id, 'equip');
      rec.structural('linkEntities：合法引用写入', ok.reason === null && ok.document.entities.find((e) => e.id === x.id)!.refs.length === 1, `refs=${ok.document.entities.find((e) => e.id === x.id)!.refs.length}`);
      const dup = linkEntities(ok.document, x.id, y.id, 'equip');
      rec.structural('linkEntities：拒绝重复引用', dup.reason !== null, String(dup.reason));
    }

    // 5. 删实体两头清引用（自己发出的 + 别人指向它的入边）
    {
      const g = createGame('级联');
      const a = g.entities[0]!;
      const b = g.entities[1]!;
      const linked = linkEntities(g, a.id, b.id).document;
      const incomingBefore = countRefsFor(linked, b.id);
      const after = removeEntity(linked, b.id);
      rec.structural('removeEntity：实体本身移除', !after.entities.some((e) => e.id === b.id), 'entity removed');
      rec.structural('removeEntity：摘掉别人指向它的入边', after.entities.find((e) => e.id === a.id)!.refs.every((r) => r.to !== b.id), `incoming was ${incomingBefore}`);
      const byId = linkEntities(g, a.id, b.id).document;
      const refId = byId.entities.find((e) => e.id === a.id)!.refs[0]!.id;
      const removed = removeRef(byId, a.id, refId);
      rec.structural('removeRef：按引用 id 摘掉', removed.entities.find((e) => e.id === a.id)!.refs.length === 0, 'ref removed');
    }

    // 6. validateGame 各类缺陷码
    {
      const good = createGame('好游戏');
      rec.structural('validateGame：骨架游戏零缺陷', validateGame(good).length === 0, validateGame(good).map((i) => i.code).join(','));

      const titledBase = createGame('标题');
      const t0 = titledBase.entities[0]!;
      const titled = updateEntity(titledBase, t0.id, { name: '' });
      rec.structural('validateGame：空名字报 empty-name', validateGame(titled).some((i) => i.code === 'empty-name'), validateGame(titled).map((i) => i.code).join(','));

      const badKind: GameDocument = { ...createGame('非法类') };
      const bk = badKind.entities[0]!;
      badKind.entities = [{ ...bk, kind: 'bogus' as unknown as typeof bk.kind }];
      rec.structural('validateGame：非法 kind 报 bad-kind', validateGame(badKind).some((i) => i.code === 'bad-kind'), validateGame(badKind).map((i) => i.code).join(','));

      const dup: GameDocument = { ...createGame('重复id') };
      const d0 = dup.entities[0]!;
      dup.entities = [d0, { ...d0, name: '副本' }];
      rec.structural('validateGame：重复 id 报 duplicate-id', validateGame(dup).some((i) => i.code === 'duplicate-id'), validateGame(dup).map((i) => i.code).join(','));

      const selfRef: GameDocument = { ...createGame('自指') };
      const s0 = selfRef.entities[0]!;
      const ref: GameRef = { id: 'r', to: s0.id, role: '' };
      selfRef.entities = [{ ...s0, refs: [ref] }];
      rec.structural('validateGame：自指报 self-ref', validateGame(selfRef).some((i) => i.code === 'self-ref'), validateGame(selfRef).map((i) => i.code).join(','));

      const missing: GameDocument = { ...createGame('悬空') };
      const m0 = missing.entities[0]!;
      missing.entities = [{ ...m0, refs: [{ id: 'r', to: 'ghost', role: '' }] }];
      rec.structural('validateGame：悬空引用报 missing-ref-target', validateGame(missing).some((i) => i.code === 'missing-ref-target'), validateGame(missing).map((i) => i.code).join(','));

      const badStat: GameDocument = { ...createGame('坏数值') };
      const bs = badStat.entities[0]!;
      badStat.entities = [{ ...bs, stats: { hp: Number.NaN as unknown as number } }];
      rec.structural('validateGame：NaN 数值报 bad-stat', validateGame(badStat).some((i) => i.code === 'bad-stat'), validateGame(badStat).map((i) => i.code).join(','));
    }

    // 7. gameCounts：每类各一条（骨架）
    {
      const counts = gameCounts(createGame('计数'));
      rec.structural('gameCounts：每类 1 条（骨架）', GAME_ENTITY_KINDS.every((k) => counts[k] === 1), JSON.stringify(counts));
    }

    // 8. referenceGraph：删点后对应边自然消失
    {
      const g = createGame('图投影');
      const g0 = g.entities[0]!;
      const g1 = g.entities[1]!;
      const linked = linkEntities(g, g0.id, g1.id).document;
      const before = referenceGraph(linked).edges.length;
      const after = referenceGraph(removeEntity(linked, g1.id)).edges.length;
      rec.structural('referenceGraph：删点后对应边自然消失', before === 1 && after === 0, `before=${before} after=${after}`);
    }

    // 9. 管线单点分派（§16：同一份模型不许有两个出口）
    {
      rec.structural('pipelineOfKind：2d → topdown', pipelineOfKind('2d') === 'topdown', String(pipelineOfKind('2d')));
      rec.structural('pipelineOfKind：rpg-prototype → rpg', pipelineOfKind('rpg-prototype') === 'rpg', String(pipelineOfKind('rpg-prototype')));
      rec.structural('pipelineOfKind：interactive-story → story', pipelineOfKind('interactive-story') === 'story', String(pipelineOfKind('interactive-story')));
    }

    // 10. 类型判定边界
    {
      rec.structural('isGameKind：合法返回 true', isGameKind('3d') === true && isGameKind('nope') === false, `${isGameKind('3d')}/${isGameKind('nope')}`);
      rec.structural('isGameEntityKind：合法返回 true', isGameEntityKind('player') === true && isGameEntityKind('bogus') === false, `${isGameEntityKind('player')}/${isGameEntityKind('bogus')}`);
      rec.structural('isUsableStatValue：有限数 true / NaN·Inf·字符串 false', isUsableStatValue(5) === true && isUsableStatValue(Number.NaN) === false && isUsableStatValue(Number.POSITIVE_INFINITY) === false && isUsableStatValue('5') === false, `${isUsableStatValue(5)}/${isUsableStatValue(Number.NaN)}`);
    }

    // 11. fleshedOutCount：骨架全空时为 0
    {
      rec.structural('fleshedOutCount：骨架（仅名字）计 0', fleshedOutCount(createGame('填充计数')) === 0, String(fleshedOutCount(createGame('填充计数'))));
    }

    // 12. 套件非空壳
    rec.structural('套件总览：结构性 check >= 25（非空壳）', rec.checks.length >= 25, rec.checks.length);

    rec.skip('AI 生成的游戏内容（§52 Game Agent 从一句话长出整套设计要真 provider，§159 不许假生成）');
    rec.skip('试玩运行时（play/sim/playtest 的限度在各自模块披露，属运行层而非文档层）');

    return { checks: rec.checks, notMeasured: rec.notMeasured };
  },
};
