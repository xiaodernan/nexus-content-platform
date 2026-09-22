'use client';

import { useMemo } from 'react';
import type { AssetRef, DesignDocument } from '@nexus/design-model';
import { cn } from '@/lib/cn';
import { apiAssetUrl } from './assets';
import { studio, useStudioReady } from './store';

/**
 * M2 Asset Library（line 227）：项目资产清单是设计模型的一部分（§16），
 * 这里只是它的一个投影——列出、预览、以及删除。
 *
 * 删除走 `studio.deleteAssetFromLibrary`：一次可撤销事务把资产移出清单并剥掉引用它的填充
 * （removeAsset 模型级负责跨页清理，§149）。字节删除是尽力而为的第二步，
 * 面板把"撤销能恢复引用、但文件字节回不来"这条非对称如实写进回执（§159），不假装万能。
 */

function referenceCount(doc: DesignDocument, assetId: string): number {
  let count = 0;
  for (const page of doc.pages) {
    for (const node of Object.values(page.nodes)) {
      const inFill = Array.isArray(node.style.fills)
        ? node.style.fills.some((p) => p.kind === 'image' && p.assetId === assetId)
        : false;
      if (inFill || node.assetId === assetId) count += 1;
    }
  }
  return count;
}

function formatBytes(n?: number): string {
  if (!n || !Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function AssetsPanel() {
  const state = useStudioReady();
  const assets = state.assets as AssetRef[];
  const counts = useMemo(
    () => new Map(assets.map((a) => [a.id, referenceCount(state.document, a.id)])),
    [assets, state.document],
  );

  return (
    <div className="flex h-full min-h-0 flex-col" data-assets-panel>
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--nexus-color-border-subtle)] px-[var(--nexus-space-3)] py-2">
        <h2 className="font-mono text-12 uppercase tracking-wide text-fg-3">资产库</h2>
        <span className="font-mono text-12 text-fg-3">{assets.length}</span>
      </header>

      {state.assetError ? (
        <p className="shrink-0 bg-warn/15 px-[var(--nexus-space-3)] py-2 text-12 text-warn" data-asset-error>
          {state.assetError}
        </p>
      ) : null}
      {state.assetNotice && !state.assetError ? (
        <p className="shrink-0 bg-bg-2 px-[var(--nexus-space-3)] py-2 text-12 text-fg-3" data-asset-notice>
          {state.assetNotice}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto p-[var(--nexus-space-2)]">
        {assets.length === 0 ? (
          <p className="m-auto max-w-[220px] px-3 py-8 text-center text-12 text-fg-3">
            还没有资产。在画布上选中元素，用属性面板上传一张图片，它就会出现在这里。
          </p>
        ) : (
          <ul className="flex flex-col gap-[var(--nexus-space-2)]">
            {assets.map((asset) => {
              const refs = counts.get(asset.id) ?? 0;
              const previewable = asset.kind === 'image' || asset.kind === 'svg';
              return (
                <li
                  key={asset.id}
                  className="flex items-stretch gap-2 overflow-hidden rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-subtle)] bg-bg-2 p-2"
                  data-asset-card={asset.id}
                >
                  <div className="flex h-[56px] w-[56px] shrink-0 items-center justify-center overflow-hidden rounded-[var(--nexus-radius-sm)] bg-bg-3">
                    {previewable ? (
                      // 走鉴权 API 路由；缺失/无权限会 404，浏览器显示空白而非破图占位（§159 不假渲染）
                      <img src={apiAssetUrl(asset.id)} alt={asset.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="font-mono text-10 uppercase text-fg-3">{asset.kind}</span>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                    <span className="truncate text-12 text-fg-1" title={asset.name}>
                      {asset.name}
                    </span>
                    <span
                      className="truncate font-mono text-11 text-fg-3"
                      title={`${asset.width && asset.height ? `${asset.width}×${asset.height} · ` : ''}${formatBytes(asset.sizeBytes)} · 引用 ${refs}`}
                    >
                      {formatBytes(asset.sizeBytes)} · 引用 {refs}
                    </span>
                    <div className="flex items-center gap-1">
                      {asset.generatedBy?.demoMode ? (
                        <span className={cn('rounded px-1 font-mono text-10 text-bg-0', 'bg-warn')}>DEMO</span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void studio.extractVisualDnaFromAsset(asset.id)}
                        disabled={state.assetBusy || asset.kind !== 'image'}
                        title={asset.kind === 'image' ? '把这张图当作参考图，提取项目的 Visual DNA（§30）' : '目前只有位图可提取'}
                        data-asset-dna={asset.id}
                        className="ml-auto rounded-[var(--nexus-radius-sm)] px-2 py-[2px] font-mono text-11 text-fg-3 hover:bg-bg-3 disabled:opacity-50"
                      >
                        提取视觉语言
                      </button>
                      <button
                        type="button"
                        onClick={() => void studio.deleteAssetFromLibrary(asset.id)}
                        disabled={state.assetBusy}
                        data-asset-delete={asset.id}
                        className="rounded-[var(--nexus-radius-sm)] px-2 py-[2px] font-mono text-11 text-fg-3 hover:bg-bg-3 disabled:opacity-50"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
