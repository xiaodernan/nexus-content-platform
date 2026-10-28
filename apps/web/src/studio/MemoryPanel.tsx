'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { csrfHeaders } from '@/lib/csrf';
import { useStudioReady } from './store';
import { useWorld, worldStore } from './worldStore';

/**
 * §48 记忆：四类（本次会话 / 角色 / 世界 / 我的偏好）可查看、可删除、可按词面搜。
 *
 * 搜索走 §49 那套混合检索（全文 + 子串 + 词覆盖度的确定性融合），界面上就写清它是什么、
 * 不是什么：**不是语义检索**（没有 embedding 之前，用词不同意思相近的那条搜不到），
 * 而「我的偏好」那一类不挂项目、本来就不在这个项目的语料里（那是 §49 的语料清单决定的，不是漏了）。
 * 也没有"全部清空"：§48 要的是按类删除，一次误点抹掉用户全部记忆这种事不该有按钮。
 */

type Scope = 'session' | 'character' | 'world' | 'user';

interface MemoryEntry {
  id: string;
  scope: Scope;
  subjectId: string;
  content: string;
  createdAt: string;
  embedded: boolean;
}

const SCOPES: { scope: Scope; label: string; hint: string }[] = [
  { scope: 'session', label: '本次会话', hint: '只在这个项目的工作过程里跟着走' },
  { scope: 'character', label: '角色', hint: '挂在某个角色身上（§46）' },
  { scope: 'world', label: '世界', hint: '整个世界都成立的事实' },
  { scope: 'user', label: '我的偏好', hint: '你本人的偏好，跨项目有效' },
];

export function MemoryPanel() {
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
          (body?.characters ?? []).map((c) => ({ id: c.id, name: c.profile.name || '（没有名字）' })),
        );
      } catch {
        setCharacterNames([]);
      }
    })();
  }, [studio.projectId]);

  const subjectLabel = useMemo(() => {
    const worldId = world.world?.id;
    return (entry: MemoryEntry): string => {
      if (entry.scope === 'user') return '本人';
      if (entry.scope === 'session') return '这个项目';
      if (entry.scope === 'world') return entry.subjectId === worldId ? world.world?.name ?? '当前世界' : entry.subjectId;
      return characterNames.find((c) => c.id === entry.subjectId)?.name ?? entry.subjectId;
    };
  }, [characterNames, world.world]);

  const add = async () => {
    if (!content.trim()) {
      setMessage('先写下要记住的内容。');
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
    <div className="flex h-full min-h-0 flex-col" data-memory-panel>
      <header className="shrink-0 border-b border-[var(--nexus-color-border-subtle)] p-[var(--nexus-space-3)]">
        <div className="flex items-center gap-2">
          <h2 className="font-mono text-12 uppercase tracking-wide text-fg-3">记忆</h2>
          <span className="ml-auto font-mono text-11 text-fg-3" data-memory-total>
            {items.length}
          </span>
        </div>
        <p className="mt-1 text-11 leading-relaxed text-fg-3" data-memory-note>
          四类记忆都可查看、可删除（§48）。搜索走的是 §49 那套词面混合检索（全文 + 子串 + 词覆盖度），
          <span className="text-fg-2">不是语义检索</span>：用词不同、意思相近的那条搜不到。
        </p>
        <div className="mt-2 flex gap-1">
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
            placeholder="搜记忆内容（词面匹配，回车检索）"
            aria-label="搜索记忆"
            data-memory-search
            className="min-w-0 flex-1 rounded-[var(--nexus-radius-sm)] bg-bg-1 px-2 py-1 text-11 text-fg-1 placeholder:text-fg-3"
          />
          <button
            type="button"
            onClick={() => void reload()}
            className="shrink-0 rounded-[var(--nexus-radius-sm)] bg-bg-1 px-2 py-1 text-11 text-fg-2 hover:bg-bg-3"
            data-memory-search-go
          >
            搜
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
              className="shrink-0 rounded-[var(--nexus-radius-sm)] px-2 py-1 text-11 text-fg-3 hover:bg-bg-2"
              data-memory-search-clear
            >
              清空
            </button>
          ) : null}
        </div>
        {searchNote ? (
          <p className="mt-1 text-11 leading-relaxed text-fg-3" data-memory-search-note>
            {searchNote}
          </p>
        ) : null}
        {message ? (
          <p className="mt-2 text-11 text-danger" data-memory-error>
            {message}
          </p>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-[var(--nexus-space-2)]">
        <section className="mb-3 rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-subtle)] bg-bg-2 p-2">
          <h3 className="mb-1 text-11 text-fg-3">记一条</h3>
          <div className="flex gap-1">
            <select
              value={scope}
              onChange={(e) => {
                setScope(e.target.value as Scope);
                setSubjectId('');
              }}
              aria-label="记忆类型"
              data-memory-scope
              className="rounded-[var(--nexus-radius-sm)] bg-bg-1 px-1 py-1 text-11 text-fg-1"
            >
              {SCOPES.map((item) => (
                <option key={item.scope} value={item.scope}>
                  {item.label}
                </option>
              ))}
            </select>
            {scope === 'world' ? (
              <span
                className="min-w-0 flex-1 truncate rounded-[var(--nexus-radius-sm)] bg-bg-1 px-2 py-1 text-11 text-fg-3"
                data-memory-subject="world"
              >
                {world.world ? world.world.name : '（还没有世界）'}
              </span>
            ) : null}
            {scope === 'character' ? (
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                aria-label="记忆主体"
                data-memory-subject
                className="min-w-0 flex-1 rounded-[var(--nexus-radius-sm)] bg-bg-1 px-1 py-1 text-11 text-fg-1"
              >
                <option value="">选一个角色…</option>
                {characterNames.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="要记住什么？"
            aria-label="记忆内容"
            data-memory-content
            rows={2}
            className="mt-1 w-full resize-y rounded-[var(--nexus-radius-sm)] bg-bg-1 px-2 py-1 text-12 text-fg-1 outline-none focus:bg-bg-3"
          />
          <button
            type="button"
            disabled={busy || !content.trim() || (needsSubject && !effectiveSubject)}
            onClick={() => void add()}
            data-memory-add
            className="mt-1 rounded-[var(--nexus-radius-sm)] bg-accent-2 px-3 py-1 text-11 text-accent-fg disabled:opacity-50"
          >
            记下
          </button>
          {needsSubject && !effectiveSubject ? (
            <p className="mt-1 text-11 text-warn" data-memory-need-subject>
              {scope === 'world' ? '先建世界，再记世界类的记忆。' : '先选一个角色。'}
            </p>
          ) : null}
        </section>

        {status === 'loading' ? <p className="p-3 text-12 text-fg-3">读取记忆…</p> : null}

        {SCOPES.map((group) => {
          const rows = items.filter((item) => item.scope === group.scope);
          return (
            <section key={group.scope} className="mb-3" data-memory-group={group.scope}>
              <h3 className="mb-1 flex items-center gap-1 text-11 text-fg-3">
                {group.label}
                <span className="font-mono">{counts[group.scope]}</span>
                {rows.length ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void clearScope(group.scope)}
                    data-memory-clear={group.scope}
                    className="ml-auto text-11 text-fg-3 underline hover:text-danger disabled:opacity-50"
                  >
                    清空这一类
                  </button>
                ) : null}
              </h3>
              <p className="mb-1 text-11 text-fg-3">{group.hint}</p>
              <ul className="flex flex-col gap-1">
                {rows.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-start gap-1 rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-subtle)] bg-bg-2 px-2 py-1"
                    data-memory-entry={entry.id}
                  >
                    <span className="min-w-0 flex-1 text-12 leading-relaxed text-fg-1">{entry.content}</span>
                    <span className="shrink-0 font-mono text-10 text-fg-3">{subjectLabel(entry)}</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remove(entry.id)}
                      aria-label="删除这条记忆"
                      data-memory-remove={entry.id}
                      className={cn('shrink-0 px-1 text-12 text-fg-3 hover:text-danger', !entry.embedded && 'opacity-90')}
                    >
                      ×
                    </button>
                  </li>
                ))}
                {status === 'ready' && !rows.length ? (
                  <li className="px-1 text-11 text-fg-3" data-memory-empty={group.scope}>
                    {/* 搜索态下这句不能说"还没有这一类的记忆"——那一类可能有一堆，只是这个词没命中 */}
                    {searchNote ? '这一类里没有词面命中的条目（不等于没有相关记忆：这是词面检索）。' : '还没有这一类的记忆。'}
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
