'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';

/**
 * §144 / ADR-0025：注销账号的界面入口。
 *
 * 为什么要点开之后再去取一次数：这几个数说的是"按下按钮的那一刻库里有什么"，
 * 客户端自己数的话，页面上挂着的是一份可能已经过期一分钟的清单（§159）。
 * 于是入口只做一件事——把 `GET /api/account` 的原文摊开，确认词也从同一份响应里来。
 *
 * 导出入口放在旁边但不强制（ADR 第二节第 2 件事）：软删的草稿在回收站里还在，
 * 但"还能恢复"和"东西在我手上"是两回事，所以给链接，不给"必须先导出才能注销"那种门槛。
 */

/** 字段与 `GET /api/account` 的响应一一对应；`domain/account.ts` 里改了名这里不改，界面读到的是 undefined，测试那一格会红 */
interface Preview {
  confirmField: 'handle' | 'display_name';
  confirmWord: string;
  privateProjects: number;
  drafts: { id: string; name: string }[];
  draftsTruncated: boolean;
  publishedWorks: number;
  liveSessions: number;
  liveApiTokens: number;
}

interface Receipt {
  privateProjectsSoftDeleted: number;
  publishedWorksKept: number;
  sessionsRevoked: number;
  apiTokensRevoked: number;
}

export function AccountDeletionPanel() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const start = async (): Promise<void> => {
    setOpen(true);
    if (preview || loading) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/account');
      const body = (await res.json().catch(() => null)) as (Preview & { ok?: boolean; message?: string; error?: string }) | null;
      if (!res.ok || !body?.confirmWord) {
        setLoadError(body?.message ?? body?.error ?? `HTTP ${res.status}`);
        return;
      }
      setPreview(body);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : '读不到这份清单');
    } finally {
      setLoading(false);
    }
  };

  const close = () => {
    setOpen(false);
    setTyped('');
    setNotice(null);
  };

  const remove = async (): Promise<void> => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/account', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ confirm: typed }),
      });
      const body = (await res.json().catch(() => null)) as (Receipt & { ok?: boolean; message?: string; issues?: string[]; error?: string }) | null;
      if (!res.ok || !body?.ok) {
        setNotice(`没注销：${body?.issues?.join('；') ?? body?.message ?? body?.error ?? `HTTP ${res.status}`}`);
        return;
      }
      // 会话已经在库里删掉了，这里先不 refresh：收据那四个数要留在屏幕上给人看一眼，
      // 按下面那颗按钮才换回游客视图
      setTyped('');
      setPreview(null);
      setReceipt({
        privateProjectsSoftDeleted: body.privateProjectsSoftDeleted,
        publishedWorksKept: body.publishedWorksKept,
        sessionsRevoked: body.sessionsRevoked,
        apiTokensRevoked: body.apiTokensRevoked,
      });
    } finally {
      setBusy(false);
    }
  };

  if (receipt) {
    return (
      <div
        className="flex flex-col gap-2 rounded-[var(--nexus-radius-sm)] bg-bg-1 px-[var(--nexus-space-3)] py-[var(--nexus-space-2)]"
        data-account-deleted-receipt
      >
        <p className="text-11 text-fg-2">
          账号已注销。收起来了 {receipt.privateProjectsSoftDeleted} 个私有草稿，留着 {receipt.publishedWorksKept} 个已发布作品在公网，
          吊销了 {receipt.sessionsRevoked} 个登录会话与 {receipt.apiTokensRevoked} 个 API 凭据。
        </p>
        <p className="text-11 text-fg-3">
          这不是删除：库里那条记录还在，找回账号这件事由运维在处理一侧做（ADR-0025）。
        </p>
        <button
          type="button"
          onClick={() => {
            // 与登出那颗按钮同一个做法：先清掉本地这份收据，再让服务端把页面换成新的身份视图。
            // 不先清的话，"知道了"按下去屏幕上半截一动不动，而这正是这条按钮承诺会动的部分
            setReceipt(null);
            router.refresh();
          }}
          className="self-start rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] px-3 py-1 text-12 text-fg-2 hover:bg-bg-2"
          data-account-deleted-done
        >
          知道了
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => void start()}
        className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] px-2 py-1 text-11 text-fg-2 hover:bg-bg-2"
        data-account-delete-open
      >
        注销账号
      </button>
    );
  }

  return (
    <div
      className="flex flex-col gap-[var(--nexus-space-2)] rounded-[var(--nexus-radius-sm)] bg-bg-1 px-[var(--nexus-space-3)] py-[var(--nexus-space-2)]"
      data-account-delete-card
    >
      <p className="text-11 text-fg-2">注销之后：这个人的登录入口关闭、所有会话与 API 凭据作废、私有草稿收进回收站；已发布的作品继续在公网可达，只是作者名换成「已注销的用户」。</p>
      {loading ? <p className="text-11 text-fg-3" data-account-delete-loading>正在核对你名下的东西…</p> : null}
      {loadError ? (
        <p className="text-11 text-danger" data-account-delete-load-error>
          没能读到清单：{loadError}
        </p>
      ) : null}
      {preview ? (
        <>
          <ul className="flex flex-col gap-1 text-11 text-fg-2" data-account-delete-counts>
            <li data-account-private>{preview.privateProjects} 个私有草稿会被收进回收站（从没发布过的那些）</li>
            <li data-account-published>{preview.publishedWorks} 个已发布作品留在公网，不跟着走</li>
            <li data-account-sessions>{preview.liveSessions} 个登录会话会立刻失效（包括你现在这一个）</li>
            <li data-account-tokens>{preview.liveApiTokens} 个 API 凭据会被吊销</li>
          </ul>
          {preview.privateProjects > 0 ? (
            <div className="flex flex-col gap-1" data-account-export-offer>
              <span className="text-11 text-fg-3">
                想先带走的话，每个项目的 Studio 里有「导出」（design + code + assets 打成一个 zip）。这一步不强制。
              </span>
              <ul className="flex flex-wrap gap-2">
                {preview.drafts.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/studio/${d.id}`}
                      className="text-11 text-accent-2-ink underline"
                      data-account-export-draft={d.id}
                    >
                      {d.name}
                    </Link>
                  </li>
                ))}
              </ul>
              {preview.draftsTruncated ? (
                <span className="text-11 text-fg-3" data-account-export-truncated>
                  只列了最近改过的 {preview.drafts.length} 个，一共 {preview.privateProjects} 个——项目列表里还有其余的。
                </span>
              ) : null}
            </div>
          ) : null}
          <p className="text-11 text-fg-2">
            逐字输入你的{preview.confirmField === 'handle' ? '主页地址（handle）' : '展示名'}{' '}
            <span className="font-mono text-fg-1" data-account-delete-expected>{preview.confirmWord}</span> 才会执行。
          </p>
          <div className="flex items-center gap-2">
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="逐字输入确认词"
              maxLength={2000}
              className="w-[240px] rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] bg-bg-2 px-2 py-1 text-12 text-fg-1 placeholder:text-fg-3"
              data-account-delete-input
            />
            {/* 与删项目那颗按钮同一口径：打错字时按钮照样能按，拒绝要在界面上看得见。
                一不匹配就禁用等于这道门从不显形，测试与人也都撞不到它 */}
            <button
              type="button"
              disabled={busy || typed.trim().length === 0}
              onClick={() => void remove()}
              className="rounded-[var(--nexus-radius-sm)] bg-accent-2 px-3 py-1 text-12 text-accent-fg disabled:opacity-40"
              data-account-delete-confirm
            >
              {busy ? '注销中…' : '确认注销'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={close}
              className="text-11 text-fg-3 hover:text-fg-2 disabled:opacity-40"
              data-account-delete-cancel
            >
              取消
            </button>
          </div>
        </>
      ) : null}
      {notice ? (
        <p className="text-11 text-fg-2" data-account-delete-notice>
          {notice}
        </p>
      ) : null}
    </div>
  );
}
