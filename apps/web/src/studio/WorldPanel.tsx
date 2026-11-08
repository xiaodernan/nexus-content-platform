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
  updateWorldNode,
  worldCounts,
  type WorldDocument,
  type WorldKind,
  type WorldPlateau,
} from '@nexus/world-model';
import { cn } from '@/lib/cn';
import { useStudioReady } from './store';
import { useWorld, worldStore } from './worldStore';

/**
 * §44 World Builder 的填写界面：把世界文档摊开成可编辑的九类。
 * 图视图（§45，`WorldGraphView`）读的是同一个 store，两处不会各存一份世界。
 *
 * 两件事刻意没做，界面上也写着：
 * - AI 生成世界内容要真 provider，没接之前只有**模板骨架**（九类各一条空条目、正文留空），
 *   往模板里塞预设世界观就是假生成（§159）；
 * - 世界编辑不进画布的 Command 撤销栈（§150 目前只覆盖设计文档），所以每次写库都对应一个明确动作。
 */

const STATE_TEXT: Record<string, string> = {
  idle: '',
  loading: '读取中…',
  dirty: '未保存',
  saving: '保存中…',
  saved: '已保存',
  error: '保存失败',
};

export function WorldPanel() {
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
      <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-[var(--nexus-space-3)]" data-world-panel>
        <h2 className="font-mono text-12 uppercase tracking-wide text-fg-3">世界</h2>
        <p className="text-12 leading-relaxed text-fg-2" data-world-empty>
          {snapshot.saveState === 'loading'
            ? '读取世界…'
            : snapshot.error
              ? `读不出库里那份世界：${snapshot.error}。下面这个按钮会写一份新的模板骨架进去，覆盖掉读不出来的那份——先确认不是契约漂移再点。`
              : (
                  <>
                    这个项目还没有世界。可以先建一份<strong>模板骨架</strong>：九类内容各留一个空条目，你自己往里填。
                    AI 生成世界（§44 的「Create a dark fantasy world」）需要真实模型，provider 未接入前这里不做假生成。
                  </>
                )}
        </p>
        {snapshot.error ? (
          <p className="text-11 text-danger-ink" data-world-error>
            {snapshot.error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={snapshot.saveState === 'saving'}
          onClick={() => void worldStore.createSkeleton(studio.document?.name ?? '未命名世界')}
          data-world-create
          className="self-start rounded-[var(--nexus-radius-sm)] bg-accent-2 px-3 py-1 text-12 text-accent-fg disabled:opacity-50"
        >
          创建世界骨架（模板）
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
    <div className="flex h-full min-h-0 flex-col" data-world-panel>
      <header className="shrink-0 border-b border-[var(--nexus-color-border-subtle)] p-[var(--nexus-space-3)]">
        <div className="flex items-center gap-2">
          <h2 className="font-mono text-12 uppercase tracking-wide text-fg-3">世界</h2>
          <span
            className={cn(
              'ml-auto font-mono text-11',
              snapshot.saveState === 'error' ? 'text-danger-ink' : 'text-fg-3',
            )}
            data-world-state
          >
            {STATE_TEXT[snapshot.saveState] ?? ''}
          </span>
          <span data-world-pending={snapshot.saveState === 'saving' || snapshot.saveState === 'dirty' ? 'true' : 'false'} />
        </div>
        <input
          value={world.name}
          onChange={(e) => edit({ ...world, name: e.target.value })}
          onBlur={() => edit({ ...world, name: world.name.trim() || '未命名世界' }, true)}
          aria-label="世界名称"
          data-world-name
          className="mt-2 w-full rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-13 text-fg-1 outline-none focus:bg-bg-3"
        />
        <textarea
          value={world.summary}
          onChange={(e) => edit({ ...world, summary: e.target.value })}
          onBlur={() => edit(world, true)}
          placeholder="一句话说明这是个什么样的世界"
          aria-label="世界概述"
          data-world-summary
          rows={2}
          className="mt-2 w-full resize-y rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-12 text-fg-1 outline-none focus:bg-bg-3"
        />
        {snapshot.error ? (
          <p className="mt-2 text-11 text-danger-ink" data-world-error>
            {snapshot.error}
          </p>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-[var(--nexus-space-2)]">
        {groups.map((kind) => (
          <section key={kind} className="mb-3" data-world-group={kind}>
            <h3 className="mb-1 flex items-center font-mono text-11 uppercase tracking-wide text-fg-3">
              {WORLD_KIND_LABELS[kind]}
              <span className="ml-auto">{counts?.[kind] ?? 0}</span>
            </h3>
            <ul className="flex flex-col gap-2">
              {world.nodes
                .filter((node) => node.kind === kind)
                .map((node) => (
                  <li
                    key={node.id}
                    className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-subtle)] bg-bg-2 p-2"
                    data-world-node={node.id}
                  >
                    <div className="flex items-center gap-1">
                      <input
                        value={node.title}
                        onChange={(e) => edit(updateWorldNode(world, node.id, { title: e.target.value }))}
                        onBlur={() => edit(world, true)}
                        aria-label={`条目标题 ${node.title}`}
                        data-world-title={node.id}
                        className="min-w-0 flex-1 rounded-[3px] bg-bg-1 px-1 py-[2px] text-12 text-fg-1 outline-none focus:bg-bg-3"
                      />
                      <button
                        type="button"
                        title={
                          countLinksFor(world, node.id)
                            ? `删除这条（会一并去掉 ${countLinksFor(world, node.id)} 条关系）`
                            : '删除这条'
                        }
                        onClick={() => edit(removeWorldNode(world, node.id), true)}
                        aria-label={`删除 ${node.title}`}
                        data-world-remove={node.id}
                        className="shrink-0 px-1 text-12 text-fg-3 hover:text-danger-ink"
                      >
                        ×
                      </button>
                    </div>
                    <textarea
                      value={node.body}
                      onChange={(e) => edit(updateWorldNode(world, node.id, { body: e.target.value }))}
                      onBlur={() => edit(world, true)}
                      placeholder="还什么都没写"
                      aria-label={`正文 ${node.title}`}
                      data-world-body={node.id}
                      rows={3}
                      className="mt-1 w-full resize-y rounded-[3px] bg-bg-1 px-1 py-[2px] text-12 leading-relaxed text-fg-1 outline-none focus:bg-bg-3"
                    />
                    <div className="mt-1 flex items-center gap-1">
                      <label htmlFor={`world-elevation-${node.id}`} className="shrink-0 text-11 text-fg-3">
                        高度
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
                        aria-label={`高度 ${node.title}`}
                        data-world-elevation={node.id}
                        className="w-16 rounded-[3px] bg-bg-1 px-1 py-[2px] text-12 text-fg-1 outline-none focus:bg-bg-3 disabled:opacity-50"
                      />
                      <span className="text-11 text-fg-3">
                        0–{WORLD_ELEVATION_MAX}；3D 世界里条目会浮在这个高度上（先在世界图上摆过位置才能写）
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1">
                      <label htmlFor={`world-model-${node.id}`} className="shrink-0 text-11 text-fg-3">
                        3D 模型
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
                        aria-label={`3D 模型 ${node.title}`}
                        data-world-model={node.id}
                        className="min-w-0 flex-1 rounded-[3px] bg-bg-1 px-1 py-[2px] text-12 text-fg-1 outline-none focus:bg-bg-3"
                      >
                        <option value="">
                          {modelAssets.length ? '类别几何体（占位）' : '类别几何体（本项目还没有 model 资产）'}
                        </option>
                        {modelAssets.map((asset) => (
                          <option key={asset.id} value={asset.id}>
                            {asset.name}
                          </option>
                        ))}
                      </select>
                      <span className="shrink-0 text-11 text-fg-3">
                        在 3D 世界里渲染哪个模型；加载不出来时退回类别几何体，不会留空白
                      </span>
                    </div>
                  </li>
                ))}
            </ul>
          </section>
        ))}

        <TerrainSection world={world} edit={edit} />

        <div className="mt-1 flex items-center gap-1">
          <select
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as WorldKind)}
            aria-label="新增条目的类型"
            data-world-new-kind
            className="rounded-[var(--nexus-radius-sm)] bg-bg-2 px-1 py-1 text-11 text-fg-1"
          >
            {WORLD_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {WORLD_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() =>
              edit(addWorldNode(world, { kind: newKind, title: `${WORLD_KIND_LABELS[newKind]} · 新条目` }), true)
            }
            data-world-add={newKind}
            className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] px-2 py-1 text-11 text-fg-2 hover:bg-bg-2"
          >
            加一条
          </button>
        </div>
        <p className="mt-2 text-11 leading-relaxed text-fg-3" data-world-note>
          改完即写库（失焦或点删除都会保存）。世界编辑不进画布的撤销栈：Ctrl+Z 只管设计文档。
          {groups.length < WORLD_KINDS.length
            ? ` ${WORLD_KINDS.filter((k) => !counts?.[k]).map((k) => WORLD_KIND_LABELS[k]).join('、')} 这一类还没有条目，可以用上面的下拉补。`
            : ''}
        </p>
        <button
          type="button"
          onClick={() => void worldStore.commit()}
          data-world-save
          className="mt-2 self-start rounded-[var(--nexus-radius-sm)] bg-accent-2 px-3 py-1 text-12 text-accent-fg"
        >
          保存到库
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
}: {
  world: WorldDocument;
  edit: (next: WorldDocument, save?: boolean) => void;
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
    <section className="mt-4" data-world-terrain-panel>
      <h3 className="font-mono text-11 uppercase tracking-wide text-fg-3">地形（可走的圆台与坡）</h3>
      <p className="mt-1 text-11 leading-relaxed text-fg-3">
        站在地形特征上就是站在它的高度上（相机与点击地面都读同一份高度）。剖面两种：台面（硬边）
        与坡（台心到边缘线性降到 0，可走）。没画地形的世界脚下是平的。
        高度 0–{WORLD_TERRAIN_HEIGHT_MAX}，半径 {WORLD_PLATEAU_RADIUS_MIN}–{WORLD_PLATEAU_RADIUS_MAX}；
        重叠的地形取最高的那个。当前 {plateaus.length}/{WORLD_PLATEAU_LIMIT} 个。
      </p>
      <ul className="mt-1 flex flex-col gap-1">
        {plateaus.map((plateau) => (
          <li key={plateau.id} className="flex items-center gap-1" data-world-plateau={plateau.id}>
            <span className="min-w-0 flex-1 truncate font-mono text-11 text-fg-2">
              ({plateau.x}, {plateau.y}) r={plateau.radius} h={plateau.height}
              {plateau.profile === 'cone' ? ' 坡' : ''}
            </span>
            <button
              type="button"
              onClick={() => apply(plateaus.filter((p) => p.id !== plateau.id))}
              aria-label={`删除圆台 ${plateau.id}`}
              data-world-plateau-remove={plateau.id}
              className="shrink-0 px-1 text-12 text-fg-3 hover:text-danger-ink"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <label htmlFor="world-plateau-x" className="shrink-0 text-11 text-fg-3">
          x
        </label>
        <input
          id="world-plateau-x"
          type="number"
          value={draft.x}
          onChange={(e) => setDraft((d) => ({ ...d, x: Number(e.target.value) }))}
          data-world-plateau-input="x"
          className="w-16 rounded-[3px] bg-bg-1 px-1 py-[2px] text-12 text-fg-1 outline-none focus:bg-bg-3"
        />
        <label htmlFor="world-plateau-y" className="shrink-0 text-11 text-fg-3">
          y
        </label>
        <input
          id="world-plateau-y"
          type="number"
          value={draft.y}
          onChange={(e) => setDraft((d) => ({ ...d, y: Number(e.target.value) }))}
          data-world-plateau-input="y"
          className="w-16 rounded-[3px] bg-bg-1 px-1 py-[2px] text-12 text-fg-1 outline-none focus:bg-bg-3"
        />
        <label htmlFor="world-plateau-radius" className="shrink-0 text-11 text-fg-3">
          半径
        </label>
        <input
          id="world-plateau-radius"
          type="number"
          min={WORLD_PLATEAU_RADIUS_MIN}
          max={WORLD_PLATEAU_RADIUS_MAX}
          value={draft.radius}
          onChange={(e) => setDraft((d) => ({ ...d, radius: Number(e.target.value) }))}
          data-world-plateau-input="radius"
          className="w-16 rounded-[3px] bg-bg-1 px-1 py-[2px] text-12 text-fg-1 outline-none focus:bg-bg-3"
        />
        <label htmlFor="world-plateau-height" className="shrink-0 text-11 text-fg-3">
          高度
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
          className="w-16 rounded-[3px] bg-bg-1 px-1 py-[2px] text-12 text-fg-1 outline-none focus:bg-bg-3"
        />
        <label htmlFor="world-plateau-profile" className="shrink-0 text-11 text-fg-3">
          剖面
        </label>
        <select
          id="world-plateau-profile"
          value={draft.profile ?? 'mesa'}
          onChange={(e) =>
            setDraft((d) => ({ ...d, profile: e.target.value === 'cone' ? 'cone' : undefined }))
          }
          data-world-plateau-input="profile"
          className="rounded-[3px] bg-bg-1 px-1 py-[2px] text-12 text-fg-1 outline-none focus:bg-bg-3"
        >
          <option value="mesa">台面（硬边）</option>
          <option value="cone">坡（线性降到 0）</option>
        </select>
        <button
          type="button"
          onClick={() => {
            // 只写 cone：mesa 是缺省，写进文档等于让每个存盘都多一栏没人读的默认值
            const { profile, ...rest } = draft;
            apply([...plateaus, { ...rest, id: `wp_${Date.now().toString(36)}${plateaus.length}`, ...(profile === 'cone' ? { profile: 'cone' as const } : {}) }]);
          }}
          data-world-plateau-add
          className="shrink-0 rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] px-2 py-1 text-11 text-fg-2 hover:bg-bg-2"
        >
          加上去
        </button>
        {world.terrain ? (
          <button
            type="button"
            onClick={() => apply(null)}
            data-world-terrain-clear
            className="shrink-0 px-2 py-1 text-11 text-fg-3 hover:text-danger-ink"
          >
            收掉地形
          </button>
        ) : null}
      </div>
    </section>
  );
}
