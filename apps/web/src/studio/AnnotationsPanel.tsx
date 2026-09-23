'use client';

import { useState } from 'react';
import { studio, useStudioReady } from './store';

/**
 * §111 画布批注：点击元素 → 写一条评论，评论钉在那个节点上。
 *
 * 三条不糊弄的边界：
 * - 批注只钉**当前选中的那一个**元素。多选时不写：一句"这个按钮太大"对着五个元素，
 *   Agent 拿到的定位就是猜的。
 * - 节点被删掉之后批注不会跟着消失：列表里标出"节点已不在文档里"，
 *   因为"话是谁说的、说过没有"是历史，不该被一次删除抹掉。
 * - 这是作者项目内部的私有笔记，不会出现在公开页上；
 *   它随 AI 请求发给模型时走服务端派生那一条路（见 server/ai/assemble.ts）。
 */
export function AnnotationsPanel() {
  const state = useStudioReady();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedId = state.selection.length === 1 ? state.selection[0]! : null;
  const selectedNode = selectedId ? state.page?.nodes[selectedId] ?? null : null;
  const mine = state.annotations.filter((a) => a.pageId === state.page?.id);
  const onSelected = selectedId ? state.annotations.filter((a) => a.nodeId === selectedId) : [];

  const submit = async (): Promise<void> => {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    const reason = await studio.addAnnotation(selectedId, text);
    setBusy(false);
    if (reason) {
      setError(reason);
      return;
    }
    setText('');
  };

  return (
    <div
      className="absolute bottom-3 left-3 z-40 flex max-w-[340px] flex-col gap-2"
      data-annotations-root
      // 这块面板浮在画布上：不挡住 pointerdown 的话，点面板里任何一个控件都会
      // 被画布当成"点了空白处"，选中项被清空，刚写的批注就没地方钉了
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-annotations-toggle={open ? 'on' : 'off'}
        className="self-start rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] bg-bg-1 px-2 py-1 text-11 text-fg-2 hover:bg-bg-2"
      >
        批注 {mine.length} 条{onSelected.length ? ` · 选中元素上 ${onSelected.length}` : ''}
      </button>

      {open ? (
        <div className="flex flex-col gap-2 rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-subtle)] bg-bg-1 p-2" data-annotations-panel>
          {selectedId && selectedNode ? (
            <>
              <p className="text-11 text-fg-3">
                钉在：<span className="text-fg-1">{selectedNode.name}</span>（{selectedNode.type} · {selectedId}）
              </p>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="例如：这个按钮太大"
                className="rounded bg-bg-2 px-2 py-1 text-12 text-fg-1"
                data-annotation-input
              />
              <button
                type="button"
                disabled={busy || !text.trim()}
                onClick={() => void submit()}
                className="self-start rounded bg-accent-2 px-2 py-1 text-11 text-fg-1 disabled:opacity-50"
                data-annotation-submit
              >
                {busy ? '写入中…' : '批注这个元素'}
              </button>
            </>
          ) : (
            <p className="text-11 text-fg-3" data-annotation-hint>
              {state.selection.length > 1
                ? '先只选一个元素再批注：对着五个元素说"这个太大"，定位就成了猜。'
                : '在画布上点一个元素，再回来写批注。'}
            </p>
          )}
          {error ? (
            <p className="text-11 text-danger" data-annotation-error>
              {error}
            </p>
          ) : null}

          <ul className="flex max-h-[220px] flex-col gap-1 overflow-auto" data-annotation-list>
            {mine.map((a) => (
              <li className="border-t border-[var(--nexus-color-border-subtle)] pt-1 text-11" data-annotation={a.nodeId} key={a.id}>
                <span className="text-fg-1">{a.body}</span>
                <span className="block text-fg-3">
                  {a.nodeName} · {a.pageName} · {a.author}
                  {a.pageName === '(节点已不在文档里)' ? ' · 节点已不在文档里' : ''}
                </span>
                <button
                  type="button"
                  onClick={() => void studio.removeAnnotation(a.id)}
                  className="mt-[2px] text-fg-3 hover:text-danger"
                  data-annotation-remove={a.id}
                >
                  删除
                </button>
              </li>
            ))}
            {mine.length === 0 ? <li className="text-11 text-fg-3">这一页还没有批注。</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
