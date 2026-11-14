'use client';

import { useState } from 'react';
import type { Locale } from '@/lib/i18n';
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
 * 双语（v751）：locale 由调用侧透传；zh 原文原样保留，en 逐句对应。
 */

const COPY = {
  zh: {
    pinnedTo: '钉在：',
    placeholder: '例如：这个按钮太大',
    submitBusy: '写入中…',
    submitBtn: '批注这个元素',
    hintMulti: '先只选一个元素再批注：对着五个元素说"这个太大"，定位就成了猜。',
    hintNone: '在画布上点一个元素，再回来写批注。',
    showResolved: (n: number) => `显示已解决的 ${n} 条`,
    hideResolved: '收起已解决的批注',
    deletedNode: ' · 节点已不在文档里',
    resolved: ' · 已解决',
    reopen: '重新打开',
    markResolved: '标为已解决',
    remove: '删除',
    emptyPage: '这一页还没有批注。',
    allResolved: '这一页的批注都已标记为已解决。',
    toggle: (total: number, onSelected: number) => `批注 ${total} 条${onSelected ? ` · 选中元素上 ${onSelected}` : ''}`,
  },
  en: {
    pinnedTo: 'Pinned to: ',
    placeholder: 'e.g. this button is too big',
    submitBusy: 'Writing…',
    submitBtn: 'Annotate this element',
    hintMulti: 'Pick a single element first; with five selected, “this is too big” is a guess.',
    hintNone: 'Click an element on the canvas, then come back to annotate.',
    showResolved: (n: number) => `Show ${n} resolved`,
    hideResolved: 'Hide resolved annotations',
    deletedNode: ' · node not in document',
    resolved: ' · resolved',
    reopen: 'Reopen',
    markResolved: 'Mark resolved',
    remove: 'Delete',
    emptyPage: 'No annotations on this page yet.',
    allResolved: 'All annotations on this page are marked resolved.',
    toggle: (total: number, onSelected: number) => `Annotations ${total}${onSelected ? ` · ${onSelected} on selected` : ''}`,
  },
} as const;

export function AnnotationsPanel({ locale = 'zh' }: { locale?: Locale }) {
  const c = COPY[locale];
  const state = useStudioReady();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  // 默认收起已解决的：留着它们只会把还没处理的那几条挤到看不见。要看得点一下
  const [hideResolved, setHideResolved] = useState(true);

  const selectedId = state.selection.length === 1 ? state.selection[0]! : null;
  const selectedNode = selectedId ? state.page?.nodes[selectedId] ?? null : null;
  const mine = state.annotations.filter((a) => a.pageId === state.page?.id);
  const resolvedCount = mine.filter((a) => a.resolvedAt !== null).length;
  const shown = hideResolved ? mine.filter((a) => a.resolvedAt === null) : mine;
  const onSelected = selectedId ? state.annotations.filter((a) => a.nodeId === selectedId) : [];

  const resolve = async (annotationId: string, resolved: boolean): Promise<void> => {
    setResolving(annotationId);
    setError(null);
    const reason = await studio.resolveAnnotation(annotationId, resolved);
    setResolving(null);
    if (reason) setError(reason);
  };

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
      className="np-root"
      data-annotations-root
      // 这块面板浮在画布上：不挡住 pointerdown 的话，点面板里任何一个控件都会
      // 被画布当成"点了空白处"，选中项被清空，刚写的批注就没地方钉了
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-annotations-toggle={open ? 'on' : 'off'}
        className="np-toggle"
      >
        {c.toggle(mine.length, onSelected.length)}
      </button>

      {open ? (
        <div className="np-panel" data-annotations-panel>
          {selectedId && selectedNode ? (
            <>
              <p className="np-lede">
                {c.pinnedTo}<span className="np-name">{selectedNode.name}</span>（{selectedNode.type} · {selectedId}）
              </p>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder={c.placeholder}
                className="np-input"
                data-annotation-input
              />
              <button
                type="button"
                disabled={busy || !text.trim()}
                onClick={() => void submit()}
                className="np-submit"
                data-annotation-submit
              >
                {busy ? c.submitBusy : c.submitBtn}
              </button>
            </>
          ) : (
            <p className="np-lede" data-annotation-hint>
              {state.selection.length > 1 ? c.hintMulti : c.hintNone}
            </p>
          )}
          {error ? (
            <p className="am-triageError" data-annotation-error>
              {error}
            </p>
          ) : null}

          {resolvedCount > 0 ? (
            <button
              type="button"
              onClick={() => setHideResolved((v) => !v)}
              className="np-resolved"
              data-annotations-resolved-filter={hideResolved ? 'hiding' : 'showing'}
            >
              {hideResolved ? c.showResolved(resolvedCount) : c.hideResolved}
            </button>
          ) : null}

          <ul className="np-list" data-annotation-list>
            {shown.map((a) => (
              <li
                className="np-item"
                data-annotation={a.nodeId}
                data-annotation-resolved={a.resolvedAt ? 'on' : 'off'}
                key={a.id}
              >
                <span className={a.resolvedAt ? 'np-bodyOff' : 'np-bodyOn'}>{a.body}</span>
                <span className="np-meta">
                  {a.nodeName} · {a.pageName} · {a.author}
                  {a.pageName === '(节点已不在文档里)' ? c.deletedNode : ''}
                  {a.resolvedAt ? c.resolved : ''}
                </span>
                <span className="np-actions">
                  <button
                    type="button"
                    disabled={resolving === a.id}
                    onClick={() => void resolve(a.id, a.resolvedAt === null)}
                    className="np-linkBtn"
                    data-annotation-resolve={a.id}
                  >
                    {resolving === a.id ? '…' : a.resolvedAt ? c.reopen : c.markResolved}
                  </button>
                  <button
                    type="button"
                    onClick={() => void studio.removeAnnotation(a.id)}
                    className="np-removeBtn"
                    data-annotation-remove={a.id}
                  >
                    {c.remove}
                  </button>
                </span>
              </li>
            ))}
            {shown.length === 0 ? (
              <li className="np-lede">
                {mine.length === 0 ? c.emptyPage : c.allResolved}
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
