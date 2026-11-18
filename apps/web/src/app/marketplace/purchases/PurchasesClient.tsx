'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { saveBlob } from '@/lib/download';
import type { Locale } from '@/lib/i18n';

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

/** 双语：每行文案按 cookie locale 选（不夹杂） */
const MP_TXT = {
  zh: {
    typeLabels: {
      component: '组件',
      template: '模板',
      design_system: '设计系统',
      asset: '素材',
      world: '世界',
      game: '游戏',
      character: 'AI 角色',
    },
    deListed: '已下架（不再交付）',
    madePrivate: '已转私密（已购仍可下载）',
    live: '在售',
    readFailed: (status: number) => `读取失败（${status}）`,
    readFailedShort: '读取失败',
    title: '我的购买',
    subtitle: '在这里买到的东西都留在这张单子上。条目下架后记录仍在——但交付门不再给包（页面上照实写）。',
    back: '回市场',
    loading: '加载中...',
    empty: '还没有买过东西。',
    emptyCta: '去市场看看',
    creator: '作者',
    unknownCreator: '未知创作者',
    paid: (n: number) => `实付 ${n} credits`,
    packing: '打包中...',
    download: '下载',
    delivered: '包已交付（设计文档 + 代码）。',
    downloadFailed: (status: number) => `下载失败（${status}）`,
  },
  en: {
    typeLabels: {
      component: 'Component',
      template: 'Template',
      design_system: 'Design system',
      asset: 'Asset',
      world: 'World',
      game: 'Game',
      character: 'AI character',
    },
    deListed: 'Delisted (no longer delivered)',
    madePrivate: 'Made private (still downloadable)',
    live: 'On sale',
    readFailed: (status: number) => `Load failed (${status})`,
    readFailedShort: 'Load failed',
    title: 'My purchases',
    subtitle: 'Everything bought here stays on this ledger. Records survive delisting — the delivery gate just stops handing over the package (the page says so honestly).',
    back: 'Back to marketplace',
    loading: 'Loading...',
    empty: 'You have not bought anything yet. ',
    emptyCta: 'Browse the marketplace',
    creator: 'Creator',
    unknownCreator: 'unknown creator',
    paid: (n: number) => `paid ${n} credits`,
    packing: 'Packing...',
    download: 'Download',
    delivered: 'Package delivered (design docs + code).',
    downloadFailed: (status: number) => `Download failed (${status})`,
  },
} as const;

/** 状态只有三种，且都能从记录本身推出来——不复述服务端没有的枚举 */
function statusOf(row: PurchaseRow, T: (typeof MP_TXT)[Locale]): { label: string; className: string } {
  if (row.delistedAt) {
    return { label: T.deListed, className: 'mp-statusDelisted' };
  }
  if (row.visibility === 'private') {
    return { label: T.madePrivate, className: 'mp-statusPrivate' };
  }
  return { label: T.live, className: 'mp-statusLive' };
}

function stamp(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export function PurchasesClient({ locale = 'zh' }: { locale?: Locale }) {
  const T = MP_TXT[locale];
  const typeLabels = T.typeLabels as Record<string, string>;
  const router = useRouter();
  const [rows, setRows] = useState<PurchaseRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Record<string, string>>({});

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/marketplace/purchases');
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        if (!res.ok) throw new Error(T.readFailed(res.status));
        const body = (await res.json()) as { purchases: PurchaseRow[] };
        setRows(body.purchases);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : T.readFailedShort);
      }
    })();
  }, [router]);

  const download = async (row: PurchaseRow): Promise<void> => {
    setBusy(row.itemId);
    setMessage((prev) => ({ ...prev, [row.itemId]: '' }));
    try {
      const res = await fetch(`/api/marketplace/${row.itemId}/content`, { credentials: 'same-origin' });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
        setMessage((prev) => ({
          ...prev,
          [row.itemId]: json?.message ?? json?.error ?? T.downloadFailed(res.status),
        }));
        return;
      }
      saveBlob(`${row.title}.zip`, await res.blob());
      setMessage((prev) => ({ ...prev, [row.itemId]: T.delivered }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="mp-root" data-purchases-root>
      <div className="mp-frame">
      <header className="mp-head">
        <div className="mp-heading">
          <h1 className="mp-title">{T.title}</h1>
          <p className="mp-subtitle">
            {T.subtitle}
          </p>
        </div>
        <div className="mp-headActions">
          <Link href="/marketplace" className="mp-back" data-purchases-back>
            {T.back}
          </Link>
        </div>
      </header>

      {error ? (
        <p className="mp-error" data-purchases-error>
          {error}
        </p>
      ) : rows === null ? (
        <p className="mp-loading" data-purchases-loading>
          {T.loading}
        </p>
      ) : rows.length === 0 ? (
        <p className="mp-empty" data-purchases-empty>
          {T.empty}<Link href="/marketplace">{T.emptyCta}</Link>。
        </p>
      ) : (
        <ul className="mp-list" data-purchases-list>
          {rows.map((row) => {
            const status = statusOf(row, T);
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
                    {typeLabels[row.itemType] ?? row.itemType}
                  </span>
                  <span className={`mp-status ${status.className}`} data-purchase-status-label>
                    {status.label}
                  </span>
                  <span className="mp-date" data-purchase-date>
                    {stamp(row.purchasedAt)}
                  </span>
                </div>
                <div className="mp-rowMeta">
                  <span>{T.creator}: {row.creatorName ?? row.creatorHandle ?? T.unknownCreator}</span>
                  <span data-purchase-price>{T.paid(row.pricePaid)}</span>
                  {row.delistedAt ? null : (
                    <button
                      type="button"
                      onClick={() => void download(row)}
                      disabled={busy === row.itemId}
                      className="mp-download"
                      data-purchase-download={row.itemId}
                    >
                      {busy === row.itemId ? T.packing : T.download}
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
