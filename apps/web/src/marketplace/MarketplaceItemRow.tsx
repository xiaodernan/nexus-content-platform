'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';
import { saveBlob } from '@/lib/download';
import { REPORT_REASON_LABELS, REPORT_REASON_LABELS_EN, REPORT_REASONS, type ReportReason } from '@/lib/marketplaceReports';
import type { Locale } from '@/lib/i18n';

/**
 * 市场物品的一行：卡片信息 + （自己的）删除 + 下载计数。
 * §127-128 Marketplace 购买与交付：付费物品先买后下，免费物品直接下。
 *
 * 双语（2026-11-15）：locale 由 RSC 透传（默认 zh），COPY 中英一辞两字面；
 * 用户内容（title、description、creatorName）原样下发，不生成译本。
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

const COPY: Record<Locale, {
  freeItem: string;
  confirmBuy: (credits: number, title: string) => string;
  purchaseFailed: (status: number) => string;
  purchaseOk: string;
  downloadBeforePurchase: string;
  downloadFailed: (status: number) => string;
  delivered: string;
  removeConfirm: (title: string) => string;
  removeFailed: (status: number) => string;
  saveFailed: (status: number) => string;
  saved: string;
  reportFailed: (status: number) => string;
  reportDone: string;
  reportReason: string;
  reportSubmit: string;
  reportCancel: string;
  reportNoteAria: string;
  reportNotePlaceholder: string;
  reportIntro: string;
  reportClose: string;
  reportOpen: string;
  remove: string;
  reporting: string;
  downloadsLabel: (n: number) => string;
  free: string;
  purchased: string;
  reported: string;
  anonymousCreator: string;
  edit: string;
  collapse: string;
  price: string;
  visibility: string;
  visPublic: string;
  visFree: string;
  visPrivate: string;
  save: string;
  purchase: string;
  purchasing: string;
  download: string;
  fetching: string;
  previewAlt: (title: string) => string;
}> = {
  zh: {
    freeItem: '免费物品无需购买',
    confirmBuy: (credits, title) => `确认花费 ${credits} credits 购买「${title}」？`,
    purchaseFailed: (status) => `购买失败（${status}）`,
    purchaseOk: '购买成功！现在可以下载了。',
    downloadBeforePurchase: '请先完成购买再下载',
    downloadFailed: (status) => `下载失败（${status}）`,
    delivered: '包已交付（设计文档 + 代码）。',
    removeConfirm: (title) => `下架「${title}」？`,
    removeFailed: (status) => `下架失败（${status}）`,
    saveFailed: (status) => `保存失败（${status}）`,
    saved: '已保存。',
    reportFailed: (status) => `举报失败（${status}）`,
    reportDone: '已提交举报。审核员会在市场工单台处置；工单结案不等于下架，撤内容走人工复核台。',
    reportReason: '原因',
    reportSubmit: '提交举报',
    reportCancel: '取消',
    reportNoteAria: '举报说明',
    reportNotePlaceholder: '补充说明（可选，最多 1000 字）',
    reportIntro: '举报进审核员工单台；结案 / 驳回都不会自动下架物品。',
    reportClose: '收起举报',
    reportOpen: '举报',
    remove: '下架',
    reporting: '提交中...',
    downloadsLabel: (n) => `下载（${n}）`,
    free: '免费',
    purchased: '已购买',
    reported: '已举报',
    anonymousCreator: '匿名创作者',
    edit: '改价格/可见性',
    collapse: '收起',
    price: '价格',
    visibility: '可见性',
    visPublic: '公开在售',
    visFree: '免费',
    visPrivate: '私密',
    save: '保存',
    purchase: '购买',
    purchasing: '购买中...',
    download: '下载',
    fetching: '取包中...',
    previewAlt: (title) => `预览：${title}`,
  },
  en: {
    freeItem: 'Free items require no purchase',
    confirmBuy: (credits, title) => `Spend ${credits} credits to buy “${title}”?`,
    purchaseFailed: (status) => `Purchase failed (HTTP ${status})`,
    purchaseOk: 'Purchased — it is downloadable now.',
    downloadBeforePurchase: 'Buy it first, then download',
    downloadFailed: (status) => `Download failed (HTTP ${status})`,
    delivered: 'Bundle delivered (design doc + code).',
    removeConfirm: (title) => `Take “${title}” off the shelf?`,
    removeFailed: (status) => `Take-down failed (HTTP ${status})`,
    saveFailed: (status) => `Save failed (HTTP ${status})`,
    saved: 'Saved.',
    reportFailed: (status) => `Report failed (HTTP ${status})`,
    reportDone: 'Report filed. A reviewer will work it in the marketplace triage desk — a closed verdict is not a takedown; takedowns go through the content-review desk.',
    reportReason: 'Reason',
    reportSubmit: 'File report',
    reportCancel: 'Cancel',
    reportNoteAria: 'Report details',
    reportNotePlaceholder: 'Details (optional, up to 1000 chars)',
    reportIntro: 'Reports land in the moderator triage desk; resolving or dismissing never takes the item down automatically.',
    reportClose: 'Close report',
    reportOpen: 'Report',
    remove: 'Take down',
    reporting: 'Filing…',
    downloadsLabel: (n) => `Download (${n})`,
    free: 'Free',
    purchased: 'Purchased',
    reported: 'Reported',
    anonymousCreator: 'Anonymous creator',
    edit: 'Edit price/visibility',
    collapse: 'Collapse',
    price: 'Price',
    visibility: 'Visibility',
    visPublic: 'For sale',
    visFree: 'Free',
    visPrivate: 'Private',
    save: 'Save',
    purchase: 'Buy',
    purchasing: 'Buying…',
    download: 'Download',
    fetching: 'Fetching…',
    previewAlt: (title) => `Preview: ${title}`,
  },
};

export function MarketplaceItemRow({
  item,
  mine,
  signedIn,
  alreadyReported,
  typeLabel,
  visibilityLabel,
  locale = 'zh',
}: {
  item: ItemView;
  mine: boolean;
  /** 未登录不显示举报入口：端点要会话，点了也只会拿到 401 */
  signedIn: boolean;
  /** 服务端已知“我举报过这件”：刷新后入口直接不出现，不再靠再点一次拿 409 */
  alreadyReported: boolean;
  typeLabel: string;
  visibilityLabel: string;
  locale?: Locale;
}) {
  const c = COPY[locale];
  const reasonLabels = locale === 'zh' ? REPORT_REASON_LABELS : REPORT_REASON_LABELS_EN;
  const router = useRouter();
  // §A11Y-2：disclosure 契约——触发键的 aria-controls 与受控面板的 id 共用同一份，
  // 派生自 item.id 让列表里多行实例互不串味；只在展开态引用、收起不留悬空引用。
  const editPanelId = `marketplace-edit-${item.id}`;
  const reportPanelId = `marketplace-report-${item.id}`;
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(item.priceCredits);
  const [visibility, setVisibility] = useState(item.visibility);
  const [purchased, setPurchased] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason>('spam');
  const [reportNote, setReportNote] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [reported, setReported] = useState(alreadyReported);

  const purchase = async () => {
    if (item.priceCredits === 0) {
      setMessage(c.freeItem);
      return;
    }
    if (!window.confirm(c.confirmBuy(item.priceCredits, item.title))) return;
    setPurchasing(true);
    try {
      const res = await fetch(`/api/marketplace/${item.id}/purchase`, {
        method: 'POST',
        headers: csrfHeaders(),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
        setMessage(json?.message ?? json?.error ?? c.purchaseFailed(res.status));
        return;
      }
      setPurchased(true);
      setMessage(c.purchaseOk);
    } finally {
      setPurchasing(false);
    }
  };

  const download = async () => {
    // 付费物品需要先购买（除非是自己的）
    if (item.priceCredits > 0 && !mine && !purchased) {
      setMessage(c.downloadBeforePurchase);
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
        setMessage(json?.message ?? json?.error ?? c.downloadFailed(res.status));
        return;
      }
      const blob = await res.blob();
      // 回收对象 URL 的时机只写在 @/lib/download 那一处（三处下载共用一份实现）
      saveBlob(`${item.title}.zip`, blob);
      setMessage(c.delivered);
    } finally {
      setDownloading(false);
      router.refresh();
    }
  };

  const remove = async () => {
    if (!window.confirm(c.removeConfirm(item.title))) return;
    const res = await fetch(`/api/marketplace/${item.id}`, {
      method: 'DELETE',
      headers: csrfHeaders(),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      setMessage(json?.message ?? c.removeFailed(res.status));
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
      setMessage(json?.message ?? json?.error ?? c.saveFailed(res.status));
      return;
    }
    setEditing(false);
    setMessage(c.saved);
    router.refresh();
  };

  const submitReport = async () => {
    setReportBusy(true);
    try {
      const res = await fetch('/api/admin/marketplace/reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({
          itemId: item.id,
          reason: reportReason,
          description: reportNote.trim() || undefined,
        }),
      });
      const json = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!res.ok) {
        // 409 是"已经举报过"，不是能重试的失败：入口收起，别让同一句错误再点一次
        setMessage(json?.message ?? json?.error ?? c.reportFailed(res.status));
        if (res.status === 409) {
          setReported(true);
          setReportOpen(false);
        }
        return;
      }
      setReported(true);
      setReportOpen(false);
      setMessage(c.reportDone);
    } finally {
      setReportBusy(false);
    }
  };

  return (
    <li
      className="mk-card"
      data-marketplace-item={item.id}
    >
      <div className="mi-head">
        {item.previewAssetId ? (
          // 预览走市场自己的公开路由：素材本体在作者项目里，画布那条取图路是 owner-only 的
          <img
            src={`/api/marketplace/${item.id}/preview`}
            alt={c.previewAlt(item.title)}
            className="mi-preview"
            data-marketplace-preview={item.id}
          />
        ) : null}
        <span className="mi-title" data-marketplace-item-title>
          {item.title}
        </span>
        <span className="mi-tag">{typeLabel}</span>
        <span className="mi-tag" data-marketplace-item-visibility={item.visibility}>
          {visibilityLabel}
        </span>
        <span className="mi-price" data-marketplace-item-price={item.priceCredits}>
          {item.priceCredits > 0 ? `${item.priceCredits} credits` : c.free}
        </span>
        {purchased ? (
          <span className="mi-badgePurchased" data-marketplace-purchased>
            {c.purchased}
          </span>
        ) : null}
        {reported ? (
          <span className="mi-badgeReported" data-marketplace-reported>
            {c.reported}
          </span>
        ) : null}
        <span className="mi-creator">{item.creatorName ?? c.anonymousCreator}</span>
        {mine ? (
          <button
            type="button"
            onClick={() => setEditing((on) => !on)}
            data-marketplace-edit={item.id}
            aria-expanded={editing}
            aria-controls={editing ? editPanelId : undefined}
            className="mi-btn mi-btnGhost"
          >
            {editing ? c.collapse : c.edit}
          </button>
        ) : null}
        {item.priceCredits > 0 && !mine && !purchased ? (
          <button
            type="button"
            onClick={() => void purchase()}
            disabled={purchasing}
            data-marketplace-purchase={item.id}
            className="mi-btn mi-btnPrimary"
          >
            {purchasing ? c.purchasing : c.purchase}
          </button>
        ) : null}
        {signedIn && !mine && !reported ? (
          <button
            type="button"
            onClick={() => setReportOpen((on) => !on)}
            aria-expanded={reportOpen}
            aria-controls={reportOpen ? reportPanelId : undefined}
            data-marketplace-report={item.id}
            className="mi-btn mi-btnDanger"
          >
            {reportOpen ? c.reportClose : c.reportOpen}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void download()}
          disabled={downloading}
          data-marketplace-download={item.id}
          className="mi-btn mi-btnGhost"
        >
          {downloading ? c.fetching : c.downloadsLabel(item.downloadCount)}
        </button>
        {mine ? (
          <button
            type="button"
            onClick={() => void remove()}
            data-marketplace-remove={item.id}
            className="mi-btn mi-btnDanger"
          >
            {c.remove}
          </button>
        ) : null}
      </div>
      {editing ? (
        <div id={editPanelId} className="mi-panel" data-marketplace-edit-panel={item.id}>
          <label className="mi-field">
            {c.price}
            <input
              type="number"
              min={0}
              value={price}
              onChange={(e) => setPrice(Math.max(0, Number(e.target.value) || 0))}
              data-marketplace-edit-price={item.id}
              className="mi-input mi-inputNum"
            />
          </label>
          <label className="mi-field">
            {c.visibility}
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              data-marketplace-edit-visibility={item.id}
              className="mi-select"
            >
              <option value="public">{c.visPublic}</option>
              <option value="free">{c.visFree}</option>
              <option value="private">{c.visPrivate}</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void saveEdit()}
            data-marketplace-edit-save={item.id}
            className="mi-btn mi-btnPrimary"
          >
            {c.save}
          </button>
        </div>
      ) : null}
      {reportOpen ? (
        <div id={reportPanelId} className="mi-panel" data-marketplace-report-panel={item.id}>
          <label className="mi-field">
            {c.reportReason}
            <select
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value as ReportReason)}
              data-marketplace-report-reason={item.id}
              className="mi-select"
            >
              {REPORT_REASONS.map((value) => (
                <option value={value} key={value}>
                  {reasonLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <input aria-label={c.reportNoteAria}
            value={reportNote}
            onChange={(e) => setReportNote(e.target.value)}
            maxLength={1000}
            placeholder={c.reportNotePlaceholder}
            data-marketplace-report-note={item.id}
            className="mi-input mi-inputNote"
          />
          <button
            type="button"
            onClick={() => void submitReport()}
            disabled={reportBusy}
            data-marketplace-report-submit={item.id}
            className="mi-btn mi-btnPrimary"
          >
            {reportBusy ? c.reporting : c.reportSubmit}
          </button>
          <button
            type="button"
            onClick={() => setReportOpen(false)}
            data-marketplace-report-cancel={item.id}
            className="mi-btn mi-btnGhost"
          >
            {c.reportCancel}
          </button>
          <span className="mi-hint">{c.reportIntro}</span>
        </div>
      ) : null}
      {item.description ? <p className="mi-desc">{item.description}</p> : null}
      {message ? (
        <p className="mi-msg" data-marketplace-item-message>
          {message}
        </p>
      ) : null}
    </li>
  );
}
