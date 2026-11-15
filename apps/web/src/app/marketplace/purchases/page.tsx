'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clientLocale } from '@/lib/client-locale';
import type { Locale } from '@/lib/i18n';
import { saveBlob } from '@/lib/download';

/**
 * 双语 COPY（2026-11-15 公开试玩面 wave）——en 逐字对应 zh；组件只做选择。
 * 服务端 409/403/5xx 的 message/reason 原文显示（与其余面板一致）。
 */
const COPY: Record<Locale, {
  readFailed: (status: number) => string;
  readFail: string;
  downloadFailed: (status: number) => string;
  delivered: string;
  type: Record<string, string>;
  delisted: string;
  private: string;
  live: string;
  title: string;
  subtitle: string;
  back: string;
  loadFail: string;
  loading: string;
  empty: string;
  emptyLink: string;
  by: (name: string) => string;
  creatorUnknown: string;
  paid: (n: number) => string;
  busy: string;
  download: string;
}> = {
  zh: {
    readFailed: (status) => `读取失败（${status}）`,
    readFail: '读取失败',
    downloadFailed: (status) => `下载失败（${status}）`,
    delivered: '包已交付（设计文档 + 代码）。',
    type: {
      component: '组件',
      template: '模板',
      design_system: '设计系统',
      asset: '素材',
      world: '世界',
      game: '游戏',
      character: 'AI 角色',
    },
    delisted: '已下架（不再交付）',
    private: '已转私密（已购仍可下载）',
    live: '在售',
    title: '我的购买',
    subtitle: '在这里买到的东西都留在这张单子上。条目下架后记录仍在——但交付门不再给包（页面上照实写）。',
    back: '回市场',
    loadFail: '加载失败',
    loading: '加载中...',
    empty: '还没有买过东西。',
    emptyLink: '去市场看看',
    by: (name) => `作者：${name}`,
    creatorUnknown: '未知创作者',
    paid: (n) => `实付 ${n} credits`,
    busy: '打包中...',
    download: '下载',
  },
  en: {
    readFailed: (status) => `Could not read your purchases (${status})`,
    readFail: 'Could not read your purchases',
    downloadFailed: (status) => `Download failed (${status})`,
    delivered: 'Package delivered (design document + code).',
    type: {
      component: 'Component',
      template: 'Template',
      design_system: 'Design system',
      asset: 'Asset',
      world: 'World',
      game: 'Game',
      character: 'AI character',
    },
    delisted: 'Delisted (no longer delivered)',
    private: 'Now private (prior purchases still downloadable)',
    live: 'On sale',
    title: 'My purchases',
    subtitle: 'Everything bought here stays on this list. A delisted row still shows — but the fulfillment door won’t hand out a package.',
    back: 'To marketplace',
    loadFail: 'Failed to load',
    loading: 'Loading…',
    empty: 'No purchases yet.',
    emptyLink: 'Browse the marketplace',
    by: (name) => `By: ${name}`,
    creatorUnknown: 'Unknown creator',
    paid: (n) => `Paid ${n} credits`,
    busy: 'Preparing package…',
    download: 'Download',
  },
};

interface PurchaseRow {
  itemId: string;
  title: string;
  itemType: string;
  visibility: string;
  pricePaid: number;
  purchasedAt: string;
  creatorId: string;
  creatorName: string | null;
  creatorHandle: string | null;
  delistedAt: string | null;
}

function stamp(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export default function PurchasesPage() {
  const router = useRouter();
  const [locale] = useState<Locale>(() => clientLocale());
  const c = COPY[locale];
  const [rows, setRows] = useState<PurchaseRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Record<string, string>>({});

  /** 状态只有三种，且都能从记录本身推出来——不复述服务端没有的枚举 */
  const statusOf = (row: PurchaseRow): { label: string; className: string } => {
    if (row.delistedAt) {
      return { label: c.delisted, className: 'mp-statusDelisted' };
    }
    if (row.visibility === 'private') {
      return { label: c.private, className: 'mp-statusPrivate' };
    }
    return { label: c.live, className: 'mp-statusLive' };
  };

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/marketplace/purchases');
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        if (!res.ok) throw new Error(c.readFailed(res.status));
        const body = (await res.json()) as { purchases: PurchaseRow[] };
        setRows(body.purchases);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : c.readFail);
      }
    })();
  }, [router, c]);

  const download = async (row: PurchaseRow): Promise<void> => {
    setBusy(row.itemId);
    setMessage((prev) => ({ ...prev, [row.itemId]: '' }));
    try {
      const res = await fetch(`/api/marketplace/${row.itemId}/content`, { credentials: 'same-origin' });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
        setMessage((prev) => ({
          ...prev,
          [row.itemId]: json?.message ?? json?.error ?? c.downloadFailed(res.status),
        }));
        return;
      }
      saveBlob(`${row.title}.zip`, await res.blob());
      setMessage((prev) => ({ ...prev, [row.itemId]: c.delivered }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="mp-root" data-purchases-root>
      <div className="mp-frame">
      <header className="mp-head">
        <div className="mp-heading">
          <h1 className="mp-title">{c.title}</h1>
          <p className="mp-subtitle">
            {c.subtitle}
          </p>
        </div>
        <div className="mp-headActions">
          <Link href="/marketplace" className="mp-back" data-purchases-back>
            {c.back}
          </Link>
        </div>
      </header>

      {error ? (
        <p className="mp-error" data-purchases-error>
          {error}
        </p>
      ) : rows === null ? (
        <p className="mp-loading" data-purchases-loading>
          {c.loading}
        </p>
      ) : rows.length === 0 ? (
        <p className="mp-empty" data-purchases-empty>
          {c.empty}<Link href="/marketplace">{c.emptyLink}</Link>.
        </p>
      ) : (
        <ul className="mp-list" data-purchases-list>
          {rows.map((row) => {
            const status = statusOf(row);
            return (
              <li
                key={row.itemId}
                className="mp-row"
                data-purchase-row
                data-purchase-item={row.itemId}
                data-purchase-status={row.delistedAt ? 'delisted' : row.visibility}
              >
                <div className="mp-rowTop">
                  <strong className="mp-rowName">{row.title}</strong>
                  <span className="mp-type">
                    {c.type[row.itemType] ?? row.itemType}
                  </span>
                  <span className={`mp-status ${status.className}`} data-purchase-status-label>
                    {status.label}
                  </span>
                  <span className="mp-date" data-purchase-date>
                    {stamp(row.purchasedAt)}
                  </span>
                </div>
                <div className="mp-rowMeta">
                  <span>{c.by(row.creatorName ?? row.creatorHandle ?? c.creatorUnknown)}</span>
                  <span data-purchase-price>{c.paid(row.pricePaid)}</span>
                  {row.delistedAt ? null : (
                    <button
                      type="button"
                      onClick={() => void download(row)}
                      disabled={busy === row.itemId}
                      className="mp-download"
                      data-purchase-download={row.itemId}
                    >
                      {busy === row.itemId ? c.busy : c.download}
                    </button>
                  )}
                  {message[row.itemId] ? (
                    <span className="mp-message" data-purchase-message={row.itemId}>
                      {message[row.itemId]}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      </div>
    </main>
  );
}
