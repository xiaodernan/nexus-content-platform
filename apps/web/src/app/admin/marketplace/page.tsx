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
import { BrandTitle } from '@/components/BrandTitle';

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
 * 举报提交入口是 /api/admin/marketplace/reports（任何登录用户），处置入口在
 * PATCH /api/admin/marketplace/reports/[id]（仅 admin）。没有这一页，处置端点只能拿 curl 用，
 * 工单仍然只会积压——界面这一格和端点一样是功能的一部分。
 *
 * 默认拒绝与复核台同一口径：没登录 / 不是 admin 都只说一句拒绝，不泄露队列里有什么。
 * 页面明写"结案/驳回落的是工单结论，不撤内容"：撤下公开页是复核台的权力——
 * 让审核员以为这里"结案"会下架物品，就是界面替产品说反话（§159）。
 */
export default async function AdminMarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="mx-auto flex max-w-[860px] flex-col gap-3 px-6 py-16" data-admin-denied="anonymous">
        <p className="text-10 font-mono uppercase tracking-[0.35em] text-fg-3">NEXUS · ADMIN · MARKETPLACE</p>
        <h1 className="mt-2 text-[var(--nexus-font-size-24)] font-semibold">市场工单</h1>
        <p className="text-13 text-fg-2">需要先登录才能看。</p>
      </main>
    );
  }
  if (user.role !== 'admin') {
    return (
      <main className="mx-auto flex max-w-[860px] flex-col gap-3 px-6 py-16" data-admin-denied="not-admin">
        <p className="text-10 font-mono uppercase tracking-[0.35em] text-fg-3">NEXUS · ADMIN · MARKETPLACE</p>
        <h1 className="mt-2 text-[var(--nexus-font-size-24)] font-semibold">市场工单</h1>
        <p className="text-13 text-fg-2">
          这个页面对 {user.displayName}（role={user.role}）不开放：举报工单与交易审计只对 role=admin 可见。
        </p>
        <p className="mt-1 text-11 text-fg-3">
          成为审核员要从 <Link href="/admin/users" className="text-accent-2-ink underline">账号与角色</Link>
          由现有审核员提权（不能改自己、guest 不给提权，每次尝试都进审计）。
        </p>
        <Link href="/" className="mt-4 inline-flex w-fit items-center gap-1 text-12 text-accent-2-ink underline">
          ← 回到我的项目
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
    <main className="mx-auto flex max-w-[1080px] flex-col gap-5 px-6 py-8" data-admin-marketplace>
      <header className="relative overflow-hidden rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] bg-bg-1 px-6 py-6">
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-[var(--nexus-color-brand)] opacity-[0.14] blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-16 -left-14 h-48 w-48 rounded-full bg-[var(--nexus-color-accent-2)] opacity-[0.14] blur-3xl" />
        <p className="relative text-10 font-mono uppercase tracking-[0.35em] text-fg-3">NEXUS · ADMIN · MARKETPLACE</p>
        <BrandTitle className="relative mt-2 inline-block text-gradient-brand pb-2 text-28 font-bold tracking-tight">
          市场工单
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[var(--nexus-color-brand)] to-transparent opacity-70"
          />
        </BrandTitle>
        <p className="relative mt-2 text-12 text-fg-3" data-marketplace-summary>
          显示 {reports.length} 条工单（最多 100）· 其中待处理 {pending} 条 · 处置只对 role=admin 开放。
        </p>
        <div className="relative mt-4 flex flex-wrap items-center justify-between gap-3">
          <AdminNav current="marketplace" />
          <Link href="/admin/audit" className="text-11 text-accent-2-ink underline" data-marketplace-audit-link>
            每笔处置都进审计 →
          </Link>
        </div>
      </header>

      <section className="rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] bg-bg-2/60 p-4" data-marketplace-scope>
        <p className="text-12 font-semibold text-fg-1">
          结案 / 驳回落的是工单结论：<strong>不会</strong>下架物品，也不会撤下已发布的公开页。
          要让内容不可访问，用 <Link href="/admin/moderation" className="text-accent-2-ink underline">人工复核台</Link>
          的「拒绝并撤下」。
        </p>
        <p className="mt-1 text-11 text-fg-3">
          终态（已结案 / 已驳回）不再接受改写：结案记录是证据，不是可反复覆盖的草稿。
        </p>
      </section>

      <nav className="flex flex-wrap items-center gap-2 text-12" data-report-filter>
        <Link
          href="/admin/marketplace"
          className={`rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] px-3 py-1.5 ${statusFilter ? 'text-fg-3 hover:text-fg-1' : 'bg-[var(--nexus-color-bg-2)] font-semibold text-fg-1'}`}
          aria-current={statusFilter ? undefined : 'page'}
          data-report-filter-status="all"
        >
          全部
        </Link>
        {REPORT_STATUSES.map((value) => (
          <Link
            key={value}
            href={`/admin/marketplace?status=${value}`}
            className={`rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] px-3 py-1.5 ${statusFilter === value ? 'bg-[var(--nexus-color-bg-2)] font-semibold text-fg-1' : 'text-fg-3 hover:text-fg-1'}`}
            aria-current={statusFilter === value ? 'page' : undefined}
            data-report-filter-status={value}
          >
            {STATUS_LABELS[value]}
          </Link>
        ))}
      </nav>

      {reports.length === 0 ? (
        <p className="rounded-[var(--nexus-radius-md)] border border-dashed border-[var(--nexus-color-border-subtle)] bg-bg-1 px-6 py-10 text-center text-13 text-fg-2" data-report-empty>
          这个筛选下没有举报工单。举报由登录用户在市场物品上提交；提交后进入「待处理」。
        </p>
      ) : null}

      {reports.map((report) => (
        <article
          key={report.id}
          className="flex flex-col gap-2 rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] bg-bg-1 p-4"
          data-report-row={report.id}
          data-report-status={report.status}
        >
          <header className="flex flex-wrap items-baseline gap-3">
            <span className="text-13 font-semibold text-fg-1" data-report-reason={report.reason}>
              {report.reason}
            </span>
            <span className="font-mono text-11 text-fg-3" data-report-item>
              物品 {report.itemId}
            </span>
            <span className="text-11 text-fg-3 font-mono" data-report-created>
              {new Date(report.createdAt).toLocaleString('zh-CN', { hour12: false })}
            </span>
            <span className="rounded-full border border-[var(--nexus-color-border-subtle)] bg-bg-2 px-2 py-0.5 text-11 text-fg-2" data-report-status-label>
              {STATUS_LABELS[report.status]}
            </span>
            <span className="font-mono text-11 text-fg-3" data-report-reporter>
              举报人 {report.reporterId}
            </span>
          </header>

          {report.description ? (
            <p className="text-11 text-fg-2" data-report-description>
              「{report.description}」
            </p>
          ) : (
            <p className="text-11 text-fg-3" data-report-description="none">
              举报人没有写补充说明
            </p>
          )}

          {report.status === 'resolved' || report.status === 'dismissed' ? (
            <div className="flex flex-col gap-1" data-report-closed={report.status}>
              <span className="text-11 text-fg-3 font-mono">
                结案时间{' '}
                {report.resolvedAt
                  ? new Date(report.resolvedAt).toLocaleString('zh-CN', { hour12: false })
                  : '（缺失）'}
              </span>
              <span className="text-11 text-fg-2" data-report-notes={report.adminNotes ? 'some' : 'none'}>
                {report.adminNotes ? `处置依据：${report.adminNotes}` : '没有留下处置依据。'}
              </span>
            </div>
          ) : (
            <TriageButtons reportId={report.id} />
          )}
        </article>
      ))}

      <section className="rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] bg-bg-1 p-4" data-marketplace-audit-log>
        <h2 className="text-[var(--nexus-font-size-16)] font-semibold text-fg-1">市场审计日志（最多 50 条）</h2>
        <p className="mt-1 text-11 text-fg-3">
          购买、下载、结算、改价、上下架与可疑购买都会记在这里。右侧的细节是当时落库的读数，不是事后补的。
        </p>
        {auditEntries.length === 0 ? (
          <p className="mt-2 text-13 text-fg-2" data-marketplace-audit-empty>
            还没有市场审计事件。
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-11">
              <thead className="text-left text-fg-3">
                <tr>
                  <th className="px-3 py-2 font-normal">时间</th>
                  <th className="px-3 py-2 font-normal">动作</th>
                  <th className="px-3 py-2 font-normal">物品</th>
                  <th className="px-3 py-2 font-normal">操作人</th>
                  <th className="px-3 py-2 font-normal">细节</th>
                </tr>
              </thead>
              <tbody>
                {auditEntries.map((entry) => (
                  <tr key={entry.id} className="border-t border-[var(--nexus-color-border-subtle)] hover:bg-[var(--nexus-color-bg-2)]" data-marketplace-audit-row={entry.action}>
                    <td className="whitespace-nowrap px-3 py-2 font-mono">{new Date(entry.occurredAt).toLocaleString('zh-CN', { hour12: false })}</td>
                    <td className="px-3 py-2">{entry.action}</td>
                    <td className="px-3 py-2 font-mono">{entry.itemId}</td>
                    <td className="px-3 py-2 font-mono">{entry.actorId}</td>
                    <td className="break-all px-3 py-2 text-fg-3 font-mono">{JSON.stringify(entry.metadata)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
