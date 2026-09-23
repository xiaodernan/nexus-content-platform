'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import { csrfHeaders } from '@/lib/csrf';
import { useStudioReady } from './store';
import { useWorld, worldStore } from './worldStore';

/**
 * §48 记忆：四类（本次会话 / 角色 / 世界 / 我的偏好）可查看、可删除。
 *
 * 界面上不出现"搜索记忆"：语义检索要 embedding，而 embedding 要真 provider（§49）。
 * 没接之前那一列是 null，这里就写"未做向量索引"，而不是给一个关键词框假装能搜。
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

  useEffect(() => {
    worldStore.ensure(studio.projectId);
  }, [studio.projectId]);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${studio.projectId}/memories`, { cache: 'no-store' });
      const body = (await res.json().catch(() => null)) as
        | { items?: MemoryEntry[]; counts?: Record<Scope, number>; message?: string }
        | null;
      if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
      setItems(body?.items ?? []);
      setCounts(body?.counts ?? { session: 0, character: 0, world: 0, user: 0 });
      setStatus('ready');
    } catch (error) {
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
          四类记忆都可查看、可删除（§48）。没有搜索框：语义检索要 embedding 与真 provider（§49），
          没接之前那些行是空的，这里不假装能搜。
        </p>
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
            className="mt-1 rounded-[var(--nexus-radius-sm)] bg-accent-2 px-3 py-1 text-11 text-fg-1 disabled:opacity-50"
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
                    还没有这一类的记忆。
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
