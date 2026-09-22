'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  WORLD_KINDS,
  WORLD_KIND_LABELS,
  addWorldNode,
  createWorld,
  removeWorldNode,
  updateWorldNode,
  worldCounts,
  type WorldDocument,
  type WorldKind,
} from '@nexus/world-model';
import { cn } from '@/lib/cn';
import { csrfHeaders } from '@/lib/csrf';
import { useStudioReady } from './store';

/**
 * §44 World Builder 的第一块界面：把世界文档摊开成可填的九类。
 *
 * 只做"存得下、看得见、改得动"这一条闭环。两件事刻意没做，都在界面上写清楚：
 * - AI 生成（"Create a dark fantasy world"）要真 provider，没接之前这里只给**模板骨架**，
 *   九类各一条空条目，正文是空的——替用户编世界观就是假生成（§150/§159）。
 * - 世界编辑不进画布的撤销栈（Ctrl+Z 只管设计文档），所以这里用显式"保存到库"，
 *   不假装自动保存、也不假装可撤销。
 */

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const STATE_TEXT: Record<SaveState, string> = {
  idle: '',
  saving: '保存中…',
  saved: '已保存',
  error: '保存失败',
};

export function WorldPanel() {
  const state = useStudioReady();
  const projectId = state.projectId;
  const [world, setWorld] = useState<WorldDocument | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [newKind, setNewKind] = useState<WorldKind>('lore');

  const reload = useCallback(async () => {
    setStatus('loading');
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/world`, { cache: 'no-store' });
      const body = (await res.json().catch(() => null)) as
        | { world?: WorldDocument | null; message?: string }
        | null;
      if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
      setWorld(body?.world ?? null);
      setSaveState('idle');
      setStatus('ready');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      setStatus('error');
    }
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const persist = useCallback(
    async (next: WorldDocument) => {
      setWorld(next);
      setSaveState('saving');
      try {
        const res = await fetch(`/api/projects/${projectId}/world`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json', ...csrfHeaders() },
          body: JSON.stringify({ document: next }),
        });
        const body = (await res.json().catch(() => null)) as
          | { world?: WorldDocument; message?: string }
          | null;
        if (!res.ok || !body?.world) throw new Error(body?.message ?? `HTTP ${res.status}`);
        setWorld(body.world);
        setSaveState('saved');
      } catch (error) {
        setSaveState('error');
        setMessage(error instanceof Error ? error.message : String(error));
      }
    },
    [projectId],
  );

  const counts = useMemo(() => (world ? worldCounts(world) : null), [world]);

  if (status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center p-4 text-12 text-fg-3" data-world-panel>
        读取世界…
      </div>
    );
  }

  if (!world) {
    return (
      <div className="flex h-full flex-col gap-3 p-[var(--nexus-space-3)]" data-world-panel>
        <h2 className="font-mono text-12 uppercase tracking-wide text-fg-3">世界</h2>
        <p className="text-12 leading-relaxed text-fg-2" data-world-empty>
          {message
            ? `读不出库里那份世界：${message}。下面这个按钮会写一份新的模板骨架进去，覆盖掉读不出来的那份——先确认不是契约漂移再点。`
            : '这个项目还没有世界。可以先建一份**模板骨架**：九类内容各留一个空条目，你自己往里填。AI 生成世界（§44 的「Create a dark fantasy world」）需要真实模型，provider 未接入前这里不做假生成。'}
        </p>
        {message ? <p className="text-11 text-danger" data-world-error>{message}</p> : null}
        <button
          type="button"
          onClick={() => void persist(createWorld(state.document?.name ?? '未命名世界', projectId))}
          data-world-create
          className="self-start rounded-[var(--nexus-radius-sm)] bg-accent-2 px-3 py-1 text-12 text-fg-1"
        >
          创建世界骨架（模板）
        </button>
      </div>
    );
  }

  const groups = WORLD_KINDS.filter((kind) => counts?.[kind]);

  return (
    <div className="flex h-full min-h-0 flex-col" data-world-panel>
      <header className="shrink-0 border-b border-[var(--nexus-color-border-subtle)] p-[var(--nexus-space-3)]">
        <div className="flex items-center gap-2">
          <h2 className="font-mono text-12 uppercase tracking-wide text-fg-3">世界</h2>
          <span
            className={cn(
              'ml-auto font-mono text-11',
              saveState === 'error' ? 'text-danger' : 'text-fg-3',
            )}
            data-world-state
          >
            {STATE_TEXT[saveState]}
          </span>
        </div>
        <input
          value={world.name}
          onChange={(e) => setWorld({ ...world, name: e.target.value })}
          onBlur={() => void persist({ ...world, name: world.name.trim() || '未命名世界' })}
          aria-label="世界名称"
          data-world-name
          className="mt-2 w-full rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-13 text-fg-1 outline-none focus:bg-bg-3"
        />
        <textarea
          value={world.summary}
          onChange={(e) => setWorld({ ...world, summary: e.target.value })}
          onBlur={() => void persist(world)}
          placeholder="一句话说明这是个什么样的世界"
          aria-label="世界概述"
          data-world-summary
          rows={2}
          className="mt-2 w-full resize-y rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-12 text-fg-1 outline-none focus:bg-bg-3"
        />
        {message ? <p className="mt-2 text-11 text-danger" data-world-error>{message}</p> : null}
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
                        onChange={(e) =>
                          setWorld(updateWorldNode(world, node.id, { title: e.target.value }))
                        }
                        onBlur={() => void persist(world)}
                        aria-label={`条目标题 ${node.title}`}
                        data-world-title={node.id}
                        className="min-w-0 flex-1 rounded-[3px] bg-bg-1 px-1 py-[2px] text-12 text-fg-1 outline-none focus:bg-bg-3"
                      />
                      <button
                        type="button"
                        title="删除这条"
                        onClick={() => void persist(removeWorldNode(world, node.id))}
                        aria-label={`删除 ${node.title}`}
                        data-world-remove={node.id}
                        className="shrink-0 px-1 text-12 text-fg-3 hover:text-danger"
                      >
                        ×
                      </button>
                    </div>
                    <textarea
                      value={node.body}
                      onChange={(e) =>
                        setWorld(updateWorldNode(world, node.id, { body: e.target.value }))
                      }
                      onBlur={() => void persist(world)}
                      placeholder="还什么都没写"
                      aria-label={`正文 ${node.title}`}
                      data-world-body={node.id}
                      rows={3}
                      className="mt-1 w-full resize-y rounded-[3px] bg-bg-1 px-1 py-[2px] text-12 leading-relaxed text-fg-1 outline-none focus:bg-bg-3"
                    />
                  </li>
                ))}
            </ul>
          </section>
        ))}

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
            onClick={() => void persist(addWorldNode(world, { kind: newKind, title: `${WORLD_KIND_LABELS[newKind]} · 新条目` }))}
            data-world-add={newKind}
            className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] px-2 py-1 text-11 text-fg-2 hover:bg-bg-2"
          >
            加一条
          </button>
        </div>
        <p className="mt-2 text-11 leading-relaxed text-fg-3" data-world-note>
          改完即写库（失焦或点删除都会保存）。世界编辑不进画布的撤销栈：Ctrl+Z 只管设计文档。
          {WORLD_KINDS.length - groups.length > 0
            ? ` ${WORLD_KINDS.filter((k) => !counts?.[k]).map((k) => WORLD_KIND_LABELS[k]).join('、')} 这一类还没有条目，可以用上面的下拉补。`
            : ''}
        </p>
        <button
          type="button"
          onClick={() => void persist(world)}
          data-world-save
          className="mt-2 self-start rounded-[var(--nexus-radius-sm)] bg-accent-2 px-3 py-1 text-12 text-fg-1"
        >
          保存到库
        </button>
      </div>
    </div>
  );
}
