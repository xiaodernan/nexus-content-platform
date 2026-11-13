import Link from 'next/link';
import { listAudit, DELETED_USER_LABEL } from '@/server/domain/audit';
import { currentUserOrNull } from '@/server/domain/session';
import { AdminNav } from '@/components/AdminNav';
import { BrandTitle } from '@/components/BrandTitle';

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
      <main className="mx-auto flex max-w-[860px] flex-col gap-3 px-6 py-16" data-admin-denied="anonymous">
        <p className="text-10 font-mono uppercase tracking-[0.35em] text-fg-3">NEXUS · ADMIN · AUDIT</p>
        <h1 className="mt-2 text-[var(--nexus-font-size-24)] font-semibold">审计事件</h1>
        <p className="text-13 text-fg-2">需要先登录才能看。</p>
      </main>
    );
  }
  if (user.role !== 'admin') {
    return (
      <main className="mx-auto flex max-w-[860px] flex-col gap-3 px-6 py-16" data-admin-denied="not-admin">
        <p className="text-10 font-mono uppercase tracking-[0.35em] text-fg-3">NEXUS · ADMIN · AUDIT</p>
        <h1 className="mt-2 text-[var(--nexus-font-size-24)] font-semibold">审计事件</h1>
        <p className="text-13 text-fg-2">
          这个页面对 {user.displayName}（role={user.role}）不开放：审计只对 role=admin 可见。
        </p>
      </main>
    );
  }

  const events = await listAudit(100);
  const denied = events.filter((event) => !event.allowed).length;
  const allowed = events.length - denied;
  return (
    <main className="mx-auto flex max-w-[1080px] flex-col gap-5 px-6 py-8" data-audit-root>
      <header className="relative overflow-hidden rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] bg-bg-1 px-6 py-6">
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-[var(--nexus-color-brand)] opacity-[0.14] blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-16 -left-14 h-48 w-48 rounded-full bg-[var(--nexus-color-accent-2)] opacity-[0.14] blur-3xl" />
        <p className="relative text-10 font-mono uppercase tracking-[0.35em] text-fg-3">NEXUS · ADMIN · AUDIT</p>
        <BrandTitle className="relative mt-2 inline-block text-gradient-brand pb-2 text-28 font-bold tracking-tight">
          审计事件
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[var(--nexus-color-brand)] to-transparent opacity-70"
          />
        </BrandTitle>
        <p className="relative mt-2 text-12 text-fg-3" data-audit-summary>
          最多 {events.length} 条 · 其中被拒 {denied} 条 · 放行 {allowed} 条。
        </p>
        <div className="relative mt-4 flex flex-wrap items-center justify-between gap-3">
          <AdminNav current="audit" />
          <Link href="/admin/users" className="text-11 text-accent-2-ink underline" data-audit-users-link>
            角色变更在这里发生 →
          </Link>
        </div>
      </header>

      <p className="rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] bg-bg-2/60 px-4 py-3 text-11 leading-6 text-fg-3" data-audit-scope>
        这里记的是决定，不是访问流水：登录与注册（含失败）、人工裁决（含越权与重复裁决尝试）、发布 / 下架 / 取消发布、角色变更。
        失败的登录不记是哪个邮箱——那张表本身会变成可枚举的用户清单。IP 存在库里但默认不摊在这一页上。
      </p>

      {events.length === 0 ? (
        <p className="rounded-[var(--nexus-radius-md)] border border-dashed border-[var(--nexus-color-border-subtle)] bg-bg-1 px-6 py-10 text-center text-13 text-fg-2" data-audit-empty>
          还没有记下来的事件。
        </p>
      ) : (
        // 审计表六列、时间/动作/细节都不能截断；窄视口下让它自己横滚。
        // 而不是把整页的布局视口撑宽。
        // 第五十一片：390 下表格只剩 342 宽里首列（时间被拆字），而横滚区没有 tabindex
        // ——键盘用户看得到「细节」那一列却滚不过去（axe: scrollable-region-focusable）。
        <div
          className="overflow-x-auto rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] bg-bg-1"
          data-audit-table-scroll
          role="region"
          aria-label="审计事件表（可横向滚动）"
          tabIndex={0}
        >
        <table className="w-full text-11">
          <thead className="text-left text-fg-3">
            <tr>
              <th className="whitespace-nowrap px-3 py-2 font-normal">时间</th>
              <th className="whitespace-nowrap px-3 py-2 font-normal">谁</th>
              <th className="whitespace-nowrap px-3 py-2 font-normal">动作</th>
              <th className="whitespace-nowrap px-3 py-2 font-normal">对象</th>
              <th className="whitespace-nowrap px-3 py-2 font-normal">结果</th>
              <th className="whitespace-nowrap px-3 py-2 font-normal">细节</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} data-audit-row={event.action} className="border-t border-[var(--nexus-color-border-subtle)] hover:bg-[var(--nexus-color-bg-2)]">
                <td className="whitespace-nowrap px-3 py-2 font-mono">{new Date(event.createdAt).toLocaleString('zh-CN', { hour12: false })}</td>
                <td className="whitespace-nowrap px-3 py-2" data-audit-actor={event.actorId ? 'known' : 'none'}>
                  {event.actorName ?? (event.actorId ? DELETED_USER_LABEL : '没有身份')}
                </td>
                <td className="whitespace-nowrap px-3 py-2">{event.action}</td>
                <td className="px-3 py-2">{event.targetType ? `${event.targetType}${event.targetId ? ` ${String(event.targetId).slice(0, 8)}` : ''}` : '—'}</td>
                <td className="whitespace-nowrap px-3 py-2" data-audit-allowed={event.allowed ? 'yes' : 'no'}>
                  <span className={event.allowed ? 'text-success-ink' : 'text-danger-ink'}>{event.allowed ? '放行' : '拒绝'}</span>
                </td>
                {/* 细节是长串 JSON；允许在任意位置断开，宽屏才不必为它横滚 */}
                <td className="break-words px-3 py-2 font-mono">{event.detail ? (typeof event.detail === 'string' ? event.detail : JSON.stringify(event.detail)) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </main>
  );
}
