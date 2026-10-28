'use client';

import { useEffect, useMemo, useState } from 'react';
import { TokenStore, findPage, resolveLayout, type ResolvedLayout } from '@nexus/design-model';
import type { VariantEntry } from '@/server/domain/variants';
import { cn } from '@/lib/cn';
import { studio, useStudio } from './store';
import { nodeStyle } from './render';

/**
 * §29 多方案的并排比较板。
 *
 * 每张卡是同一条分支 head 上那份文档的**只读投影**——与画布、预览共用同一套
 * resolveLayout + nodeStyle（§16），所以这里看到的和切过去之后看到的必须一致。
 * 生成方案不动工作区：候选是给人挑的，点"切到这个方向"才走 §28 的分支切换。
 */

interface Preview {
  layout: ResolvedLayout;
  mode: string | null;
}

function usePreview(variant: VariantEntry | undefined): Preview | null {
  return useMemo(() => {
    if (!variant) return null;
    const document = variant.document;
    const page = findPage(document, document.activePageId) ?? document.pages[0];
    if (!page) return null;
    const tokens = new TokenStore(document.tokens);
    const mode = document.activeMode ?? null;
    return { layout: resolveLayout(page, { tokens, mode }), mode };
  }, [variant]);
}

function VariantFrame({ variant, height = 260 }: { variant: VariantEntry; height?: number }) {
  const preview = usePreview(variant);
  // 资产目录取项目级的那一份：候选文档是分支 head，图却还是同一个项目上传的
  const { assetContext } = useStudio();
  if (!preview) {
    return (
      <div className="flex h-[260px] items-center justify-center bg-bg-0 text-12 text-fg-3" data-variant-empty>
        这条分支还没有可读的文档
      </div>
    );
  }
  const { layout, mode } = preview;
  const tokens = new TokenStore(variant.document.tokens);
  const scale = layout.width ? Math.min(1, 420 / layout.width) : 1;
  return (
    <div className="relative overflow-hidden bg-bg-0" style={{ height, width: '100%' }} data-variant-frame>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: layout.width,
          height: layout.height,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          pointerEvents: 'none',
          background: typeof variant.document.pages[0]?.backgroundColor === 'string' ? variant.document.pages[0]?.backgroundColor : undefined,
        }}
      >
        {layout.paintOrder.map((id) => {
          const resolved = layout.nodes[id];
          if (!resolved) return null;
          return (
            <div key={id} data-node-id={id} data-node-type={resolved.node.type} style={nodeStyle(resolved, { tokens, mode, assets: assetContext })}>
              {resolved.node.text ?? null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VariantCard({
  variant,
  layoutPicked,
  visualPicked,
  onPickLayout,
  onPickVisual,
}: {
  variant: VariantEntry;
  layoutPicked: boolean;
  visualPicked: boolean;
  onPickLayout: () => void;
  onPickVisual: () => void;
}) {
  const { branch, description, label } = variant;
  // 合成/生成的线有 summary；main 这种"手上这一版"只有快照标签，别显示成"没有描述"
  const caption = description ?? label ?? '这条分支还没有说明';
  return (
    <div
      className="flex flex-col overflow-hidden rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] bg-bg-1"
      data-variant-card={branch.id}
      data-variant-current={branch.current ? 'true' : 'false'}
    >
      <div className="flex items-center gap-2 px-[var(--nexus-space-3)] py-[var(--nexus-space-2)]">
        <span className="font-mono text-12 text-fg-1" data-variant-name>
          {branch.name}
        </span>
        {branch.current ? (
          <span className="rounded-[var(--nexus-radius-sm)] bg-accent-2 px-[5px] py-[1px] text-11 text-accent-fg">当前</span>
        ) : null}
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onPickLayout}
            aria-pressed={layoutPicked}
            data-variant-pick-layout={branch.id}
            className={cn(
              'rounded-[var(--nexus-radius-sm)] px-2 py-[2px] text-11',
              layoutPicked ? 'bg-bg-3 text-fg-1' : 'text-fg-3 hover:bg-bg-2',
            )}
          >
            布局
          </button>
          <button
            type="button"
            onClick={onPickVisual}
            aria-pressed={visualPicked}
            data-variant-pick-visual={branch.id}
            className={cn(
              'rounded-[var(--nexus-radius-sm)] px-2 py-[2px] text-11',
              visualPicked ? 'bg-bg-3 text-fg-1' : 'text-fg-3 hover:bg-bg-2',
            )}
          >
            视觉
          </button>
        </span>
      </div>
      <VariantFrame variant={variant} />
      <div className="flex flex-col gap-[var(--nexus-space-2)] px-[var(--nexus-space-3)] py-[var(--nexus-space-2)]">
        <p className="text-11 leading-relaxed text-fg-3" data-variant-desc>
          {caption}
        </p>
        <button
          type="button"
          disabled={branch.current}
          onClick={() => void studio.switchBranch(branch.id)}
          data-variant-adopt={branch.id}
          className={cn(
            'rounded-[var(--nexus-radius-sm)] px-2 py-1 text-12',
            branch.current ? 'cursor-not-allowed text-fg-3' : 'bg-bg-3 text-fg-1 hover:bg-bg-2',
          )}
        >
          {branch.current ? '正在编辑这条线' : '切到这个方向'}
        </button>
      </div>
    </div>
  );
}

export function VariantsBoard() {
  const state = useStudio();
  const [count, setCount] = useState(4);
  const [layoutId, setLayoutId] = useState<string | null>(null);
  const [visualId, setVisualId] = useState<string | null>(null);
  const [name, setName] = useState('');

  useEffect(() => {
    void studio.refreshVariants();
  }, []);

  const variants = state.variants;
  const layoutChoice = variants.find((v) => v.branch.id === layoutId) ?? null;
  const visualChoice = variants.find((v) => v.branch.id === visualId) ?? null;

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-bg-0 px-[var(--nexus-space-4)] py-[var(--nexus-space-3)]" data-variants-board>
      <div className="mb-[var(--nexus-space-3)] flex flex-wrap items-center gap-2">
        <span className="font-mono text-12 text-fg-2">§29 多方案</span>
        <label className="flex items-center gap-1 text-12 text-fg-3">
          条数
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            data-variant-count
            className="rounded-[var(--nexus-radius-sm)] bg-bg-2 px-1 py-[2px] text-12 text-fg-1"
          >
            {[2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={state.snapshotBusy}
          onClick={() => void studio.generateVariants(count)}
          data-variant-generate
          className="rounded-[var(--nexus-radius-sm)] bg-accent-2 px-2 py-1 text-12 text-accent-fg disabled:opacity-50"
        >
          {state.snapshotBusy ? '生成中…' : '生成候选方案'}
        </button>
        <span className="rounded-[var(--nexus-radius-sm)] bg-warn px-2 py-[2px] font-mono text-11 text-accent-fg" data-variant-demo-mode>
          DEMO MODE
        </span>
        <span className="text-11 text-fg-3">
          确定性配方（结构 × 视觉语言），不是模型输出；生成只开新分支，不动当前画布。
        </span>
      </div>

      {state.snapshotError ? (
        <p className="mb-2 text-12 text-danger" data-variant-error>
          {state.snapshotError}
        </p>
      ) : null}

      {state.variantNotes.length ? (
        <ul className="mb-2 flex flex-col gap-1 text-11 text-warn" data-variant-notes>
          {state.variantNotes.map((note) => (
            <li key={note}>· {note}</li>
          ))}
        </ul>
      ) : null}

      <div className="mb-[var(--nexus-space-3)] flex flex-wrap items-center gap-2 rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] bg-bg-1 px-[var(--nexus-space-3)] py-[var(--nexus-space-2)]">
        <span className="text-12 text-fg-2">合成：</span>
        <select
          value={layoutId ?? ''}
          onChange={(e) => setLayoutId(e.target.value || null)}
          aria-label="布局来源"
          data-variant-layout
          className="rounded-[var(--nexus-radius-sm)] bg-bg-2 px-1 py-[2px] text-12 text-fg-1"
        >
          <option value="">布局来源…</option>
          {variants.map((v) => (
            <option key={v.branch.id} value={v.branch.id}>
              {v.branch.name}
            </option>
          ))}
        </select>
        <span className="text-12 text-fg-3">的布局 +</span>
        <select
          value={visualId ?? ''}
          onChange={(e) => setVisualId(e.target.value || null)}
          aria-label="视觉来源"
          data-variant-visual
          className="rounded-[var(--nexus-radius-sm)] bg-bg-2 px-1 py-[2px] text-12 text-fg-1"
        >
          <option value="">视觉来源…</option>
          {variants.map((v) => (
            <option key={v.branch.id} value={v.branch.id}>
              {v.branch.name}
            </option>
          ))}
        </select>
        <span className="text-12 text-fg-3">的视觉</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="新分支名（可留空）"
          data-variant-name
          className="w-[160px] rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-[3px] text-12 text-fg-1 outline-none"
        />
        <button
          type="button"
          disabled={!layoutChoice || !visualChoice || layoutChoice.branch.id === visualChoice.branch.id || state.snapshotBusy}
          onClick={() => {
            if (!layoutChoice || !visualChoice) return;
            void studio.mergeVariants(layoutChoice.branch.id, visualChoice.branch.id, name).then((created) => {
              if (created) {
                setLayoutId(null);
                setVisualId(null);
                setName('');
              }
            });
          }}
          data-variant-merge
          className="rounded-[var(--nexus-radius-sm)] bg-bg-3 px-2 py-1 text-12 text-fg-1 disabled:opacity-40"
        >
          合成新方案
        </button>
        <span className="text-11 text-fg-3">
          {layoutChoice && visualChoice && layoutChoice.branch.id === visualChoice.branch.id
            ? '布局与视觉要选两条不同的分支'
            : '两条都选中才能合成；结果作为一条新分支加入比较板'}
        </span>
      </div>

      {variants.length === 0 ? (
        <p className="text-12 text-fg-3" data-variant-empty-list>
          还没有可比较的方向。点"生成候选方案"开几条分支。
        </p>
      ) : (
        <div className="grid gap-[var(--nexus-space-3)] [grid-template-columns:repeat(auto-fill,minmax(360px,1fr))]">
          {variants.map((variant) => (
            <VariantCard
              key={variant.branch.id}
              variant={variant}
              layoutPicked={layoutId === variant.branch.id}
              visualPicked={visualId === variant.branch.id}
              onPickLayout={() => setLayoutId(variant.branch.id)}
              onPickVisual={() => setVisualId(variant.branch.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
