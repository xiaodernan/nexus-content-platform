import Link from 'next/link';
import {
  REPORT_STATUSES,
  getAuditLog,
  getReports,
} from '@/server/domain/marketplace';
import type { ReportStatus } from '@/server/domain/marketplace';
import { currentUserOrNull } from '@/server/domain/session';
import { TriageButtons } from './TriageButtons';
import { AdminNav } from '@/components/AdminNav';

export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<ReportStatus, string> = {
  pending: '待处理',
  reviewing: '复核中',
  resolved: '已结案',
  dismissed: '已驳回',
};

function isReportStatus(value: string | undefined): value is ReportStatus {
  return value !== undefined && (REPORT_STATUSES as readonly string[]).includes(value);
}

/**
 * §123/#158/#159 的市场管理台：举报工单与交易审计。
 *
 * 举报提交入口在 `/api/admin/marketplace/reports`（任何登录用户），处置入口在
 * `PATCH /api/admin/marketplace/reports/[id]`（仅 admin）。没有这一页，处置端点只能靠 curl 用，
 * 工单仍然只会积压——界面这一格和端点一样是功能的一部分。
 *
 * 默认拒绝与复核台同一口径：没登录 / 不是 admin 都只说一句拒绝，不泄露队列里有什么。
 * 页面明写"结案/驳回落的是工单结论，不撤内容"：撤下公开页是复核台的权力，
 * 让审核员以为这里的"结案"会下架物品，就是界面替产品说反话（§159）。
 */
export default async function AdminMarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="adm-denied" data-admin-denied="anonymous">
        <h1 className="adm-deniedTitle">市场工单</h1>
        <p className="adm-deniedText">需要先登录才能看。</p>
      </main>
    );
  }
  if (user.role !== 'admin') {
    return (
      <main className="adm-denied" data-admin-denied="not-admin">
        <h1 className="adm-deniedTitle">市场工单</h1>
        <p className="adm-deniedText">
          这个页面对 {user.displayName}（role={user.role}）不开放：举报工单与交易审计只对 role=admin 可见。
        </p>
        <p className="am-note">
          成为审核员要走 <Link href="/admin/users" className="am-linkInline">账号与角色</Link>
          由现有审核员提权（不能改自己、guest 不给提权，每次尝试都进审计）。
        </p>
        <Link href="/" className="am-backlink">
          回到我的项目
        </Link>
      </main>
    );
  }

  const { status } = await searchParams;
  const statusFilter = isReportStatus(status) ? status : undefined;
  const [reports, auditEntries] = await Promise.all([
    getReports({ status: statusFilter, limit: 100 }),
    getAuditLog({ limit: 50 }),
  ]);
  const pending = reports.filter((report) => report.status === 'pending').length;

  return (
    <main className="am-shell" data-admin-marketplace>
      <header className="adm-headBaseline">
        <div>
          <h1 className="adm-deniedTitle">市场工单</h1>
          <p className="am-summary" data-marketplace-summary>
            显示 {reports.length} 条工单（最多 100）· 其中待处理 {pending} 条 · 处置只对 role=admin 开放
          </p>
        </div>
        <AdminNav current="marketplace" />
      </header>

      <section className="am-scopeBox" data-marketplace-scope>
        <p className="am-lede">
          结案 / 驳回落的是工单结论：<strong>不会</strong>下架物品，也不会撤下已发布的公开页。
          要让内容不可访问，用 <Link href="/admin/moderation" className="am-linkTarget">人工复核台</Link>
          的「拒绝并撤下」。
        </p>
        <p className="am-note">
          终态（已结案 / 已驳回）不再接受改写：结案记录是证据，不是可反复覆盖的草稿。
        </p>
      </section>

      <nav className="am-filters" data-report-filter>
        <Link
          href="/admin/marketplace"
          className="am-filterChip"
          aria-current={statusFilter ? undefined : 'page'}
          data-report-filter-status="all"
        >
          全部
        </Link>
        {REPORT_STATUSES.map((value) => (
          <Link
            key={value}
            href={`/admin/marketplace?status=${value}`}
            className="am-filterIdle"
            aria-current={statusFilter === value ? 'page' : undefined}
            data-report-filter-status={value}
          >
            {STATUS_LABELS[value]}
          </Link>
        ))}
      </nav>

      {reports.length === 0 ? (
        <p className="am-empty" data-report-empty>
          这个筛选下没有举报工单。举报由登录用户在市场物品上提交；提交后进入「待处理」。
        </p>
      ) : null}

      {reports.map((report) => (
        <article
          key={report.id}
          className="am-reportCard"
          data-report-row={report.id}
          data-report-status={report.status}
        >
          <header className="am-reportHead">
            <span className="am-reportReason" data-report-reason={report.reason}>
              {report.reason}
            </span>
            <span className="am-metaMono" data-report-item>
              物品 {report.itemId}
            </span>
            <span className="am-note" data-report-created>
              {new Date(report.createdAt).toLocaleString('zh-CN', { hour12: false })}
            </span>
            <span className="am-statusLabel" data-report-status-label>
              {STATUS_LABELS[report.status]}
            </span>
            <span className="am-metaMono" data-report-reporter>
              举报人 {report.reporterId}
            </span>
          </header>

          {report.description ? (
            <p className="am-note2" data-report-description>
              「{report.description}」
            </p>
          ) : (
            <p className="am-note" data-report-description="none">
              举报人没有写补充说明。
            </p>
          )}

          {report.status === 'resolved' || report.status === 'dismissed' ? (
            <div className="am-closed" data-report-closed={report.status}>
              <span className="am-note">
                结案时间{' '}
                {report.resolvedAt
                  ? new Date(report.resolvedAt).toLocaleString('zh-CN', { hour12: false })
                  : '（缺失）'}
              </span>
              <span className="am-note2" data-report-notes={report.adminNotes ? 'some' : 'none'}>
                {report.adminNotes ? `处置依据：${report.adminNotes}` : '没有留下处置依据。'}
              </span>
            </div>
          ) : (
            <TriageButtons reportId={report.id} />
          )}
        </article>
      ))}

      <section className="am-audit" data-marketplace-audit-log>
        <h2 className="am-auditTitle">市场审计日志（最近 50 条）</h2>
        <p className="am-note">
          购买、下载、结算、改价、上下架与可疑购买都会记在这里。右侧的细节是当时落库的读数，不是事后补的。
        </p>
        {auditEntries.length === 0 ? (
          <p className="am-empty" data-marketplace-audit-empty>
            还没有市场审计事件。
          </p>
        ) : (
          <table className="am-table">
            <thead className="am-thRow">
              <tr>
                <th>时间</th>
                <th>动作</th>
                <th>物品</th>
                <th>操作者</th>
                <th>细节</th>
              </tr>
            </thead>
            <tbody>
              {auditEntries.map((entry) => (
                <tr key={entry.id} data-marketplace-audit-row={entry.action}>
                  <td>{new Date(entry.occurredAt).toLocaleString('zh-CN', { hour12: false })}</td>
                  <td>{entry.action}</td>
                  <td className="am-monoCell">{entry.itemId}</td>
                  <td className="am-monoCell">{entry.actorId}</td>
                  <td className="am-detailCell">{JSON.stringify(entry.metadata)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
