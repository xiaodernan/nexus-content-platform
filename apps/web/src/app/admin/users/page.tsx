import { countAdmins, listAccounts } from '@/server/domain/roles';
import { currentUserOrNull } from '@/server/domain/session';
import { scanGuestReclaimCandidates } from '@/server/domain/guest-reclaim';
import { PlanSelect } from './PlanSelect';
import { RoleButton } from './RoleButton';
import { GuestReclaimPanel } from './GuestReclaimPanel';
import { AdminNav } from '@/components/AdminNav';
import { getLocale, type Locale } from '@/lib/i18n';

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
 *
 * 过期访客回收那块面板（ADR-0072）挂在同一个页面上，但它的读数是**这次渲染算的快照**：
 * 判据里全是时间，快照挂几分钟就可能是假话，所以面板自己带「重新数一遍」。
 * 扫描放在那两条 return 之后——非审核员连"此刻有几个沉默 guest"都不该问出来，
 * 那是一句能被人拿来反复探测的计数。
 */
const COPY: Record<Locale, {
  deniedAnonymous: string;
  deniedNotAdmin: (name: string, role: string) => string;
  title: string;
  summary: (claimed: number, guests: number, admins: number) => string;
  rules: string;
  planRules: string;
  guestTag: string;
  roleLine: (role: string, day: string) => string;
}> = {
  zh: {
    deniedAnonymous: '需要先登录才能看。',
    deniedNotAdmin: (name, role) => `这个页面对 ${name}（role=${role}）不开放：角色只对 role=admin 可见可改。`,
    title: '账号与角色',
    summary: (claimed, guests, admins) => `已认领的账号 ${claimed} 个 · 未认领的 guest ${guests} 个 · 审核员 ${admins} 人`,
    rules: '改角色有三条硬规则：不能改自己的（自己提权等于给会话被盗留后门）；未认领的 guest 不给提权（那种身份新开一个浏览器就有，提权等于把审核权发给匿名会话）；以及改别人的前提是你此刻就是审核员。由此有一条不用写的规则——"最后一个审核员不能降权"：能降别人的只有审核员，而审核员降自己被第一条挡住，所以"一个审核员都不剩"这个状态从这条路进不去。每一次尝试都会记进审计，被拒的那一次也记。',
    planRules: '改档位（§133）的入口也在这一行：只有审核员能改，可以改自己——这条与改角色刻意不同，因为改角色是发权限（自己提权 = 拿到这个会话的人就能变成审核员），改档位是发额度（ADR-0021）。这是运营兜底动作，不是购买流程：没有支付、页面上不标价，改完这一档每月发的额度与存储上限跟着变，已经在库里的东西一样都不动（§159）。',
    guestTag: '未认领的 guest',
    roleLine: (role, day) => `role=${role} · 注册于 ${day}`,
  },
  en: {
    deniedAnonymous: 'You must sign in first.',
    deniedNotAdmin: (name, role) => `This page is not open to ${name} (role=${role}): roles are visible and editable only by role=admin.`,
    title: 'Accounts & roles',
    summary: (claimed, guests, admins) => `Claimed accounts ${claimed} · unclaimed guests ${guests} · admins ${admins}`,
    rules: 'Three hard rules govern role edits: no editing your own (self-promotion hands a stolen session a role); no promoting unclaimed guests (anyone with a new browser can get there, promotion hands review power to anonymous sessions); and editing someone else presumes you are an admin right now. Which implies one rule that does not need to be written — “the last admin cannot be demoted”: only an admin can demote others, and an admin demoting themselves is blocked by the first rule — so “not a single admin left” is unreachable from this path. Every attempt is written to the audit log, including denied ones.',
    planRules: 'The tier entry (§133) sits on the same line: only admins can change it, and they can change their own — deliberately unlike roles, because roles are permissions (self-promotion means whoever holds this session can become an admin), while tiers are quotas (ADR-0021). This is an operations fallback, not a purchase flow: no payment, no price shown, the tier takes effect for next month’s allowance and storage cap, nothing already in the library moves (§159).',
    guestTag: 'Unclaimed guest',
    roleLine: (role, day) => `role=${role} · joined ${day}`,
  },
};

export default async function AdminUsersPage() {
  const locale = await getLocale();
  const c = COPY[locale];
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
      </main>
    );
  }

  const [accounts, admins, reclaim] = await Promise.all([listAccounts(200), countAdmins(), scanGuestReclaimCandidates()]);
  return (
    <main className="au-shell" data-users-root>
      <header className="adm-headBaseline">
        <div>
          <h1 className="adm-deniedTitle">{c.title}</h1>
          <p className="adm-capNote" data-users-summary>
            {c.summary(accounts.filter((a) => !a.guest).length, accounts.filter((a) => a.guest).length, admins)}
          </p>
        </div>
        <AdminNav current="users" />
      </header>

      <p className="adm-capNote" data-users-rules>
        {c.rules}
      </p>

      <p className="adm-capNote" data-users-plan-rules>
        {c.planRules}
      </p>

      <GuestReclaimPanel scan={reclaim} locale={locale} />

      <ul className="au-list">
        {accounts.map((account) => (
          <li
            key={account.id}
            className="au-row"
            data-account-row={account.handle ?? account.id}
          >
            <span className="au-rowMain">
              <span className="au-rowName" data-account-name>
                {account.name}
                {account.handle ? (
                  <a
                    href={`/u/${account.handle}`}
                    className="am-linkTargetSub"
                  >
                    @{account.handle}
                  </a>
                ) : null}
                {account.guest ? <span className="au-guestTag">{c.guestTag}</span> : null}
              </span>
              <span className="adm-capNote" data-account-role={account.role}>
                {c.roleLine(account.role, new Date(account.createdAt).toLocaleDateString(locale === 'en' ? 'en-US' : 'zh-CN'))}
              </span>
            </span>
            <span className="au-actions">
              <PlanSelect userId={account.id} plan={account.plan} self={account.id === user.id} handle={account.handle} locale={locale} />
              <RoleButton userId={account.id} handle={account.handle} role={account.role} self={account.id === user.id} guest={account.guest} locale={locale} />
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
