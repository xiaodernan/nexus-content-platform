'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { generateProject } from '@nexus/design-model';
import { cn } from '@/lib/cn';
import { useStudioReady } from './store';

/**
 * §19 Code 视图：画布旁边的第二块投影。
 * 代码由设计模型单向生成；这里刻意只读，编辑回写要等受限 JSX 解析器（Code → Design）。
 */
export function CodePanel() {
  const state = useStudioReady();
  const files = useMemo(
    () => generateProject(state.document, { mode: state.activeMode }),
    [state.revision, state.document, state.activeMode],
  );
  const [picked, setPicked] = useState<string | null>(null);
  const selectedId = state.selection.length === 1 ? state.selection[0] : null;

  const homePage = files.filter((f) => f.path.endsWith('.tsx'));
  const located = selectedId
    ? files.find((f) => f.contents.includes(`data-nexus-id="${selectedId}"`))
    : undefined;
  const active = files.find((f) => f.path === picked) ?? located ?? homePage[0] ?? files[0];

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
      <p className="m-auto text-13 text-fg-3" data-code-empty>
        还没有页面可以生成代码。
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg-0" data-code-view>
      <div className="flex shrink-0 flex-wrap items-center gap-[var(--nexus-space-1)] border-b border-[var(--nexus-color-border-subtle)] bg-bg-1 px-[var(--nexus-space-2)] py-[var(--nexus-space-1)]">
        {files.map((file) => (
          <button
            key={file.path}
            type="button"
            onClick={() => setPicked(file.path)}
            data-code-file={file.path}
            className={cn(
              'rounded-[var(--nexus-radius-sm)] px-[var(--nexus-space-2)] py-1 font-mono text-12',
              file.path === active.path ? 'bg-bg-3 text-fg-1' : 'text-fg-3 hover:bg-bg-2',
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
          className="ml-auto rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] px-[var(--nexus-space-2)] py-1 text-12 text-fg-2 hover:bg-bg-2"
          data-code-copy
        >
          复制
        </button>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <div data-code-file-path={active.path}>
          {lines.map((line, index) => (
            <div
              key={`${active.path}:${index}`}
              ref={index === hitIndex ? hitRef : null}
              className={cn(
                'flex font-mono text-12 leading-[1.6]',
                index === hitIndex ? 'bg-accent-2/20 text-fg-1' : 'text-fg-2',
              )}
              data-code-line={index === hitIndex ? 'selected' : undefined}
            >
              <span className="w-[42px] shrink-0 select-none pr-[var(--nexus-space-2)] text-right text-fg-3">
                {index + 1}
              </span>
              <span className="whitespace-pre pr-[var(--nexus-space-4)]">{line}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="shrink-0 border-t border-[var(--nexus-color-border-subtle)] bg-bg-1 px-[var(--nexus-space-3)] py-[var(--nexus-space-2)] text-12 text-fg-3" data-code-hint>
        只读投影：改设计请回到画布。选中的元素在这里定位到它对应的那一行（§16）。
        编辑代码回写模型需要受限 JSX 解析器，无法映射的片段会保留为 code-only 区域（§19）。
      </p>
    </div>
  );
}
