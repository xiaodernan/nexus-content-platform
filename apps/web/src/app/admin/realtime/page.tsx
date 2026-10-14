import Link from 'next/link';
import { currentUserOrNull } from '@/server/domain/session';
import { RealtimeStatsPanel } from './StatsPanel';

export const dynamic = 'force-dynamic';

/**
 * §163 的诊断入口（ADR-0028 那一片"明确不做的第三件"）：`wireErrorCount` / `ready`
 * 在此之前只住在 stderr 与测试里——界面上看不见"这台实例掉了几帧"。
 *
 * 三句限度写在页面上，因为它们各自都能被误读：
 * - 问的是**这台实例**（多实例部署下每台各算各的；回答这次请求的那台会说话，别台不会）；
 * - 进程内驱动没有线路，那两格是"不适用"不是 0；
 * - 失败的帧不补发（ADR-0028 的语义选择，补发要另立 ADR），权威状态永远在库里。
 */
export default async function AdminRealtimePage() {
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="mx-auto max-w-[860px] px-6 py-16" data-admin-denied="anonymous">
        <h1 className="text-[var(--nexus-font-size-21)] font-semibold">实时总线状态</h1>
        <p className="mt-2 text-13 text-fg-2">需要先登录才能看。</p>
      </main>
    );
  }
  if (user.role !== 'admin') {
    return (
      <main className="mx-auto max-w-[860px] px-6 py-16" data-admin-denied="not-admin">
        <h1 className="text-[var(--nexus-font-size-21)] font-semibold">实时总线状态</h1>
        <p className="mt-2 text-13 text-fg-2">
          这个页面对 {user.displayName}（role={user.role}）不开放：实时总线状态只对 role=admin 可见。
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-[860px] flex-col gap-4 px-6 py-10" data-realtime-admin-root>
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-[var(--nexus-font-size-21)] font-semibold">实时总线状态</h1>
          <p className="text-11 text-fg-3" data-realtime-summary>
            驱动是谁、跨实例线路接上没有、这台实例断过几帧、本进程有几个人在听（§163 诊断入口）
          </p>
        </div>
        <nav className="flex gap-3 text-11">
          <Link href="/admin/users" className="text-accent-2 underline" data-realtime-users>
            账号与角色
          </Link>
          <Link href="/admin/moderation" className="text-accent-2 underline" data-realtime-moderation>
            复核台
          </Link>
          <Link href="/admin/audit" className="text-accent-2 underline" data-realtime-audit>
            审计事件
          </Link>
        </nav>
      </header>

      <p className="text-11 text-fg-3" data-realtime-scope>
        这里记的是<strong>这台实例</strong>的线路：多实例部署下每台各算各的，回答这次请求的那台会说话，别台不会。
        实时通道是加速器不是权威来源——失败的帧不补发，界面上每个数字都按这个口径读。
      </p>

      <RealtimeStatsPanel />
    </main>
  );
}
