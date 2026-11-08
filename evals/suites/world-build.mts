import {
  createWorld,
  addWorldNode,
  updateWorldNode,
  removeWorldNode,
  setWorldNodeModelAsset,
  linkWorldNodes,
  setWorldNodePosition,
  setWorldNodeElevation,
  setWorldTerrain,
  autoLayout,
  worldGraph,
  validateWorld,
  worldCounts,
  WORLD_KINDS,
  WORLD_ELEVATION_MAX,
  WORLD_PLATEAU_LIMIT,
  WORLD_PLATEAU_RADIUS_MIN,
  WORLD_PLATEAU_RADIUS_MAX,
} from '../../packages/world-model/src/index.ts';
import {
  createCharacter,
  addRelationship,
  validateCharacter,
  validateCharacterAgainstWorld,
  linesToList,
  listToLines,
} from '../../packages/world-model/src/character.ts';
import {
  buildWorldScene,
  terrainHeightAt,
  walkToward,
  resolveWalkCollision,
  type SceneTerrain,
} from '../../packages/world-model/src/scene.ts';
import { EvalRecorder } from '../lib/recorder.ts';
import type { EvalSuite } from '../types.ts';
import type { WorldDocument, WorldTerrain } from '../../packages/world-model/src/index.ts';

/**
 * §44/§46/§140 · 世界模型投影自洽——"建世界 → 填九类 → 连关系 → 摆位置 → 画地形 →
 * 投影成 3D 场景"整条确定链。
 *
 * 为什么进 eval 不混进 world-model 单测：单测断的是**点**（每个函数对不对），
 * 这条钉的是**面**——几个函数之间的跨函数不变式：
 *   1. 建世界给的是**骨架**而非内容（正文一律空，不替用户编世界观，§159 不许假生成）；
 *   2. 删节点**级联**清掉挂在它身上的边与位置（留着就是指向不存在条目的箭头）；
 *   3. 关系三道门禁（不自连 / 不悬空 / 不重复）与 validateWorld 的缺陷码同源；
 *   4. 高程钳在 0–6、地形圆台在边界内、autoLayout 确定性、scene 高度查询
 *      mesa 硬边 / cone 线性 / 重叠取最高、walk 碰撞推出；
 *   5. 角色档案空骨架 + 关系/色板校验、指向不存在条目报 dangling。
 * 这种"链级"不变式单测那张网罩不到；破了，3D 世界会显示出一份对不上文档的计划。
 */
export const worldBuildSuite: EvalSuite = {
  name: 'world-build',
  dimension: '代码正确性 / 世界模型投影自洽（§44/§46/§140）',
  needsDatabase: false,

  run() {
    const rec = new EvalRecorder();
    console.log('\n== 世界模型投影自洽（§44/§46/§140）· 建世界→九类→关系→位置→地形→3D 场景 整链确定性 ==');

    // 1. 建世界给的是骨架：九类各一条、标题即类名、正文空
    {
      const w = createWorld('暗黑奇幻');
      const kindsOk = w.nodes.length === WORLD_KINDS.length && WORLD_KINDS.every((k) => w.nodes.some((n) => n.kind === k));
      const emptyBody = w.nodes.every((n) => n.body === '');
      rec.structural('createWorld：九类骨架各一条', kindsOk, `${w.nodes.length}/${WORLD_KINDS.length}`);
      rec.structural('createWorld：正文一律空（骨架非内容，不假生成）', emptyBody, emptyBody ? 'all-empty' : 'HAS-BODY');
    }

    // 2. 增 / 改节点
    {
      const w = createWorld('增删');
      const added = addWorldNode(w, { kind: 'lore', title: '新条目' });
      rec.structural('addWorldNode：节点 +1', added.nodes.length === w.nodes.length + 1, `${added.nodes.length}`);
      const last = added.nodes[added.nodes.length - 1]!;
      const updated = updateWorldNode(added, last.id, { body: '正文' });
      rec.structural('updateWorldNode：正文更新', updated.nodes.find((n) => n.id === last.id)?.body === '正文', 'body updated');
    }

    // 3. 删节点级联清边与位置
    {
      const w = createWorld('级联');
      const a = w.nodes[0]!;
      const b = w.nodes[1]!;
      const linked = linkWorldNodes(w, a.id, b.id).document;
      const positioned = setWorldNodePosition(linked, a.id, { x: 5, y: 6 });
      const after = removeWorldNode(positioned, a.id);
      rec.structural('removeWorldNode：节点本身移除', !after.nodes.some((n) => n.id === a.id), 'node removed');
      rec.structural('removeWorldNode：连带删掉挂它的边', after.links.every((l) => l.from !== a.id && l.to !== a.id), `links=${after.links.length}`);
      rec.structural('removeWorldNode：连带清掉它的位置', after.positions?.[a.id] === undefined, 'position cleared');
    }

    // 4. 关系三道门禁
    {
      const w = createWorld('关系门禁');
      const x = w.nodes[0]!;
      const y = w.nodes[1]!;
      const self = linkWorldNodes(w, x.id, x.id);
      rec.structural('linkWorldNodes：拒绝自连', self.reason !== null && self.document.links.length === 0, String(self.reason));
      const missing = linkWorldNodes(w, x.id, 'ghost');
      rec.structural('linkWorldNodes：拒绝悬空端点', missing.reason !== null && missing.document.links.length === 0, String(missing.reason));
      const ok = linkWorldNodes(w, x.id, y.id);
      rec.structural('linkWorldNodes：合法关系写入', ok.reason === null && ok.document.links.length === 1, `links=${ok.document.links.length}`);
      const dup = linkWorldNodes(ok.document, x.id, y.id);
      rec.structural('linkWorldNodes：拒绝重复关系', dup.reason !== null && dup.document.links.length === 1, String(dup.reason));
    }

    // 5. model 资产写入纪律：空串拒绝、合法写入、null 摘键、节点不存在拒绝
    {
      const w = createWorld('资产');
      const m = w.nodes[0]!;
      const empty = setWorldNodeModelAsset(w, m.id, '');
      rec.structural('setWorldNodeModelAsset：空串拒绝', empty.reason !== null, String(empty.reason));
      const set = setWorldNodeModelAsset(w, m.id, 'asset-1');
      rec.structural('setWorldNodeModelAsset：合法 id 写入', set.reason === null && set.document.nodes.find((n) => n.id === m.id)?.modelAssetId === 'asset-1', String(set.reason));
      const drop = setWorldNodeModelAsset(set.document, m.id, null);
      rec.structural('setWorldNodeModelAsset：null 摘掉键', drop.reason === null && (drop.document.nodes.find((n) => n.id === m.id)?.modelAssetId) === undefined, String(drop.reason));
      const ghost = setWorldNodeModelAsset(w, 'ghost', 'asset-2');
      rec.structural('setWorldNodeModelAsset：节点不存在拒绝', ghost.reason !== null, String(ghost.reason));
    }

    // 6. 位置 / 高程：未摆位置不能写高程；高程钳 0–6
    {
      const w = createWorld('高程');
      const e = w.nodes[0]!;
      const noPos = setWorldNodeElevation(w, e.id, 3);
      rec.structural('setWorldNodeElevation：未摆位置拒绝', noPos.reason !== null, String(noPos.reason));
      const pos = setWorldNodePosition(w, e.id, { x: 10, y: 20 });
      rec.structural('setWorldNodePosition：写入坐标', pos.positions[e.id]?.x === 10 && pos.positions[e.id]?.y === 20, JSON.stringify(pos.positions[e.id]));
      const ok = setWorldNodeElevation(pos, e.id, 3);
      rec.structural('setWorldNodeElevation：合法高程写入', ok.reason === null && ok.document.positions?.[e.id]?.elevation === 3, String(ok.reason));
      const over = setWorldNodeElevation(pos, e.id, WORLD_ELEVATION_MAX + 10);
      rec.structural('setWorldNodeElevation：超界高程拒绝', over.reason !== null, String(over.reason));
    }

    // 7. 地形圆台边界：合法接受、半径越界/高度越界/超量拒绝、null 收回
    {
      const w = createWorld('地形');
      const terr: WorldTerrain = { kind: 'plateaus', plateaus: [{ id: 'p1', x: 0, y: 0, radius: 10, height: 5 }] };
      const ok = setWorldTerrain(w, terr);
      rec.structural('setWorldTerrain：合法圆台接受', ok.reason === null && ok.document.terrain?.kind === 'plateaus' && ok.document.terrain.plateaus.length === 1, String(ok.reason));
      const badR = setWorldTerrain(w, { kind: 'plateaus', plateaus: [{ id: 'p2', x: 0, y: 0, radius: WORLD_PLATEAU_RADIUS_MIN - 0.5, height: 5 }] });
      rec.structural('setWorldTerrain：半径越界拒绝', badR.reason !== null, String(badR.reason));
      const badH = setWorldTerrain(w, { kind: 'plateaus', plateaus: [{ id: 'p3', x: 0, y: 0, radius: 10, height: WORLD_PLATEAU_RADIUS_MAX }] });
      rec.structural('setWorldTerrain：高度越界拒绝', badH.reason !== null, String(badH.reason));
      const many = Array.from({ length: WORLD_PLATEAU_LIMIT + 1 }, (_, i) => ({ id: `m${i}`, x: 0, y: 0, radius: 10, height: 1 }));
      const tooMany = setWorldTerrain(w, { kind: 'plateaus', plateaus: many });
      rec.structural('setWorldTerrain：超量圆台拒绝', tooMany.reason !== null, String(tooMany.reason));
      const clear = setWorldTerrain(ok.document, null);
      rec.structural('setWorldTerrain：null 收回地形', clear.reason === null && clear.document.terrain === undefined, String(clear.reason));
    }

    // 8. autoLayout 确定性
    {
      const w = createWorld('布局');
      const a1 = autoLayout(w);
      const a2 = autoLayout(w);
      rec.structural('autoLayout：同文档确定性一致', JSON.stringify(a1) === JSON.stringify(a2), 'stable');
    }

    // 9. worldGraph 删点后对应边自然消失
    {
      const w = createWorld('图投影');
      const g1 = w.nodes[0]!;
      const g2 = w.nodes[1]!;
      const linked = linkWorldNodes(w, g1.id, g2.id).document;
      const before = worldGraph(linked).edges.length;
      const after = worldGraph(removeWorldNode(linked, g2.id)).edges.length;
      rec.structural('worldGraph：删点后对应边自然消失', before === 1 && after === 0, `before=${before} after=${after}`);
    }

    // 10. validateWorld 各类缺陷码
    {
      const good = createWorld('好世界');
      rec.structural('validateWorld：模板骨架世界零缺陷', validateWorld(good).length === 0, validateWorld(good).map((i) => i.code).join(','));

      const titledBase = createWorld('标题');
      const t0 = titledBase.nodes[0]!;
      const titled = updateWorldNode(titledBase, t0.id, { title: '' });
      rec.structural('validateWorld：空标题报 empty-title', validateWorld(titled).some((i) => i.code === 'empty-title'), validateWorld(titled).map((i) => i.code).join(','));

      const badKind: WorldDocument = { ...createWorld('非法类') };
      const f = badKind.nodes[0]!;
      badKind.nodes = [{ ...f, kind: 'bogus' as unknown as typeof f.kind }];
      rec.structural('validateWorld：非法 kind 报 bad-kind', validateWorld(badKind).some((i) => i.code === 'bad-kind'), validateWorld(badKind).map((i) => i.code).join(','));

      const dup: WorldDocument = { ...createWorld('重复id') };
      const d0 = dup.nodes[0]!;
      dup.nodes = [d0, { ...d0, title: '副本' }];
      rec.structural('validateWorld：重复 id 报 duplicate-id', validateWorld(dup).some((i) => i.code === 'duplicate-id'), validateWorld(dup).map((i) => i.code).join(','));

      const selfLink: WorldDocument = { ...createWorld('自连') };
      const s0 = selfLink.nodes[0]!;
      selfLink.links = [{ id: 'l1', from: s0.id, to: s0.id, label: '' }];
      rec.structural('validateWorld：自连报 self-link', validateWorld(selfLink).some((i) => i.code === 'self-link'), validateWorld(selfLink).map((i) => i.code).join(','));

      const missing: WorldDocument = { ...createWorld('悬空') };
      const m0 = missing.nodes[0]!;
      missing.links = [{ id: 'l2', from: m0.id, to: 'ghost', label: '' }];
      rec.structural('validateWorld：悬空端点报 missing-endpoint', validateWorld(missing).some((i) => i.code === 'missing-endpoint'), validateWorld(missing).map((i) => i.code).join(','));

      const badTerr: WorldDocument = { ...createWorld('坏地形') };
      badTerr.terrain = { kind: 'plateaus', plateaus: [{ id: 'p', x: 0, y: 0, radius: 0.5, height: 5 }] } as WorldTerrain;
      rec.structural('validateWorld：半径越界地形报 bad-terrain', validateWorld(badTerr).some((i) => i.code === 'bad-terrain'), validateWorld(badTerr).map((i) => i.code).join(','));
    }

    // 11. worldCounts：每类各一条（骨架）
    {
      const counts = worldCounts(createWorld('计数'));
      rec.structural('worldCounts：每类 1 条（骨架）', WORLD_KINDS.every((k) => counts[k] === 1), JSON.stringify(counts));
    }

    // 12. 角色档案：空骨架 + 关系 + 色板校验 + 行↔列 往返 + dangling
    {
      const ch = createCharacter({ name: '英雄' });
      rec.structural('createCharacter：空档案（除名字外为空）', ch.profile.name === '英雄' && ch.profile.appearance === '' && ch.profile.relationships.length === 0, ch.profile.name);
      const rel = addRelationship(ch, { target: 'n1', kind: '效忠' });
      rec.structural('addRelationship：关系写入', rel.profile.relationships.length === 1 && rel.profile.relationships[0]?.target === 'n1', '1 rel');
      const badPalette = validateCharacter({ ...rel, profile: { ...rel.profile, visualIdentity: { ...rel.profile.visualIdentity, palette: ['not-hex'] } } });
      rec.structural('validateCharacter：非法色板报 bad-palette', badPalette.some((i) => i.code === 'bad-palette'), badPalette.map((i) => i.code).join(','));
      const goodPalette = validateCharacter({ ...rel, profile: { ...rel.profile, visualIdentity: { ...rel.profile.visualIdentity, palette: ['#fff'] } } });
      rec.structural('validateCharacter：合法色板无 bad-palette', !goodPalette.some((i) => i.code === 'bad-palette'), goodPalette.map((i) => i.code).join(','));
      const lines = linesToList('一行\n\n  二行  \n三行');
      rec.structural('linesToList：空行不算条目', lines.length === 3 && lines[0] === '一行' && lines[2] === '三行', lines.join('|'));
      rec.structural('listToLines↔linesToList：往返一致', listToLines(linesToList('a\nb')) === 'a\nb', listToLines(linesToList('a\nb')));
      const dangling = validateCharacterAgainstWorld(rel, createWorld('W'), []);
      rec.structural('validateCharacterAgainstWorld：指向不存在条目报 dangling', dangling.some((i) => i.code === 'dangling-relationship'), dangling.map((i) => i.code).join(','));
    }

    // 13. 场景投影：实体数 / authored / fallback 计数
    {
      const w = createWorld('场景');
      const n0 = w.nodes[0]!;
      const n1 = w.nodes[1]!;
      const wPos = setWorldNodePosition(setWorldNodePosition(w, n0.id, { x: 0, y: 0 }), n1.id, { x: 30, y: 0 });
      const scene = buildWorldScene(wPos);
      rec.structural('buildWorldScene：实体数 == 节点数', scene.entities.length === wPos.nodes.length, `${scene.entities.length}/${wPos.nodes.length}`);
      rec.structural('buildWorldScene：authored 计数正确', scene.stats.authored === 2, `authored=${scene.stats.authored}`);
      rec.structural('buildWorldScene：fallback = 总数 - authored', scene.stats.fallback === wPos.nodes.length - 2, `fallback=${scene.stats.fallback}`);
      rec.structural('buildWorldScene：无边时 linksDrawn=0', scene.stats.links === 0 && scene.stats.linksDrawn === 0, `links=${scene.stats.links}`);
    }

    // 14. 地形高度查询：无地形恒 0 / mesa 硬边 / cone 线性 / 重叠取最高
    {
      rec.structural('terrainHeightAt：无地形恒 0', terrainHeightAt(undefined, 5, 5) === 0, '0');
      const mesa: SceneTerrain = { plateaus: [{ id: 'm', x: 0, z: 0, radius: 10, height: 5, profile: 'mesa' }], authored: true };
      rec.structural('terrainHeightAt：mesa 圆心取满高', terrainHeightAt(mesa, 0, 0) === 5, String(terrainHeightAt(mesa, 0, 0)));
      rec.structural('terrainHeightAt：mesa 圆外为 0', terrainHeightAt(mesa, 20, 0) === 0, String(terrainHeightAt(mesa, 20, 0)));
      const cone: SceneTerrain = { plateaus: [{ id: 'c', x: 0, z: 0, radius: 10, height: 5, profile: 'cone' }], authored: true };
      rec.structural('terrainHeightAt：cone 圆心取满高', terrainHeightAt(cone, 0, 0) === 5, String(terrainHeightAt(cone, 0, 0)));
      rec.structural('terrainHeightAt：cone 半径边缘为 0', terrainHeightAt(cone, 10, 0) === 0, String(terrainHeightAt(cone, 10, 0)));
      const overlap: SceneTerrain = { plateaus: [mesa.plateaus[0]!, { id: 'c2', x: 0, z: 0, radius: 5, height: 8, profile: 'cone' }], authored: true };
      rec.structural('terrainHeightAt：重叠取最高', terrainHeightAt(overlap, 0, 0) === 8, String(terrainHeightAt(overlap, 0, 0)));
    }

    // 15. 行走碰撞：站在条目中心被推出 / 远离不挡 / 一步内到达
    {
      const w = createWorld('走');
      const node = w.nodes[0]!;
      const scene = buildWorldScene(setWorldNodePosition(w, node.id, { x: 0, y: 0 }));
      const coll = resolveWalkCollision(scene, 0, 0);
      rec.structural('resolveWalkCollision：站在条目中心被推出', coll.blockedBy !== null && Math.hypot(coll.x, coll.z) >= 2.0 - 1e-6, `blockedBy=${coll.blockedBy} (${coll.x.toFixed(2)},${coll.z.toFixed(2)})`);
      const free = resolveWalkCollision(scene, 100, 100);
      rec.structural('resolveWalkCollision：远离条目不挡', free.blockedBy === null && free.x === 100 && free.z === 100, `blockedBy=${free.blockedBy}`);
      const arrived = walkToward(scene, { x: 5, z: 0 }, { x: 6, z: 0 }, 10);
      rec.structural('walkToward：一步之内到达', arrived.arrived === true, `arrived=${arrived.arrived}`);
    }

    // 16. 套件非空壳
    rec.structural('套件总览：结构性 check >= 20（非空壳）', rec.checks.length >= 20, rec.checks.length);

    rec.skip('AI 生成的世界内容（§44 示例九类填充正文要真 provider，§159 不许假生成）');
    rec.skip('3D 运行时渲染（scene.ts 限度已在 SCENE_LIMITS 披露，属渲染层而非模型层）');
    rec.skip('角色记忆（§48 是独立存储，档案里不塞 memory 字段，避免第二个记忆真值）');

    return { checks: rec.checks, notMeasured: rec.notMeasured };
  },
};
