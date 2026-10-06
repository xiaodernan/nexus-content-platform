'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';

/**
 * 市场物品的一行：卡片信息 + （自己的）删除 + 下载计数。
 * 「下载」只记一次计数并诚实说明内容交付还没接（店面页的限度那段）。
 */

interface ItemView {
  id: string;
  title: string;
  description: string;
  itemType: string;
  priceCredits: number;
  visibility: string;
  creatorName: string | null;
  downloadCount: number;
  previewAssetId: string | null;
}

export function MarketplaceItemRow({
  item,
  mine,
  typeLabel,
  visibilityLabel,
}: {
  item: ItemView;
  mine: boolean;
  typeLabel: string;
  visibilityLabel: string;
}) {
  const router = useRouter();
  const [downloads, setDownloads] = useState(item.downloadCount);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(item.priceCredits);
  const [visibility, setVisibility] = useState(item.visibility);

  const download = async () => {
    const res = await fetch(`/api/marketplace/${item.id}/download`, { method: 'POST' });
    if (!res.ok) {
      setMessage(`下载失败（${res.status}）`);
      return;
    }
    const json = (await res.json().catch(() => null)) as { downloadCount?: number } | null;
    setDownloads(json?.downloadCount ?? downloads + 1);
    setMessage('已记一次下载（工程文件本体的交付还没接——见页面底部的限度）。');
  };

  const remove = async () => {
    if (!window.confirm(`下架「${item.title}」？`)) return;
    const res = await fetch(`/api/marketplace/${item.id}`, {
      method: 'DELETE',
      headers: csrfHeaders(),
    });
    if (!res.ok) {
      setMessage(`下架失败（${res.status}）`);
      return;
    }
    router.refresh();
  };

  const saveEdit = async () => {
    const res = await fetch(`/api/marketplace/${item.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...csrfHeaders() },
      body: JSON.stringify({ priceCredits: price, visibility }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      setMessage(json?.error ?? `保存失败（${res.status}）`);
      return;
    }
    setEditing(false);
    setMessage('已保存。');
    router.refresh();
  };

  return (
    <li
      className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-subtle)] bg-bg-2 p-3"
      data-marketplace-item={item.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        {item.previewAssetId ? (
          // 预览走市场自己的公开路由：素材本体在作者项目里，画布那条取图路是 owner-only 的
          <img
            src={`/api/marketplace/${item.id}/preview`}
            alt={`预览：${item.title}`}
            className="h-14 w-20 rounded object-cover"
            data-marketplace-preview={item.id}
          />
        ) : null}
        <span className="text-13 font-semibold text-fg-1" data-marketplace-item-title>
          {item.title}
        </span>
        <span className="rounded bg-bg-3 px-1 text-11 text-fg-2">{typeLabel}</span>
        <span className="rounded bg-bg-3 px-1 text-11 text-fg-2" data-marketplace-item-visibility={item.visibility}>
          {visibilityLabel}
        </span>
        <span className="text-12 text-accent-2" data-marketplace-item-price={item.priceCredits}>
          {item.priceCredits > 0 ? `${item.priceCredits} credits` : '免费'}
        </span>
        <span className="ml-auto text-11 text-fg-3">{item.creatorName ?? '匿名创作者'}</span>
        {mine ? (
          <button
            type="button"
            onClick={() => setEditing((on) => !on)}
            data-marketplace-edit={item.id}
            aria-expanded={editing}
            className="rounded bg-bg-3 px-2 py-1 text-11 text-fg-2 hover:bg-bg-1"
          >
            {editing ? '收起' : '改价格/可见性'}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void download()}
          data-marketplace-download={item.id}
          className="rounded bg-bg-3 px-2 py-1 text-11 text-fg-2 hover:bg-bg-1"
        >
          下载（{downloads}）
        </button>
        {mine ? (
          <button
            type="button"
            onClick={() => void remove()}
            data-marketplace-remove={item.id}
            className="rounded px-2 py-1 text-11 text-fg-3 hover:text-danger"
          >
            下架
          </button>
        ) : null}
      </div>
      {editing ? (
        <div className="mt-2 flex flex-wrap items-center gap-2" data-marketplace-edit-panel={item.id}>
          <label className="flex items-center gap-1 text-11 text-fg-2">
            价格
            <input
              type="number"
              min={0}
              value={price}
              onChange={(e) => setPrice(Math.max(0, Number(e.target.value) || 0))}
              data-marketplace-edit-price={item.id}
              className="w-20 rounded bg-bg-1 px-1 py-[2px] text-12"
            />
          </label>
          <label className="flex items-center gap-1 text-11 text-fg-2">
            可见性
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              data-marketplace-edit-visibility={item.id}
              className="rounded bg-bg-2 px-1 py-1 text-12"
            >
              <option value="public">公开在售</option>
              <option value="free">免费</option>
              <option value="private">私密</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void saveEdit()}
            data-marketplace-edit-save={item.id}
            className="rounded bg-accent-1 px-2 py-1 text-11"
          >
            保存
          </button>
        </div>
      ) : null}
      {item.description ? <p className="mt-1 text-12 text-fg-2">{item.description}</p> : null}
      {message ? (
        <p className="mt-1 text-11 text-fg-3" data-marketplace-item-message>
          {message}
        </p>
      ) : null}
    </li>
  );
}
