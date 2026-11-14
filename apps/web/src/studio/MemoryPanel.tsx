'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { csrfHeaders } from '@/lib/csrf';
import type { Locale } from '@/lib/i18n';
import { useStudioReady } from './store';
import { useWorld, worldStore } from './worldStore';

/**
 * §48 记忆：四类（本次会话 / 角色 / 世界 / 我的偏好）可查看、可删除、可按词面搜。
 *
 * 搜索走 §49 那套混合检索（全文 + 子串 + 词覆盖度的确定性融合），界面上就写清它是什么、
 * 不是什么：**不是语义检索**（没有 embedding 之前，用词不同意思相近的那条搜不到），
 * 而「我的偏好」那一类不挂项目、本来就不在这个项目的语料里（那是 §49 的语料清单决定的，不是漏了）。
 * 也没有"全部清空"：§48 要的是按类删除，一次误点抹掉用户全部记忆这种事不该有按钮。
 * 双语（v740）：locale 由 StudioShell 透传；zh 原文原样保留，en 逐句对应。
 */

const COPY = {
  zh: {
    scopes: [
      { scope: 'session', label: '本次会话', hint: '只在这个项目的工作过程里跟着走' },
      { scope: 'character', label: '角色', hint: '挂在某个角色身上（§46）' },
      { scope: 'world', label: '世界', hint: '整个世界都成立的事实' },
      { scope: 'user', label: '我的偏好', hint: '你本人的偏好，跨项目有效' },
    ] as { scope: Scope; label: string; hint: string }[],
    heading: '记忆',
    note: '四类记忆都可查看、可删除（§48）。搜索走的是 §49 那套词面混合检索（全文 + 子串 + 词覆盖度），',
    noteNotSemantic: '不是语义检索',
    noteTail: '：用词不同、意思相近的那条搜不到。',
    searchPlaceholder: '搜记忆内容（词面匹配，回车检索）',
    searchAria: '搜索记忆',
    search: '搜',
    clear: '清空',
    needContent: '先写下要记住的内容。',
    me: '本人',
    thisProject: '这个项目',
    currentWorld: '当前世界',
    noName: '（没有名字）',
    addTitle: '记一条',
    scopeAria: '记忆类型',
    noWorld: '（还没有世界）',
    subjectAria: '记忆主体',
    pickCharacter: '选一个角色…',
    contentPlaceholder: '要记住什么？',
    contentAria: '记忆内容',
    remember: '记下',
    needWorldFirst: '先建世界，再记世界类的记忆。',
    needCharacterFirst: '先选一个角色。',
    reading: '读取记忆…',
    clearClass: '清空这一类',
    deleteAria: '删除这条记忆',
    emptyWithNote: '这一类里没有词面命中的条目（不等于没有相关记忆：这是词面检索）。',
    emptyPlain: '还没有这一类的记忆。',
  },
  en: {
    scopes: [
      { scope: 'session', label: 'Session', hint: 'Follows you through this project’s work' },
      { scope: 'character', label: 'Character', hint: 'Attached to a character (§46)' },
      { scope: 'world', label: 'World', hint: 'Facts that hold for the whole world' },
      { scope: 'user', label: 'My preferences', hint: 'Your personal preferences, valid across projects' },
    ] as { scope: Scope; label: string; hint: string }[],
    heading: 'Memory',
    note: 'All four classes can be viewed and deleted (§48). Search is the §49 lexical hybrid (fulltext + substring + term coverage) —',
    noteNotSemantic: ' not semantic search',
    noteTail: ': lines with different words but similar meaning will not come back.',
    searchPlaceholder: 'Search memories (lexical match; Enter to search)',
    searchAria: 'Search memories',
    search: 'Search',
    clear: 'Clear',
    needContent: 'Write down what to remember first.',
    me: 'You',
    thisProject: 'This project',
    currentWorld: 'Current world',
    noName: '(no name)',
    addTitle: 'Remember one',
    scopeAria: 'Memory scope',
    noWorld: '(no world yet)',
    subjectAria: 'Memory subject',
    pickCharacter: 'Pick a character…',
    contentPlaceholder: 'What to remember?',
    contentAria: 'Memory content',
    remember: 'Remember',
    needWorldFirst: 'Create a world first, then remember world-scoped memories.',
    needCharacterFirst: 'Pick a character first.',
    reading: 'Reading memories…',
    clearClass: 'Clear this class',
    deleteAria: 'Delete this memory',
    emptyWithNote: 'No lexical matches in this class (there may still be relevant ones — this is lexical retrieval).',
    emptyPlain: 'No memories in this class yet.',
  },
} as const;

type Scope = 'session' | 'character' | 'world' | 'user';

interface MemoryEntry {
  id: string;
  scope: Scope;
  subjectId: string;
  content: string;
  createdAt: string;
  embedded: boolean;
}

export function MemoryPanel({ locale = 'zh' }: { locale?: Locale }) {
  const c = COPY[locale];
  const SCOPES = c.scopes;
  const studio = useStudioReady();
  const world = useWorld();
  const [items, setItems] = useState<MemoryEntry[]>([]);
  const [counts, setCounts] = useState<Record<Scope, number>>({
    session: 0,
    character: 0,
    world: 0,
    user: 0,
  });
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState<Scope>('world');
  const [subjectId, setSubjectId] = useState('');
  const [content, setContent] = useState('');
  const [characterNames, setCharacterNames] = useState<{ id: string; name: string }[]>([]);
  /** 搜索框里的词。列表由 `reload()` 读这个 ref，所以按一次键不会触发一次重取 */
  const [query, setQuery] = useState('');
  const queryRef = useRef('');
  /** 第几次重取：晚到的旧响应不许盖掉新结果 */
  const reloadSeq = useRef(0);
  /** 服务端那句边界说明（"这是词面检索、不是语义检索"之类），只在搜索态下有内容 */
  const [searchNote, setSearchNote] = useState<string | null>(null);

  useEffect(() => {
    worldStore.ensure(studio.projectId);
  }, [studio.projectId]);

  const reload = useCallback(async () => {
    // 搜索态下的任何一次重取（记一条 / 删一条 / 清空一类之后）都留在搜索结果里，
    // 而不是悄悄退回全量列表——那会让"我删了它，它还在那儿"和"列表变了"混成一件事
    const q = queryRef.current.trim();
    // 连点两次"搜"会并发两个请求：晚到的那一份如果是**上一个词**的结果，不许盖掉新列表。
    // 没有这个序号，界面上会出现"搜索框写着 A、列出来的是 B 的命中"
    const seq = ++reloadSeq.current;
    try {
      const res = await fetch(
        `/api/projects/${studio.projectId}/memories${q ? `?q=${encodeURIComponent(q)}` : ''}`,
        { cache: 'no-store' },
      );
      const body = (await res.json().catch(() => null)) as
        | {
            items?: MemoryEntry[];
            hits?: MemoryEntry[];
            note?: string | null;
            counts?: Record<Scope, number>;
            message?: string;
          }
        | null;
      if (seq !== reloadSeq.current) return;
      if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
      setItems(body?.hits ?? body?.items ?? []);
      setSearchNote(q ? body?.note ?? null : null);
      setCounts(body?.counts ?? { session: 0, character: 0, world: 0, user: 0 });
      setStatus('ready');
    } catch (error) {
      if (seq !== reloadSeq.current) return;
      setMessage(error instanceof Error ? error.message : String(error));
      setStatus('error');
    }
  }, [studio.projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${studio.projectId}/characters`, { cache: 'no-store' });
        const body = (await res.json().catch(() => null)) as
          | { characters?: { id: string; profile: { name: string } }[] }
          | null;
        setCharacterNames(
          (body?.characters ?? []).map((char) => ({ id: char.id, name: char.profile.name || c.noName })),
        );
      } catch {
        setCharacterNames([]);
      }
    })();
  }, [studio.projectId, c.noName]);

  const subjectLabel = useMemo(() => {
    const worldId = world.world?.id;
    return (entry: MemoryEntry): string => {
      if (entry.scope === 'user') return c.me;
      if (entry.scope === 'session') return c.thisProject;
      if (entry.scope === 'world') return entry.subjectId === worldId ? world.world?.name ?? c.currentWorld : entry.subjectId;
      return characterNames.find((char) => char.id === entry.subjectId)?.name ?? entry.subjectId;
    };
  }, [characterNames, world.world, c]);

  const add = async () => {
    if (!content.trim()) {
      setMessage(c.needContent);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${studio.projectId}/memories`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ scope, subjectId: effectiveSubject || undefined, content }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
      setContent('');
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/projects/${studio.projectId}/memories/${id}`,
        { method: 'DELETE', headers: csrfHeaders() },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? `HTTP ${res.status}`);
      }
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const clearScope = async (target: Scope) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/projects/${studio.projectId}/memories?scope=${encodeURIComponent(target)}`,
        { method: 'DELETE', headers: csrfHeaders() },
      );
      const body = (await res.json().catch(() => null)) as { removed?: number; message?: string } | null;
      if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  /**
   * 一个项目一份世界（v1）：世界类记忆的主体就是它，不让用户再选一次，
   * 也**不存进 state**——存了就会有过期的一刻（切到别的类型再切回来，
   * 那个 state 被清空而 effect 依赖没变，按钮于是永远点不动）。
   */
  const effectiveSubject = scope === 'world' ? world.world?.id ?? '' : subjectId;
  const needsSubject = scope === 'world' || scope === 'character';

  return (
    <div className="wd-rootCol" data-memory-panel>
      <header className="wd-headBordered">
        <div className="wd-row2">
          <h2 className="wd-label">{c.heading}</h2>
          <span className="wd-monoFaintEnd" data-memory-total>
            {items.length}
          </span>
        </div>
        <p className="wd-body11Mt1" data-memory-note>
          {c.note}
          <span className="hi-ink">{c.noteNotSemantic}</span>{c.noteTail}
        </p>
        <div className="mm-rowMt2">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              queryRef.current = e.target.value;
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') void reload();
            }}
            placeholder={c.searchPlaceholder}
            aria-label={c.searchAria}
            data-memory-search
            className="mm-growPlaceholder"
          />
          <button
            type="button"
            onClick={() => void reload()}
            className="mm-btn1"
            data-memory-search-go
          >
            {c.search}
          </button>
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                queryRef.current = '';
                setSearchNote(null);
                void reload();
              }}
              className="mm-btnGhost"
              data-memory-search-clear
            >
              {c.clear}
            </button>
          ) : null}
        </div>
        {searchNote ? (
          <p className="wd-body11Mt1" data-memory-search-note>
            {searchNote}
          </p>
        ) : null}
        {message ? (
          <p className="wd-dangerMt2" data-memory-error>
            {message}
          </p>
        ) : null}
      </header>

      <div className="wd-scrollP2">
        <section className="pb-blockBordered">
          <h3 className="cp-faintMb1">{c.addTitle}</h3>
          <div className="cp-wrap">
            <select
              value={scope}
              onChange={(e) => {
                setScope(e.target.value as Scope);
                setSubjectId('');
              }}
              aria-label={c.scopeAria}
              data-memory-scope
              className="mm-chipPlain"
            >
              {SCOPES.map((item) => (
                <option key={item.scope} value={item.scope}>
                  {item.label}
                </option>
              ))}
            </select>
            {scope === 'world' ? (
              <span
                className="mm-truncFaint"
                data-memory-subject="world"
              >
                {world.world ? world.world.name : c.noWorld}
              </span>
            ) : null}
            {scope === 'character' ? (
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                aria-label={c.subjectAria}
                data-memory-subject
                className="mm-growField11"
              >
                <option value="">{c.pickCharacter}</option>
                {characterNames.map((char) => (
                  <option key={char.id} value={char.id}>
                    {char.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={c.contentPlaceholder}
            aria-label={c.contentAria}
            data-memory-content
            rows={2}
            className="mm-textArea"
          />
          <button
            type="button"
            disabled={busy || !content.trim() || (needsSubject && !effectiveSubject)}
            onClick={() => void add()}
            data-memory-add
            className="mm-accent"
          >
            {c.remember}
          </button>
          {needsSubject && !effectiveSubject ? (
            <p className="cp-warnMt1" data-memory-need-subject>
              {scope === 'world' ? c.needWorldFirst : c.needCharacterFirst}
            </p>
          ) : null}
        </section>

        {status === 'loading' ? <p className="cp-empty">{c.reading}</p> : null}

        {SCOPES.map((group) => {
          const rows = items.filter((item) => item.scope === group.scope);
          return (
            <section key={group.scope} className="wd-mb3" data-memory-group={group.scope}>
              <h3 className="mm-labelRow">
                {group.label}
                <span className="mm-mono">{counts[group.scope]}</span>
                {rows.length ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void clearScope(group.scope)}
                    data-memory-clear={group.scope}
                    className="mm-clearAll"
                  >
                    {c.clearClass}
                  </button>
                ) : null}
              </h3>
              <p className="cp-faintMb1">{group.hint}</p>
              <ul className="gp-col1">
                {rows.map((entry) => (
                  <li
                    key={entry.id}
                    className="mm-memRow"
                    data-memory-entry={entry.id}
                  >
                    <span className="mm-growLead">{entry.content}</span>
                    <span className="ds-mono10shrink">{subjectLabel(entry)}</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remove(entry.id)}
                      aria-label={c.deleteAria}
                      data-memory-remove={entry.id}
                      className={cn('mm-xshrink', !entry.embedded && 'mm-semi90')}
                    >
                      ×
                    </button>
                  </li>
                ))}
                {status === 'ready' && !rows.length ? (
                  <li className="cp-faintPx1" data-memory-empty={group.scope}>
                    {/* 搜索态下这句不能说"还没有这一类的记忆"——那一类可能有一堆，只是这个词没命中 */}
                    {searchNote ? c.emptyWithNote : c.emptyPlain}
                  </li>
                ) : null}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
