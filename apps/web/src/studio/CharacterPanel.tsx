'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  WORLD_KIND_LABELS,
  addRelationship,
  removeRelationshipAt,
  validateCharacter,
  withProfile,
  type Character,
  type CharacterProfile,
} from '@nexus/world-model';
import { cn } from '@/lib/cn';
import { csrfHeaders } from '@/lib/csrf';
import { CharacterChat } from '@/studio/CharacterChat';
import { studio as editor, useStudioReady } from './store';
import { useWorld, worldStore } from './worldStore';

/**
 * §46 Character System 的面板：角色档案的建、改、删。
 *
 * 保存是显式的（改完点「保存档案」）：角色编辑没进画布的 Command 撤销栈（§150 目前只覆盖设计文档），
 * 自动保存会把"我还没写完"的半份档案写进库而撤销又救不回来——所以宁可让用户点一下。
 * 关系的目标从世界文档（§44）的下拉里选，不靠手抄 id；档案里没有 memory 字段，
 * 那是 §48 的独立存储，塞个文本框就会造出第二个记忆真值。
 */

const INPUT =
  'w-full resize-y rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-12 text-fg-1 outline-none focus:bg-bg-3';

type ListMode = 'lines' | 'comma' | 'space';

function splitList(text: string, mode: ListMode): string[] {
  const parts = mode === 'lines' ? text.split(/\r?\n/) : mode === 'comma' ? text.split(',') : text.split(/\s+/);
  return parts.map((part) => part.trim()).filter(Boolean);
}

function joinList(items: readonly string[], mode: ListMode): string {
  return items.join(mode === 'lines' ? '\n' : mode === 'comma' ? ', ' : ' ');
}

function sameItems(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/**
 * 列表字段要自己留住"正在敲的原文"：模型里存的是数组，若每次按键都把数组 join 回输入框，
 * 刚敲下的逗号 / 换行 / 空格会在下一次渲染时被过滤掉——第二个条目永远开不了头。
 * 分隔符只用来解析；只有外部结果真的不同时才覆盖原文（保存后光标不跳）。
 */
function ListText({
  label,
  value,
  mode,
  onChange,
  data,
  hint,
  placeholder,
  multiline = false,
  showLabel = true,
  className = INPUT,
}: {
  label: string;
  value: readonly string[];
  mode: ListMode;
  onChange: (next: string[]) => void;
  data: Record<string, string>;
  hint?: string;
  placeholder?: string;
  multiline?: boolean;
  showLabel?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(() => joinList(value, mode));
  const seen = useRef(value);
  useEffect(() => {
    if (seen.current === value) return;
    seen.current = value;
    if (!sameItems(splitList(text, mode), value)) setText(joinList(value, mode));
  }, [value, text, mode]);

  const handle = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const next = event.target.value;
    setText(next);
    onChange(splitList(next, mode));
  };

  const field = multiline ? (
    <textarea
      rows={2}
      {...data}
      aria-label={label}
      value={text}
      placeholder={placeholder ?? '一行一条'}
      onChange={handle}
      className={className}
    />
  ) : (
    <input {...data} aria-label={label} value={text} placeholder={placeholder} onChange={handle} className={className} />
  );

  if (!showLabel) return field;
  return (
    <label className="block">
      <span className="mb-[2px] block text-11 text-fg-3">
        {label}
        {hint ? <span className="ml-1">{hint}</span> : null}
      </span>
      {field}
    </label>
  );
}

export function CharacterPanel() {
  const studio = useStudioReady();
  const world = useWorld();
  const [items, setItems] = useState<Character[]>([]);
  const [unreadable, setUnreadable] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CharacterProfile | null>(null);
  const [scene, setScene] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');
  const [relKind, setRelKind] = useState('');

  useEffect(() => {
    worldStore.ensure(studio.projectId);
  }, [studio.projectId]);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${studio.projectId}/characters`, { cache: 'no-store' });
      const body = (await res.json().catch(() => null)) as
        | { characters?: Character[]; unreadable?: string[]; message?: string }
        | null;
      if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
      setItems(body?.characters ?? []);
      setUnreadable(body?.unreadable ?? []);
      setStatus('ready');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      setStatus('error');
    }
  }, [studio.projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  /**
   * 改草稿的唯一入口。基准必须是当前草稿而不是库里那份：
   * 拿库里的档案当基准，改一个字段会把其它还没保存的编辑一起抹掉。
   */
  const patchProfile = (patch: Partial<CharacterProfile>) => {
    if (!selected || !draft) return;
    setDraft(withProfile({ ...selected, profile: draft }, patch).profile);
  };

  const dirty = !!selected && !!draft && JSON.stringify(selected.profile) !== JSON.stringify(draft);
  const issues = useMemo(
    () => (selected && draft ? validateCharacter({ ...selected, profile: draft }) : []),
    [selected, draft],
  );

  const create = async () => {
    const name = newName.trim();
    if (!name) {
      setMessage('先给角色一个名字。');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${studio.projectId}/characters`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ name }),
      });
      const body = (await res.json().catch(() => null)) as { character?: Character; message?: string } | null;
      if (!res.ok || !body?.character) throw new Error(body?.message ?? `HTTP ${res.status}`);
      setNewName('');
      await reload();
      setSelectedId(body.character.id);
      setDraft(body.character.profile);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (!selected || !draft) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${studio.projectId}/characters/${selected.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ profile: draft }),
      });
      const body = (await res.json().catch(() => null)) as { character?: Character; message?: string } | null;
      if (!res.ok || !body?.character) throw new Error(body?.message ?? `HTTP ${res.status}`);
      setItems((prev) => prev.map((item) => (item.id === body.character!.id ? body.character! : item)));
      setDraft(body.character.profile);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selected) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${studio.projectId}/characters/${selected.id}`, {
        method: 'DELETE',
        headers: csrfHeaders(),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? `HTTP ${res.status}`);
      }
      setSelectedId(null);
      setDraft(null);
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const textField = (key: 'name' | 'appearance' | 'personality' | 'backstory' | 'identity' | 'style' | 'clothing', label: string, multiline = false) => (
    <label className="block">
      <span className="mb-[2px] block text-11 text-fg-3">{label}</span>
      {multiline ? (
        <textarea
          rows={3}
          value={String(draft?.[key] ?? '')}
          aria-label={label}
          data-character-field={key}
          onChange={(e) => patchProfile({ [key]: e.target.value } as Partial<CharacterProfile>)}
          className={INPUT}
        />
      ) : (
        <input
          value={String(draft?.[key] ?? '')}
          aria-label={label}
          data-character-field={key}
          onChange={(e) => patchProfile({ [key]: e.target.value } as Partial<CharacterProfile>)}
          className={INPUT}
        />
      )}
    </label>
  );

  return (
    <div className="flex h-full min-h-0 flex-col" data-character-panel>
      <header className="shrink-0 border-b border-[var(--nexus-color-border-subtle)] p-[var(--nexus-space-3)]">
        <div className="flex items-center gap-2">
          <h2 className="font-mono text-12 uppercase tracking-wide text-fg-3">角色</h2>
          <span className="ml-auto font-mono text-11 text-fg-3" data-character-count>
            {items.length}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-1">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void create();
            }}
            placeholder="新角色名字"
            aria-label="新角色名字"
            data-character-new-name
            className="min-w-0 flex-1 rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-12 text-fg-1 outline-none focus:bg-bg-3"
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => void create()}
            data-character-create
            className="shrink-0 rounded-[var(--nexus-radius-sm)] bg-accent-2 px-2 py-1 text-11 text-accent-fg disabled:opacity-50"
          >
            建
          </button>
        </div>
        <p className="mt-2 text-11 leading-relaxed text-fg-3" data-character-note>
          建档只给名字，其余留空等用户填；AI 生成角色设定要真 provider，这里不做假生成（§159）。
          记忆属于 §48 的独立存储，不在档案里放一个假字段。
        </p>
        {message ? (
          <p className="mt-2 text-11 text-danger-ink" data-character-error>
            {message}
          </p>
        ) : null}
        {unreadable.length ? (
          <p className="mt-2 text-11 text-warn-ink" data-character-unreadable>
            有 {unreadable.length} 个角色的档案读不出来：{unreadable[0]}
          </p>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-[var(--nexus-space-2)]">
        {status === 'loading' ? <p className="p-3 text-12 text-fg-3">读取角色…</p> : null}
        {status === 'ready' && !items.length ? (
          <p className="p-3 text-12 text-fg-3" data-character-empty>
            还没有角色。
          </p>
        ) : null}
        <ul className="mb-3 flex flex-wrap gap-1">
          {items.map((character) => (
            <li key={character.id}>
              <button
                type="button"
                onClick={() => {
                  setSelectedId(character.id);
                  setDraft(character.profile);
                  setMessage(null);
                }}
                data-character-tab={character.id}
                aria-pressed={character.id === selectedId}
                className={cn(
                  'rounded-[var(--nexus-radius-sm)] px-2 py-1 text-12',
                  character.id === selectedId ? 'bg-bg-3 text-fg-1' : 'text-fg-3 hover:bg-bg-2',
                )}
              >
                {character.profile.name || '（没有名字）'}
              </button>
            </li>
          ))}
        </ul>

        {selected && draft ? (
          <div key={selected.id} className="flex flex-col gap-2" data-character-editor={selected.id}>
            {textField('name', '名字')}
            {textField('appearance', '外观', true)}
            {textField('identity', '身份（不变的那部分：五官 / 疤痕 / 标记）', true)}
            {textField('clothing', '穿着')}
            {textField('style', '画风 / 媒介')}
            <ListText
              label="特征"
              hint="逗号分隔"
              value={draft.traits}
              mode="comma"
              data={{ 'data-character-field': 'traits' }}
              placeholder="例：怕水，话多，认路很快"
              onChange={(traits) => patchProfile({ traits })}
            />
            {textField('personality', '性格', true)}
            {textField('backstory', '背景故事', true)}
            <ListText
              label="目标"
              hint="一行一条"
              value={draft.goals}
              mode="lines"
              multiline
              data={{ 'data-character-list': 'goals' }}
              onChange={(goals) => patchProfile({ goals })}
            />
            <ListText
              label="恐惧"
              hint="一行一条"
              value={draft.fears}
              mode="lines"
              multiline
              data={{ 'data-character-list': 'fears' }}
              onChange={(fears) => patchProfile({ fears })}
            />

            <section>
              <h3 className="mb-1 text-11 text-fg-3">声音</h3>
              <div className="flex gap-1">
                <input
                  value={draft.voice.register}
                  onChange={(e) => patchProfile({ voice: { ...draft.voice, register: e.target.value } })}
                  placeholder="语域"
                  aria-label="语域"
                  data-character-voice="register"
                  className={INPUT}
                />
                <input
                  value={draft.voice.pace}
                  onChange={(e) => patchProfile({ voice: { ...draft.voice, pace: e.target.value } })}
                  placeholder="语速"
                  aria-label="语速"
                  data-character-voice="pace"
                  className={INPUT}
                />
              </div>
              <ListText
                label="口头禅"
                value={draft.voice.catchphrases}
                mode="lines"
                multiline
                showLabel={false}
                placeholder="口头禅（一行一条）"
                data={{ 'data-character-voice': 'catchphrases' }}
                className={`${INPUT} mt-1`}
                onChange={(catchphrases) =>
                  patchProfile({ voice: { ...draft.voice, catchphrases } })
                }
              />
            </section>

            <section>
              <h3 className="mb-1 text-11 text-fg-3">视觉标识</h3>
              <div className="flex gap-1">
                <input
                  value={draft.visualIdentity.silhouette}
                  onChange={(e) =>
                    patchProfile({ visualIdentity: { ...draft.visualIdentity, silhouette: e.target.value } })
                  }
                  placeholder="轮廓"
                  aria-label="轮廓"
                  data-character-visual="silhouette"
                  className={INPUT}
                />
                <ListText
                  label="母题"
                  value={draft.visualIdentity.motifs}
                  mode="comma"
                  showLabel={false}
                  placeholder="母题（逗号分隔）"
                  data={{ 'data-character-visual': 'motifs' }}
                  onChange={(motifs) => patchProfile({ visualIdentity: { ...draft.visualIdentity, motifs } })}
                />
              </div>
              <ListText
                label="色板"
                value={draft.visualIdentity.palette}
                mode="space"
                showLabel={false}
                placeholder="色板：#1b1205 #f5b451（空格分隔）"
                data={{ 'data-character-visual': 'palette' }}
                className={`${INPUT} mt-1 font-mono`}
                onChange={(palette) => patchProfile({ visualIdentity: { ...draft.visualIdentity, palette } })}
              />

              {/* §39/§40 Character → Scene 的界面入口。色板（**已保存的那一版**）为空时按钮不可点：
                  服务端同一口径会拒绝，界面不给人点出一张与角色无关的图冒充"它的场景" */}
              <div className="mt-2 flex items-center gap-1">
                <input
                  value={scene}
                  onChange={(e) => setScene(e.target.value)}
                  placeholder="给它一个场景：在雪地里 / 在夜市里"
                  aria-label="场景"
                  data-scene-prompt
                  className={`${INPUT} min-w-0 flex-1`}
                />
                <button
                  type="button"
                  disabled={selected.profile.visualIdentity.palette.length === 0 || !scene.trim() || Boolean(studio.assetBusy)}
                  onClick={() => {
                    void editor.generateImageFromPrompt(`${draft.name}：${scene.trim()}`, { characterId: selected.id });
                  }}
                  data-character-scene
                  title={
                    selected.profile.visualIdentity.palette.length === 0
                      ? '先把色板填上：没有视觉标识就谈不上"同一个角色"'
                      : '按这个角色的视觉标识生成它在该场景里的一张图（DEMO 本地合成 · 扣 image 额度 2 点）'
                  }
                  className="shrink-0 rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-11 text-fg-2 hover:bg-bg-3 disabled:opacity-50"
                >
                  生成场景
                </button>
              </div>

              {/* §39 角色一致性生成：角色自己的参考图。**不要输入框**——这一张完全由档案驱动，
                  让用户填一句话再被忽略，比不给输入框更让人困惑。同样要求色板已填，
                  与服务端同一条口径（没有视觉标识就谈不上"同一个角色"） */}
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  disabled={selected.profile.visualIdentity.palette.length === 0 || Boolean(studio.assetBusy)}
                  onClick={() => {
                    // prompt 传空串：服务端拿到 generateCharacterPortrait 就忽略它，改用档案组装
                    void editor.generateImageFromPrompt('', { characterId: selected.id, generateCharacterPortrait: true });
                  }}
                  data-character-portrait
                  title={
                    selected.profile.visualIdentity.palette.length === 0
                      ? '先把色板填上：肖像要读的就是这份视觉标识'
                      : '按档案里的 身份/穿着/画风/特征 + 视觉标识 生成这个角色自己的参考图，之后可以拿它当场景的参考（DEMO 本地合成 · 扣 image 额度 2 点）'
                  }
                  className="rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-11 text-fg-2 hover:bg-bg-3 disabled:opacity-50"
                >
                  生成肖像
                </button>
                <span className="text-10 text-fg-3">由档案驱动，不用填场景</span>
              </div>
              {studio.assetError || studio.assetNotice ? (
                <p
                  className={cn('mt-1 text-11', studio.assetError ? 'text-danger-ink' : 'text-fg-3')}
                  data-character-notice
                >
                  {studio.assetError ?? studio.assetNotice}
                </p>
              ) : null}
            </section>

            <section>
              <h3 className="mb-1 text-11 text-fg-3">关系（指向世界条目）</h3>
              <ul className="flex flex-col gap-1">
                {draft.relationships.map((rel, index) => {
                  const node = world.world?.nodes.find((n) => n.id === rel.target);
                  return (
                    <li
                      key={`${rel.target}-${index}`}
                      className="flex items-center gap-1 rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1"
                      data-character-relationship={index}
                    >
                      <span className="min-w-0 flex-1 truncate text-12 text-fg-1">
                        {node ? `${node.title}（${WORLD_KIND_LABELS[node.kind]}）` : rel.target || '（还没选目标）'}
                        {rel.kind ? ` · ${rel.kind}` : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDraft(removeRelationshipAt({ ...selected, profile: draft }, index).profile)}
                        aria-label="删除这条关系"
                        data-character-relationship-remove={index}
                        className="shrink-0 px-1 text-12 text-fg-3 hover:text-danger-ink"
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
                {!draft.relationships.length ? <li className="px-1 text-11 text-fg-3">还没有关系。</li> : null}
              </ul>
              <div className="mt-1 flex items-center gap-1">
                <select
                  aria-label="关系目标"
                  data-character-relationship-target
                  value=""
                  onChange={(e) => {
                    const target = e.target.value;
                    if (!target) return;
                    setDraft(addRelationship({ ...selected, profile: draft }, { target, kind: relKind }).profile);
                    setRelKind('');
                  }}
                  className="min-w-0 flex-1 rounded-[var(--nexus-radius-sm)] bg-bg-2 px-1 py-1 text-11 text-fg-1"
                >
                  <option value="">＋ 选一个世界条目…</option>
                  {(world.world?.nodes ?? []).map((node) => (
                    <option key={node.id} value={node.id}>
                      {WORLD_KIND_LABELS[node.kind]} · {node.title}
                    </option>
                  ))}
                </select>
                <input
                  value={relKind}
                  onChange={(e) => setRelKind(e.target.value)}
                  placeholder="关系"
                  aria-label="关系名称"
                  data-character-relationship-kind
                  className="w-[80px] rounded-[var(--nexus-radius-sm)] bg-bg-2 px-1 py-1 text-11 text-fg-1 outline-none focus:bg-bg-3"
                />
              </div>
              {!world.world ? (
                <p className="mt-1 text-11 text-warn-ink">这个项目还没有世界，关系没有可指向的条目。</p>
              ) : null}
            </section>

            {/* §47 跟角色说话：共用块（/world 的 3D HUD 也渲染同一份），key 换人即换对话 */}
            <CharacterChat
              key={selected.id}
              projectId={studio.projectId}
              characterId={selected.id}
              characterName={draft.name || ''}
            />

            {issues.length ? (
              <ul className="flex flex-col gap-[2px]" data-character-issues>
                {issues.map((issue) => (
                  <li key={`${issue.code}-${issue.path}`} className="text-11 text-warn-ink">
                    · {issue.message}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="sticky bottom-0 flex items-center gap-2 bg-bg-1 pt-2">
              <button
                type="button"
                disabled={!dirty || saving}
                onClick={() => void save()}
                data-character-save
                className={cn(
                  'rounded-[var(--nexus-radius-sm)] px-3 py-1 text-12',
                  dirty ? 'bg-accent-2 text-accent-fg' : 'bg-bg-2 text-fg-3',
                )}
              >
                {saving ? '保存中…' : dirty ? '保存档案' : '没有改动'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void remove()}
                data-character-delete
                className="rounded-[var(--nexus-radius-sm)] px-2 py-1 text-12 text-fg-3 hover:text-danger-ink disabled:opacity-50"
              >
                删除角色
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
