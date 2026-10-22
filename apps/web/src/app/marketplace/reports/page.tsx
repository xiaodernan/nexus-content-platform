import Link from 'next/link';
import type { ReactElement } from 'react';
import { REPORT_REASON_LABELS, type ReportReason } from '@/lib/marketplaceReports';
import { listReportsByReporter, type ReportStatus } from '@/server/domain/marketplace';
import { currentUserOrNull } from '@/server/domain/session';

export const dynamic = 'force-dynamic';

/**
 * 举报人对状态的读法：工单的四个状态各说一句**对自己意味着什么**。
 * 键被 `Record<ReportStatus, …>` 钉死，域层加状态时这里漏写会直接编译失败。
 */
const STATUS_LABELS: Record<ReportStatus, { label: string; className: string }> = {
  pending: { label: '待受理', className: 'text-fg-2' },
  reviewing: { label: '审核中', className: 'text-accent-2' },
  resolved: { label: '举报成立', className: 'text-green-400' },
  dismissed: { label: '举报不成立', className: 'text-fg-3' },
};

/** 时间按 UTC 印：与「我的购买」「收件箱」同一口径 */
function stamp(value: Date): string {
  const iso = value.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/** 物品此刻的状态：与工单结论分开读，工单结案不会自动改动它 */
function itemState(visibility: string, deletedAt: Date | null): string {
  if (deletedAt) return '已删除';
  if (visibility === 'private') return '已转私密';
  return visibility === 'free' ? '免费在售' : '在售';
}

function reasonLabel(reason: string): string {
  return REPORT_REASON_LABELS[reason as ReportReason] ?? reason;
}

export default async function MyReportsPage(): Promise<ReactElement> {
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-[980px] flex-col gap-[var(--nexus-space-4)] p-[var(--nexus-space-6)] font-mono" data-reports-denied="anonymous">
        <h1 className="text-[var(--nexus-font-size-28)] font-semibold tracking-tight">我的举报</h1>
        <p className="text-13 text-fg-2">需要先登录：举报按举报人存放，没有身份就没有可归属的那一份。</p>
        <Link href="/login" className="text-accent-2 underline">
          去登录
        </Link>
      </main>
    );
  }

  const reports = await listReportsByReporter(user.id);

  return (
    <main className="mx-auto flex min-h-screen max-w-[980px] flex-col gap-[var(--nexus-space-5)] p-[var(--nexus-space-6)] font-mono">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[var(--nexus-font-size-28)] font-semibold tracking-tight" data-reports-title>
            我的举报
          </h1>
          <p className="text-[var(--nexus-font-size-12)] text-fg-2">
            你提交过的举报都在这里。工单状态与物品此刻的状态是两件事：结案 / 驳回都不自动下架物品，
            撤内容走人工复核台；作者也可能自己把物品下架或转私密。
          </p>
        </div>
        <Link href="/marketplace" className="shrink-0 text-accent-2 underline" data-reports-back>
          回市场
        </Link>
      </header>

      {reports.length === 0 ? (
        <p className="text-fg-2" data-reports-empty>
          你还没有提交过举报。在市场的物品行里点「举报」即可提交——同一件物品只能举报一次。
        </p>
      ) : (
        <>
          <p className="text-11 text-fg-3" data-reports-count={reports.length}>
            共 {reports.length} 条；按提交时间倒序。审核员的内部笔记不在这一页。
          </p>
          <ul className="flex flex-col gap-2" data-reports-list>
            {reports.map((report) => {
              const status = STATUS_LABELS[report.status];
              return (
                <li
                  key={report.id}
                  className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-subtle)] bg-bg-2 p-3"
                  data-report-row
                  data-report-id={report.id}
                  data-report-status={report.status}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-14" data-report-item-title>
                      {report.itemTitle}
                    </strong>
                    <span className="text-11 text-fg-3" data-report-item-state={itemState(report.itemVisibility, report.itemDeletedAt)}>
                      物品{itemState(report.itemVisibility, report.itemDeletedAt)}
                    </span>
                    <span className={`ml-auto text-11 ${status.className}`} data-report-status-label={report.status}>
                      {status.label}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-12 text-fg-2">
                    <span data-report-reason>{reasonLabel(report.reason)}</span>
                    <span className="text-11 text-fg-3" data-report-created>
                      提交于 {stamp(report.createdAt)}
                    </span>
                    {report.resolvedAt ? (
                      <span className="text-11 text-fg-3" data-report-resolved>
                        处置于 {stamp(report.resolvedAt)}
                      </span>
                    ) : null}
                  </div>
                  {report.description ? (
                    <p className="mt-1 text-11 text-fg-3" data-report-description>
                      你的说明：{report.description}
                    </p>
                  ) : null}
                  {report.status === 'resolved' ? (
                    <p className="mt-1 text-11 text-fg-3" data-report-outcome-note>
                      审核员认定举报成立。这是工单结论，物品是否撤下由人工复核台另行处理。
                    </p>
                  ) : report.status === 'dismissed' ? (
                    <p className="mt-1 text-11 text-fg-3" data-report-outcome-note>
                      审核员判定这次举报不成立。若之后发现新的证据，可以留意物品页面的变化。
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <p className="text-11 text-fg-3">
        页面只列你自己提交的工单：别人的举报不在这一页，也拿不到举报人是谁。
      </p>
    </main>
  );
}
