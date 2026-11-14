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
      <main className="adm-denied" data-admin-denied="anonymous">
        <h1 className="adm-deniedTitle">审计事件</h1>
        <p className="adm-deniedText">需要先登录才能看。</p>
      </main>
    );
  }
  if (user.role !== 'admin') {
    return (
      <main className="adm-denied" data-admin-denied="not-admin">
        <h1 className="adm-deniedTitle">审计事件</h1>
        <p className="adm-deniedText">
          这个页面对 {user.displayName}（role={user.role}）不开放：审计只对 role=admin 可见。
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
          <h1 className="adm-deniedTitle">审计事件</h1>
          <p className="adm-capNote" data-audit-summary>
            最近 {events.length} 条 · 其中被拒绝 {denied} 条
          </p>
        </div>
        <AdminNav current="audit" />
      </header>

      <p className="adm-capNote" data-audit-scope>
        这里记的是决定，不是访问流水：登录与注册（含失败）、人工裁决（含越权与重复裁决尝试）、发布 / 下架 / 取消发布、角色变更。
        失败的登录不记是哪个邮箱——那张表本身会变成可枚举的用户清单。IP 存在库里但默认不摊在这一页上。
      </p>

      {events.length === 0 ? (
        <p className="am-empty" data-audit-empty>
          还没有记下来的事件。
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
          aria-label="审计事件表（可横向滚动）"
          tabIndex={0}
        >
        <table className="tl-table">
          <thead className="tl-thRow">
            <tr>
              <th className="tl-tdNowrap">时间</th>
              <th className="tl-tdNowrap">谁</th>
              <th className="tl-tdNowrap">动作</th>
              <th className="tl-tdNowrap">对象</th>
              <th className="tl-tdNowrap">结果</th>
              <th className="tl-tdNowrap">细节</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} data-audit-row={event.action}>
                <td className="tl-tdNowrap">{new Date(event.createdAt).toLocaleString('zh-CN', { hour12: false })}</td>
                <td className="tl-tdNowrap" data-audit-actor={event.actorId ? 'known' : 'none'}>
                  {event.actorName ?? (event.actorId ? DELETED_USER_LABEL : '没有身份')}
                </td>
                <td className="tl-tdNowrap">{event.action}</td>
                <td>{event.targetType ? `${event.targetType}${event.targetId ? ` ${String(event.targetId).slice(0, 8)}` : ''}` : '—'}</td>
                <td className="tl-tdNowrap" data-audit-allowed={event.allowed ? 'yes' : 'no'}>{event.allowed ? '放行' : '拒绝'}</td>
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
