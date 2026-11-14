'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  WORLD_KIND_LABELS,
  WORLD_KIND_LABELS_EN,
  addRelationship,
  removeRelationshipAt,
  validateCharacter,
  withProfile,
  type Character,
  type CharacterProfile,
  type WorldKind,
} from '@nexus/world-model';
import { cn } from '@/lib/cn';
import { csrfHeaders } from '@/lib/csrf';
import type { Locale } from '@/lib/i18n';
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
 * 双语（v747）：locale 由 StudioShell 透传；zh 原文原样保留，en 逐句对应。
 */

const COPY = {
  zh: {
    heading: '角色',
    newNamePlaceholder: '新角色名字',
    newNameAria: '新角色名字',
    create: '建',
    note: '建档只给名字，其余留空等用户填；AI 生成角色设定要真 provider，这里不做假生成（§159）。记忆属于 §48 的独立存储，不在档案里放一个假字段。',
    unreadable: (n: number, first: string) => `有 ${n} 个角色的档案读不出来：${first}`,
    reading: '读取角色…',
    empty: '还没有角色。',
    noName: '（没有名字）',
    name: '名字',
    appearance: '外观',
    identity: '身份（不变的那部分：五官 / 疤痕 / 标记）',
    clothing: '穿着',
    style: '画风 / 媒介',
    activeEra: '活跃纪元（可选：与世界编年里的纪元同名）',
    traits: '特征',
    traitsHint: '逗号分隔',
    traitsPlaceholder: '例：怕水，话多，认路很快',
    personality: '性格',
    backstory: '背景故事',
    goals: '目标',
    onePerLine: '一行一条',
    fears: '恐惧',
    voiceSection: '声音',
    register: '语域',
    pace: '语速',
    registerAria: '语域',
    paceAria: '语速',
    catchphrasesPlaceholder: '口头禅（一行一条）',
    catchphrases: '口头禅',
    voiceSectionTitle: '声音',
    visualSection: '视觉标识',
    silhouette: '轮廓',
    motifs: '母题',
    motifsPlaceholder: '母题（逗号分隔）',
    palette: '色板',
    palettePlaceholder: '色板：#1b1205 #f5b451（空格分隔）',
    scenePlaceholder: '给它一个场景：在雪地里 / 在夜市里',
    sceneAria: '场景',
    paletteRequired: '先把色板填上：没有视觉标识就谈不上"同一个角色"',
    sceneTitle: '按这个角色的视觉标识生成它在该场景里的一张图（DEMO 本地合成 · 扣 image 额度 2 点）',
    generateScene: '生成场景',
    generatePortrait: '生成肖像',
    sceneLabel: '场景',
    portraitTitle:
      '按档案里的 身份/穿着/画风/特征 + 视觉标识 生成这个角色自己的参考图，之后可以拿它当场景的参考（DEMO 本地合成 · 扣 image 额度 2 点）',
    portraitShort: '由档案驱动，不用填场景',
    relationshipsTitle: '关系（指向世界条目）',
    removeRelationship: '删除这条关系',
    noRelationships: '还没有关系。',
    noRelationshipTarget: '＋ 选一个世界条目…',
    noWorld: '这个项目还没有世界，关系没有可指向的条目。',
    relationshipAria: '关系名称',
    relationshipKindPlaceholder: '关系',
    relationshipTargetAria: '关系目标',
    relationshipsTitle2: '关系（指向世界条目）',
    pickTarget: '关系目标',
    relKindPlaceholder: '关系',
    namelessFallback: '（没有名字）',
    pickCharacter: '（没有名字）',
    unspecifiedTarget: '（还没选目标）',
    relationshipName: '关系名称',
    saving: '保存中…',
    saveProfile: '保存档案',
    noChanges: '没有改动',
    deleteCharacter: '删除角色',
    savedHint: '保存档案',
  },
  en: {
    heading: 'Characters',
    newNamePlaceholder: 'New character name',
    newNameAria: 'New character name',
    create: 'Create',
    note: 'Creation only takes a name; the rest is yours to fill in. An AI to author the dossier needs a real provider; no fake generation here (§159). Memory lives in §48’s own store — the dossier carries no fake field for it.',
    unreadable: (n: number, first: string) => `${n} character profile(s) cannot be read: ${first}`,
    reading: 'Reading characters…',
    empty: 'No characters yet.',
    noName: '(no name)',
    name: 'Name',
    appearance: 'Appearance',
    identity: 'Identity (the unchanging part: features / scars / marks)',
    clothing: 'Clothing',
    style: 'Style / medium',
    activeEra: 'Active era (optional; name it like an era in the world chronicle)',
    traits: 'Traits',
    traitsHint: 'comma-separated',
    traitsPlaceholder: 'e.g. afraid of water, talks a lot, finds the way fast',
    personality: 'Personality',
    backstory: 'Backstory',
    goals: 'Goals',
    onePerLine: 'one per line',
    fears: 'Fears',
    voiceSection: 'Voice',
    register: 'Register',
    pace: 'Pace',
    registerAria: 'Voice register',
    paceAria: 'Voice pace',
    catchphrasesPlaceholder: 'Catchphrases (one per line)',
    catchphrases: 'Catchphrases',
    voiceSectionTitle: 'Voice',
    visualSection: 'Visual identity',
    silhouette: 'Silhouette',
    motifs: 'Motifs',
    motifsPlaceholder: 'Motifs (comma-separated)',
    palette: 'Palette',
    palettePlaceholder: 'Palette: #1b1205 #f5b451 (space-separated)',
    scenePlaceholder: 'Give it a scene: in the snow / at the night market',
    sceneAria: 'Scene',
    paletteRequired: 'Fill the palette first — without a visual signature there is no “same character”',
    sceneTitle: 'Generate one image of this character in this scene from their visual signature (DEMO local synthesis · –2 image credits)',
    generateScene: 'Generate scene',
    generatePortrait: 'Generate portrait',
    sceneLabel: 'Scene',
    portraitTitle:
      'Use Identity/Clothing/Style/Traits + Visual identity from the dossier to generate this character’s own reference image; later scenes can take it as reference (DEMO local synthesis · –2 image credits)',
    portraitShort: 'Dossier-driven; no scene needed',
    relationshipsTitle: 'Relationships (pointing at world entries)',
    removeRelationship: 'Delete this relationship',
    noRelationships: 'No relationships yet.',
    noRelationshipTarget: '＋ Pick a world entry…',
    noWorld: 'This project has no world yet; relationships have nothing to point at.',
    relationshipAria: 'Relationship name',
    relationshipKindPlaceholder: 'Relationship',
    relationshipTargetAria: 'Relationship target',
    relationshipsTitle2: 'Relationships (pointing at world entries)',
    pickTarget: 'Relationship target',
    relKindPlaceholder: 'Relationship',
    namelessFallback: '(no name)',
    pickCharacter: '(no name)',
    unspecifiedTarget: '(no target picked yet)',
    relationshipName: 'Relationship name',
    saving: 'Saving…',
    saveProfile: 'Save dossier',
    noChanges: 'No changes',
    deleteCharacter: 'Delete character',
    savedHint: 'Saved',
  },
} as const;

type CharacterCopy = (typeof COPY)[Locale];

const INPUT =
  'cp-inputShared';

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
  c,
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
  c: CharacterCopy;
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
      placeholder={placeholder ?? c.onePerLine}
      onChange={handle}
      className={className}
    />
  ) : (
    <input {...data} aria-label={label} value={text} placeholder={placeholder} onChange={handle} className={className} />
  );

  if (!showLabel) return field;
  return (
    <label className="cp-block">
      <span className="cp-labelSmall">
        {label}
        {hint ? <span className="cp-ml1">{hint}</span> : null}
      </span>
      {field}
    </label>
  );
}

const kindLabel = (kind: WorldKind, locale: Locale): string =>
  locale === 'en' ? WORLD_KIND_LABELS_EN[kind] : WORLD_KIND_LABELS[kind];

export function CharacterPanel({ locale = 'zh' }: { locale?: Locale }) {
  const c = COPY[locale];
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
      setMessage(locale === 'en' ? 'Give the character a name first.' : '先给角色一个名字。');
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

  const textField = (key: 'name' | 'appearance' | 'personality' | 'backstory' | 'identity' | 'style' | 'clothing' | 'activeEra', label: string, multiline = false) => (
    <label className="cp-block">
      <span className="cp-labelSmall">{label}</span>
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
    <div className="wd-rootCol" data-character-panel>
      <header className="wd-headBordered">
        <div className="wd-row2">
          <h2 className="wd-label">{c.heading}</h2>
          <span className="wd-monoFaintEnd" data-character-count>
            {items.length}
          </span>
        </div>
        <div className="cp-rowMt2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void create();
            }}
            placeholder={c.newNamePlaceholder}
            aria-label={c.newNameAria}
            data-character-new-name
            className="cp-growField"
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => void create()}
            data-character-create
            className="cp-accentBtnSm"
          >
            {c.create}
          </button>
        </div>
        <p className="wd-body11Mt2" data-character-note>
          {c.note}
        </p>
        {message ? (
          <p className="wd-dangerMt2" data-character-error>
            {message}
          </p>
        ) : null}
        {unreadable.length ? (
          <p className="cp-warnMt2" data-character-unreadable>
            {c.unreadable(unreadable.length, unreadable[0]!)}
          </p>
        ) : null}
      </header>

      <div className="wd-scrollP2">
        {status === 'loading' ? <p className="cp-empty">{c.reading}</p> : null}
        {status === 'ready' && !items.length ? (
          <p className="cp-empty" data-character-empty>
            {c.empty}
          </p>
        ) : null}
        <ul className="cp-wrapMb3">
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
                className={cn('cp-charTab', character.id === selectedId ? 'cp-tabOn' : 'cp-tabIdle')}
              >
                {character.profile.name || c.noName}
              </button>
            </li>
          ))}
        </ul>

        {selected && draft ? (
          <div key={selected.id} className="wd-col2" data-character-editor={selected.id}>
            {textField('name', c.name)}
            {textField('appearance', c.appearance, true)}
            {textField('identity', c.identity, true)}
            {textField('clothing', c.clothing)}
            {textField('style', c.style)}
            {textField('activeEra', c.activeEra)}
            <ListText
              label={c.traits}
              hint={c.traitsHint}
              value={draft.traits}
              mode="comma"
              data={{ 'data-character-field': 'traits' }}
              placeholder={c.traitsPlaceholder}
              onChange={(traits) => patchProfile({ traits })}
              c={c}
            />
            {textField('personality', c.personality, true)}
            {textField('backstory', c.backstory, true)}
            <ListText
              label={c.goals}
              hint={c.onePerLine}
              value={draft.goals}
              mode="lines"
              multiline
              data={{ 'data-character-list': 'goals' }}
              onChange={(goals) => patchProfile({ goals })}
              c={c}
            />
            <ListText
              label={c.fears}
              hint={c.onePerLine}
              value={draft.fears}
              mode="lines"
              multiline
              data={{ 'data-character-list': 'fears' }}
              onChange={(fears) => patchProfile({ fears })}
              c={c}
            />

            <section>
              <h3 className="cp-faintMb1">{c.voiceSectionTitle}</h3>
              <div className="cp-wrap">
                <input
                  value={draft.voice.register}
                  onChange={(e) => patchProfile({ voice: { ...draft.voice, register: e.target.value } })}
                  placeholder={c.register}
                  aria-label={c.registerAria}
                  data-character-voice="register"
                  className={INPUT}
                />
                <input
                  value={draft.voice.pace}
                  onChange={(e) => patchProfile({ voice: { ...draft.voice, pace: e.target.value } })}
                  placeholder={c.pace}
                  aria-label={c.paceAria}
                  data-character-voice="pace"
                  className={INPUT}
                />
              </div>
              <ListText
                label={c.catchphrases}
                value={draft.voice.catchphrases}
                mode="lines"
                multiline
                showLabel={false}
                placeholder={c.catchphrasesPlaceholder}
                data={{ 'data-character-voice': 'catchphrases' }}
                className={`${INPUT} gp-mt1`}
                onChange={(catchphrases) =>
                  patchProfile({ voice: { ...draft.voice, catchphrases } })
                }
                c={c}
              />
            </section>

            <section>
              <h3 className="cp-faintMb1">{c.visualSection}</h3>
              <div className="cp-wrap">
                <input
                  value={draft.visualIdentity.silhouette}
                  onChange={(e) =>
                    patchProfile({ visualIdentity: { ...draft.visualIdentity, silhouette: e.target.value } })
                  }
                  placeholder={c.silhouette}
                  aria-label={c.silhouette}
                  data-character-visual="silhouette"
                  className={INPUT}
                />
                <ListText
                  label={c.motifs}
                  value={draft.visualIdentity.motifs}
                  mode="comma"
                  showLabel={false}
                  placeholder={c.motifsPlaceholder}
                  data={{ 'data-character-visual': 'motifs' }}
                  onChange={(motifs) => patchProfile({ visualIdentity: { ...draft.visualIdentity, motifs } })}
                  c={c}
                />
              </div>
              <ListText
                label={c.palette}
                value={draft.visualIdentity.palette}
                mode="space"
                showLabel={false}
                placeholder={c.palettePlaceholder}
                data={{ 'data-character-visual': 'palette' }}
                className={`${INPUT} gp-mt1 cp-mono`}
                onChange={(palette) => patchProfile({ visualIdentity: { ...draft.visualIdentity, palette } })}
                c={c}
              />

              {/* §39/§40 Character → Scene 的界面入口。色板（**已保存的那一版**）为空时按钮不可点：
                  服务端同一口径会拒绝，界面不给人点出一张与角色无关的图冒充"它的场景" */}
              <div className="cp-rowMt2">
                <input
                  value={scene}
                  onChange={(e) => setScene(e.target.value)}
                  placeholder={c.scenePlaceholder}
                  aria-label={c.sceneAria}
                  data-scene-prompt
                  className={`${INPUT} cp-grow`}
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
                      ? c.paletteRequired
                      : c.sceneTitle
                  }
                  className="cp-btnHover"
                >
                  {c.generateScene}
                </button>
              </div>

              {/* §39 角色一致性生成：角色自己的参考图。**不要输入框**——这一张完全由档案驱动，
                  让用户填一句话再被忽略，比不给输入框更让人困惑。同样要求色板已填，
                  与服务端同一条口径（没有视觉标识就谈不上"同一个角色"） */}
              <div className="cp-row2Mt2">
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
                      ? c.paletteRequired
                      : c.portraitTitle
                  }
                  className="cp-btnHover"
                >
                  {c.generatePortrait}
                </button>
                <span className="cp-microFaint">{c.portraitShort}</span>
              </div>
              {studio.assetError || studio.assetNotice ? (
                <p
                  className={cn('cp-noticeRow', studio.assetError && 'cp-noticeError')}
                  data-character-notice
                >
                  {studio.assetError ?? studio.assetNotice}
                </p>
              ) : null}
            </section>

            <section>
              <h3 className="cp-faintMb1">{c.relationshipsTitle}</h3>
              <ul className="gp-col1">
                {draft.relationships.map((rel, index) => {
                  const node = world.world?.nodes.find((n) => n.id === rel.target);
                  return (
                    <li
                      key={`${rel.target}-${index}`}
                      className="cp-rowChip"
                      data-character-relationship={index}
                    >
                      <span className="cp-trunc12ink">
                        {node ? `${node.title}（${kindLabel(node.kind, locale)}）` : rel.target || c.unspecifiedTarget}
                        {rel.kind ? ` · ${rel.kind}` : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDraft(removeRelationshipAt({ ...selected, profile: draft }, index).profile)}
                        aria-label={c.removeRelationship}
                        data-character-relationship-remove={index}
                        className="wd-delBtn"
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
                {!draft.relationships.length ? <li className="cp-faintPx1">{c.noRelationships}</li> : null}
              </ul>
              <div className="wd-rowMt1">
                <select
                  aria-label={c.relationshipTargetAria}
                  data-character-relationship-target
                  value=""
                  onChange={(e) => {
                    const target = e.target.value;
                    if (!target) return;
                    setDraft(addRelationship({ ...selected, profile: draft }, { target, kind: relKind }).profile);
                    setRelKind('');
                  }}
                  className="cp-growInput"
                >
                  <option value="">{c.noRelationshipTarget}</option>
                  {(world.world?.nodes ?? []).map((node) => (
                    <option key={node.id} value={node.id}>
                      {kindLabel(node.kind, locale)} · {node.title}
                    </option>
                  ))}
                </select>
                <input
                  value={relKind}
                  onChange={(e) => setRelKind(e.target.value)}
                  placeholder={c.relKindPlaceholder}
                  aria-label={c.relationshipName}
                  data-character-relationship-kind
                  className="cp-mode80"
                />
              </div>
              {!world.world ? (
                <p className="cp-warnMt1">{c.noWorld}</p>
              ) : null}
            </section>

            {/* §47 跟角色说话：共用块（/world 的 3D HUD 也渲染同一份），key 换人即换对话 */}
            <CharacterChat
              key={selected.id}
              projectId={studio.projectId}
              characterId={selected.id}
              characterName={draft.name || ''}
              locale={locale}
            />

            {issues.length ? (
              <ul className="cp-colGap2" data-character-issues>
                {issues.map((issue) => (
                  <li key={`${issue.code}-${issue.path}`} className="cp-warn11">
                    · {issue.message}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="cp-stickyBar">
              <button
                type="button"
                disabled={!dirty || saving}
                onClick={() => void save()}
                data-character-save
                className={cn('cp-saveBtn', dirty ? 'cp-saveReady' : 'cp-saveIdle')}
              >
                {saving ? c.saving : dirty ? c.saveProfile : c.noChanges}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void remove()}
                data-character-delete
                className="cp-dangerGhost"
              >
                {c.deleteCharacter}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
