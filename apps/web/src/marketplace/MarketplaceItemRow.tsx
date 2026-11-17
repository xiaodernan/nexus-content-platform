'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';
import { saveBlob } from '@/lib/download';
import { REPORT_REASON_LABELS, REPORT_REASON_LABELS_EN, REPORT_REASONS, type ReportReason } from '@/lib/marketplaceReports';
import type { Locale } from '@/lib/i18n';

/** 双语：每行文案按 cookie locale 选（不夹杂）；服务端下发的判定原文（message/error）原样保留——那是服务端裁决 */
const MI_TXT = {
  zh: {
    freeNoBuy: '免费物品无需购买',
    confirmBuy: (cost: number, title: string) => `确认花费 ${cost} credits 购买「${title}」？`,
    purchaseFailed: (status: number) => `购买失败（${status}）`,
    purchasedOk: '购买成功！现在可以下载了。',
    buyBeforeDownload: '请先完成购买再下载',
    downloadFailed: (status: number) => `下载失败（${status}）`,
    delivered: '包已交付（设计文档 + 代码）。',
    confirmDelist: (title: string) => `下架「${title}」？`,
    delistFailed: (status: number) => `下架失败（${status}）`,
    saveFailed: (status: number) => `保存失败（${status}）`,
    saved: '已保存。',
    reportFailed: (status: number) => `举报失败（${status}）`,
    reportSubmitted: '已提交举报。审核员会在市场工单台处置；工单结案不等于下架，撤内容走人工复核台。',
    previewAlt: (title: string) => `预览：${title}`,
    free: '免费',
    purchased: '已购买',
    reported: '已举报',
    anonymousCreator: '匿名创作者',
    collapse: '收起',
    editPriceVisibility: '改价格/可见性',
    purchasing: '购买中...',
    purchase: '购买',
    collapseReport: '收起举报',
    report: '举报',
    fetching: '取包中...',
    downloadCount: (n: number) => `下载（${n}）`,
    delist: '下架',
    price: '价格',
    visibility: '可见性',
    visibilityPublic: '公开在售',
    visibilityFree: '免费',
    visibilityPrivate: '私密',
    save: '保存',
    reason: '原因',
    reportNoteAria: '举报说明',
    reportNotePlaceholder: '补充说明（可选，最多 1000 字）',
    submitting: '提交中...',
    submitReport: '提交举报',
    cancel: '取消',
    reportSinkNote: '举报进审核员工单台；结案 / 驳回都不会自动下架物品。',
  },
  en: {
    freeNoBuy: 'Free items need no purchase',
    confirmBuy: (cost: number, title: string) => `Spend ${cost} credits on “${title}”?`,
    purchaseFailed: (status: number) => `Purchase failed (${status})`,
    purchasedOk: 'Purchased! You can download now.',
    buyBeforeDownload: 'Buy first, then download',
    downloadFailed: (status: number) => `Download failed (${status})`,
    delivered: 'Package delivered (design docs + code).',
    confirmDelist: (title: string) => `Delist “${title}”?`,
    delistFailed: (status: number) => `Delist failed (${status})`,
    saveFailed: (status: number) => `Save failed (${status})`,
    saved: 'Saved.',
    reportFailed: (status: number) => `Report failed (${status})`,
    reportSubmitted: 'Report submitted. A reviewer will handle it in the marketplace ticket desk; a closed ticket is not a delist — content removal goes through the human review desk.',
    previewAlt: (title: string) => `Preview: ${title}`,
    free: 'Free',
    purchased: 'Purchased',
    reported: 'Reported',
    anonymousCreator: 'anonymous creator',
    collapse: 'Collapse',
    editPriceVisibility: 'Edit price / visibility',
    purchasing: 'Purchasing...',
    purchase: 'Buy',
    collapseReport: 'Collapse report',
    report: 'Report',
    fetching: 'Fetching...',
    downloadCount: (n: number) => `Download (${n})`,
    delist: 'Delist',
    price: 'Price',
    visibility: 'Visibility',
    visibilityPublic: 'Listed (paid)',
    visibilityFree: 'Free',
    visibilityPrivate: 'Private',
    save: 'Save',
    reason: 'Reason',
    reportNoteAria: 'Report details',
    reportNotePlaceholder: 'Details (optional, max 1000 chars)',
    submitting: 'Submitting...',
    submitReport: 'Submit report',
    cancel: 'Cancel',
    reportSinkNote: 'The report goes to the reviewer ticket desk; closing / dismissal never delists the item automatically.',
  },
} as const;

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
  const T = MI_TXT[locale];
  const reasonLabels = locale === 'en' ? REPORT_REASON_LABELS_EN : REPORT_REASON_LABELS;
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
      setMessage(T.freeNoBuy);
      return;
    }
    if (!window.confirm(T.confirmBuy(item.priceCredits, item.title))) return;
    setPurchasing(true);
    try {
      const res = await fetch(`/api/marketplace/${item.id}/purchase`, {
        method: 'POST',
        headers: csrfHeaders(),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
        setMessage(json?.message ?? json?.error ?? T.purchaseFailed(res.status));
        return;
      }
      setPurchased(true);
      setMessage(T.purchasedOk);
    } finally {
      setPurchasing(false);
    }
  };

  const download = async () => {
    // 付费物品需要先购买（除非是自己的）
    if (item.priceCredits > 0 && !mine && !purchased) {
      setMessage(T.buyBeforeDownload);
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
        setMessage(json?.message ?? json?.error ?? T.downloadFailed(res.status));
        return;
      }
      const blob = await res.blob();
      // 回收对象 URL 的时机只写在 @/lib/download 那一处（三处下载共用一份实现）
      saveBlob(`${item.title}.zip`, blob);
      setMessage(T.delivered);
    } finally {
      setDownloading(false);
      router.refresh();
    }
  };

  const remove = async () => {
    if (!window.confirm(T.confirmDelist(item.title))) return;
    const res = await fetch(`/api/marketplace/${item.id}`, {
      method: 'DELETE',
      headers: csrfHeaders(),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      setMessage(json?.message ?? T.delistFailed(res.status));
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
      setMessage(json?.message ?? json?.error ?? T.saveFailed(res.status));
      return;
    }
    setEditing(false);
    setMessage(T.saved);
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
        setMessage(json?.message ?? json?.error ?? T.reportFailed(res.status));
        if (res.status === 409) {
          setReported(true);
          setReportOpen(false);
        }
        return;
      }
      setReported(true);
      setReportOpen(false);
      setMessage(T.reportSubmitted);
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
            alt={T.previewAlt(item.title)}
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
          {item.priceCredits > 0 ? `${item.priceCredits} credits` : T.free}
        </span>
        {purchased ? (
          <span className="mi-badgePurchased" data-marketplace-purchased>
            {T.purchased}
          </span>
        ) : null}
        {reported ? (
          <span className="mi-badgeReported" data-marketplace-reported>
            {T.reported}
          </span>
        ) : null}
        <span className="mi-creator">{item.creatorName ?? T.anonymousCreator}</span>
        {mine ? (
          <button
            type="button"
            onClick={() => setEditing((on) => !on)}
            data-marketplace-edit={item.id}
            aria-expanded={editing}
            aria-controls={editing ? editPanelId : undefined}
            className="mi-btn mi-btnGhost"
          >
            {editing ? T.collapse : T.editPriceVisibility}
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
            {purchasing ? T.purchasing : T.purchase}
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
            {reportOpen ? T.collapseReport : T.report}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void download()}
          disabled={downloading}
          data-marketplace-download={item.id}
          className="mi-btn mi-btnGhost"
        >
          {downloading ? T.fetching : T.downloadCount(item.downloadCount)}
        </button>
        {mine ? (
          <button
            type="button"
            onClick={() => void remove()}
            data-marketplace-remove={item.id}
            className="mi-btn mi-btnDanger"
          >
            {T.delist}
          </button>
        ) : null}
      </div>
      {editing ? (
        <div id={editPanelId} className="mi-panel" data-marketplace-edit-panel={item.id}>
          <label className="mi-field">
            {T.price}
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
            {T.visibility}
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              data-marketplace-edit-visibility={item.id}
              className="mi-select"
            >
              <option value="public">{T.visibilityPublic}</option>
              <option value="free">{T.visibilityFree}</option>
              <option value="private">{T.visibilityPrivate}</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void saveEdit()}
            data-marketplace-edit-save={item.id}
            className="mi-btn mi-btnPrimary"
          >
            {T.save}
          </button>
        </div>
      ) : null}
      {reportOpen ? (
        <div id={reportPanelId} className="mi-panel" data-marketplace-report-panel={item.id}>
          <label className="mi-field">
            {T.reason}
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
          <input aria-label={T.reportNoteAria}
            value={reportNote}
            onChange={(e) => setReportNote(e.target.value)}
            maxLength={1000}
            placeholder={T.reportNotePlaceholder}
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
            {reportBusy ? T.submitting : T.submitReport}
          </button>
          <button
            type="button"
            onClick={() => setReportOpen(false)}
            data-marketplace-report-cancel={item.id}
            className="mi-btn mi-btnGhost"
          >
            {T.cancel}
          </button>
          <span className="mi-hint">{T.reportSinkNote}</span>
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
