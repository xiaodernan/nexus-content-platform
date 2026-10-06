'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';

/**
 * §127 上架表单。预览素材从所选项目的资产里挑（GET /api/projects/<id>/assets，
 * 那条路自己校验所有权）；没选项目也能上架一条只有文字的条目——它就是一张
 * 「挂牌」，页面上说明了内容交付还没接（见店面页的限度）。
 */

const TYPES = [
  { value: 'component', label: '组件' },
  { value: 'template', label: '模板' },
  { value: 'design_system', label: '设计系统' },
  { value: 'asset', label: '素材' },
  { value: 'world', label: '世界' },
  { value: 'game', label: '游戏' },
  { value: 'character', label: 'AI 角色' },
] as const;

interface AssetOption {
  id: string;
  name: string;
}

export function MarketplaceCreateForm({ projects }: { projects: { id: string; name: string }[] }) {
  const router = useRouter();
  const [itemType, setItemType] = useState<string>('component');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [priceCredits, setPriceCredits] = useState(0);
  const [visibility, setVisibility] = useState<'public' | 'free' | 'private'>('public');
  const [projectId, setProjectId] = useState('');
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [previewAssetId, setPreviewAssetId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pickProject = async (nextId: string) => {
    setProjectId(nextId);
    setPreviewAssetId('');
    setAssets([]);
    if (!nextId) return;
    const res = await fetch(`/api/projects/${nextId}/assets`);
    const json = (await res.json().catch(() => null)) as { assets?: { id: string; name: string }[] } | null;
    setAssets(json?.assets ?? []);
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/marketplace', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({
          itemType,
          title,
          description,
          tags: tags
            .split(/[,，]/)
            .map((tag) => tag.trim())
            .filter(Boolean),
          priceCredits,
          visibility,
          sourceProjectId: projectId || undefined,
          previewAssetId: previewAssetId || undefined,
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setMessage(json?.error ?? `上架失败（${res.status}）`);
        return;
      }
      setTitle('');
      setDescription('');
      setTags('');
      setMessage('已上架。');
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-subtle)] p-3" data-marketplace-create>
      <h2 className="text-[var(--nexus-font-size-16)] font-medium">上架新物品</h2>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-12">
          类型
          <select value={itemType} onChange={(e) => setItemType(e.target.value)} data-marketplace-create-type className="rounded bg-bg-2 px-1 py-1">
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-12">
          可见性
          <select value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)} data-marketplace-create-visibility className="rounded bg-bg-2 px-1 py-1">
            <option value="public">公开在售（要花 credits 买）</option>
            <option value="free">免费（谁都能下）</option>
            <option value="private">私密（只给自己看）</option>
          </select>
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="标题（必填）"
          data-marketplace-create-title
          className="rounded bg-bg-2 px-2 py-1 text-12"
        />
        <input
          value={priceCredits}
          onChange={(e) => setPriceCredits(Math.max(0, Number(e.target.value) || 0))}
          type="number"
          min={0}
          aria-label="价格（credits）"
          data-marketplace-create-price
          className="rounded bg-bg-2 px-2 py-1 text-12"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="描述"
          data-marketplace-create-description
          className="rounded bg-bg-2 px-2 py-1 text-12 sm:col-span-2"
        />
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="标签，用逗号隔开"
          data-marketplace-create-tags
          className="rounded bg-bg-2 px-2 py-1 text-12 sm:col-span-2"
        />
        {projects.length ? (
          <>
            <select value={projectId} onChange={(e) => void pickProject(e.target.value)} data-marketplace-create-project className="rounded bg-bg-2 px-1 py-1 text-12">
              <option value="">来源项目（可选）</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select value={previewAssetId} onChange={(e) => setPreviewAssetId(e.target.value)} data-marketplace-create-preview className="rounded bg-bg-2 px-1 py-1 text-12" disabled={!projectId}>
              <option value="">预览素材（可选，先选项目）</option>
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name}
                </option>
              ))}
            </select>
          </>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || !title.trim()}
        data-marketplace-create-submit
        className="mt-2 rounded bg-accent-1 px-3 py-1 text-12 text-fg-1 disabled:opacity-50"
      >
        {busy ? '上架中…' : '上架'}
      </button>
      {message ? (
        <p className="mt-1 text-11 text-fg-2" data-marketplace-create-message>
          {message}
        </p>
      ) : null}
    </div>
  );
}
