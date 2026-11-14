import { listAudit, DELETED_USER_LABEL } from '@/server/domain/audit';
import { currentUserOrNull } from '@/server/domain/session';
import { AdminNav } from '@/components/AdminNav';
import { getLocale, type Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/**
 * §80 / §84 的审计页：谁在什么时候试过什么，被挡住的也算。
 *
 * 这张表建库起就有，但从没有人往里写——所以"有表"不等于"有审计"。
 * 现在写进去的是四类决定：登录与注册（成功与失败）、人工裁决（含非审核员的越权尝试与重复裁决尝试）、
 * 发布 / 下架 / 取消发布、角色变更。默认拒绝的口径与复核台一致：没登录与不是 admin 都只说一句拒绝，
 * 不泄露表里有多少行。
 *
 * v762：双语（getLocale）；DELETED_USER_LABEL（服务端常量）原文透传（§46 独立切片）。
 */
const COPY: Record<Locale, {
  deniedTitle: string;
  deniedAnonymous: string;
  deniedNotAdmin: (name: string, role: string) => string;
  summary: (total: number, denied: number) => string;
  scope: string;
  empty: string;
  tableAria: string;
  colTime: string;
  colActor: string;
  colAction: string;
  colTarget: string;
  colResult: string;
  colDetail: string;
  anonymousActor: string;
  allowed: string;
  deniedLabel: string;
}> = {
  zh: {
    deniedTitle: '审计事件',
    deniedAnonymous: '需要先登录才能看。',
    deniedNotAdmin: (name, role) => `这个页面对 ${name}（role=${role}）不开放：审计只对 role=admin 可见。`,
    summary: (total, denied) => `最近 ${total} 条 · 其中被拒绝 ${denied} 条`,
    scope: '这里记的是决定，不是访问流水：登录与注册（含失败）、人工裁决（含越权与重复裁决尝试）、发布 / 下架 / 取消发布、角色变更。失败的登录不记是哪个邮箱——那张表本身会变成可枚举的用户清单。IP 存在库里但默认不摊在这一页上。',
    empty: '还没有记下来的事件。',
    tableAria: '审计事件表（可横向滚动）',
    colTime: '时间',
    colActor: '谁',
    colAction: '动作',
    colTarget: '对象',
    colResult: '结果',
    colDetail: '细节',
    anonymousActor: '没有身份',
    allowed: '放行',
    deniedLabel: '拒绝',
  },
  en: {
    deniedTitle: 'Audit events',
    deniedAnonymous: 'You must sign in first.',
    deniedNotAdmin: (name, role) => `This page is not open to ${name} (role=${role}): audit is visible only to role=admin.`,
    summary: (total, denied) => `Latest ${total} entries · ${denied} denied`,
    scope: 'What is recorded here are decisions, not access flows: sign-in and sign-up (including failures), manual verdicts (including out-of-scope and repeat-verdict attempts), publish / unpublish / cancel-publish, role changes. Failed sign-ins never record the email — the table itself would become an enumerable user list. IP is stored but deliberately not spread on this page.',
    empty: 'Nothing has been recorded yet.',
    tableAria: 'Audit events table (horizontally scrollable)',
    colTime: 'Time',
    colActor: 'Who',
    colAction: 'Action',
    colTarget: 'Target',
    colResult: 'Result',
    colDetail: 'Detail',
    anonymousActor: 'No identity',
    allowed: 'Allowed',
    deniedLabel: 'Denied',
  },
};

export default async function AdminAuditPage() {
  const locale = await getLocale();
  const c = COPY[locale];
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="adm-denied" data-admin-denied="anonymous">
        <h1 className="adm-deniedTitle">{c.deniedTitle}</h1>
        <p className="adm-deniedText">{c.deniedAnonymous}</p>
      </main>
    );
  }
  if (user.role !== 'admin') {
    return (
      <main className="adm-denied" data-admin-denied="not-admin">
        <h1 className="adm-deniedTitle">{c.deniedTitle}</h1>
        <p className="adm-deniedText">
          {c.deniedNotAdmin(user.displayName, user.role)}
        </p>
      </main>
    );
  }

  const events = await listAudit(100);
  const denied = events.filter((event) => !event.allowed).length;
  return (
    <main className="am-shellWide" data-audit-root>
      <header className="adm-headBaseline">
        <div>
          <h1 className="adm-deniedTitle">{c.deniedTitle}</h1>
          <p className="adm-capNote" data-audit-summary>
            {c.summary(events.length, denied)}
          </p>
        </div>
        <AdminNav current="audit" />
      </header>

      <p className="adm-capNote" data-audit-scope>
        {c.scope}
      </p>

      {events.length === 0 ? (
        <p className="am-empty" data-audit-empty>
          {c.empty}
        </p>
      ) : (
        // 审计表六列、时间/动作/细节都不能截断；窄视口下让它自己横滚，
        // 而不是把整页的布局视口撑宽（390 下曾量到 innerWidth 被撑成 1183）
        // 第五十一片：390 下表格只剩 342 宽里的 69px 首列（时间被拆字），而横滚区没有 tabindex
        // ——键盘用户看得到「细节」那一列却滚不过去（axe: scrollable-region-focusable）。
        <div
          className="tl-tableScroll"
          data-audit-table-scroll
          role="region"
          aria-label={c.tableAria}
          tabIndex={0}
        >
        <table className="tl-table">
          <thead className="tl-thRow">
            <tr>
              <th className="tl-tdNowrap">{c.colTime}</th>
              <th className="tl-tdNowrap">{c.colActor}</th>
              <th className="tl-tdNowrap">{c.colAction}</th>
              <th className="tl-tdNowrap">{c.colTarget}</th>
              <th className="tl-tdNowrap">{c.colResult}</th>
              <th className="tl-tdNowrap">{c.colDetail}</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} data-audit-row={event.action}>
                <td className="tl-tdNowrap">{new Date(event.createdAt).toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN', { hour12: false })}</td>
                <td className="tl-tdNowrap" data-audit-actor={event.actorId ? 'known' : 'none'}>
                  {event.actorName ?? (event.actorId ? DELETED_USER_LABEL : c.anonymousActor)}
                </td>
                <td className="tl-tdNowrap">{event.action}</td>
                <td>{event.targetType ? `${event.targetType}${event.targetId ? ` ${String(event.targetId).slice(0, 8)}` : ''}` : '—'}</td>
                <td className="tl-tdNowrap" data-audit-allowed={event.allowed ? 'yes' : 'no'}>{event.allowed ? c.allowed : c.deniedLabel}</td>
                {/* 细节是长串 JSON；允许在任意位置断开，宽屏才不必为它横滚 */}
                <td className="am-detailMin">
                  {event.detail ? JSON.stringify(event.detail) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </main>
  );
}
