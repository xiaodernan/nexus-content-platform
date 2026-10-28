'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  GAME_ENTITY_KINDS,
  GAME_ENTITY_LABELS,
  GAME_KINDS,
  GAME_KIND_LABELS,
  GAME_KIND_STATUS,
  STAT_HINTS,
  addEntity,
  countRefsFor,
  fleshedOutCount,
  gameCounts,
  linkEntities,
  removeEntity,
  removeRef,
  removeStat,
  setStat,
  updateEntity,
  type GameDocument,
  type GameEntity,
  type GameEntityKind,
  type GameKind,
} from '@nexus/game-model';
import { cn } from '@/lib/cn';
import { useStudioReady } from './store';
import { useGame, gameStore } from './gameStore';
import { GameCodeExport } from './GameCodeExport';

/**
 * §54 Game Design System 的填写界面：11 类实体、每类的开放数值、实体之间的有向引用。
 *
 * 三件事刻意没做，界面上也写着：
 * - §52 的 Game Agent 今天给的是**确定性配方草稿**（`@/lib/agent-game-draft`，DEMO 规划、不是模型），
 *   它在「Agent 作业」那一栏里生成，由用户点那一步上的「接受进项目」才落到这里；
 *   本面板自己只提供**模板骨架**——11 类各一条空实体，说明与数值一律留空（§159 不许假生成）；
 * - 不预填"平衡数值"：编一套 health=100 出来就是替用户做设计，那串数字没有任何依据；
 * - 游戏编辑不进画布的 Command 撤销栈（§150 目前只覆盖设计文档），所以每次写库对应一个明确动作。
 *
 * 引用有两种画法：这里是挂在发起方实体下面的**列表**（能连能摘），
 * 主区第五个视图「游戏图」是同一份 refs 的图投影（§54）。两处写的是同一个 store，不分叉。
 */

const STATE_TEXT: Record<string, string> = {
  idle: '',
  loading: '读取中…',
  dirty: '未保存',
  saving: '保存中…',
  saved: '已保存',
  error: '保存失败',
};

/** 草稿键：一个实体的一条数值 / 一条待连的引用，各自独立存，别互相踩 */
const statKey = (entityId: string, key: string) => `${entityId}::${key}`;

export function GamePanel() {
  const studio = useStudioReady();
  const snapshot = useGame();
  const [newKind, setNewKind] = useState<GameEntityKind>('enemy');
  const game = snapshot.game;

  useEffect(() => {
    gameStore.ensure(studio.projectId);
  }, [studio.projectId]);

  const counts = useMemo(() => (game ? gameCounts(game) : null), [game]);

  if (!game) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-[var(--nexus-space-3)]" data-game-panel>
        <h2 className="font-mono text-12 uppercase tracking-wide text-fg-3">游戏</h2>
        <p className="text-12 leading-relaxed text-fg-2" data-game-empty>
          {snapshot.saveState === 'loading'
            ? '读取游戏设计…'
            : snapshot.error
              ? `读不出库里那份游戏：${snapshot.error}。下面这个按钮会写一份新的模板骨架进去，覆盖掉读不出来的那份——先确认不是契约漂移再点。`
              : '这个项目还没有游戏设计。可以先建一份模板骨架：§54 的 11 类各留一个空实体，说明和数值都由你填。' +
                '想要 §52 那份 RPG 草稿：切到「Agent 作业」跑一次检查，点那一步上的「接受进项目」——项目已有游戏时它不会覆盖。' +
                '整份设计由模型生成（§52 的 Game Agent 真规划）要真实 provider，没接入前不做假生成。'}
        </p>
        {snapshot.error ? (
          <p className="text-11 text-danger" data-game-error>
            {snapshot.error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={snapshot.saveState === 'saving'}
          onClick={() => void gameStore.createSkeleton(studio.document?.name ?? '未命名游戏')}
          data-game-create
          className="self-start rounded-[var(--nexus-radius-sm)] bg-accent-2 px-3 py-1 text-12 text-accent-fg disabled:opacity-50"
        >
          创建游戏骨架（模板）
        </button>
      </div>
    );
  }

  const edit = (next: GameDocument, save = false) => {
    gameStore.setLocal(next);
    if (save) void gameStore.commit();
  };

  const groups = GAME_ENTITY_KINDS.filter((kind) => counts?.[kind]);
  const refTotal = game.entities.reduce((n, e) => n + e.refs.length, 0);

  return (
    <div className="flex h-full min-h-0 flex-col" data-game-panel>
      <header className="shrink-0 border-b border-[var(--nexus-color-border-subtle)] p-[var(--nexus-space-3)]">
        <div className="flex items-center gap-2">
          <h2 className="font-mono text-12 uppercase tracking-wide text-fg-3">游戏</h2>
          <span
            className={cn(
              'ml-auto font-mono text-11',
              snapshot.saveState === 'error' ? 'text-danger' : 'text-fg-3',
            )}
            data-game-state
          >
            {STATE_TEXT[snapshot.saveState] ?? ''}
          </span>
          <span data-game-pending={snapshot.saveState === 'saving' || snapshot.saveState === 'dirty' ? 'true' : 'false'} />
        </div>
        <input
          value={game.name}
          onChange={(e) => edit({ ...game, name: e.target.value })}
          onBlur={() => edit({ ...game, name: game.name.trim() || '未命名游戏' }, true)}
          aria-label="游戏名称"
          data-game-name
          className="mt-2 w-full rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-13 text-fg-1 outline-none focus:bg-bg-3"
        />
        <textarea
          value={game.summary}
          onChange={(e) => edit({ ...game, summary: e.target.value })}
          onBlur={() => edit(game, true)}
          placeholder="一句话说明这是个什么样的游戏"
          aria-label="游戏概述"
          data-game-summary
          rows={2}
          className="mt-2 w-full resize-y rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-12 text-fg-1 outline-none focus:bg-bg-3"
        />
        {/* §51：类型是**文档字段**，不是界面状态——它决定试玩页跑哪条管线（§16）。
            下面那句"接没接"直接读 GAME_KIND_STATUS：面板自己判断一遍，
            就会和分派点说两套话（这里说能玩、点进去是空场子，正是 §159 禁止的那种谎）。 */}
        <label className="mt-2 flex items-center gap-2 text-11 text-fg-3">
          游戏类型
          <select
            value={game.kind}
            onChange={(e) => edit({ ...game, kind: e.target.value as GameKind }, true)}
            aria-label="游戏类型"
            data-game-kind={game.kind}
            className="flex-1 rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-12 text-fg-1 outline-none"
          >
            {GAME_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {GAME_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-1 text-11 text-fg-3" data-game-kind-note={game.kind}>
          {GAME_KIND_STATUS[game.kind].note}
        </p>
        <p className="mt-1 font-mono text-11 text-fg-3" data-game-progress>
          {game.entities.length} 个实体 · {refTotal} 条引用 · {fleshedOutCount(game)} 个已填内容
        </p>
        {/* §50：这一页改的就是可玩投影读的那份文档，所以"试玩"永远指向同一份真值（§16）。
            新标签打开：跳走会丢掉这里没保存完的编辑。 */}
        <a
          href={`/game/${studio.projectId}`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block rounded-[var(--nexus-radius-sm)] bg-accent-2 px-2 py-1 font-mono text-11 text-accent-fg"
          data-game-play
        >
          试玩这份设计 →
        </a>
        {snapshot.error ? (
          <p className="mt-2 text-11 text-danger" data-game-error>
            {snapshot.error}
          </p>
        ) : null}
        {snapshot.notice ? (
          <p className="mt-2 text-11 text-warn" data-game-notice>
            {snapshot.notice}
          </p>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-[var(--nexus-space-2)]">
        {groups.map((kind) => (
          <section key={kind} className="mb-3" data-game-group={kind}>
            <h3 className="mb-1 flex items-center font-mono text-11 uppercase tracking-wide text-fg-3">
              {GAME_ENTITY_LABELS[kind]}
              <span className="ml-auto">{counts?.[kind] ?? 0}</span>
            </h3>
            <ul className="flex flex-col gap-2">
              {game.entities
                .filter((entity) => entity.kind === kind)
                .map((entity) => (
                  <li key={entity.id} data-game-entity={entity.id}>
                    <EntityCard
                      game={game}
                      entity={entity}
                      edit={edit}
                      onNotice={(message) => gameStore.showNotice(message)}
                    />
                  </li>
                ))}
            </ul>
          </section>
        ))}

        <div className="mt-1 flex items-center gap-1">
          <select
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as GameEntityKind)}
            aria-label="新增实体的类型"
            data-game-new-kind
            className="rounded-[var(--nexus-radius-sm)] bg-bg-2 px-1 py-1 text-11 text-fg-1"
          >
            {GAME_ENTITY_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {GAME_ENTITY_LABELS[kind]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => edit(addEntity(game, { kind: newKind, name: GAME_ENTITY_LABELS[newKind] }), true)}
            data-game-add={newKind}
            className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] px-2 py-1 text-11 text-fg-2 hover:bg-bg-2"
          >
            加一个实体
          </button>
        </div>
        <p className="mt-2 text-11 leading-relaxed text-fg-3" data-game-note>
          改完即写库（失焦或点删除都会保存）。游戏编辑不进画布的撤销栈：Ctrl+Z 只管设计文档。
          {groups.length < GAME_ENTITY_KINDS.length
            ? ` ${GAME_ENTITY_KINDS.filter((k) => !counts?.[k]).map((k) => GAME_ENTITY_LABELS[k]).join('、')} 这一类还没有实体，可以用上面的下拉补。`
            : ''}
        </p>
        <button
          type="button"
          onClick={() => void gameStore.commit()}
          data-game-save
          className="mt-2 self-start rounded-[var(--nexus-radius-sm)] bg-accent-2 px-3 py-1 text-12 text-accent-fg"
        >
          保存到库
        </button>
        <GameCodeExport projectId={studio.projectId} />
      </div>
    </div>
  );
}

/** 一个实体：说明、开放数值、它发出的引用。草稿状态放在这里，所以两条数值不会互相踩 */
function EntityCard({
  game,
  entity,
  edit,
  onNotice,
}: {
  game: GameDocument;
  entity: GameEntity;
  edit: (next: GameDocument, save?: boolean) => void;
  onNotice: (message: string) => void;
}) {
  // 键名与数字都边敲边存草稿，失焦才过模型层校验：setStat 只接受有限数，
  // 敲到一半的 "" / "-" 不该被当成一次写入，也不该被静默丢掉（所以不合法时要出声）
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newStat, setNewStat] = useState({ key: '', value: '' });
  const [link, setLink] = useState({ to: '', role: '' });

  const writeStat = (key: string, value: string): boolean => {
    // 空串走 NaN：Number('') 是 0，直接喂给 setStat 等于把"清空"写成"设成 0"
    const result = setStat(game, entity.id, key, value.trim() === '' ? Number.NaN : Number(value));
    if (result.reason) {
      onNotice(result.reason);
      return false;
    }
    edit(result.document, true);
    return true;
  };

  const refCount = countRefsFor(game, entity.id);
  const others = game.entities.filter((e) => e.id !== entity.id);

  return (
    <div className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-subtle)] bg-bg-2 p-2">
      <div className="flex items-center gap-1">
        <input
          value={entity.name}
          onChange={(e) => edit(updateEntity(game, entity.id, { name: e.target.value }))}
          onBlur={() => edit(game, true)}
          aria-label={`实体名称 ${entity.name}`}
          data-game-entity-name={entity.id}
          className="min-w-0 flex-1 rounded-[3px] bg-bg-1 px-1 py-[2px] text-12 text-fg-1 outline-none focus:bg-bg-3"
        />
        <button
          type="button"
          title={refCount ? `删除这个实体（会一并去掉 ${refCount} 条引用）` : '删除这个实体'}
          onClick={() => edit(removeEntity(game, entity.id), true)}
          aria-label={`删除 ${entity.name}`}
          data-game-remove={entity.id}
          className="shrink-0 px-1 text-12 text-fg-3 hover:text-danger"
        >
          ×
        </button>
      </div>
      <textarea
        value={entity.notes}
        onChange={(e) => edit(updateEntity(game, entity.id, { notes: e.target.value }))}
        onBlur={() => edit(game, true)}
        placeholder="这块东西是什么、为什么这样设计"
        aria-label={`设计说明 ${entity.name}`}
        data-game-entity-notes={entity.id}
        rows={2}
        className="mt-1 w-full resize-y rounded-[3px] bg-bg-1 px-1 py-[2px] text-12 leading-relaxed text-fg-1 outline-none focus:bg-bg-3"
      />

      <div className="mt-1" data-game-stats={entity.id}>
        {Object.keys(entity.stats).map((key) => {
          const dk = statKey(entity.id, key);
          return (
            <div key={key} className="flex items-center gap-1">
              <span className="min-w-0 flex-1 truncate font-mono text-11 text-fg-2">{key}</span>
              <input
                type="number"
                step="any"
                value={drafts[dk] ?? String(entity.stats[key] ?? '')}
                onChange={(e) => setDrafts({ ...drafts, [dk]: e.target.value })}
                onBlur={() => {
                  const raw = drafts[dk];
                  setDrafts({ ...drafts, [dk]: '' });
                  if (raw === undefined) return;
                  if (raw.trim() === '') {
                    onNotice(`${key} 是空的：没有改动。要删掉这条数值点右边的 ×。`);
                    return;
                  }
                  writeStat(key, raw);
                }}
                aria-label={`数值 ${key}`}
                data-game-stat={`${entity.id}:${key}`}
                className="w-20 rounded-[3px] bg-bg-1 px-1 py-[2px] text-11 text-fg-1 outline-none focus:bg-bg-3"
              />
              <button
                type="button"
                onClick={() => edit(removeStat(game, entity.id, key), true)}
                aria-label={`删除数值 ${key}`}
                data-game-stat-remove={`${entity.id}:${key}`}
                className="shrink-0 px-1 text-11 text-fg-3 hover:text-danger"
              >
                ×
              </button>
            </div>
          );
        })}
        <div className="mt-1 flex items-center gap-1">
          <input
            value={newStat.key}
            onChange={(e) => setNewStat({ ...newStat, key: e.target.value })}
            placeholder={STAT_HINTS[entity.kind][0] ?? 'health'}
            aria-label="新数值的键名"
            data-game-stat-key={entity.id}
            className="min-w-0 flex-1 rounded-[3px] bg-bg-1 px-1 py-[2px] text-11 text-fg-1 outline-none placeholder:text-fg-3 focus:bg-bg-3"
          />
          <input
            type="number"
            step="any"
            value={newStat.value}
            onChange={(e) => setNewStat({ ...newStat, value: e.target.value })}
            placeholder="0"
            aria-label="新数值的值"
            data-game-stat-value={entity.id}
            className="w-16 rounded-[3px] bg-bg-1 px-1 py-[2px] text-11 text-fg-1 outline-none placeholder:text-fg-3 focus:bg-bg-3"
          />
          <button
            type="button"
            onClick={() => {
              if (writeStat(newStat.key, newStat.value)) setNewStat({ key: '', value: '' });
            }}
            data-game-stat-add={entity.id}
            className="shrink-0 rounded-[3px] border border-[var(--nexus-color-border-strong)] px-1 py-[2px] text-11 text-fg-2 hover:bg-bg-3"
          >
            加数值
          </button>
        </div>
      </div>

      <div className="mt-2 border-t border-[var(--nexus-color-border-subtle)] pt-1" data-game-refs={entity.id}>
        {entity.refs.length ? (
          <ul className="flex flex-col gap-1">
            {entity.refs.map((ref) => {
              const target = game.entities.find((e) => e.id === ref.to);
              return (
                <li key={ref.id} className="flex items-center gap-1 text-11" data-game-ref={ref.id}>
                  <span className="min-w-0 flex-1 truncate text-fg-2" data-game-ref-label={ref.id}>
                    → {target ? `${target.name}${ref.role ? `（${ref.role}）` : ''}` : `（悬空引用 ${ref.to}）`}
                  </span>
                  <button
                    type="button"
                    onClick={() => edit(removeRef(game, entity.id, ref.id), true)}
                    aria-label="摘掉这条引用"
                    data-game-ref-remove={ref.id}
                    className="shrink-0 px-1 text-fg-3 hover:text-danger"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-11 text-fg-3" data-game-ref-empty={entity.id}>
            还没有引用别的实体
          </p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <select
            value={link.to}
            onChange={(e) => setLink({ ...link, to: e.target.value })}
            aria-label="引用指向的实体"
            data-game-ref-target={entity.id}
            className="min-w-0 max-w-full flex-1 basis-28 rounded-[3px] bg-bg-1 px-1 py-[2px] text-11 text-fg-1 outline-none focus:bg-bg-3"
          >
            <option value="">指向…</option>
            {others.map((e) => (
              <option key={e.id} value={e.id}>
                {GAME_ENTITY_LABELS[e.kind]} · {e.name}
              </option>
            ))}
          </select>
          <input
            value={link.role}
            onChange={(e) => setLink({ ...link, role: e.target.value })}
            placeholder="关系"
            title="这条引用是什么关系，例如「装备」「掉落」；留空则图上不写字"
            aria-label="引用关系"
            data-game-ref-role={entity.id}
            className="w-[72px] min-w-0 shrink-0 rounded-[3px] bg-bg-1 px-1 py-[2px] text-11 text-fg-1 outline-none placeholder:text-fg-3 focus:bg-bg-3"
          />
          <button
            type="button"
            onClick={() => {
              if (!link.to) {
                onNotice('先选一个目标实体，再连引用。');
                return;
              }
              const result = linkEntities(game, entity.id, link.to, link.role);
              if (result.reason) {
                onNotice(result.reason);
                return;
              }
              setLink({ to: '', role: '' });
              edit(result.document, true);
            }}
            data-game-ref-add={entity.id}
            className="shrink-0 rounded-[3px] border border-[var(--nexus-color-border-strong)] px-1 py-[2px] text-11 text-fg-2 hover:bg-bg-3"
          >
            连引用
          </button>
        </div>
      </div>
    </div>
  );
}
