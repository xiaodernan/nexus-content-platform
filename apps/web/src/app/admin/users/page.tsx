import Link from 'next/link';
import { countAdmins, listAccounts } from '@/server/domain/roles';
import { currentUserOrNull } from '@/server/domain/session';
import { PlanSelect } from './PlanSelect';
import { RoleButton } from './RoleButton';

export const dynamic = 'force-dynamic';

/**
 * §131 那条"谁是 admin 目前只能由运维改库"的收口页。
 *
 * 自助提权是危险功能，所以页面上把规则写清楚，而不是只放两个按钮：
 * 不能改自己；未认领的 guest 不给提权；改别人的前提是你此刻就是审核员。
 * 三条都在服务端判定（`domain/roles.ts`），这里的按钮只是不让误点在正常路径上发生。
 *
 * 注意页面上那段话**没有**写"最后一个审核员不能被降权"：那条规则刻意不存在，
 * 因为它是够不着的——能改别人的只有审核员，而审核员改自己被第一条挡住，
 * 所以"一个审核员都不剩"从这条路径根本进不去。写下一条不执行的规则会让人
 * 以为它在工作（§159 的反面），页面上那段说明就是把这件事讲清楚而不是假装有保护。
 */
export default async function AdminUsersPage() {
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="mx-auto max-w-[860px] px-6 py-16" data-admin-denied="anonymous">
        <h1 className="text-[var(--nexus-font-size-21)] font-semibold">账号与角色</h1>
        <p className="mt-2 text-13 text-fg-2">需要先登录才能看。</p>
      </main>
    );
  }
  if (user.role !== 'admin') {
    return (
      <main className="mx-auto max-w-[860px] px-6 py-16" data-admin-denied="not-admin">
        <h1 className="text-[var(--nexus-font-size-21)] font-semibold">账号与角色</h1>
        <p className="mt-2 text-13 text-fg-2">
          这个页面对 {user.displayName}（role={user.role}）不开放：角色只对 role=admin 可见可改。
        </p>
      </main>
    );
  }

  const [accounts, admins] = await Promise.all([listAccounts(200), countAdmins()]);
  return (
    <main className="mx-auto flex max-w-[980px] flex-col gap-4 px-6 py-10" data-users-root>
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-[var(--nexus-font-size-21)] font-semibold">账号与角色</h1>
          <p className="text-11 text-fg-3" data-users-summary>
            已认领的账号 {accounts.filter((a) => !a.guest).length} 个 · 未认领的 guest {accounts.filter((a) => a.guest).length} 个 ·
            审核员 {admins} 人
          </p>
        </div>
        <nav className="flex gap-3 text-11">
          <Link href="/admin/audit" className="text-accent-2-ink underline" data-users-audit>
            看审计事件
          </Link>
          <Link href="/admin/realtime" className="text-accent-2-ink underline" data-users-realtime>
            实时总线
          </Link>
          <Link href="/admin/access" className="text-accent-2-ink underline" data-users-access>
            访问账
          </Link>
        </nav>
      </header>

      <p className="text-11 text-fg-3" data-users-rules>
        改角色有三条硬规则：不能改自己的（自己提权等于给会话被盗留后门）；未认领的 guest 不给提权（那种身份新开一个浏览器就有，
        提权等于把审核权发给匿名会话）；以及改别人的前提是你此刻就是审核员。由此有一条不用写的规则——"最后一个审核员不能降权"：
        能降别人的只有审核员，而审核员降自己被第一条挡住，所以"一个审核员都不剩"这个状态从这条路进不去。
        每一次尝试都会记进审计，被拒的那一次也记。
      </p>

      <p className="text-11 text-fg-3" data-users-plan-rules>
        改档位（§133）的入口也在这一行：只有审核员能改，<strong>可以改自己</strong>——这条与改角色刻意不同，
        因为改角色是发权限（自己提权 = 拿到这个会话的人就能变成审核员），改档位是发额度（ADR-0021）。
        这是运营兜底动作，不是购买流程：没有支付、页面上不标价，改完这一档每月发的额度与存储上限跟着变，
        已经在库里的东西一样都不动（§159）。
      </p>

      <ul className="flex flex-col gap-2">
        {accounts.map((account) => (
          <li
            key={account.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded bg-bg-1 px-3 py-2"
            data-account-row={account.handle ?? account.id}
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-13 text-fg-1" data-account-name>
                {account.name}
                {account.handle ? <a href={`/u/${account.handle}`} className="ml-2 text-11 text-accent-2-ink underline">@{account.handle}</a> : null}
                {account.guest ? <span className="ml-2 text-11 text-fg-3">未认领的 guest</span> : null}
              </span>
              <span className="text-11 text-fg-3" data-account-role={account.role}>
                role={account.role} · 注册于 {new Date(account.createdAt).toLocaleDateString('zh-CN')}
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <PlanSelect userId={account.id} plan={account.plan} self={account.id === user.id} handle={account.handle} />
              <RoleButton userId={account.id} handle={account.handle} role={account.role} self={account.id === user.id} guest={account.guest} />
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
