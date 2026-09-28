'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_SHOT_MS,
  SHOT_CAMERAS,
  SHOT_TRANSITIONS,
  timelineOf,
  type ShotCamera,
  type ShotTransition,
  type StoryboardShot,
} from '@nexus/video-model';
import { cn } from '@/lib/cn';
import { csrfHeaders } from '@/lib/csrf';
import { useStudioReady } from './store';
import { storyboardStore, useStoryboard } from './storyboardStore';

/**
 * §40-42 分镜面板：Prompt → Storyboard → Shot list → Timeline 的界面入口。
 *
 * 三件事在界面上写着，不藏着：
 * - 「切一版分镜」是**本地确定性断句**，不是 AI 分镜（notes 里那句原样显示，§159 不许假生成）；
 * - 时间线**能编辑不能播**：§40 的 Video generation 那一格要真 provider，本机不假造像素，
 *   所以 `playable` 一直是 false，而这一条理由要读得出来（blockers 原文显示）；
 * - audio / subtitles / effects 三条轨照样列出来，各带一句"为什么是空的"——
 *   缺这一句，界面上"没有音频"与"渲染失败"就长得一模一样（§41）。
 *
 * 每一次改镜头都是一个补丁事务（§150）：撤销/重做是真的能回，不是重打一遍。
 */

const STATE_TEXT: Record<string, string> = {
  idle: '',
  loading: '读取中…',
  dirty: '未保存',
  saving: '保存中…',
  saved: '已保存',
  error: '保存失败',
};

const CAMERA_LABELS: Record<ShotCamera, string> = {
  wide: '宽景',
  medium: '中景',
  close: '特写',
  detail: '细部',
  tracking: '跟移',
  aerial: '航拍',
};

const TRANSITION_LABELS: Record<ShotTransition, string> = {
  cut: '硬切',
  fade: '淡入',
  dissolve: '叠化',
  wipe: '划像',
};

export function StoryboardPanel() {
  const studio = useStudioReady();
  const snapshot = useStoryboard();
  const [prompt, setPrompt] = useState('');
  /** 草稿：镜头文本与时长各自独立存，失焦才写成一个事务——打字过程中不该一次次 PUT */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  /**
   * §40 那一格欠的入口：镜头可以挂「这一镜里是谁」与「用哪张图当参考」。
   * 名册与资产清单从服务端读（不是让客户端猜 id）——挂上去的 id 由 `saveStoryboard`
   * 那侧的 `firstForeignRef` 校验归属，所以这里的列表就是唯一能被接受的那一批。
   */
  const [roster, setRoster] = useState<{
    characters: { id: string; name: string }[];
    assets: { id: string; name: string }[];
  }>({ characters: [], assets: [] });
  const [rosterNote, setRosterNote] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const sb = snapshot.storyboard;

  useEffect(() => {
    storyboardStore.ensure(studio.projectId);
  }, [studio.projectId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [c, a] = await Promise.all([
          fetch(`/api/projects/${studio.projectId}/characters`, { cache: 'no-store' })
            .then((r) => r.json())
            .catch(() => null),
          fetch(`/api/projects/${studio.projectId}/assets`, { cache: 'no-store' })
            .then((r) => r.json())
            .catch(() => null),
        ]);
        if (cancelled) return;
        const characters = ((c as { characters?: { id: string; profile: { name: string } }[] } | null)?.characters ?? []).map(
          (item) => ({ id: item.id, name: item.profile.name || '（没有名字的角色）' }),
        );
        const assets = ((a as { assets?: { id: string; name: string }[] } | null)?.assets ?? []).map((item) => ({
          id: item.id,
          name: item.name,
        }));
        setRoster({ characters, assets });
        const unreadable = ((c as { unreadable?: string[] } | null)?.unreadable ?? []).length;
        setRosterNote(
          characters.length === 0
            ? '这个项目还没有角色，参考图也要先在资产库里上传（不给你手填 id）'
            : unreadable
              ? `${characters.length} 位角色可挂，其中 ${unreadable} 位档案读不出来，暂时不列`
              : null,
        );
      } catch {
        if (!cancelled) setRosterNote('名册或资产清单没读到，镜头上的引用暂时只能留空');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studio.projectId]);

  /**
   * §38 / §39 那条箭头接到镜头上：拿这一镜的提示词生成一张参考图，成功后把资产 id 挂上去。
   * 挂了角色就走 Character → Scene 那一条（服务端拿这位角色的肖像当参考，字节由服务端自己取）。
   *
   * 两句实话写在按钮上：像素来自**本地确定性合成器**（本机没有图像 provider，§160），
   * 这不是 AI 出图；撤销只断开镜头与引用的关系，**不会删掉那张已经花过额度产出的资产**——
   * 删资产是资产库那一格的动作，不该藏在一次 undo 里。
   */
  const makeReference = useCallback(
    async (shot: StoryboardShot) => {
      setImageBusy(shot.id);
      setImageError(null);
      try {
        const res = await fetch(`/api/projects/${studio.projectId}/images`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...csrfHeaders() },
          body: JSON.stringify(
            shot.characterId ? { prompt: shot.prompt, characterId: shot.characterId } : { prompt: shot.prompt },
          ),
        });
        const body = (await res.json().catch(() => null)) as
          | { asset?: { id: string; name?: string }; message?: string }
          | null;
        if (!res.ok || !body?.asset) throw new Error(body?.message ?? `HTTP ${res.status}`);
        // 新资产要立刻出现在选择器里：名册是挂载时拉的那一份，不补上就会显示成
        // "选了一个不存在的选项"（浏览器把这种 select 渲染成空白，用户看到的是刚刚挂上的东西不见了）
        setRoster((prev) =>
          prev.assets.some((item) => item.id === body.asset!.id)
            ? prev
            : { ...prev, assets: [...prev.assets, { id: body.asset!.id, name: body.asset!.name || '（新生成的参考图）' }] },
        );
        storyboardStore.applyOps([
          {
            op: 'updateShot',
            id: shot.id,
            before: { referenceAssetId: shot.referenceAssetId },
            after: { referenceAssetId: body.asset.id },
          },
        ]);
      } catch (error) {
        setImageError(error instanceof Error ? error.message : String(error));
      } finally {
        setImageBusy(null);
      }
    },
    [studio.projectId],
  );

  const timeline = useMemo(() => (sb ? timelineOf(sb) : null), [sb]);

  if (!sb) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-[var(--nexus-space-3)]" data-storyboard-panel>
        <h2 className="font-mono text-12 uppercase tracking-wide text-fg-3">分镜</h2>
        <p className="text-12 leading-relaxed text-fg-2" data-storyboard-empty>
          {snapshot.saveState === 'loading'
            ? '读取分镜…'
            : snapshot.error
              ? `读不出库里那份分镜：${snapshot.error}`
              : '这个项目还没有分镜。写一句话，下面按标点把它切成镜头表——这是本地确定性断句，不是 AI 分镜（provider 未接入前不做假生成）。'}
        </p>
        {snapshot.error ? (
          <p className="text-11 text-danger" data-storyboard-error>
            {snapshot.error}
          </p>
        ) : null}
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="夜色里的港口，一台旧起重机慢慢转身，猫跳上缆绳，它跑起来了"
          data-storyboard-prompt-input
          className="w-full resize-y rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-subtle)] bg-bg-2 p-2 text-12 text-fg-1"
        />
        <button
          type="button"
          disabled={!prompt.trim() || snapshot.saveState === 'saving'}
          onClick={() => void storyboardStore.planFrom(prompt)}
          data-storyboard-create
          className="self-start rounded-[var(--nexus-radius-sm)] bg-accent-2 px-3 py-1 text-12 text-fg-1 disabled:opacity-50"
        >
          切一版分镜
        </button>
        {snapshot.notice ? (
          <p className="text-11 text-fg-3" data-storyboard-notice>
            {snapshot.notice}
          </p>
        ) : null}
      </div>
    );
  }

  const draftOf = (shot: StoryboardShot, field: 'prompt' | 'durationMs') => {
    const key = `${shot.id}::${field}`;
    if (field === 'prompt') return drafts[key] ?? shot.prompt;
    return String(drafts[key] ?? shot.durationMs);
  };

  const setDraft = (key: string, value: string) => setDrafts((d) => ({ ...d, [key]: value }));

  const flushPrompt = (shot: StoryboardShot) => {
    const key = `${shot.id}::prompt`;
    const next = (drafts[key] ?? shot.prompt).trim();
    if (!next) {
      // 空提示词过不了报文契约，也不该静默把旧值清掉：明说这一格没动
      storyboardStore.showNotice('这一镜的提示词是空的，没有写进去——空白的镜头没法生成。');
      setDraft(key, shot.prompt);
      return;
    }
    if (next === shot.prompt) {
      setDrafts((d) => {
        const { [key]: _drop, ...rest } = d;
        return rest;
      });
      return;
    }
    setDrafts((d) => {
      const { [key]: _drop, ...rest } = d;
      return rest;
    });
    storyboardStore.applyOps([{ op: 'updateShot', id: shot.id, before: { prompt: shot.prompt }, after: { prompt: next } }]);
  };

  const flushDuration = (shot: StoryboardShot) => {
    const key = `${shot.id}::durationMs`;
    const next = Number(drafts[key]);
    setDrafts((d) => {
      const { [key]: _drop, ...rest } = d;
      return rest;
    });
    if (!Number.isInteger(next) || next < 1 || next > 600_000) {
      storyboardStore.showNotice(
        `时长要 1 到 600000 之间的整数毫秒，「${drafts[key] ?? ''}」没写进去——这一镜还是 ${shot.durationMs} 毫秒。`,
      );
      return;
    }
    if (next === shot.durationMs) return;
    storyboardStore.applyOps([{ op: 'updateShot', id: shot.id, before: { durationMs: shot.durationMs }, after: { durationMs: next } }]);
  };

  const total = sb.shots.length;

  return (
    <div className="flex h-full min-h-0 flex-col" data-storyboard-panel>
      <header className="shrink-0 border-b border-[var(--nexus-color-border-subtle)] p-[var(--nexus-space-3)]">
        <div className="flex items-center gap-2">
          <h2 className="font-mono text-12 uppercase tracking-wide text-fg-3">分镜</h2>
          <span
            className={cn(
              'ml-auto rounded-[var(--nexus-radius-sm)] px-2 py-[2px] font-mono text-11',
              snapshot.saveState === 'error' ? 'bg-warn text-bg-0' : 'text-fg-3',
            )}
            data-storyboard-save-state
          >
            {STATE_TEXT[snapshot.saveState] ?? ''}
          </span>
        </div>
        <p className="mt-1 text-12 text-fg-2" data-storyboard-summary>
          {total} 镜 · 共 {(timeline?.totalMs ?? 0) / 1000} 秒 · 来源：{sb.source.prompt || '（没有原句）'}
        </p>
        <div className="mt-2 flex items-center gap-1">
          <button
            type="button"
            onClick={() => storyboardStore.undo()}
            disabled={!snapshot.canUndo || snapshot.saveState === 'saving'}
            title="撤销上一次镜头改动（走 patch 的逆补丁，不是重打一遍）"
            data-storyboard-undo
            className="rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-11 text-fg-2 disabled:opacity-50"
          >
            撤销
          </button>
          <button
            type="button"
            onClick={() => storyboardStore.redo()}
            disabled={!snapshot.canRedo || snapshot.saveState === 'saving'}
            title="重做"
            data-storyboard-redo
            className="rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-11 text-fg-2 disabled:opacity-50"
          >
            重做
          </button>
          <button
            type="button"
            onClick={() => storyboardStore.reload()}
            className="ml-auto rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-11 text-fg-3"
            title="重新读库里那一份（未保存的本地编辑会被覆盖）"
            data-storyboard-reload
          >
            重读
          </button>
        </div>
        {snapshot.error ? (
          <p className="mt-1 text-11 text-danger" data-storyboard-error>
            {snapshot.error}
          </p>
        ) : null}
        {snapshot.notice ? (
          <p className="mt-1 text-11 text-fg-3" data-storyboard-notice>
            {snapshot.notice}
          </p>
        ) : null}
        {rosterNote ? (
          <p className="mt-1 text-11 text-fg-3" data-storyboard-roster-note>
            {rosterNote}
          </p>
        ) : null}
        {imageError ? (
          <p className="mt-1 text-11 text-danger" data-storyboard-image-error>
            参考图没生成：{imageError}
          </p>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        <ul className="flex flex-col gap-2 p-[var(--nexus-space-3)]">
          {sb.shots.map((shot, index) => (
            <li
              key={shot.id}
              className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-subtle)] bg-bg-2 p-2"
              data-storyboard-shot={shot.id}
            >
              {/* 换行是必要的：面板只有 264px 宽，机位+转场+时长已经占满一行，
                  不换行时 ↑↓＋✕ 四个动作会被裁到面板外面——点得到但看不见，等于没有 */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-11 text-fg-3">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <select
                  value={shot.camera}
                  onChange={(e) =>
                    storyboardStore.applyOps([
                      {
                        op: 'updateShot',
                        id: shot.id,
                        before: { camera: shot.camera },
                        after: { camera: e.target.value as ShotCamera },
                      },
                    ])
                  }
                  aria-label="机位"
                  data-storyboard-camera={shot.id}
                  className="rounded-[var(--nexus-radius-sm)] bg-bg-3 px-1 py-[2px] text-11 text-fg-1"
                >
                  {SHOT_CAMERAS.map((c) => (
                    <option key={c} value={c}>
                      {CAMERA_LABELS[c]}
                    </option>
                  ))}
                </select>
                <select
                  value={shot.transition}
                  onChange={(e) =>
                    storyboardStore.applyOps([
                      {
                        op: 'updateShot',
                        id: shot.id,
                        before: { transition: shot.transition },
                        after: { transition: e.target.value as ShotTransition },
                      },
                    ])
                  }
                  aria-label="转场"
                  data-storyboard-transition={shot.id}
                  className="rounded-[var(--nexus-radius-sm)] bg-bg-3 px-1 py-[2px] text-11 text-fg-1"
                >
                  {SHOT_TRANSITIONS.map((t) => (
                    <option key={t} value={t}>
                      {TRANSITION_LABELS[t]}
                    </option>
                  ))}
                </select>
                <input
                  value={draftOf(shot, 'durationMs')}
                  onChange={(e) => setDraft(`${shot.id}::durationMs`, e.target.value)}
                  onBlur={() => flushDuration(shot)}
                  aria-label="时长（毫秒）"
                  data-storyboard-duration={shot.id}
                  className="w-[64px] rounded-[var(--nexus-radius-sm)] bg-bg-3 px-1 py-[2px] text-11 text-fg-1"
                />
                {/* 挂角色 / 挂参考图：一次改动 = 一个可撤销事务（§150），选项只来自服务端名册，
                    所以这里给不出一个"会被 firstForeignRef 挡下"的 id */}
                <select
                  value={shot.characterId ?? ''}
                  onChange={(e) =>
                    storyboardStore.applyOps([
                      {
                        op: 'updateShot',
                        id: shot.id,
                        before: { characterId: shot.characterId },
                        after: { characterId: e.target.value || undefined },
                      },
                    ])
                  }
                  aria-label="这一镜里的角色"
                  data-storyboard-character={shot.id}
                  className="max-w-[110px] rounded-[var(--nexus-radius-sm)] bg-bg-3 px-1 py-[2px] text-11 text-fg-1"
                >
                  <option value="">不挂角色</option>
                  {roster.characters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  value={shot.referenceAssetId ?? ''}
                  onChange={(e) =>
                    storyboardStore.applyOps([
                      {
                        op: 'updateShot',
                        id: shot.id,
                        before: { referenceAssetId: shot.referenceAssetId },
                        after: { referenceAssetId: e.target.value || undefined },
                      },
                    ])
                  }
                  aria-label="这一镜的参考图"
                  data-storyboard-reference={shot.id}
                  className="max-w-[110px] rounded-[var(--nexus-radius-sm)] bg-bg-3 px-1 py-[2px] text-11 text-fg-1"
                >
                  <option value="">不用参考图</option>
                  {roster.assets.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void makeReference(shot)}
                  disabled={imageBusy !== null}
                  title="本地确定性合成（DEMO），不是 AI 出图；撤销只断开引用，不删除已生成的资产"
                  aria-label="为本镜生成参考图"
                  data-storyboard-image-gen={shot.id}
                  className="rounded-[var(--nexus-radius-sm)] bg-bg-3 px-1 py-[2px] text-11 text-fg-2 disabled:opacity-40"
                >
                  {imageBusy === shot.id ? '合成中…' : 'DEMO 参考图'}
                </button>
                <span className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => storyboardStore.applyOps([{ op: 'moveShot', from: index, to: index - 1 }])}
                    disabled={index === 0}
                    title="上一位"
                    data-storyboard-move-up={shot.id}
                    className="rounded-[var(--nexus-radius-sm)] bg-bg-3 px-1 text-11 text-fg-2 disabled:opacity-40"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => storyboardStore.applyOps([{ op: 'moveShot', from: index, to: index + 1 }])}
                    disabled={index === total - 1}
                    title="下一位"
                    data-storyboard-move-down={shot.id}
                    className="rounded-[var(--nexus-radius-sm)] bg-bg-3 px-1 text-11 text-fg-2 disabled:opacity-40"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      storyboardStore.applyOps([
                        {
                          op: 'addShot',
                          index: index + 1,
                          shot: {
                            id: `shot-manual-${crypto.randomUUID().slice(0, 8)}`,
                            prompt: '新的一镜：写要拍什么',
                            durationMs: DEFAULT_SHOT_MS,
                            camera: 'medium',
                            transition: 'cut',
                          },
                        },
                      ])
                    }
                    title="在这一镜之后插一镜"
                    data-storyboard-add={shot.id}
                    className="rounded-[var(--nexus-radius-sm)] bg-bg-3 px-1 text-11 text-fg-2"
                  >
                    ＋
                  </button>
                  <button
                    type="button"
                    onClick={() => storyboardStore.applyOps([{ op: 'removeShot', id: shot.id }])}
                    disabled={total <= 1}
                    title={total <= 1 ? '最后一镜不能删：0 镜的时间线没什么可编辑的' : '删掉这一镜（可撤销）'}
                    data-storyboard-remove={shot.id}
                    className="rounded-[var(--nexus-radius-sm)] bg-bg-3 px-1 text-11 text-fg-2 disabled:opacity-40"
                  >
                    ✕
                  </button>
                </span>
              </div>
              <textarea
                value={draftOf(shot, 'prompt')}
                onChange={(e) => setDraft(`${shot.id}::prompt`, e.target.value)}
                onBlur={() => flushPrompt(shot)}
                rows={2}
                aria-label="这一镜要拍什么"
                data-storyboard-prompt={shot.id}
                className="mt-1 w-full resize-y rounded-[var(--nexus-radius-sm)] bg-bg-3 p-1 text-12 text-fg-1"
              />
            </li>
          ))}
        </ul>

        <section className="border-t border-[var(--nexus-color-border-subtle)] p-[var(--nexus-space-3)]" data-storyboard-timeline>
          <h3 className="font-mono text-11 uppercase tracking-wide text-fg-3">时间线（§41）</h3>
          <p className="mt-1 text-11 text-fg-2">
            总长 {String((timeline?.totalMs ?? 0) / 1000)} 秒 ·
            <span data-storyboard-playable={String(timeline?.playable)}>
              {timeline?.playable
                ? ' 可播'
                : ' 不可播：还没有能直接播放的画面——镜头视频那一格要真 provider，本机不做假生成（§159）'}
            </span>
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {(timeline?.tracks ?? []).map((track) => (
              <li key={track.kind} className="text-11 text-fg-2" data-storyboard-track={track.kind}>
                <span className="font-mono text-fg-3">{track.kind}</span>
                {'：'}
                {track.clips.length ? `${track.clips.length} 格` : `空——${track.emptyReason ?? '这一版没有内容'}`}
              </li>
            ))}
          </ul>
          {timeline?.blockers.length ? (
            <ul className="mt-2 flex flex-col gap-1">
              {timeline.blockers.map((b) => (
                <li key={b} className="text-11 text-fg-3" data-storyboard-blocker>
                  {b}
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="border-t border-[var(--nexus-color-border-subtle)] p-[var(--nexus-space-3)]">
          <h3 className="font-mono text-11 uppercase tracking-wide text-fg-3">这一版分镜是怎么来的</h3>
          <ul className="mt-1 flex flex-col gap-1">
            {sb.notes.map((note) => (
              <li key={note} className="text-11 leading-relaxed text-fg-3" data-storyboard-note>
                {note}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
