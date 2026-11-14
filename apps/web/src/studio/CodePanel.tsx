'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  changedNodeIds,
  codeToPageOps,
  generateProject,
  summarizeCodeEdit,
  type CodeEditSummary,
} from '@nexus/creative-model';
import { cn } from '@/lib/cn';
import { studio, useStudioReady } from './store';

/** 反向解析要用与生成一致的前缀和 token 表，否则 var(--nx-…) 回不到 {color.*} */
const CSS_VAR_PREFIX = 'nx';

interface ApplyReport extends CodeEditSummary {
  applied: number;
  issues: string[];
}

/**
 * §19 Code 视图：画布旁边的第二块投影，并且可以反向编辑。
 * 页面组件经受限 JSX 解析器回到设计模型（一次应用 = 一个可撤销事务），再由模型重新投影；
 * 解析器吃不下的片段如实报告，不回写、也不假装回写成功（§159）。
 */
export function CodePanel() {
  const state = useStudioReady();
  const files = useMemo(
    () => generateProject(state.document, { mode: state.activeMode }),
    [state.revision, state.document, state.activeMode],
  );
  const [picked, setPicked] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [report, setReport] = useState<ApplyReport | null>(null);
  const selectedId = state.selection.length === 1 ? state.selection[0] : null;

  const homePage = files.filter((f) => f.path.endsWith('.tsx'));
  /** 只有当前页面的组件能反向映射回模型 */
  const pageFile = files.find((f) => f.contents.includes(`data-nexus-id="${state.page.rootId}"`));
  const located = selectedId
    ? files.find((f) => f.contents.includes(`data-nexus-id="${selectedId}"`))
    : undefined;
  const active = files.find((f) => f.path === picked) ?? located ?? homePage[0] ?? files[0];
  const editable = Boolean(active && pageFile && pageFile.path === active.path);

  const lines = useMemo(() => (active?.contents ?? '').split('\n'), [active?.contents]);
  const hitIndex =
    selectedId && active
      ? lines.findIndex((line) => line.includes(`data-nexus-id="${selectedId}"`))
      : -1;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hitRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (hitRef.current && scrollRef.current) {
      hitRef.current.scrollIntoView({ block: 'center' });
    }
  }, [hitIndex, active?.path]);

  if (!active) {
    return (
      <p className="cd-empty" data-code-empty>
        还没有页面可以生成代码。
      </p>
    );
  }

  const editing = draft !== null && editable;

  const cancel = (): void => {
    setDraft(null);
    setReport(null);
  };

  const apply = (): void => {
    if (draft === null) return;
    const result = codeToPageOps(draft, state.page, {
      cssVarPrefix: CSS_VAR_PREFIX,
      tokens: state.document.tokens,
      mode: state.activeMode,
    });
    const issues = result.issues.map((issue) => `第 ${issue.line} 行：${issue.message}`);
    if (!result.mappings.length) {
      // 连根元素都对不上：一行都不回写，代码留在编辑器里等用户改（§159 不静默丢弃）
      setReport({ changed: [], unmapped: [], applied: 0, issues });
      return;
    }
    if (result.ops.length) studio.execute('代码编辑', result.ops);
    setReport({
      ...summarizeCodeEdit(result, changedNodeIds(active.contents, draft)),
      applied: result.ops.length,
      issues,
    });
    setDraft(null);
  };

  return (
    <div className="cd-root" data-code-view>
      <div className="cd-toolbar">
        {files.map((file) => (
          <button
            key={file.path}
            type="button"
            disabled={editing}
            onClick={() => {
              setPicked(file.path);
              cancel();
            }}
            data-code-file={file.path}
            className={cn(
              'cd-fileBtn',
              file.path === active.path && 'cd-fileBtnActive',
              editing && 'cd-disabledForbidden',
            )}
          >
            {file.path.replace('components/nexus/', '')}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(active.contents);
          }}
          className="cd-ghost cd-pushEnd"
          data-code-copy
        >
          复制
        </button>
        {editable &&
          (editing ? (
            <>
              <button
                type="button"
                onClick={apply}
                disabled={draft === active.contents}
                data-code-apply
                className={cn('cd-apply', draft === active.contents && 'cd-applyIdle')}
              >
                应用到模型
              </button>
              <button
                type="button"
                onClick={cancel}
                data-code-cancel
                className="cd-ghost"
              >
                取消
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setReport(null);
                setDraft(active.contents);
              }}
              data-code-edit
              className="cd-ghost"
            >
              编辑代码
            </button>
          ))}
      </div>

      <div ref={scrollRef} className="cd-canvas">
        {editing ? (
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            spellCheck={false}
            data-code-editor
            className="cd-editor"
          />
        ) : (
          <div data-code-file-path={active.path}>
            {lines.map((line, index) => (
              <div
                key={`${active.path}:${index}`}
                ref={index === hitIndex ? hitRef : null}
                className={index === hitIndex ? 'cd-lineHit' : 'cd-lineIdle'}
                data-code-line={index === hitIndex ? 'selected' : undefined}
              >
                <span className="cd-gutter">
                  {index + 1}
                </span>
                <span className="cd-lineText">{line}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {report && (
        <div
          className="cd-report"
          data-code-report
        >
          {report.applied ? (
            <p className="am-lede" data-code-report-applied>
              已回写 {report.applied} 处（Ctrl+Z 整体撤销）：
              {report.changed.map((entry) => (
                <span
                  key={`${entry.nodeName}:${entry.line}`}
                  className="cd-changeName"
                >
                  {entry.nodeName} → {entry.paths.join('、')}
                </span>
              ))}
            </p>
          ) : (
            <p className="cd-appliedNone" data-code-report-applied>
              没有可回写的改动。
            </p>
          )}
          {report.unmapped.length > 0 && (
            <ul className="cd-warn" data-code-report-unmapped>
              {report.unmapped.map((entry) => (
                <li key={`${entry.nodeName}:${entry.line}`}>
                  第 {entry.line} 行 {entry.nodeName}：{entry.reasons.join('；')} ——
                  保留为 code-only 区域，下一次生成会被设计模型覆盖（§19）
                </li>
              ))}
            </ul>
          )}
          {report.issues.length > 0 && (
            <ul className="cd-warn" data-code-report-issues>
              {report.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p
        className="cd-hint"
        data-code-hint
      >
        {editing
          ? '代码 → 设计模型：应用后这里会列出哪些改动回了模型、哪些解析不了（§19）。改标签、加删节点、重排属于结构性变更，请在画布或图层树完成。'
          : editable
            ? '画布、代码与预览是同一份设计模型的投影：选中的元素在这里定位到自己那一行（§16）。点「编辑代码」可把改动写回模型（§19）。'
            : '这份文件由设计模型单向生成：只有当前页面的组件能反向映射回模型（§19）。'}
      </p>
    </div>
  );
}
