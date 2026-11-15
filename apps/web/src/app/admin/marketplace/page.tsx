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
import { getLocale, type Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

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
 *
 * v766：双语（getLocale）。
 */
const STATUS_LABELS: Record<Locale, Record<ReportStatus, string>> = {
  zh: {
    pending: '待处理',
    reviewing: '复核中',
    resolved: '已结案',
    dismissed: '已驳回',
  },
  en: {
    pending: 'Pending',
    reviewing: 'Reviewing',
    resolved: 'Resolved',
    dismissed: 'Dismissed',
  },
};

const COPY: Record<Locale, {
  deniedAnonymous: string;
  deniedNotAdmin: (name: string, role: string) => string;
  title: string;
  summary: (total: number, pending: number) => string;
  scopeNoteStrong: string;
  scopeNoteWeak: string;
  terminalNote: string;
  filterAll: string;
  empty: string;
  auditTitle: string;
  auditNote: string;
  auditEmpty: string;
  itemLabel: (id: string) => string;
  reporterLabel: (id: string) => string;
  noDescription: string;
  closedTime: (time: string) => string;
  closedMissing: string;
  dispositionNote: (notes: string) => string;
  noDispositionNote: string;
  moderationLink: string;
  moderationReject: string;
  colTime: string;
  colAction: string;
  colItem: string;
  colActor: string;
  colDetail: string;
  backHome: string;
  becomeAdminLink: string;
  becomeAdminTail: string;
}> = {
  zh: {
    deniedAnonymous: '需要先登录才能看。',
    deniedNotAdmin: (name, role) => `这个页面对 ${name}（role=${role}）不开放：举报工单与交易审计只对 role=admin 可见。`,
    title: '市场工单',
    summary: (total, pending) => `显示 ${total} 条工单（最多 100）· 其中待处理 ${pending} 条 · 处置只对 role=admin 开放`,
    scopeNoteStrong: '结案 / 驳回落的是工单结论：',
    scopeNoteWeak: '下架物品，也不会撤下已发布的公开页。要让内容不可访问，用',
    terminalNote: '终态（已结案 / 已驳回）不再接受改写：结案记录是证据，不是可反复覆盖的草稿。',
    filterAll: '全部',
    empty: '这个筛选下没有举报工单。举报由登录用户在市场物品上提交；提交后进入「待处理」。',
    auditTitle: '市场审计日志（最近 50 条）',
    auditNote: '购买、下载、结算、改价、上下架与可疑购买都会记在这里。右侧的细节是当时落库的读数，不是事后补的。',
    auditEmpty: '还没有市场审计事件。',
    itemLabel: (id) => `物品 ${id}`,
    reporterLabel: (id) => `举报人 ${id}`,
    noDescription: '举报人没有写补充说明。',
    closedTime: (time) => `结案时间 ${time}`,
    closedMissing: '（缺失）',
    dispositionNote: (notes) => `处置依据：${notes}`,
    noDispositionNote: '没有留下处置依据。',
    moderationLink: '人工复核台',
    moderationReject: '「拒绝并撤下」',
    colTime: '时间',
    colAction: '动作',
    colItem: '物品',
    colActor: '操作者',
    colDetail: '细节',
    backHome: '回到我的项目',
    becomeAdminLink: '账号与角色',
    becomeAdminTail: '由现有审核员提权（不能改自己、guest 不给提权，每次尝试都进审计）。',
  },
  en: {
    deniedAnonymous: 'You must sign in first.',
    deniedNotAdmin: (name, role) => `This page is not open to ${name} (role=${role}): report queues and trade audit are visible only to role=admin.`,
    title: 'Marketplace queue',
    summary: (total, pending) => `Showing ${total} report${total === 1 ? '' : 's'} (cap 100) · ${pending} pending · dispositions are admin-only`,
    scopeNoteStrong: 'Resolve / Dismiss record the verdict: ',
    scopeNoteWeak: ' delist the item nor take down the published page. To make content unreachable, use',
    terminalNote: 'Terminal states (resolved / dismissed) accept no rewrites — a verdict record is evidence, not an editable draft.',
    filterAll: 'All',
    empty: 'No reports under this filter. Reports are filed by signed-in users on marketplace items; new ones land on “Pending”.',
    auditTitle: 'Marketplace audit (latest 50)',
    auditNote: 'Purchases, downloads, settlements, re-pricing, listings and delistings, and suspicious purchases all land here. The detail column on the right is the value stored at the time, not reconstructed later.',
    auditEmpty: 'No marketplace audit events yet.',
    itemLabel: (id) => `Item ${id}`,
    reporterLabel: (id) => `Reporter ${id}`,
    noDescription: 'The reporter filed no additional note.',
    closedTime: (time) => `Closed ${time}`,
    closedMissing: '(missing)',
    dispositionNote: (notes) => `Disposition: ${notes}`,
    noDispositionNote: 'No disposition note was left.',
    moderationLink: 'Moderation queue',
    moderationReject: '“Reject & take down”',
    colTime: 'Time',
    colAction: 'Action',
    colItem: 'Item',
    colActor: 'Actor',
    colDetail: 'Detail',
    backHome: 'Back to my projects',
    becomeAdminLink: 'Accounts & roles',
    becomeAdminTail: ' — promoted by an existing admin (no self, no unclaimed guests; every attempt is audited).',
  },
};

function isReportStatus(value: string | undefined): value is ReportStatus {
  return value !== undefined && (REPORT_STATUSES as readonly string[]).includes(value);
}

export default async function AdminMarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const locale = await getLocale();
  const c = COPY[locale];
  const statusLabels = STATUS_LABELS[locale];
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="adm-denied" data-admin-denied="anonymous">
        <h1 className="adm-deniedTitle">{c.title}</h1>
        <p className="adm-deniedText">{c.deniedAnonymous}</p>
      </main>
    );
  }
  if (user.role !== 'admin') {
    return (
      <main className="adm-denied" data-admin-denied="not-admin">
        <h1 className="adm-deniedTitle">{c.title}</h1>
        <p className="adm-deniedText">
          {c.deniedNotAdmin(user.displayName, user.role)}
        </p>
        <p className="am-note">
          <Link href="/admin/users" className="am-linkInline">{c.becomeAdminLink}</Link>
          {c.becomeAdminTail}
        </p>
        <Link href="/" className="am-backlink">
          {c.backHome}
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
          <h1 className="adm-deniedTitle">{c.title}</h1>
          <p className="am-summary" data-marketplace-summary>
            {c.summary(reports.length, pending)}
          </p>
        </div>
        <AdminNav current="marketplace" />
      </header>

      <section className="am-scopeBox" data-marketplace-scope>
        <p className="am-lede">
          {c.scopeNoteStrong}<strong>{locale === 'en' ? 'will NOT' : '不会'}</strong>{c.scopeNoteWeak}
          {' '}<Link href="/admin/moderation" className="am-linkTarget">{c.moderationLink}</Link>
          {locale === 'en' ? `’s ${c.moderationReject}.` : `的${c.moderationReject}。`}
        </p>
        <p className="am-note">
          {c.terminalNote}
        </p>
      </section>

      <nav className="am-filters" data-report-filter>
        <Link
          href="/admin/marketplace"
          className="am-filterChip"
          aria-current={statusFilter ? undefined : 'page'}
          data-report-filter-status="all"
        >
          {c.filterAll}
        </Link>
        {REPORT_STATUSES.map((value) => (
          <Link
            key={value}
            href={`/admin/marketplace?status=${value}`}
            className="am-filterIdle"
            aria-current={statusFilter === value ? 'page' : undefined}
            data-report-filter-status={value}
          >
            {statusLabels[value]}
          </Link>
        ))}
      </nav>

      {reports.length === 0 ? (
        <p className="am-empty" data-report-empty>
          {c.empty}
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
              {c.itemLabel(report.itemId)}
            </span>
            <span className="am-note" data-report-created>
              {new Date(report.createdAt).toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN', { hour12: false })}
            </span>
            <span className="am-statusLabel" data-report-status-label>
              {statusLabels[report.status]}
            </span>
            <span className="am-metaMono" data-report-reporter>
              {c.reporterLabel(report.reporterId)}
            </span>
          </header>

          {report.description ? (
            <p className="am-note2" data-report-description>
              「{report.description}」
            </p>
          ) : (
            <p className="am-note" data-report-description="none">
              {c.noDescription}
            </p>
          )}

          {report.status === 'resolved' || report.status === 'dismissed' ? (
            <div className="am-closed" data-report-closed={report.status}>
              <span className="am-note">
                {c.closedTime(
                  report.resolvedAt
                    ? new Date(report.resolvedAt).toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN', { hour12: false })
                    : c.closedMissing,
                )}
              </span>
              <span className="am-note2" data-report-notes={report.adminNotes ? 'some' : 'none'}>
                {report.adminNotes ? c.dispositionNote(report.adminNotes) : c.noDispositionNote}
              </span>
            </div>
          ) : (
            <TriageButtons reportId={report.id} locale={locale} />
          )}
        </article>
      ))}

      <section className="am-audit" data-marketplace-audit-log>
        <h2 className="am-auditTitle">{c.auditTitle}</h2>
        <p className="am-note">
          {c.auditNote}
        </p>
        {auditEntries.length === 0 ? (
          <p className="am-empty" data-marketplace-audit-empty>
            {c.auditEmpty}
          </p>
        ) : (
          <table className="am-table">
            <thead className="am-thRow">
              <tr>
                <th>{c.colTime}</th>
                <th>{c.colAction}</th>
                <th>{c.colItem}</th>
                <th>{c.colActor}</th>
                <th>{c.colDetail}</th>
              </tr>
            </thead>
            <tbody>
              {auditEntries.map((entry) => (
                <tr key={entry.id} data-marketplace-audit-row={entry.action}>
                  <td>{new Date(entry.occurredAt).toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN', { hour12: false })}</td>
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
