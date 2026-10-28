'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { saveBlob } from '@/lib/download';

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

const TYPE_LABELS: Record<string, string> = {
  component: '组件',
  template: '模板',
  design_system: '设计系统',
  asset: '素材',
  world: '世界',
  game: '游戏',
  character: 'AI 角色',
};

/** 状态只有三种，且都能从记录本身推出来——不复述服务端没有的枚举 */
function statusOf(row: PurchaseRow): { label: string; className: string } {
  if (row.delistedAt) {
    return { label: '已下架（不再交付）', className: 'text-fg-3' };
  }
  if (row.visibility === 'private') {
    return { label: '已转私密（已购仍可下载）', className: 'text-accent-2' };
  }
  return { label: '在售', className: 'text-green-400' };
}

function stamp(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export default function PurchasesPage() {
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
        if (!res.ok) throw new Error(`读取失败（${res.status}）`);
        const body = (await res.json()) as { purchases: PurchaseRow[] };
        setRows(body.purchases);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '读取失败');
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
          [row.itemId]: json?.message ?? json?.error ?? `下载失败（${res.status}）`,
        }));
        return;
      }
      saveBlob(`${row.title}.zip`, await res.blob());
      setMessage((prev) => ({ ...prev, [row.itemId]: '包已交付（设计文档 + 代码）。' }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-[980px] flex-col gap-[var(--nexus-space-5)] p-[var(--nexus-space-6)] font-mono">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-[var(--nexus-font-size-28)] font-semibold tracking-tight">我的购买</h1>
          <p className="text-[var(--nexus-font-size-12)] text-fg-2">
            在这里买到的东西都留在这张单子上。条目下架后记录仍在——但交付门不再给包（页面上照实写）。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/marketplace" className="text-accent-2 underline" data-purchases-back>
            回市场
          </Link>
        </div>
      </header>

      {error ? (
        <p className="text-danger" data-purchases-error>
          {error}
        </p>
      ) : rows === null ? (
        <p className="text-fg-2" data-purchases-loading>
          加载中...
        </p>
      ) : rows.length === 0 ? (
        <p className="text-fg-2" data-purchases-empty>
          还没有买过东西。<Link href="/marketplace" className="text-accent-2 underline">去市场看看</Link>。
        </p>
      ) : (
        <ul className="flex flex-col gap-2" data-purchases-list>
          {rows.map((row) => {
            const status = statusOf(row);
            return (
              <li
                key={row.itemId}
                className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-subtle)] bg-bg-2 p-3"
                data-purchase-row
                data-purchase-item={row.itemId}
                data-purchase-status={row.delistedAt ? 'delisted' : row.visibility}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-14">{row.title}</strong>
                  <span className="rounded bg-bg-3 px-1 text-11 text-fg-2">
                    {TYPE_LABELS[row.itemType] ?? row.itemType}
                  </span>
                  <span className={`text-11 ${status.className}`} data-purchase-status-label>
                    {status.label}
                  </span>
                  <span className="ml-auto text-11 text-fg-3" data-purchase-date>
                    {stamp(row.purchasedAt)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-12 text-fg-2">
                  <span>作者：{row.creatorName ?? row.creatorHandle ?? '未知创作者'}</span>
                  <span data-purchase-price>实付 {row.pricePaid} credits</span>
                  {row.delistedAt ? null : (
                    <button
                      type="button"
                      onClick={() => void download(row)}
                      disabled={busy === row.itemId}
                      className="rounded bg-accent-1 px-2 py-1 text-12 text-accent-fg disabled:opacity-50"
                      data-purchase-download={row.itemId}
                    >
                      {busy === row.itemId ? '打包中...' : '下载'}
                    </button>
                  )}
                  {message[row.itemId] ? (
                    <span className="text-11 text-fg-3" data-purchase-message={row.itemId}>
                      {message[row.itemId]}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
