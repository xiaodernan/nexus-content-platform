'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';
import type { Locale } from '@/lib/i18n';

/** 双语：每行文案按 cookie locale 选（不夹杂）；服务端下发的判定原文（error）原样保留——那是服务端裁决 */
const MFC_TXT = {
  zh: {
    TYPES: [
      { value: 'component', label: '组件' },
      { value: 'template', label: '模板' },
      { value: 'design_system', label: '设计系统' },
      { value: 'asset', label: '素材' },
      { value: 'world', label: '世界' },
      { value: 'game', label: '游戏' },
      { value: 'character', label: 'AI 角色' },
    ],
    createFailed: (status: number) => `上架失败（${status}）`,
    created: '已上架。',
    title: '上架新物品',
    type: '类型',
    visibility: '可见性',
    visibilityPublic: '公开在售（要花 credits 买）',
    visibilityFree: '免费（谁都能下）',
    visibilityPrivate: '私密（只给自己看）',
    titleAria: '标题（必填）',
    titlePlaceholder: '标题（必填）',
    priceAria: '价格（credits）',
    descAria: '简介',
    descPlaceholder: '描述',
    tagsAria: '标签（用逗号分隔）',
    tagsPlaceholder: '标签，用逗号隔开',
    sourceProjectAria: '来源项目',
    sourceProjectOption: '来源项目（可选）',
    previewAssetAria: '预览素材',
    previewAssetOption: '预览素材（可选，先选项目）',
    busy: '上架中…',
    submit: '上架',
  },
  en: {
    TYPES: [
      { value: 'component', label: 'Component' },
      { value: 'template', label: 'Template' },
      { value: 'design_system', label: 'Design system' },
      { value: 'asset', label: 'Asset' },
      { value: 'world', label: 'World' },
      { value: 'game', label: 'Game' },
      { value: 'character', label: 'AI character' },
    ],
    createFailed: (status: number) => `Create failed (${status})`,
    created: 'Listed.',
    title: 'List a new item',
    type: 'Type',
    visibility: 'Visibility',
    visibilityPublic: 'Listed (paid, credits)',
    visibilityFree: 'Free (anyone can download)',
    visibilityPrivate: 'Private (only you)',
    titleAria: 'Title (required)',
    titlePlaceholder: 'Title (required)',
    priceAria: 'Price (credits)',
    descAria: 'Description',
    descPlaceholder: 'Description',
    tagsAria: 'Tags (comma separated)',
    tagsPlaceholder: 'tags, comma separated',
    sourceProjectAria: 'Source project',
    sourceProjectOption: 'Source project (optional)',
    previewAssetAria: 'Preview asset',
    previewAssetOption: 'Preview asset (optional — pick a project first)',
    busy: 'Listing…',
    submit: 'List',
  },
} as const;

/**
 * §127 上架表单。预览素材从所选项目的资产里挑（GET /api/projects/<id>/assets，
 * 那条路自己校验所有权）；没选项目也能上架一条只有文字的条目——它就是一张「挂牌」，
 * 下载那一格给的是所挂源项目的导出包，所以没挂项目的条目点下载会拿到 no_source（店面页念同一句）。
 */

interface AssetOption {
  id: string;
  name: string;
}

export function MarketplaceCreateForm({ projects, locale = 'zh' }: { projects: { id: string; name: string }[]; locale?: Locale }) {
  const T = MFC_TXT[locale];
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
        setMessage(json?.error ?? T.createFailed(res.status));
        return;
      }
      setTitle('');
      setDescription('');
      setTags('');
      setMessage(T.created);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mfc-card" data-marketplace-create>
      <h2 className="mk-h16">{T.title}</h2>
      <div className="mfc-grid">
        <label className="mfc-label">
          {T.type}
          <select value={itemType} onChange={(e) => setItemType(e.target.value)} data-marketplace-create-type className="mfc-select">
            {T.TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="mfc-label">
          {T.visibility}
          <select value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)} data-marketplace-create-visibility className="mfc-select">
            <option value="public">{T.visibilityPublic}</option>
            <option value="free">{T.visibilityFree}</option>
            <option value="private">{T.visibilityPrivate}</option>
          </select>
        </label>
        <input aria-label={T.titleAria}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={T.titlePlaceholder}
          data-marketplace-create-title
          className="mfc-input"
        />
        <input
          value={priceCredits}
          onChange={(e) => setPriceCredits(Math.max(0, Number(e.target.value) || 0))}
          type="number"
          min={0}
          aria-label={T.priceAria}
          data-marketplace-create-price
          className="mfc-input"
        />
        <input aria-label={T.descAria}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={T.descPlaceholder}
          data-marketplace-create-description
          className="mfc-input mfc-fullRow"
        />
        <input aria-label={T.tagsAria}
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder={T.tagsPlaceholder}
          data-marketplace-create-tags
          className="mfc-input mfc-fullRow"
        />
        {projects.length ? (
          <>
            <select
              value={projectId}
              onChange={(e) => void pickProject(e.target.value)}
              aria-label={T.sourceProjectAria}
              data-marketplace-create-project
              className="mfc-select mfc-selectSm"
            >
              <option value="">{T.sourceProjectOption}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={previewAssetId}
              onChange={(e) => setPreviewAssetId(e.target.value)}
              aria-label={T.previewAssetAria}
              data-marketplace-create-preview
              className="mfc-select mfc-selectSm"
              disabled={!projectId}
            >
              <option value="">{T.previewAssetOption}</option>
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
        className="mfc-submit"
      >
        {busy ? T.busy : T.submit}
      </button>
      {message ? (
        <p className="mfc-message" data-marketplace-create-message>
          {message}
        </p>
      ) : null}
    </div>
  );
}
