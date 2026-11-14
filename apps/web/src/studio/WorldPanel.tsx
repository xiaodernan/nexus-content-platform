'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  WORLD_ELEVATION_MAX,
  WORLD_KINDS,
  WORLD_KIND_LABELS,
  WORLD_PLATEAU_LIMIT,
  WORLD_PLATEAU_RADIUS_MAX,
  WORLD_PLATEAU_RADIUS_MIN,
  WORLD_TERRAIN_HEIGHT_MAX,
  addWorldNode,
  countLinksFor,
  removeWorldNode,
  setWorldNodeElevation,
  setWorldNodeModelAsset,
  setWorldTerrain,
  setWorldTidePressures,
  updateWorldNode,
  WORLD_TIDE_PRESSURE_KINDS,
  WORLD_TIDE_PRESSURE_LIMIT,
  worldCounts,
  type WorldDocument,
  type WorldKind,
  type WorldPlateau,
  type WorldTidePressure,
  type WorldTidePressureKind,
} from '@nexus/world-model';
import { cn } from '@/lib/cn';
import { patchLore } from '@/lib/worldLore';
import type { Locale } from '@/lib/i18n';
import { useStudioReady } from './store';
import { useWorld, worldStore } from './worldStore';
import { WORLD_KIND_LABELS_EN } from '@nexus/world-model';

const COPY = {
  zh: {
    state: { idle: '', loading: '读取中…', dirty: '未保存', saving: '保存中…', saved: '已保存', error: '保存失败' } as Record<string, string>,
    world: '世界',
    readWorld: '读取世界…',
    unreadableBody: (reason: string) =>
      `读不出库里那份世界：${reason}。下面这个按钮会写一份新的模板骨架进去，覆盖掉读不出来的那份——先确认不是契约漂移再点。`,
    emptyBody:
      '这个项目还没有世界。可以先建一份模板骨架：九类内容各留一个空条目，你自己往里填。' +
      'AI 生成世界（§44 的「Create a dark fantasy world」）需要真实模型，provider 未接入前这里不做假生成。',
    createSkeleton: '创建世界骨架（模板）',
    defaultName: '未命名世界',
    nameAria: '世界名称',
    summaryPlaceholder: '一句话说明这是个什么样的世界',
    summaryAria: '世界概述',
    tidalTerrainHeading: '地形（可走的圆台与坡）',
    mesaOption: '台面（硬边）',
    coneOption: '坡（线性降到 0）',
    tideHeading: '潮汐扰模（作者声明）',
    tideKindLabels: { drought: '干亢', progeny: '繁衍', inflation: '通胀', erosion: '寂蚀', murmur: '潮声' } as Record<WorldTidePressureKind, string>,
    tideDeclared: (n: number, limit: number) => ` 已声明 ${n} / ${limit} 条。`,
    tideNone: ' 还没有声明——写了一条，潮汐页就会亮。',
    tideLabelPlaceholder: '孕育季',
    tideLabelAria: '扰模名字',
    tideKindAria: '扰模 kind',
    tideSeverityAria: '扰模 severity',
    tideNameRequired: '扰模要有一个名字——给它取 1–40 字。',
    eraPlaceholder: '灰灯纪',
    memoryEchoPlaceholder: '记忆回声：那一刻的感官（声音 / 味道 / 触感 / 光线）—— 不是剧情，是刻痕',
    severity1: '1 · 要闻',
    severity2: '2 · 季节',
    severity3: '3 · 纪元',
    newKindAria: '新增条目的类型',
    placeholderGeometryNoAssets: '类别几何体（本项目还没有 model 资产）',
    placeholderGeometryFallback: '类别几何体（占位）',
    unnamed: '未命名世界',
    titleAria: (t: string) => `条目标题 ${t}`,
    deleteEntryTitle: (n: number) => (n ? `删除这条（会一并去掉 ${n} 条关系）` : '删除这条'),
    deleteAriaEntry: (t: string) => `删除 ${t}`,
    bodyPlaceholder: '还什么都没写',
    bodyAria: (t: string) => `正文 ${t}`,
    eraLabel: '纪元',
    eraAria: (t: string) => `纪元 ${t}`,
    orderLabel: '序',
    orderAria: (t: string) => `编年序号 ${t}`,
    orderPlaceholder: '0',
    orderOptionalHint: '0 最早，缺省按 updatedAt 排',
    memoryEchoAria: (t: string) => `记忆回声 ${t}`,
    elevationLabel: '高度',
    elevationAria: (t: string) => `高度 ${t}`,
    elevationHint: (max: number) => `0–${max}；3D 世界里条目会浮在这个高度上（先在世界图上摆过位置才能写）`,
    modelLabel: '3D 模型',
    modelAria: (t: string) => `3D 模型 ${t}`,
    modelHint: '在 3D 世界里渲染哪个模型；加载不出来时退回类别几何体，不会留空白',
    saveToLibrary: '保存到库',
    addOne: '加一条',
    editsNote: '改完即写库（失焦或点删除都会保存）。世界编辑不进画布的撤销栈：Ctrl+Z 只管设计文档。',
    missingKinds: (names: string) => ` ${names} 这一类还没有条目，可以用上面的下拉补。`,
    newEntryLabel: (kind: string) => `${kind} · 新条目`,
    terrainIntro: (max: number, rmin: number, rmax: number, limit: number, count: number) =>
      `站在地形特征上就是站在它的高度上（相机与点击地面都读同一份高度）。剖面两种：台面（硬边）与坡（台心到边缘线性降到 0，可走）。没画地形的世界脚下是平的。高度 0–${max}，半径 ${rmin}–${rmax}；重叠的地形取最高的那个。当前 ${count}/${limit} 个。`,
    plateauRadius: '半径',
    plateauHeight: '高度',
    plateauProfile: '剖面',
    addPlateau: '加上去',
    clearTerrain: '收掉地形',
    plateauConeSuffix: ' 坡',
    plateauRemoveAria: (id: string) => `删除圆台 ${id}`,
    tideIntro:
      '声明一条，潮汐页（/world/项目/tide）就会按它算出真压住了多少落笔节点。severity 只是着墨（1 要闻 / 2 季节 / 3 纪元），不参与计数。',
    tideMatchKind: (entry: string, label: string) => `${entry}（${label}）`,
    tideNameField: '名字',
    tideAdd: '加上去',
    tideClearAll: '收掉全部',
    tideRemoveAria: (label: string) => `删除扰模 ${label}`,
  },
  en: {
    state: { idle: '', loading: 'Loading…', dirty: 'Unsaved', saving: 'Saving…', saved: 'Saved', error: 'Save failed' } as Record<string, string>,
    world: 'World',
    readWorld: 'Reading world…',
    unreadableBody: (reason: string) =>
      `The stored world cannot be read: ${reason}. The button below writes a new template skeleton over the unreadable one — confirm it is not a contract drift first.`,
    emptyBody:
      'This project has no world yet. Start with a template skeleton: nine kinds, one empty entry each, yours to fill in. ' +
      'AI-generating a world (§44’s “Create a dark fantasy world”) needs a real model — until a provider is wired, no fake generation ships.',
    createSkeleton: 'Create world skeleton (template)',
    defaultName: 'Untitled world',
    nameAria: 'World name',
    summaryPlaceholder: 'One line: what this world is',
    summaryAria: 'World summary',
eraPlaceholder: 'Grey Lantern Era',
    memoryEchoPlaceholder: 'Memory echo: the sensory trace of that moment (sound / taste / touch / light) — not plot, a scar',
tidalTerrainHeading: 'Terrain (walkable plateaus and cones)',
    mesaOption: 'Mesa (hard edge)',
    coneOption: 'Cone (linear to 0)',
    tideHeading: 'Tide pressures (author-declared)',
    tideKindLabels: { drought: 'Drought', progeny: 'Progeny', inflation: 'Inflation', erosion: 'Erosion', murmur: 'Murmur' } as Record<WorldTidePressureKind, string>,
    tideDeclared: (n: number, limit: number) => ` ${n} / ${limit} declared.`,
    tideNone: ' None declared yet — write one and the tide page lights up.',
    tideLabelPlaceholder: 'Breeding season',
    tideLabelAria: 'Pressure name',
    tideKindAria: 'Pressure kind',
    tideSeverityAria: 'Pressure severity',
    tideNameRequired: 'A pressure needs a name — give it 1–40 chars.',
    severity1: '1 · Major',
    severity2: '2 · Season',
    severity3: '3 · Era',
    newKindAria: 'Kind of the new entry',
    placeholderGeometryNoAssets: 'Category geometry (this project has no model assets yet)',
    placeholderGeometryFallback: 'Category geometry (placeholder)',
    unnamed: 'Untitled world',
    titleAria: (t: string) => `Entry title ${t}`,
    deleteEntryTitle: (n: number) => (n ? `Delete this entry (removes ${n} relationship(s) too)` : 'Delete this entry'),
    deleteAriaEntry: (t: string) => `Delete ${t}`,
    bodyPlaceholder: 'Nothing written yet',
    bodyAria: (t: string) => `Body ${t}`,
    eraLabel: 'Era',
    eraAria: (t: string) => `Era ${t}`,
    orderLabel: 'Order',
    orderAria: (t: string) => `Chronicle order ${t}`,
    orderPlaceholder: '0',
    orderOptionalHint: '0 = earliest; absent falls back to updatedAt',
    memoryEchoAria: (t: string) => `Memory echo ${t}`,
    elevationLabel: 'Elevation',
    elevationAria: (t: string) => `Elevation ${t}`,
    elevationHint: (max: number) => `0–${max}; in 3D the entry floats at this height (place one in the world graph first)`,
    modelLabel: '3D model',
    modelAria: (t: string) => `3D model ${t}`,
    modelHint: 'Which model to render in the 3D world; falls back to category geometry if load fails — never a blank',
    saveToLibrary: 'Save to library',
    addOne: 'Add one',
    editsNote: 'Edits write to the library immediately (blur or delete saves). World edits stay out of the canvas undo stack: Ctrl+Z only covers the design document.',
    missingKinds: (names: string) => ` No entries of these kinds yet: ${names} — add them from the dropdown above.`,
    newEntryLabel: (kind: string) => `${kind} · new entry`,
    terrainIntro: (max: number, rmin: number, rmax: number, limit: number, count: number) =>
      `Standing on a terrain feature means standing on its height (the camera and click-to-ground both read the same number). Two profiles: mesa (hard edge) and cone (linear falloff from center to rim, walkable). A world with no terrain is flat. Heights 0–${max}, radius ${rmin}–${rmax}; overlapping terrain keeps the highest. Current ${count}/${limit}.`,
    plateauRadius: 'Radius',
    plateauHeight: 'Height',
    plateauProfile: 'Profile',
    addPlateau: 'Add plateau',
    clearTerrain: 'Clear terrain',
    plateauConeSuffix: ' cone',
    plateauRemoveAria: (id: string) => `Delete plateau ${id}`,
    tideIntro:
      'Declare one and the tide page (/world/<id>/tide) will compute how many authored nodes it actually weighs on. Severity is just tint (1 major / 2 season / 3 era); it never enters the counts.',
    tideMatchKind: (entry: string, label: string) => `${entry} (${label})`,
    tideNameField: 'Name',
    tideAdd: 'Add pressure',
    tideClearAll: 'Clear all',
    tideRemoveAria: (label: string) => `Delete pressure ${label}`,
  },
} as const;

type WorldCopy = (typeof COPY)[Locale];

const kindLabel = (kind: WorldKind, locale: Locale): string =>
  locale === 'en' ? WORLD_KIND_LABELS_EN[kind] : WORLD_KIND_LABELS[kind];

/**
 * §44 World Builder 的填写界面：把世界文档摊开成可编辑的九类。
 * 图视图（§45，`WorldGraphView`）读的是同一个 store，两处不会各存一份世界。
 *
 * 两件事刻意没做，界面上也写着：
 * - AI 生成世界内容要真 provider，没接之前只有**模板骨架**（九类各一条空条目、正文留空），
 *   往模板里塞预设世界观就是假生成（§159）；
 * - 世界编辑不进画布的 Command 撤销栈（§150 目前只覆盖设计文档），所以每次写库都对应一个明确动作。
 */

export function WorldPanel({ locale = 'zh' }: { locale?: Locale }) {
  const c = COPY[locale];
  const studio = useStudioReady();
  const snapshot = useWorld();
  const [newKind, setNewKind] = useState<WorldKind>('lore');
  const world = snapshot.world;

  useEffect(() => {
    worldStore.ensure(studio.projectId);
  }, [studio.projectId]);

  // §34 的 model 类资产名册：给每个条目挑 3D 世界里的模型。
  // 只列本项目 kind='model' 的资产——"这个 id 是不是本项目的"在这里保证，
  // 模型包里那个 setter 只管形状（世界文档不认识资产表，§16）。
  const [modelAssets, setModelAssets] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${studio.projectId}/assets`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((body: { assets?: { id: string; name: string; kind: string }[] }) => {
        if (cancelled) return;
        setModelAssets((body.assets ?? []).filter((a) => a.kind === 'model').map((a) => ({ id: a.id, name: a.name })));
      })
      .catch(() => {
        if (!cancelled) setModelAssets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [studio.projectId]);

  const counts = useMemo(() => (world ? worldCounts(world) : null), [world]);

  if (!world) {
    return (
      <div className="wd-scrollPad" data-world-panel>
        <h2 className="wd-label">{c.world}</h2>
        <p className="wd-body12" data-world-empty>
          {snapshot.saveState === 'loading'
            ? c.readWorld
            : snapshot.error
              ? c.unreadableBody(snapshot.error)
              : c.emptyBody}
        </p>
        {snapshot.error ? (
          <p className="wd-danger11" data-world-error>
            {snapshot.error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={snapshot.saveState === 'saving'}
          onClick={() => void worldStore.createSkeleton(studio.document?.name ?? c.defaultName)}
          data-world-create
          className="wd-selfStart wd-accentBtn wd-dis50"
        >
          {c.createSkeleton}
        </button>
      </div>
    );
  }

  const edit = (next: WorldDocument, save = false) => {
    worldStore.setLocal(next);
    if (save) void worldStore.commit();
  };

  const groups = WORLD_KINDS.filter((kind) => counts?.[kind]);

  return (
    <div className="wd-rootCol" data-world-panel>
      <header className="wd-headBordered">
        <div className="wd-row2">
          <h2 className="wd-label">{c.world}</h2>
          <span
            className={cn('wd-monoFaintEnd', snapshot.saveState === 'error' && 'wd-dangerText')}
            data-world-state
          >
            {c.state[snapshot.saveState] ?? ''}
          </span>
          <span data-world-pending={snapshot.saveState === 'saving' || snapshot.saveState === 'dirty' ? 'true' : 'false'} />
        </div>
        <input
          value={world.name}
          onChange={(e) => edit({ ...world, name: e.target.value })}
          onBlur={() => edit({ ...world, name: world.name.trim() || c.unnamed }, true)}
          aria-label={c.nameAria}
          data-world-name
          className="wd-wfullInput13"
        />
        <textarea
          value={world.summary}
          onChange={(e) => edit({ ...world, summary: e.target.value })}
          onBlur={() => edit(world, true)}
          placeholder={c.summaryPlaceholder}
          aria-label={c.summaryAria}
          data-world-summary
          rows={2}
          className="wd-areaResize"
        />
        {snapshot.error ? (
          <p className="wd-dangerMt2" data-world-error>
            {snapshot.error}
          </p>
        ) : null}
      </header>

      <div className="wd-scrollP2">
        {groups.map((kind) => (
          <section key={kind} className="wd-mb3" data-world-group={kind}>
            <h3 className="wd-labelMb1">
              {kindLabel(kind, locale)}
              <span className="wd-end">{counts?.[kind] ?? 0}</span>
            </h3>
            <ul className="wd-col2">
              {world.nodes
                .filter((node) => node.kind === kind)
                .map((node) => (
                  <li
                    key={node.id}
                    className="wd-card"
                    data-world-node={node.id}
                  >
                    <div className="wd-row1">
                      <input
                        value={node.title}
                        onChange={(e) => edit(updateWorldNode(world, node.id, { title: e.target.value }))}
                        onBlur={() => edit(world, true)}
                        aria-label={c.titleAria(node.title)}
                        data-world-title={node.id}
                        className="wd-growInput"
                      />
                      <button
                        type="button"
                        title={c.deleteEntryTitle(countLinksFor(world, node.id))}
                        onClick={() => edit(removeWorldNode(world, node.id), true)}
                        aria-label={c.deleteAriaEntry(node.title)}
                        data-world-remove={node.id}
                        className="wd-delBtn"
                      >
                        ×
                      </button>
                    </div>
                    <textarea
                      value={node.body}
                      onChange={(e) => edit(updateWorldNode(world, node.id, { body: e.target.value }))}
                      onBlur={() => edit(world, true)}
                      placeholder={c.bodyPlaceholder}
                      aria-label={c.bodyAria(node.title)}
                      data-world-body={node.id}
                      rows={3}
                      className="wd-areaResizeMt"
                    />
                    {node.kind === 'story' || node.kind === 'history' ? (
                      <>
                      <div className="wd-rowMt1" data-world-lore-row={node.id}>
                        <label htmlFor={`world-era-${node.id}`} className="wd-faint11shrink">
                          {c.eraLabel}
                        </label>
                        <input
                          id={`world-era-${node.id}`}
                          type="text"
                          value={node.lore?.era ?? ''}
                          maxLength={80}
                          placeholder={c.eraPlaceholder}
                          aria-label={c.eraAria(node.title)}
                          data-world-era={node.id}
                          onChange={(e) => {
                            const merged = patchLore(node.lore, { era: e.target.value });
                            edit(updateWorldNode(world, node.id, { lore: merged }));
                          }}
                          onBlur={() => edit(world, true)}
                          className="wd-growInput"
                        />
                        <label htmlFor={`world-order-${node.id}`} className="wd-faint11shrink">
                          {c.orderLabel}
                        </label>
                        <input
                          id={`world-order-${node.id}`}
                          type="number"
                          min={0}
                          step={1}
                          value={node.lore?.order ?? ''}
                          placeholder={c.orderPlaceholder}
                          aria-label={c.orderAria(node.title)}
                          data-world-order={node.id}
                          onChange={(e) => {
                            const merged = patchLore(node.lore, { order: e.target.value });
                            edit(updateWorldNode(world, node.id, { lore: merged }));
                          }}
                          onBlur={() => edit(world, true)}
                          className="wd-numInput"
                        />
                        <span className="wd-faint11">{c.orderOptionalHint}</span>
                      </div>
                      <input
                        type="text"
                        value={node.lore?.memory ?? ''}
                        maxLength={240}
                        placeholder={c.memoryEchoPlaceholder}
                        aria-label={c.memoryEchoAria(node.title)}
                        data-world-memory={node.id}
                        onChange={(e) => {
                          const merged = patchLore(node.lore, { memory: e.target.value });
                          edit(updateWorldNode(world, node.id, { lore: merged }));
                        }}
                        onBlur={() => edit(world, true)}
                        className="wd-growInput"
                      />
                      </>
                    ) : null}
                    <div className="wd-rowMt1">
                      <label htmlFor={`world-elevation-${node.id}`} className="wd-faint11shrink">
                        {c.elevationLabel}
                      </label>
                      <input
                        id={`world-elevation-${node.id}`}
                        type="number"
                        min={0}
                        max={WORLD_ELEVATION_MAX}
                        step={0.5}
                        value={world.positions?.[node.id]?.elevation ?? 0}
                        disabled={!world.positions?.[node.id]}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          const result = setWorldNodeElevation(world, node.id, value);
                          if (result.reason) {
                            // 不合法就不写：把原因说出来，而不是让一次按键悄悄消失
                            worldStore.showNotice(result.reason);
                            return;
                          }
                          edit(result.document, true);
                        }}
                        aria-label={c.elevationAria(node.title)}
                        data-world-elevation={node.id}
                        className="wd-numInput"
                      />
                      <span className="wd-faint11">
                        {c.elevationHint(WORLD_ELEVATION_MAX)}
                      </span>
                    </div>
                    <div className="wd-rowMt1">
                      <label htmlFor={`world-model-${node.id}`} className="wd-faint11shrink">
                        {c.modelLabel}
                      </label>
                      <select
                        id={`world-model-${node.id}`}
                        value={node.modelAssetId ?? ''}
                        onChange={(e) => {
                          const result = setWorldNodeModelAsset(world, node.id, e.target.value === '' ? null : e.target.value);
                          if (result.reason) {
                            worldStore.showNotice(result.reason);
                            return;
                          }
                          edit(result.document, true);
                        }}
                        aria-label={c.modelAria(node.title)}
                        data-world-model={node.id}
                        className="wd-growInput"
                      >
                        <option value="">
                          {modelAssets.length ? c.placeholderGeometryFallback : c.placeholderGeometryNoAssets}
                        </option>
                        {modelAssets.map((asset) => (
                          <option key={asset.id} value={asset.id}>
                            {asset.name}
                          </option>
                        ))}
                      </select>
                      <span className="wd-faint11shrink">
                        {c.modelHint}
                      </span>
                    </div>
                  </li>
                ))}
            </ul>
          </section>
        ))}

        <TerrainSection world={world} edit={edit} c={c} />
        <TideSection world={world} edit={edit} c={c} />

        <div className="wd-rowMt1">
          <select
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as WorldKind)}
            aria-label={c.newKindAria}
            data-world-new-kind
            className="wd-chipSelect"
          >
            {WORLD_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kindLabel(kind, locale)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() =>
              edit(addWorldNode(world, { kind: newKind, title: c.newEntryLabel(kindLabel(newKind, locale)) }), true)
            }
            data-world-add={newKind}
            className="wd-ghostBtn"
          >
            {c.addOne}
          </button>
        </div>
        <p className="wd-body11Mt2" data-world-note>
          {c.editsNote}
          {groups.length < WORLD_KINDS.length
            ? c.missingKinds(WORLD_KINDS.filter((k) => !counts?.[k]).map((k) => kindLabel(k, locale)).join(locale === 'en' ? ', ' : '、'))
            : ''}
        </p>
        <button
          type="button"
          onClick={() => void worldStore.commit()}
          data-world-save
          className="wd-mt2 wd-selfStart wd-accentBtn"
        >
          {c.saveToLibrary}
        </button>
      </div>
    </div>
  );
}

/**
 * §140 第四片的地形编辑区。圆台清单 + 加一个 + 删一个。
 * 写入口径与高度输入同一边：不合法就不写，原因由 `setWorldTerrain` 交回来这里显示
 * （面板是唯一的"人看见原因"的地方，模型不认识 UI）。
 * 加的圆台落在世界原点附近一格：面板是数字入口，位置用数字填——
 * 想拖着画的入口在世界图上（WorldGraphView 的「画地形」模式，2026-10-13 落地），
 * 两边同一个写入口径 `setWorldTerrain`，不合法都只显示原因不写。
 */
function TerrainSection({
  world,
  edit,
  c,
}: {
  world: WorldDocument;
  edit: (next: WorldDocument, save?: boolean) => void;
  c: WorldCopy;
}) {
  const plateaus = world.terrain?.kind === 'plateaus' ? world.terrain.plateaus : [];
  const [draft, setDraft] = useState<WorldPlateau>({ id: '', x: 0, y: 0, radius: 6, height: 2 });

  const apply = (next: WorldPlateau[] | null) => {
    const result = setWorldTerrain(world, next === null ? null : { kind: 'plateaus', plateaus: next });
    if (result.reason) {
      worldStore.showNotice(result.reason);
      return;
    }
    edit(result.document, true);
  };

  return (
    <section className="wd-mt4" data-world-terrain-panel>
      <h3 className="wd-label11">{c.tidalTerrainHeading}</h3>
      <p className="wd-body11Mt1">
        {c.terrainIntro(WORLD_TERRAIN_HEIGHT_MAX, WORLD_PLATEAU_RADIUS_MIN, WORLD_PLATEAU_RADIUS_MAX, WORLD_PLATEAU_LIMIT, plateaus.length)}
      </p>
      <ul className="wd-colMt1">
        {plateaus.map((plateau) => (
          <li key={plateau.id} className="wd-row1" data-world-plateau={plateau.id}>
            <span className="wd-fname11truncate">
              ({plateau.x}, {plateau.y}) r={plateau.radius} h={plateau.height}
              {plateau.profile === 'cone' ? c.plateauConeSuffix : ''}
            </span>
            <button
              type="button"
              onClick={() => apply(plateaus.filter((p) => p.id !== plateau.id))}
              aria-label={c.plateauRemoveAria(plateau.id)}
              data-world-plateau-remove={plateau.id}
              className="wd-delBtn"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="wd-wrapCenter1">
        <label htmlFor="world-plateau-x" className="wd-faint11shrink">
          x
        </label>
        <input
          id="world-plateau-x"
          type="number"
          value={draft.x}
          onChange={(e) => setDraft((d) => ({ ...d, x: Number(e.target.value) }))}
          data-world-plateau-input="x"
          className="wd-numInput"
        />
        <label htmlFor="world-plateau-y" className="wd-faint11shrink">
          y
        </label>
        <input
          id="world-plateau-y"
          type="number"
          value={draft.y}
          onChange={(e) => setDraft((d) => ({ ...d, y: Number(e.target.value) }))}
          data-world-plateau-input="y"
          className="wd-numInput"
        />
        <label htmlFor="world-plateau-radius" className="wd-faint11shrink">
          {c.plateauRadius}
        </label>
        <input
          id="world-plateau-radius"
          type="number"
          min={WORLD_PLATEAU_RADIUS_MIN}
          max={WORLD_PLATEAU_RADIUS_MAX}
          value={draft.radius}
          onChange={(e) => setDraft((d) => ({ ...d, radius: Number(e.target.value) }))}
          data-world-plateau-input="radius"
          className="wd-numInput"
        />
        <label htmlFor="world-plateau-height" className="wd-faint11shrink">
          {c.plateauHeight}
        </label>
        <input
          id="world-plateau-height"
          type="number"
          min={0}
          max={WORLD_TERRAIN_HEIGHT_MAX}
          step={0.5}
          value={draft.height}
          onChange={(e) => setDraft((d) => ({ ...d, height: Number(e.target.value) }))}
          data-world-plateau-input="height"
          className="wd-numInput"
        />
        <label htmlFor="world-plateau-profile" className="wd-faint11shrink">
          {c.plateauProfile}
        </label>
        <select
          id="world-plateau-profile"
          value={draft.profile ?? 'mesa'}
          onChange={(e) =>
            setDraft((d) => ({ ...d, profile: e.target.value === 'cone' ? 'cone' : undefined }))
          }
          data-world-plateau-input="profile"
          className="wd-inputSm"
        >
          <option value="mesa">{c.mesaOption}</option>
          <option value="cone">{c.coneOption}</option>
        </select>
        <button
          type="button"
          onClick={() => {
            // 只写 cone：mesa 是缺省，写进文档等于让每个存盘都多一栏没人读的默认值
            const { profile, ...rest } = draft;
            apply([...plateaus, { ...rest, id: `wp_${Date.now().toString(36)}${plateaus.length}`, ...(profile === 'cone' ? { profile: 'cone' as const } : {}) }]);
          }}
          data-world-plateau-add
          className="wd-ghostBtnShrink"
        >
          {c.addPlateau}
        </button>
        {world.terrain ? (
          <button
            type="button"
            onClick={() => apply(null)}
            data-world-terrain-clear
            className="wd-delBtnBig"
          >
            {c.clearTerrain}
          </button>
        ) : null}
      </div>
    </section>
  );
}
/**
 * §潮汐声明编辑器（v721 · ADR-0267 的第三片）：作者在面板里落笔声明扰模。
 * 写入口径与 `setWorldTidePressures` 同一支笔：kind 不认识 / label 空白 / id 重复 / 超限整批拒绝，
 * 原因由 `worldStore.showNotice` 原样显示——和「画地形」是同一门（UI 永远不收不合法的字节）。
 * severity 只是着墨（1 要闻 / 2 季节 / 3 纪元），不参与任何潮汐计数。
 */
function TideSection({
  world,
  edit,
  c,
}: {
  world: WorldDocument;
  edit: (next: WorldDocument, save?: boolean) => void;
  c: WorldCopy;
}) {
  const pressures = world.pressures ?? [];
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<WorldTidePressureKind>('drought');
  const [severity, setSeverity] = useState<1 | 2 | 3>(2);

  const apply = (next: WorldTidePressure[] | null) => {
    const result = setWorldTidePressures(world, next);
    if (result.reason) {
      worldStore.showNotice(result.reason);
      return;
    }
    edit(result.document, true);
  };

  return (
    <section className="wd-mt4" data-world-tide-panel>
      <h3 className="wd-label11">{c.tideHeading}</h3>
      <p className="wd-body11Mt1">
        {c.tideIntro}
        {pressures.length > 0 ? c.tideDeclared(pressures.length, WORLD_TIDE_PRESSURE_LIMIT) : c.tideNone}
      </p>
      <ul className="wd-colMt1">
        {pressures.map((pressure) => (
          <li key={pressure.id} className="wd-row1" data-world-tide={pressure.id}>
            <span className="wd-fname11truncate">
              {pressure.label} · {c.tideKindLabels[pressure.kind]} · severity {pressure.severity}
            </span>
            <button
              type="button"
              onClick={() => apply(pressures.filter((entry) => entry.id !== pressure.id))}
              aria-label={c.tideRemoveAria(pressure.label)}
              data-world-tide-remove={pressure.id}
              className="wd-delBtn"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="wd-wrapCenter1">
        <label htmlFor="world-tide-label" className="wd-faint11shrink">
          {c.tideNameField}
        </label>
        <input
          id="world-tide-label"
          type="text"
          value={label}
          maxLength={40}
          placeholder={c.tideLabelPlaceholder}
          onChange={(e) => setLabel(e.target.value)}
          aria-label={c.tideLabelAria}
          data-world-tide-label
          className="wd-numInput"
        />
        <label htmlFor="world-tide-kind" className="wd-faint11shrink">
          kind
        </label>
        <select
          id="world-tide-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as WorldTidePressureKind)}
          aria-label={c.tideKindAria}
          data-world-tide-kind
          className="wd-inputSm"
        >
          {WORLD_TIDE_PRESSURE_KINDS.map((entry) => (
            <option key={entry} value={entry}>
              {c.tideMatchKind(entry, c.tideKindLabels[entry])}
            </option>
          ))}
        </select>
        <label htmlFor="world-tide-severity" className="wd-faint11shrink">
          severity
        </label>
        <select
          id="world-tide-severity"
          value={severity}
          onChange={(e) => setSeverity(Number(e.target.value) as 1 | 2 | 3)}
          aria-label={c.tideSeverityAria}
          data-world-tide-severity
          className="wd-inputSm"
        >
          <option value={1}>{c.severity1}</option>
          <option value={2}>{c.severity2}</option>
          <option value={3}>{c.severity3}</option>
        </select>
        <button
          type="button"
          onClick={() => {
            const trimmed = label.trim();
            if (!trimmed) {
              worldStore.showNotice(c.tideNameRequired);
              return;
            }
            apply([...pressures, { id: `tp_${Date.now().toString(36)}${pressures.length}`, kind, label: trimmed, severity }]);
            setLabel('');
          }}
          data-world-tide-add
          className="wd-ghostBtnShrink"
        >
          {c.tideAdd}
        </button>
        {pressures.length > 0 ? (
          <button
            type="button"
            onClick={() => apply(null)}
            data-world-tide-clear
            className="wd-delBtnBig"
          >
            {c.tideClearAll}
          </button>
        ) : null}
      </div>
    </section>
  );
}
