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
import type { Locale } from '@/lib/i18n';
import { studio, useStudioReady } from './store';

/** 反向解析要用与生成一致的前缀和 token 表，否则 var(--nx-…) 回不到 {color.*} */
const CSS_VAR_PREFIX = 'nx';

interface ApplyReport extends CodeEditSummary {
  applied: number;
  issues: string[];
}

const COPY = {
  zh: {
    empty: '还没有页面可以生成代码。',
    copy: '复制',
    applyToModel: '应用到模型',
    cancel: '取消',
    editCode: '编辑代码',
    issueLine: (line: number, message: string) => `第 ${line} 行：${message}`,
    undoLabel: '代码编辑',
    appliedTo: (applied: number) => `已回写 ${applied} 处（Ctrl+Z 整体撤销）：`,
    noChanges: '没有可回写的改动。',
    unmappedLine: (line: number, name: string, reasons: string) =>
      `第 ${line} 行 ${name}：${reasons} —— 保留为 code-only 区域，下一次生成会被设计模型覆盖（§19）`,
    unmappedJoin: '；',
    pathsJoin: '、',
    hintEditing:
      '代码 → 设计模型：应用后这里会列出哪些改动回了模型、哪些解析不了（§19）。改标签、加删节点、重排属于结构性变更，请在画布或图层树完成。',
    hintEditable:
      '画布、代码与预览是同一份设计模型的投影：选中的元素在这里定位到自己那一行（§16）。点「编辑代码」可把改动写回模型（§19）。',
    hintReadonly:
      '这份文件由设计模型单向生成：只有当前页面的组件能反向映射回模型（§19）。',
  },
  en: {
    empty: 'No page to generate code for yet.',
    copy: 'Copy',
    applyToModel: 'Apply to model',
    cancel: 'Cancel',
    editCode: 'Edit code',
    issueLine: (line: number, message: string) => `Line ${line}: ${message}`,
    undoLabel: 'Code edit',
    appliedTo: (applied: number) => `Wrote back ${applied} ${applied === 1 ? 'change' : 'changes'} (Ctrl+Z undoes the whole transaction):`,
    noChanges: 'No changes to write back.',
    unmappedLine: (line: number, name: string, reasons: string) =>
      `Line ${line} ${name}: ${reasons} — kept as a code-only region, the next generate will overwrite it (§19)`,
    unmappedJoin: '; ',
    pathsJoin: ', ',
    hintEditing:
      'Code → design model: after applying, this lists which changes wrote back and which could not be parsed (§19). Changing tags, adding/removing nodes and reordering are structural changes — do them in the canvas or the layers tree.',
    hintEditable:
      'Canvas, code and preview are projections of the same design model: a selected element is located to its line here (§16). “Edit code” writes changes back into the model (§19).',
    hintReadonly:
      'This file is generated one way from the design model: only the current page’s component maps back onto the model (§19).',
  },
} as const;

/**
 * §19 Code 视图：画布旁边的第二块投影，并且可以反向编辑。
 * 页面组件经受限 JSX 解析器回到设计模型（一次应用 = 一个可撤销事务），再由模型重新投影；
 * 解析器吃不下的片段如实报告，不回写、也不假装回写成功（§159）。
 * 双语（v737）：locale 由 StudioShell 透传；zh 原文原样保留，en 逐句对应。
 * 解析器报文（§19 反向映射）仍是中文——§46 错误语面英文化独立立片，本片不伪造翻译。
 */
export function CodePanel({ locale = 'zh' }: { locale?: Locale }) {
  const c = COPY[locale];
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
        {c.empty}
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
    const issues = result.issues.map((issue) => c.issueLine(issue.line, issue.message));
    if (!result.mappings.length) {
      // 连根元素都对不上：一行都不回写，代码留在编辑器里等用户改（§159 不静默丢弃）
      setReport({ changed: [], unmapped: [], applied: 0, issues });
      return;
    }
    if (result.ops.length) studio.execute(c.undoLabel, result.ops);
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
          {c.copy}
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
                {c.applyToModel}
              </button>
              <button
                type="button"
                onClick={cancel}
                data-code-cancel
                className="cd-ghost"
              >
                {c.cancel}
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
              {c.editCode}
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
              {c.appliedTo(report.applied)}
              {report.changed.map((entry) => (
                <span
                  key={`${entry.nodeName}:${entry.line}`}
                  className="cd-changeName"
                >
                  {entry.nodeName} → {entry.paths.join(c.pathsJoin)}
                </span>
              ))}
            </p>
          ) : (
            <p className="cd-appliedNone" data-code-report-applied>
              {c.noChanges}
            </p>
          )}
          {report.unmapped.length > 0 && (
            <ul className="cd-warn" data-code-report-unmapped>
              {report.unmapped.map((entry) => (
                <li key={`${entry.nodeName}:${entry.line}`}>
                  {c.unmappedLine(entry.line, entry.nodeName, entry.reasons.join(c.unmappedJoin))}
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
          ? c.hintEditing
          : editable
            ? c.hintEditable
            : c.hintReadonly}
      </p>
    </div>
  );
}
