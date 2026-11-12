import Link from 'next/link';
import { currentUserOrNull } from '@/server/domain/session';
import { RealtimeStatsPanel } from './StatsPanel';
import { AdminNav } from '@/components/AdminNav';

export const dynamic = 'force-dynamic';

/**
 * §163 的诊断入口（ADR-0028 那一档"明确不做的第三件"）：`wireErrorCount` / `ready`
 * 在此之前只住在 stderr 与测试里——界面上看不见"这台实例掉了几帧"。
 * 三句限度写在页面上，因为它们各自都能被误读：
 * - 问的是**这台实例**（多实例部署下每台各算各的；回答这次请求的那台会说话，别台不会）。
 * - 进程内驱动没有线路，那两格是"不适用"不是 0。
 * - 失败的帧不补发（ADR-0028 的语义选择，补发要另立 ADR），权威状态永远在库里。
 */
export default async function AdminRealtimePage() {
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="mx-auto flex max-w-[860px] flex-col gap-3 px-6 py-16" data-admin-denied="anonymous">
        <p className="text-10 font-mono uppercase tracking-[0.35em] text-fg-3">NEXUS · ADMIN · REALTIME</p>
        <h1 className="mt-2 text-[var(--nexus-font-size-24)] font-semibold">实时总线状态</h1>
        <p className="text-13 text-fg-2">需要先登录才能看。</p>
      </main>
    );
  }
  if (user.role !== 'admin') {
    return (
      <main className="mx-auto flex max-w-[860px] flex-col gap-3 px-6 py-16" data-admin-denied="not-admin">
        <p className="text-10 font-mono uppercase tracking-[0.35em] text-fg-3">NEXUS · ADMIN · REALTIME</p>
        <h1 className="mt-2 text-[var(--nexus-font-size-24)] font-semibold">实时总线状态</h1>
        <p className="text-13 text-fg-2">
          这个页面对 {user.displayName}（role={user.role}）不开放：实时总线状态只对 role=admin 可见。
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-[980px] flex-col gap-5 px-6 py-8" data-realtime-admin-root>
      {/* hero：与其他 admin 页面同语言。第一句必须是标题，无先有 <p> 顺位。 */}
      <header className="relative overflow-hidden rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] bg-bg-1 px-6 py-6">
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-[var(--nexus-color-brand)] opacity-[0.14] blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-[var(--nexus-color-accent-2)] opacity-[0.14] blur-3xl" />
        <p className="relative text-10 font-mono uppercase tracking-[0.35em] text-fg-3">NEXUS · ADMIN · REALTIME</p>
        <h1 className="relative mt-2 inline-block bg-gradient-to-br from-[#eef1f6] via-[#8b9cf8] to-[var(--nexus-color-accent-1)] bg-clip-text pb-2 text-[var(--nexus-font-size-28)] font-bold tracking-tight text-transparent">
          实时总线状态
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[var(--nexus-color-brand)] to-transparent opacity-70"
          />
        </h1>
        <p className="relative mt-2 text-12 text-fg-3" data-realtime-summary>
          驱动是谁、跨实例线路接上没有、这台实例断过几帧、本进程有几个人在听（§163 诊断入口）。
        </p>
        <div className="relative mt-4 flex flex-wrap items-center justify-between gap-3">
          <AdminNav current="realtime" />
          <Link href="/admin/observability" className="text-11 text-accent-2-ink underline" data-realtime-observability-link>
            看 process / ledger 账 →
          </Link>
        </div>
      </header>

      <p className="rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] bg-bg-2/60 px-4 py-3 text-11 leading-6 text-fg-3" data-realtime-scope>
        这里记的是 <strong>这台实例</strong> 的线路：多实例部署下每台各算各的，回答这次请求的那台会说话，别台不会。
        实时通道是加速器不是权威来源——失败的帧不补发，界面上每个数字都按这个口径读。
      </p>

      <div className="rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] bg-bg-1 p-5">
        <RealtimeStatsPanel />
      </div>
    </main>
  );
}
