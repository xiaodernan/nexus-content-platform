import { listAudit, DELETED_USER_LABEL } from '@/server/domain/audit';
import { currentUserOrNull } from '@/server/domain/session';
import { AdminNav } from '@/components/AdminNav';

export const dynamic = 'force-dynamic';

/**
 * §80 / §84 的审计页：谁在什么时候试过什么，被挡住的也算。
 *
 * 这张表建库起就有，但从没有人往里写——所以"有表"不等于"有审计"。
 * 现在写进去的是四类决定：登录与注册（成功与失败）、人工裁决（含非审核员的越权尝试与重复裁决尝试）、
 * 发布 / 下架 / 取消发布、角色变更。默认拒绝的口径与复核台一致：没登录与不是 admin 都只说一句拒绝，
 * 不泄露表里有多少行。
 */
export default async function AdminAuditPage() {
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="mx-auto max-w-[860px] px-6 py-16" data-admin-denied="anonymous">
        <h1 className="text-[var(--nexus-font-size-21)] font-semibold">审计事件</h1>
        <p className="mt-2 text-13 text-fg-2">需要先登录才能看。</p>
      </main>
    );
  }
  if (user.role !== 'admin') {
    return (
      <main className="mx-auto max-w-[860px] px-6 py-16" data-admin-denied="not-admin">
        <h1 className="text-[var(--nexus-font-size-21)] font-semibold">审计事件</h1>
        <p className="mt-2 text-13 text-fg-2">
          这个页面对 {user.displayName}（role={user.role}）不开放：审计只对 role=admin 可见。
        </p>
      </main>
    );
  }

  const events = await listAudit(100);
  const denied = events.filter((event) => !event.allowed).length;
  return (
    <main className="mx-auto flex max-w-[1080px] flex-col gap-4 px-6 py-10" data-audit-root>
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-[var(--nexus-font-size-21)] font-semibold">审计事件</h1>
          <p className="text-11 text-fg-3" data-audit-summary>
            最近 {events.length} 条 · 其中被拒绝 {denied} 条
          </p>
        </div>
        <AdminNav current="audit" />
      </header>

      <p className="text-11 text-fg-3" data-audit-scope>
        这里记的是决定，不是访问流水：登录与注册（含失败）、人工裁决（含越权与重复裁决尝试）、发布 / 下架 / 取消发布、角色变更。
        失败的登录不记是哪个邮箱——那张表本身会变成可枚举的用户清单。IP 存在库里但默认不摊在这一页上。
      </p>

      {events.length === 0 ? (
        <p className="text-13 text-fg-2" data-audit-empty>
          还没有记下来的事件。
        </p>
      ) : (
        // 审计表六列、时间/动作/细节都不能截断；窄视口下让它自己横滚，
        // 而不是把整页的布局视口撑宽（390 下曾量到 innerWidth 被撑成 1183）
        <div className="overflow-x-auto" data-audit-table-scroll>
        <table className="w-full text-11">
          <thead className="text-left text-fg-3">
            <tr>
              <th>时间</th>
              <th>谁</th>
              <th>动作</th>
              <th>对象</th>
              <th>结果</th>
              <th>细节</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} data-audit-row={event.action}>
                <td>{new Date(event.createdAt).toLocaleString('zh-CN', { hour12: false })}</td>
                <td data-audit-actor={event.actorId ? 'known' : 'none'}>
                  {event.actorName ?? (event.actorId ? DELETED_USER_LABEL : '没有身份')}
                </td>
                <td>{event.action}</td>
                <td>{event.targetType ? `${event.targetType}${event.targetId ? ` ${String(event.targetId).slice(0, 8)}` : ''}` : '—'}</td>
                <td data-audit-allowed={event.allowed ? 'yes' : 'no'}>{event.allowed ? '放行' : '拒绝'}</td>
                <td className="text-fg-3">{event.detail ? JSON.stringify(event.detail) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </main>
  );
}
