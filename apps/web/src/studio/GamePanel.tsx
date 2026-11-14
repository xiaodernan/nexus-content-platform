'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  GAME_ENTITY_KINDS,
  GAME_ENTITY_LABELS,
  GAME_ENTITY_LABELS_EN,
  GAME_KINDS,
  GAME_KIND_LABELS,
  GAME_KIND_STATUS,
  GAME_KIND_STATUS_EN,
  GAME_KIND_TERMS,
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
import type { Locale } from '@/lib/i18n';
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
 * 双语（v735）：locale 由 StudioShell 透传；zh 原文原样保留，en 逐句对应。
 */

const KIND_TERM_EN: Record<GameKind, string> = Object.fromEntries(
  GAME_KINDS.map((kind, index) => [kind, GAME_KIND_TERMS[index]]),
) as Record<GameKind, string>;

const COPY = {
  zh: {
    state: { idle: '', loading: '读取中…', dirty: '未保存', saving: '保存中…', saved: '已保存', error: '保存失败' } as Record<string, string>,
    game: '游戏',
    loadGame: '读取游戏设计…',
    unreadableBody: (reason: string) =>
      `读不出库里那份游戏：${reason}。下面这个按钮会写一份新的模板骨架进去，覆盖掉读不出来的那份——先确认不是契约漂移再点。`,
    noDesignBody:
      '这个项目还没有游戏设计。可以先建一份模板骨架：§54 的 11 类各留一个空实体，说明和数值都由你填。' +
      '想要 §52 那份 RPG 草稿：切到「Agent 作业」跑一次检查，点那一步上的「接受进项目」——项目已有游戏时它不会覆盖。' +
      '整份设计由模型生成（§52 的 Game Agent 真规划）要真实 provider，没接入前不做假生成。',
    createSkeleton: '创建游戏骨架（模板）',
    defaultName: '未命名游戏',
    nameAria: '游戏名称',
    summaryPlaceholder: '一句话说明这是个什么样的游戏',
    summaryAria: '游戏概述',
    kindLabel: '游戏类型',
    kindSelectAria: '游戏类型',
    progress: (entities: number, refs: number, fleshed: number) => `${entities} 个实体 · ${refs} 条引用 · ${fleshed} 个已填内容`,
    play: '试玩这份设计 →',
    editsNote:
      '改完即写库（失焦或点删除都会保存）。游戏编辑不进画布的撤销栈：Ctrl+Z 只管设计文档。',
    missingKinds: (names: string) => ` ${names} 这一类还没有实体，可以用上面的下拉补。`,
    addEntity: '加一个实体',
    newKindAria: '新增实体的类型',
    saveToLib: '保存到库',
    entityNameAria: (name: string) => `实体名称 ${name}`,
    deleteEntityTitle: (refCount: number) =>
      refCount ? `删除这个实体（会一并去掉 ${refCount} 条引用）` : '删除这个实体',
    deleteEntityAria: (name: string) => `删除 ${name}`,
    notesPlaceholder: '这块东西是什么、为什么这样设计',
    entityNotesAria: (name: string) => `设计说明 ${name}`,
    statAria: (key: string) => `数值 ${key}`,
    statRemoveAria: (key: string) => `删除数值 ${key}`,
    emptyStat: (key: string) => `${key} 是空的：没有改动。要删掉这条数值点右边的 ×。`,
    statNameAria: '新数值的键名',
    statValueAria: '新数值的值',
    statAdd: '加数值',
    danglingRef: (id: string) => `（悬空引用 ${id}）`,
    noRefs: '还没有引用别的实体',
    refTargetAria: '引用指向的实体',
    pointTo: '指向…',
    rolePlaceholder: '关系',
    roleTitle: '这条引用是什么关系，例如「装备」「掉落」；留空则图上不写字',
    roleAria: '引用关系',
    removeRefAria: '摘掉这条引用',
    noticeNoTarget: '先选一个目标实体，再连引用。',
    linkRef: '连引用',
    groupJoin: '、',
    wrapRole: (role: string) => `（${role}）`,
    entityLabel: (kind: GameEntityKind) => GAME_ENTITY_LABELS[kind],
    kindTerm: (kind: GameKind) => GAME_KIND_LABELS[kind],
    kindNote: (kind: GameKind) => GAME_KIND_STATUS[kind].note,
  },
  en: {
    state: { idle: '', loading: 'Loading…', dirty: 'Unsaved', saving: 'Saving…', saved: 'Saved', error: 'Save failed' } as Record<string, string>,
    game: 'Game',
    loadGame: 'Reading the game design…',
    unreadableBody: (reason: string) =>
      `The stored game could not be read: ${reason}. The button below writes a fresh template skeleton over ` +
      'the unreadable one — confirm it is not a contract drift before clicking.',
    noDesignBody:
      'This project has no game design yet. Start with a template skeleton: the §54 kinds, one empty entity each, for you to fill in. ' +
      'For the §52 RPG draft: switch to "Agent job", run a check, then click "Accept into project" on that step — it will not overwrite an existing game. ' +
      'A full model-generated design (a real §52 Game Agent plan) needs a real provider; until one is wired, nothing fake is generated.',
    createSkeleton: 'Create game skeleton (template)',
    defaultName: 'Untitled game',
    nameAria: 'Game name',
    summaryPlaceholder: 'One line: what this game is',
    summaryAria: 'Game summary',
    kindLabel: 'Game kind',
    kindSelectAria: 'Game kind',
    progress: (entities: number, refs: number, fleshed: number) => `${entities} entities · ${refs} refs · ${fleshed} fleshed out`,
    play: 'Play this design →',
    editsNote:
      "Edits write straight to the DB (blur or delete saves). Game edits don't enter the canvas undo stack: Ctrl+Z only covers the design document.",
    missingKinds: (names: string) => ` These kinds have no entity yet: ${names}. Add them from the dropdown above.`,
    addEntity: 'Add one entity',
    newKindAria: 'Kind of the new entity',
    saveToLib: 'Save to library',
    entityNameAria: (name: string) => `Entity name ${name}`,
    deleteEntityTitle: (refCount: number) =>
      refCount ? `Delete this entity (also removes ${refCount} references)` : 'Delete this entity',
    deleteEntityAria: (name: string) => `Delete ${name}`,
    notesPlaceholder: 'What this thing is and why it is designed this way',
    entityNotesAria: (name: string) => `Design notes ${name}`,
    statAria: (key: string) => `Stat ${key}`,
    statRemoveAria: (key: string) => `Remove stat ${key}`,
    emptyStat: (key: string) => `${key} is empty: nothing changed. To delete this stat, click the × on the right.`,
    statNameAria: 'New stat key',
    statValueAria: 'New stat value',
    statAdd: 'Add stat',
    danglingRef: (id: string) => `(dangling reference ${id})`,
    noRefs: 'No references to other entities yet',
    refTargetAria: 'Reference target entity',
    pointTo: 'Point to…',
    rolePlaceholder: 'Role',
    roleTitle: 'What this reference means, e.g. "equips", "drops"; leave empty and the graph draws no label',
    roleAria: 'Reference role',
    removeRefAria: 'Remove this reference',
    noticeNoTarget: 'Pick a target entity first, then link.',
    linkRef: 'Link',
    groupJoin: ', ',
    wrapRole: (role: string) => ` (${role})`,
    entityLabel: (kind: GameEntityKind) => GAME_ENTITY_LABELS_EN[kind],
    kindTerm: (kind: GameKind) => KIND_TERM_EN[kind],
    kindNote: (kind: GameKind) => GAME_KIND_STATUS_EN[kind],
  },
} as const;

type GameCopy = (typeof COPY)[Locale];

/** 草稿键：一个实体的一条数值 / 一条待连的引用，各自独立存，别互相踩 */
const statKey = (entityId: string, key: string) => `${entityId}::${key}`;

export function GamePanel({ locale = 'zh' }: { locale?: Locale }) {
  const c = COPY[locale];
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
      <div className="wd-scrollPad" data-game-panel>
        <h2 className="wd-label">{c.game}</h2>
        <p className="wd-body12" data-game-empty>
          {snapshot.saveState === 'loading'
            ? c.loadGame
            : snapshot.error
              ? c.unreadableBody(snapshot.error)
              : c.noDesignBody}
        </p>
        {snapshot.error ? (
          <p className="wd-danger11" data-game-error>
            {snapshot.error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={snapshot.saveState === 'saving'}
          onClick={() => void gameStore.createSkeleton(studio.document?.name ?? c.defaultName)}
          data-game-create
          className="wd-selfStart wd-accentBtn wd-dis50"
        >
          {c.createSkeleton}
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
    <div className="wd-rootCol" data-game-panel>
      <header className="wd-headBordered">
        <div className="wd-row2">
          <h2 className="wd-label">{c.game}</h2>
          <span
            className={cn('wd-monoFaintEnd', snapshot.saveState === 'error' && 'wd-dangerText')}
            data-game-state
          >
            {c.state[snapshot.saveState] ?? ''}
          </span>
          <span data-game-pending={snapshot.saveState === 'saving' || snapshot.saveState === 'dirty' ? 'true' : 'false'} />
        </div>
        <input
          value={game.name}
          onChange={(e) => edit({ ...game, name: e.target.value })}
          onBlur={() => edit({ ...game, name: game.name.trim() || c.defaultName }, true)}
          aria-label={c.nameAria}
          data-game-name
          className="wd-wfullInput13"
        />
        <textarea
          value={game.summary}
          onChange={(e) => edit({ ...game, summary: e.target.value })}
          onBlur={() => edit(game, true)}
          placeholder={c.summaryPlaceholder}
          aria-label={c.summaryAria}
          data-game-summary
          rows={2}
          className="wd-areaResize"
        />
        {/* §51：类型是**文档字段**，不是界面状态——它决定试玩页跑哪条管线（§16）。
            下面那句"接没接"直接读 GAME_KIND_STATUS：面板自己判断一遍，
            就会和分派点说两套话（这里说能玩、点进去是空场子，正是 §159 禁止的那种谎）。 */}
        <label className="wd-rowMt2faint">
          {c.kindLabel}
          <select
            value={game.kind}
            onChange={(e) => edit({ ...game, kind: e.target.value as GameKind }, true)}
            aria-label={c.kindSelectAria}
            data-game-kind={game.kind}
            className="wd-growInputB2"
          >
            {GAME_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {c.kindTerm(kind)}
              </option>
            ))}
          </select>
        </label>
        <p className="gp-faintMt1" data-game-kind-note={game.kind}>
          {c.kindNote(game.kind)}
        </p>
        <p className="gp-monoFaintMt1" data-game-progress>
          {c.progress(game.entities.length, refTotal, fleshedOutCount(game))}
        </p>
        {/* §50：这一页改的就是可玩投影读的那份文档，所以"试玩"永远指向同一份真值（§16）。
            新标签打开：跳走会丢掉这里没保存完的编辑。 */}
        <a
          href={`/game/${studio.projectId}`}
          target="_blank"
          rel="noreferrer"
          className="gp-tag"
          data-game-play
        >
          {c.play}
        </a>
        {snapshot.error ? (
          <p className="wd-dangerMt2" data-game-error>
            {snapshot.error}
          </p>
        ) : null}
        {snapshot.notice ? (
          <p className="gp-warnMt2" data-game-notice>
            {snapshot.notice}
          </p>
        ) : null}
      </header>

      <div className="wd-scrollP2">
        {groups.map((kind) => (
          <section key={kind} className="wd-mb3" data-game-group={kind}>
            <h3 className="wd-labelMb1">
              {c.entityLabel(kind)}
              <span className="wd-end">{counts?.[kind] ?? 0}</span>
            </h3>
            <ul className="wd-col2">
              {game.entities
                .filter((entity) => entity.kind === kind)
                .map((entity) => (
                  <li key={entity.id} data-game-entity={entity.id}>
                    <EntityCard
                      game={game}
                      entity={entity}
                      edit={edit}
                      c={c}
                      onNotice={(message) => gameStore.showNotice(message)}
                    />
                  </li>
                ))}
            </ul>
          </section>
        ))}

        <div className="wd-rowMt1">
          <select
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as GameEntityKind)}
            aria-label={c.newKindAria}
            data-game-new-kind
            className="wd-chipSelect"
          >
            {GAME_ENTITY_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {c.entityLabel(kind)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => edit(addEntity(game, { kind: newKind, name: c.entityLabel(newKind) }), true)}
            data-game-add={newKind}
            className="wd-ghostBtn"
          >
            {c.addEntity}
          </button>
        </div>
        <p className="wd-body11Mt2" data-game-note>
          {c.editsNote}
          {groups.length < GAME_ENTITY_KINDS.length
            ? c.missingKinds(GAME_ENTITY_KINDS.filter((k) => !counts?.[k]).map((k) => c.entityLabel(k)).join(c.groupJoin))
            : ''}
        </p>
        <button
          type="button"
          onClick={() => void gameStore.commit()}
          data-game-save
          className="wd-mt2 wd-selfStart wd-accentBtn"
        >
          {c.saveToLib}
        </button>
        <GameCodeExport projectId={studio.projectId} locale={locale} />
      </div>
    </div>
  );
}

/** 一个实体：说明、开放数值、它发出的引用。草稿状态放在这里，所以两条数值不会互相踩 */
function EntityCard({
  game,
  entity,
  edit,
  c,
  onNotice,
}: {
  game: GameDocument;
  entity: GameEntity;
  edit: (next: GameDocument, save?: boolean) => void;
  c: GameCopy;
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
    <div className="wd-card">
      <div className="wd-row1">
        <input
          value={entity.name}
          onChange={(e) => edit(updateEntity(game, entity.id, { name: e.target.value }))}
          onBlur={() => edit(game, true)}
          aria-label={c.entityNameAria(entity.name)}
          data-game-entity-name={entity.id}
          className="wd-growInput"
        />
        <button
          type="button"
          title={c.deleteEntityTitle(refCount)}
          onClick={() => edit(removeEntity(game, entity.id), true)}
          aria-label={c.deleteEntityAria(entity.name)}
          data-game-remove={entity.id}
          className="wd-delBtn"
        >
          ×
        </button>
      </div>
      <textarea
        value={entity.notes}
        onChange={(e) => edit(updateEntity(game, entity.id, { notes: e.target.value }))}
        onBlur={() => edit(game, true)}
        placeholder={c.notesPlaceholder}
        aria-label={c.entityNotesAria(entity.name)}
        data-game-entity-notes={entity.id}
        rows={2}
        className="wd-areaResizeMt"
      />

      <div className="gp-mt1" data-game-stats={entity.id}>
        {Object.keys(entity.stats).map((key) => {
          const dk = statKey(entity.id, key);
          return (
            <div key={key} className="wd-row1">
              <span className="wd-fname11truncate">{key}</span>
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
                    onNotice(c.emptyStat(key));
                    return;
                  }
                  writeStat(key, raw);
                }}
                aria-label={c.statAria(key)}
                data-game-stat={`${entity.id}:${key}`}
                className="gp-w80Input"
              />
              <button
                type="button"
                onClick={() => edit(removeStat(game, entity.id, key), true)}
                aria-label={c.statRemoveAria(key)}
                data-game-stat-remove={`${entity.id}:${key}`}
                className="wd-delBtnSm"
              >
                ×
              </button>
            </div>
          );
        })}
        <div className="wd-rowMt1">
          <input
            value={newStat.key}
            onChange={(e) => setNewStat({ ...newStat, key: e.target.value })}
            placeholder={STAT_HINTS[entity.kind][0] ?? 'health'}
            aria-label={c.statNameAria}
            data-game-stat-key={entity.id}
            className="wd-growInputPh"
          />
          <input
            type="number"
            step="any"
            value={newStat.value}
            onChange={(e) => setNewStat({ ...newStat, value: e.target.value })}
            placeholder="0"
            aria-label={c.statValueAria}
            data-game-stat-value={entity.id}
            className="gp-w16Mode"
          />
          <button
            type="button"
            onClick={() => {
              if (writeStat(newStat.key, newStat.value)) setNewStat({ key: '', value: '' });
            }}
            data-game-stat-add={entity.id}
            className="wd-ghostBtnSm"
          >
            {c.statAdd}
          </button>
        </div>
      </div>

      <div className="gp-hrMt" data-game-refs={entity.id}>
        {entity.refs.length ? (
          <ul className="gp-col1">
            {entity.refs.map((ref) => {
              const target = game.entities.find((e) => e.id === ref.to);
              return (
                <li key={ref.id} className="gp-row1ink" data-game-ref={ref.id}>
                  <span className="wd-nameTrunc" data-game-ref-label={ref.id}>
                    → {target ? `${target.name}${ref.role ? c.wrapRole(ref.role) : ''}` : c.danglingRef(ref.to)}
                  </span>
                  <button
                    type="button"
                    onClick={() => edit(removeRef(game, entity.id, ref.id), true)}
                    aria-label={c.removeRefAria}
                    data-game-ref-remove={ref.id}
                    className="wd-xshrink"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="wd-faint11" data-game-ref-empty={entity.id}>
            {c.noRefs}
          </p>
        )}
        <div className="wd-wrapCenter1">
          <select
            value={link.to}
            onChange={(e) => setLink({ ...link, to: e.target.value })}
            aria-label={c.refTargetAria}
            data-game-ref-target={entity.id}
            className="wd-growBasis"
          >
            <option value="">{c.pointTo}</option>
            {others.map((e) => (
              <option key={e.id} value={e.id}>
                {c.entityLabel(e.kind)} · {e.name}
              </option>
            ))}
          </select>
          <input
            value={link.role}
            onChange={(e) => setLink({ ...link, role: e.target.value })}
            placeholder={c.rolePlaceholder}
            title={c.roleTitle}
            aria-label={c.roleAria}
            data-game-ref-role={entity.id}
            className="gp-mode72"
          />
          <button
            type="button"
            onClick={() => {
              if (!link.to) {
                onNotice(c.noticeNoTarget);
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
            className="wd-ghostBtnSm"
          >
            {c.linkRef}
          </button>
        </div>
      </div>
    </div>
  );
}
