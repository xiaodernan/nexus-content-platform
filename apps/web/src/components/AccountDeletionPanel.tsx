'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';
import type { Locale } from '@/lib/i18n';

/**
 * §144 / ADR-0025：注销账号的界面入口。
 *
 * 为什么要点开之后再去取一次数：这几个数说的是"按下按钮的那一刻库里有什么"，
 * 客户端自己数的话，页面上挂着的是一份可能已经过期一分钟的清单（§159）。
 * 于是入口只做一件事——把 `GET /api/account` 的原文摊开，确认词也从同一份响应里来。
 *
 * 导出入口放在旁边但不强制（ADR 第二节第 2 件事）：软删的草稿在回收站里还在，
 * 但"还能恢复"和"东西在我手上"是两回事，所以给链接，不给"必须先导出才能注销"那种门槛。
 *
 * 双语（2026-11-15）：locale 由 RSC 透传（默认 zh）。确认词必须逐字对上服务端回传的原值——
 * 文案只翻译"说明语言"，不碰 confirmWord / confirmField 的原值（那是服务端比对的字节）。
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

const COPY: Record<Locale, {
  loadFailed: string;
  refused: (reason: string) => string;
  receiptLine: (n: { privateProjectsSoftDeleted: number; publishedWorksKept: number; sessionsRevoked: number; apiTokensRevoked: number }) => string;
  adrNote: string;
  receiptDone: string;
  receiptHint: string;
  open: string;
  openHint: string;
  intro: string;
  loading: string;
  loadError: (e: string) => string;
  countPrivate: (n: number) => string;
  countPublished: (n: number) => string;
  countSessions: (n: number) => string;
  countTokens: (n: number) => string;
  exportOffer: string;
  draftsTruncated: (listed: number, total: number) => string;
  confirmFieldHandle: string;
  confirmFieldDisplayName: string;
  confirmAria: string;
  confirmPlaceholder: string;
  busyDeleting: string;
  confirmCta: string;
  confirmHint: string;
  cancel: string;
  cancelHint: string;
}> = {
  zh: {
    loadFailed: '读不到这份清单',
    refused: (reason) => `没注销：${reason}`,
    receiptLine: (n) => `账号已注销。收起来了 ${n.privateProjectsSoftDeleted} 个私有草稿，留着 ${n.publishedWorksKept} 个已发布作品在公网，吊销了 ${n.sessionsRevoked} 个登录会话与 ${n.apiTokensRevoked} 个 API 凭据。`,
    adrNote: '这不是删除：库里那条记录还在，找回账号这件事由运维在处理一侧做（ADR-0025）。',
    receiptDone: '知道了',
    receiptHint: '关闭这张收据（只读）。账号已关，刷新页面即为新的身份视图。',
    open: '注销账号',
    openHint: '打开注销账号流程——确认词不对就不会执行，不会立刻删除任何东西。',
    intro: '注销之后：这个人的登录入口关闭、所有会话与 API 凭据作废、私有草稿收进回收站；已发布的作品继续在公网可达，只是作者名换成「已注销的用户」。',
    loading: '正在核对你名下的东西…',
    loadError: (e) => `没能读到清单：${e}`,
    countPrivate: (n) => `${n} 个私有草稿会被收进回收站（从没发布过的那些）`,
    countPublished: (n) => `${n} 个已发布作品留在公网，不跟着走`,
    countSessions: (n) => `${n} 个登录会话会立刻失效（包括你现在这一个）`,
    countTokens: (n) => `${n} 个 API 凭据会被吊销`,
    exportOffer: '想先带走的话，每个项目的 Studio 里有「导出」（design + code + assets 打成一个 zip）。这一步不强制。',
    draftsTruncated: (listed, total) => `只列了最近改过的 ${listed} 个，一共 ${total} 个——项目列表里还有其余的。`,
    confirmFieldHandle: '主页地址（handle）',
    confirmFieldDisplayName: '展示名',
    confirmAria: '逐字输入确认词',
    confirmPlaceholder: '逐字输入确认词',
    busyDeleting: '注销中…',
    confirmCta: '确认注销',
    confirmHint: '按逐字输入的确认词执行注销（软删）。已发布的作品继续在公网可看；草稿收进回收站。',
    cancel: '取消',
    cancelHint: '关闭本面板并什么都不做。',
  },
  en: {
    loadFailed: 'Could not read that list',
    refused: (reason) => `Not deleted: ${reason}`,
    receiptLine: (n) => `Account deactivated. ${n.privateProjectsSoftDeleted} private draft(s) shelved, ${n.publishedWorksKept} published work(s) still reachable on the public web, ${n.sessionsRevoked} sign-in session(s) and ${n.apiTokensRevoked} API token(s) revoked.`,
    adrNote: 'This is not deletion — the record stays; recovering the account is an operations-side matter (ADR-0025).',
    receiptDone: 'Got it',
    receiptHint: 'Close this receipt (read-only). The account is deactivated — refresh for the new identity view.',
    open: 'Deactivate account',
    openHint: 'Open the flow — the confirmation word is required; nothing is deleted until it matches.',
    intro: 'Once deactivated: this person’s sign-in closes, all sessions and API tokens become void, private drafts are shelved in the trash; published works stay reachable on the public web under the name “deactivated user”.',
    loading: 'Checking what’s yours…',
    loadError: (e) => `Could not read the list: ${e}`,
    countPrivate: (n) => `${n} private draft(s) will be shelved (the ones never published)`,
    countPublished: (n) => `${n} published work(s) stay public; they do not come along`,
    countSessions: (n) => `${n} sign-in session(s) expire immediately (including this one)`,
    countTokens: (n) => `${n} API token(s) will be revoked`,
    exportOffer: 'Want to take something first? Every project’s Studio has Export (design + code + assets in one zip). This step is not mandatory.',
    draftsTruncated: (listed, total) => `Only the ${listed} recently-edited are listed, of ${total} — the rest are in the project list.`,
    confirmFieldHandle: 'profile handle',
    confirmFieldDisplayName: 'display name',
    confirmAria: 'Type the confirmation word',
    confirmPlaceholder: 'Type the confirmation word',
    busyDeleting: 'Deactivating…',
    confirmCta: 'Confirm deactivation',
    confirmHint: 'Soft-deletes your account once the confirmation word matches. Published works stay public; drafts move to the trash.',
    cancel: 'Cancel',
    cancelHint: 'Close this panel and do nothing.',
  },
};

export function AccountDeletionPanel({ locale = 'zh' }: { locale?: Locale }) {
  const c = COPY[locale];
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
      setLoadError(cause instanceof Error ? cause.message : c.loadFailed);
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
        setNotice(c.refused(body?.issues?.join('；') ?? body?.message ?? body?.error ?? `HTTP ${res.status}`));
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
        className="adp-card"
        data-account-deleted-receipt
      >
        <p className="adp-note">{c.receiptLine(receipt)}</p>
        <p className="adp-hint">{c.adrNote}</p>
        <button
          type="button"
          onClick={() => {
            // 与登出那颗按钮同一个做法：先清掉本地这份收据，再让服务端把页面换成新的身份视图。
            // 不先清的话，"知道了"按下去屏幕上半截一动不动，而这正是这条按钮承诺会动的部分
            setReceipt(null);
            router.refresh();
          }}
          className="adp-ghostBtn"
          data-account-deleted-done
          title={c.receiptHint}
        >
          {c.receiptDone}
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => void start()}
        className="adp-btnSm"
        data-account-delete-open
        title={c.openHint}
      >
        {c.open}
      </button>
    );
  }

  const fieldLabel = preview
    ? preview.confirmField === 'handle'
      ? c.confirmFieldHandle
      : c.confirmFieldDisplayName
    : '';

  return (
    <div
      className="adp-card"
      data-account-delete-card
    >
      <p className="adp-note">{c.intro}</p>
      {loading ? <p className="adp-hint" data-account-delete-loading>{c.loading}</p> : null}
      {loadError ? (
        <p className="adp-error" data-account-delete-load-error>
          {c.loadError(loadError)}
        </p>
      ) : null}
      {preview ? (
        <>
          <ul className="adp-counts" data-account-delete-counts>
            <li data-account-private>{c.countPrivate(preview.privateProjects)}</li>
            <li data-account-published>{c.countPublished(preview.publishedWorks)}</li>
            <li data-account-sessions>{c.countSessions(preview.liveSessions)}</li>
            <li data-account-tokens>{c.countTokens(preview.liveApiTokens)}</li>
          </ul>
          {preview.privateProjects > 0 ? (
            <div className="adp-offer" data-account-export-offer>
              <span className="adp-hint">{c.exportOffer}</span>
              <ul className="adp-draftList">
                {preview.drafts.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/studio/${d.id}`}
                      className="adp-inlineLink"
                      data-account-export-draft={d.id}
                    >
                      {d.name}
                    </Link>
                  </li>
                ))}
              </ul>
              {preview.draftsTruncated ? (
                <span className="adp-hint" data-account-export-truncated>
                  {c.draftsTruncated(preview.drafts.length, preview.privateProjects)}
                </span>
              ) : null}
            </div>
          ) : null}
          <p className="adp-note">
            {locale === 'zh' ? '逐字输入你的' : 'Type your '}
            {fieldLabel}{' '}
            <span className="adp-mono" data-account-delete-expected>{preview.confirmWord}</span>
            {locale === 'zh' ? ' 才会执行。' : ' — exactly; nothing runs without it.'}
          </p>
          <div className="adp-row">
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              aria-label={c.confirmAria}
              placeholder={c.confirmPlaceholder}
              maxLength={2000}
              className="adp-input"
              data-account-delete-input
            />
            {/* 与删项目那颗按钮同一口径：打错字时按钮照样能按，拒绝要在界面上看得见。
                一不匹配就禁用等于这道门从不显形，测试与人也都撞不到它 */}
            <button
              type="button"
              disabled={busy || typed.trim().length === 0}
              onClick={() => void remove()}
              className="adp-confirmBtn"
              data-account-delete-confirm
              title={c.confirmHint}
            >
              {busy ? c.busyDeleting : c.confirmCta}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={close}
              className="adp-cancelBtn"
              data-account-delete-cancel
              title={c.cancelHint}
            >
              {c.cancel}
            </button>
          </div>
        </>
      ) : null}
      {notice ? (
        <p className="adp-note" data-account-delete-notice>
          {notice}
        </p>
      ) : null}
    </div>
  );
}
