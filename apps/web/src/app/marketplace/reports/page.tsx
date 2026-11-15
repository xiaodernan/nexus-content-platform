import Link from 'next/link';
import type { ReactElement } from 'react';
import { REPORT_REASON_LABELS, REPORT_REASON_LABELS_EN, type ReportReason } from '@/lib/marketplaceReports';
import { listReportsByReporter, type ReportStatus } from '@/server/domain/marketplace';
import { currentUserOrNull } from '@/server/domain/session';
import { getLocale, type Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/**
 * 双语 COPY（2026-11-15 公开试玩面 wave）——en 逐字对应 zh。
 * 物品可表是内容数据（title 等），原文渲染。
 */
const COPY: Record<Locale, {
  deniedTitle: string;
  deniedCopy: string;
  deniedLink: string;
  title: string;
  subtitle: string;
  back: string;
  empty: string;
  count: (n: number) => string;
  statusPending: string;
  statusReviewing: string;
  statusResolved: string;
  statusDismissed: string;
  itemSynced: string;
  itemPrivate: string;
  itemFreeOnSale: string;
  itemOnSale: string;
  itemDeleted: string;
  submittedAt: (t: string) => string;
  resolvedAt: (t: string) => string;
  yourNotePrefix: string;
  outcomeResolved: string;
  outcomeDismissed: string;
  footer: string;
  itemStatePrefix: string;
}> = {
  zh: {
    deniedTitle: '我的举报',
    deniedCopy: '需要先登录：举报按举报人存放，没有身份就没有可归属的那一份。',
    deniedLink: '去登录',
    title: '我的举报',
    subtitle:
      '你提交过的举报都在这里。工单状态与物品此刻的状态是两件事：结案 / 驳回都不自动下架物品，撤内容走人工复核台；作者也可能自己把物品下架或转私密。',
    back: '回市场',
    empty: '你还没有提交过举报。在市场的物品行里点「举报」即可提交——同一件物品只能举报一次。',
    count: (n) => `共 ${n} 条；按提交时间倒序。审核员的内部笔记不在这一页。`,
    statusPending: '待受理',
    statusReviewing: '审核中',
    statusResolved: '举报成立',
    statusDismissed: '举报不成立',
    itemSynced: '在售',
    itemPrivate: '已转私密',
    itemFreeOnSale: '免费在售',
    itemOnSale: '在售',
    itemDeleted: '已删除',
    submittedAt: (t) => `提交于 ${t}`,
    resolvedAt: (t) => `处置于 ${t}`,
    yourNotePrefix: '你的说明：',
    outcomeResolved: '审核员认定举报成立。这是工单结论，物品是否撤下由人工复核台另行处理。',
    outcomeDismissed: '审核员判定这次举报不成立。若之后发现新的证据，可以留意物品页面的变化。',
    footer: '页面只列你自己提交的工单：别人的举报不在这一页，也拿不到举报人是谁。',
    itemStatePrefix: '物品',
  },
  en: {
    deniedTitle: 'My reports',
    deniedCopy: 'Sign in first: reports are kept per reporter, so without an identity there is nothing to attribute this page to.',
    deniedLink: 'Go to login',
    title: 'My reports',
    subtitle:
      'Every report you filed lives here. The case status and the item’s current status are separate things: resolving or dismissing a case does not take the item down; takedowns go through the human review console, and authors may also delist or privatize on their own.',
    back: 'To marketplace',
    empty: 'You haven’t filed any reports yet. Click “Report” on a listing to file one — each item can be reported once.',
    count: (n) => `${n} report(s), newest first. Internal moderator notes are not shown on this page.`,
    statusPending: 'Pending review',
    statusReviewing: 'Under review',
    statusResolved: 'Upheld',
    statusDismissed: 'Dismissed',
    itemSynced: 'On sale',
    itemPrivate: 'Now private',
    itemFreeOnSale: 'Free on sale',
    itemOnSale: 'On sale',
    itemDeleted: 'Deleted',
    submittedAt: (t) => `Filed at ${t}`,
    resolvedAt: (t) => `Handled at ${t}`,
    yourNotePrefix: 'Your note: ',
    outcomeResolved: 'The moderator marked this report upheld. This is the case’s verdict — whether the item is taken down is decided by the review console separately.',
    outcomeDismissed: 'The moderator found this report unsubstantiated. If new evidence surfaces later, keep an eye on the item page.',
    footer: 'Only your own reports are listed here: other people’s reports are not shown, and reporter identity is not available to anyone.',
    itemStatePrefix: 'Item: ',
  },
};

/** 时间按 UTC 印：与「我的购买」「收件箱」同一口径 */
function stamp(value: Date): string {
  const iso = value.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/** 物品此刻的状态：与工单结论分开读，工单结案不会自动改动它 */
function itemState(c: (typeof COPY)[Locale], visibility: string, deletedAt: Date | null): string {
  if (deletedAt) return c.itemDeleted;
  if (visibility === 'private') return c.itemPrivate;
  return visibility === 'free' ? c.itemFreeOnSale : c.itemOnSale;
}

function reasonLabel(locale: Locale, reason: string): string {
  const map = locale === 'en' ? REPORT_REASON_LABELS_EN : REPORT_REASON_LABELS;
  return map[reason as ReportReason] ?? reason;
}

export default async function MyReportsPage(): Promise<ReactElement> {
  const locale = await getLocale();
  const c = COPY[locale];
  /**
   * 举报人对状态的读法：工单的四个状态各说一句**对自己意味着什么**。
   * 键被 `Record<ReportStatus, …>` 钉死，域层加状态时这里漏写会直接编译失败。
   */
  const STATUS_LABELS: Record<ReportStatus, { label: string; className: string }> = {
    pending: { label: c.statusPending, className: 'mr-statusPending' },
    reviewing: { label: c.statusReviewing, className: 'mr-statusReviewing' },
    resolved: { label: c.statusResolved, className: 'mr-statusResolved' },
    dismissed: { label: c.statusDismissed, className: 'mr-statusDismissed' },
  };

  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="mr-denied" data-reports-denied="anonymous">
        <h1 className="mr-title">{c.deniedTitle}</h1>
        <p className="mr-deniedCopy">{c.deniedCopy}</p>
        <Link href="/login" className="mr-loginLink">
          {c.deniedLink}
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
            {c.title}
          </h1>
          <p className="mr-subtitle">
            {c.subtitle}
          </p>
        </div>
        <Link href="/marketplace" className="mr-back" data-reports-back>
          {c.back}
        </Link>
      </header>

      {reports.length === 0 ? (
        <p className="mr-empty" data-reports-empty>
          {c.empty}
        </p>
      ) : (
        <>
          <p className="mr-count" data-reports-count={reports.length}>
            {c.count(reports.length)}
          </p>
          <ul className="mr-list" data-reports-list>
            {reports.map((report) => {
              const status = STATUS_LABELS[report.status];
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
                    <span className="mr-itemState" data-report-item-state={itemState(c, report.itemVisibility, report.itemDeletedAt)}>
                      {c.itemStatePrefix}{itemState(c, report.itemVisibility, report.itemDeletedAt)}
                    </span>
                    <span className={`mr-status ${status.className}`} data-report-status-label={report.status}>
                      {status.label}
                    </span>
                  </div>
                  <div className="mr-rowMeta">
                    <span data-report-reason>{reasonLabel(locale, report.reason)}</span>
                    <span className="mr-metaTime" data-report-created>
                      {c.submittedAt(stamp(report.createdAt))}
                    </span>
                    {report.resolvedAt ? (
                      <span className="mr-metaTime" data-report-resolved>
                        {c.resolvedAt(stamp(report.resolvedAt))}
                      </span>
                    ) : null}
                  </div>
                  {report.description ? (
                    <p className="mr-desc" data-report-description>
                      {c.yourNotePrefix}{report.description}
                    </p>
                  ) : null}
                  {report.status === 'resolved' ? (
                    <p className="mr-outcomeNote" data-report-outcome-note>
                      {c.outcomeResolved}
                    </p>
                  ) : report.status === 'dismissed' ? (
                    <p className="mr-outcomeNote" data-report-outcome-note>
                      {c.outcomeDismissed}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <p className="mr-footer">
        {c.footer}
      </p>
    </main>
  );
}
