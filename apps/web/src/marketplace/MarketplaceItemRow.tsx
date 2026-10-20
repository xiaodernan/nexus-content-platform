'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';
import { saveBlob } from '@/lib/download';

/**
 * 市场物品的一行：卡片信息 + （自己的）删除 + 下载计数。
 * §127-128 Marketplace 购买与交付：付费物品先买后下，免费物品直接下。
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
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(item.priceCredits);
  const [visibility, setVisibility] = useState(item.visibility);
  const [purchased, setPurchased] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const purchase = async () => {
    if (item.priceCredits === 0) {
      setMessage('免费物品无需购买');
      return;
    }
    if (!window.confirm(`确认花费 ${item.priceCredits} credits 购买「${item.title}」？`)) return;
    setPurchasing(true);
    try {
      const res = await fetch(`/api/marketplace/${item.id}/purchase`, {
        method: 'POST',
        headers: csrfHeaders(),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setMessage(json?.error ?? `购买失败（${res.status}）`);
        return;
      }
      setPurchased(true);
      setMessage('购买成功！现在可以下载了。');
    } finally {
      setPurchasing(false);
    }
  };

  const download = async () => {
    // 付费物品需要先购买（除非是自己的）
    if (item.priceCredits > 0 && !mine && !purchased) {
      setMessage('请先完成购买再下载');
      return;
    }
    if (downloading) return;
    setDownloading(true);
    try {
      // 走 fetch 而不是直接把 <a> 挂到那道门上：交付失败时门回的是机器可读的 JSON
      // （没有源项目 / 还没买 / 太频繁），一条 <a> 点击看不见状态码，界面就只能假装成功。
      // 服务端记的那个数字才是"交付了几次"，所以点完要重读权威（§159：数字不许自己攒）
      const res = await fetch(`/api/marketplace/${item.id}/content`, { credentials: 'same-origin' });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
        setMessage(json?.message ?? json?.error ?? `下载失败（${res.status}）`);
        return;
      }
      const blob = await res.blob();
      // 回收对象 URL 的时机只写在 @/lib/download 那一处（三处下载共用一份实现）
      saveBlob(`${item.title}.zip`, blob);
      setMessage('包已交付（设计文档 + 代码）。');
    } finally {
      setDownloading(false);
      router.refresh();
    }
  };

  const remove = async () => {
    if (!window.confirm(`下架「${item.title}」？`)) return;
    const res = await fetch(`/api/marketplace/${item.id}`, {
      method: 'DELETE',
      headers: csrfHeaders(),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      setMessage(json?.message ?? `下架失败（${res.status}）`);
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
      // 服务端的 `error` 是稳定的机器码（not_found/forbidden），给人看的是 `message`
      const json = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      setMessage(json?.message ?? json?.error ?? `保存失败（${res.status}）`);
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
        {purchased ? (
          <span className="rounded bg-green-900/30 px-1 text-11 text-green-400" data-marketplace-purchased>
            已购买
          </span>
        ) : null}
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
        {item.priceCredits > 0 && !mine && !purchased ? (
          <button
            type="button"
            onClick={() => void purchase()}
            disabled={purchasing}
            data-marketplace-purchase={item.id}
            className="rounded bg-accent-1 px-2 py-1 text-11 hover:bg-accent-2"
          >
            {purchasing ? '购买中...' : '购买'}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void download()}
          disabled={downloading}
          data-marketplace-download={item.id}
          className="rounded bg-bg-3 px-2 py-1 text-11 text-fg-2 hover:bg-bg-1"
        >
          {downloading ? '取包中...' : `下载（${item.downloadCount}）`}
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
