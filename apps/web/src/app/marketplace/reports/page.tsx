import Link from 'next/link';
import type { ReactElement } from 'react';
import { REPORT_REASON_LABELS, REPORT_REASON_LABELS_EN, type ReportReason } from '@/lib/marketplaceReports';
import { listReportsByReporter, type ReportStatus } from '@/server/domain/marketplace';
import { currentUserOrNull } from '@/server/domain/session';
import { getLocale, type Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/** 双语：每行文案按 cookie locale 选（不夹杂） */
const MR_TXT = {
  zh: {
    STATUS_LABELS: {
      pending: { label: '待受理', className: 'mr-statusPending' },
      reviewing: { label: '审核中', className: 'mr-statusReviewing' },
      resolved: { label: '举报成立', className: 'mr-statusResolved' },
      dismissed: { label: '举报不成立', className: 'mr-statusDismissed' },
    } as Record<ReportStatus, { label: string; className: string }>,
    title: '我的举报',
    deniedCopy: '需要先登录：举报按举报人存放，没有身份就没有可归属的那一份。',
    goLogin: '去登录',
    subtitle: '你提交过的举报都在这里。工单状态与物品此刻的状态是两件事：结案 / 驳回都不自动下架物品，撤内容走人工复核台；作者也可能自己把物品下架或转私密。',
    back: '回市场',
    empty: '你还没有提交过举报。在市场的物品行里点「举报」即可提交——同一件物品只能举报一次。',
    count: (n: number) => `共 ${n} 条；按提交时间倒序。审核员的内部笔记不在这一页。`,
    deleted: '已删除',
    madePrivate: '已转私密',
    freeOnSale: '免费在售',
    onSale: '在售',
    itemStatePrefix: '物品',
    submittedAt: (s: string) => `提交于 ${s}`,
    resolvedAt: (s: string) => `处置于 ${s}`,
    yourNote: (d: string) => `你的说明：${d}`,
    outcomeUpheld: '审核员认定举报成立。这是工单结论，物品是否撤下由人工复核台另行处理。',
    outcomeDismissed: '审核员判定这次举报不成立。若之后发现新的证据，可以留意物品页面的变化。',
    footer: '页面只列你自己提交的工单：别人的举报不在这一页，也拿不到举报人是谁。',
  },
  en: {
    STATUS_LABELS: {
      pending: { label: 'Pending', className: 'mr-statusPending' },
      reviewing: { label: 'Reviewing', className: 'mr-statusReviewing' },
      resolved: { label: 'Report upheld', className: 'mr-statusResolved' },
      dismissed: { label: 'Report dismissed', className: 'mr-statusDismissed' },
    } as Record<ReportStatus, { label: string; className: string }>,
    title: 'My reports',
    deniedCopy: 'Sign in first: reports are stored per reporter — without an identity there is nothing to attribute.',
    goLogin: 'Sign in',
    subtitle: 'Every report you submitted lives here. The ticket state and the item’s current state are two different things: upholding or dismissing never delists the item automatically — content removal goes through the human review desk; the author may also delist or make private the item themselves.',
    back: 'Back to marketplace',
    empty: 'You have not submitted a report yet. Tap "Report" on an item row in the marketplace — one report per item.',
    count: (n: number) => `${n} total, newest first. Reviewers’ internal notes are not shown on this page.`,
    deleted: 'deleted',
    madePrivate: 'made private',
    freeOnSale: 'listed free',
    onSale: 'listed',
    itemStatePrefix: 'Item ',
    submittedAt: (s: string) => `submitted ${s}`,
    resolvedAt: (s: string) => `resolved ${s}`,
    yourNote: (d: string) => `Your note: ${d}`,
    outcomeUpheld: 'The reviewer upheld the report. This is the ticket conclusion; whether the item is taken down is handled separately by the human review desk.',
    outcomeDismissed: 'The reviewer dismissed the report. If new evidence surfaces later, keep an eye on the item page.',
    footer: 'This page lists only your own tickets: others’ reports are not here, and their reporters are not identifiable.',
  },
} as const;

/** 时间按 UTC 印：与「我的购买」「收件箱」同一口径 */
function stamp(value: Date): string {
  const iso = value.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/** 物品此刻的状态：与工单结论分开读，工单结案不会自动改动它 */
function itemState(visibility: string, deletedAt: Date | null, T: (typeof MR_TXT)[Locale]): string {
  if (deletedAt) return T.deleted;
  if (visibility === 'private') return T.madePrivate;
  return visibility === 'free' ? T.freeOnSale : T.onSale;
}

function reasonLabel(reason: string, locale: Locale): string {
  const map = locale === 'en' ? REPORT_REASON_LABELS_EN : REPORT_REASON_LABELS;
  return map[reason as ReportReason] ?? reason;
}

export default async function MyReportsPage(): Promise<ReactElement> {
  const locale = await getLocale();
  const T = MR_TXT[locale];
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="mr-denied" data-reports-denied="anonymous">
        <h1 className="mr-title">{T.title}</h1>
        <p className="mr-deniedCopy">{T.deniedCopy}</p>
        <Link href="/login" className="mr-loginLink">
          {T.goLogin}
        </Link>
      </main>
    );
  }

  const reports = await listReportsByReporter(user.id);

  return (
    <main className="mr-root">
      <header className="mr-head">
        <div className="mr-heading">
          <h1 className="mr-title" data-reports-title>
            {T.title}
          </h1>
          <p className="mr-subtitle">
            {T.subtitle}
          </p>
        </div>
        <Link href="/marketplace" className="mr-back" data-reports-back>
          {T.back}
        </Link>
      </header>

      {reports.length === 0 ? (
        <p className="mr-empty" data-reports-empty>
          {T.empty}
        </p>
      ) : (
        <>
          <p className="mr-count" data-reports-count={reports.length}>
            {T.count(reports.length)}
          </p>
          <ul className="mr-list" data-reports-list>
            {reports.map((report) => {
              const status = T.STATUS_LABELS[report.status];
              return (
                <li
                  key={report.id}
                  className="mr-row"
                  data-report-row
                  data-report-id={report.id}
                  data-report-status={report.status}
                >
                  <div className="mr-rowTop">
                    <strong className="mr-rowTitle" data-report-item-title>
                      {report.itemTitle}
                    </strong>
                    <span className="mr-itemState" data-report-item-state={itemState(report.itemVisibility, report.itemDeletedAt, T)}>
                      {T.itemStatePrefix}{itemState(report.itemVisibility, report.itemDeletedAt, T)}
                    </span>
                    <span className={`mr-status ${status.className}`} data-report-status-label={report.status}>
                      {status.label}
                    </span>
                  </div>
                  <div className="mr-rowMeta">
                    <span data-report-reason>{reasonLabel(report.reason, locale)}</span>
                    <span className="mr-metaTime" data-report-created>
                      {T.submittedAt(stamp(report.createdAt))}
                    </span>
                    {report.resolvedAt ? (
                      <span className="mr-metaTime" data-report-resolved>
                        {T.resolvedAt(stamp(report.resolvedAt))}
                      </span>
                    ) : null}
                  </div>
                  {report.description ? (
                    <p className="mr-desc" data-report-description>
                      {T.yourNote(report.description)}
                    </p>
                  ) : null}
                  {report.status === 'resolved' ? (
                    <p className="mr-outcomeNote" data-report-outcome-note>
                      {T.outcomeUpheld}
                    </p>
                  ) : report.status === 'dismissed' ? (
                    <p className="mr-outcomeNote" data-report-outcome-note>
                      {T.outcomeDismissed}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <p className="mr-footer">
        {T.footer}
      </p>
    </main>
  );
}
