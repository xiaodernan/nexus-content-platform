import Link from 'next/link';
import { listReviewQueue, MODERATION_LIMITS, MODERATION_RULES_VERSION } from '@/server/domain/moderation';
import { currentUserOrNull } from '@/server/domain/session';
import { ResolveButtons } from './ResolveButtons';
import { AdminNav } from '@/components/AdminNav';
import { BrandTitle } from '@/components/BrandTitle';

export const dynamic = 'force-dynamic';

/**
 * §131 的人工复核台。机检只能把可疑的挂上来，下结论必须是这里——
 * 没有这一页，案子就会永远停在 pending，让 moderation 那一列又变回一个没人读的死字段。
 *
 * 默认拒绝：没登录要"登录"，不 admin 说"只对审核员开"，两种都不泄露队列里有什么
 * （连案子数都不给）。谁是 admin 在 /admin/users 提权（判定在 domain/roles.ts，每次尝试进审计）。
 */
export default async function AdminModerationPage() {
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="mx-auto flex max-w-[860px] flex-col gap-3 px-6 py-16" data-admin-denied="anonymous">
        <p className="text-10 font-mono uppercase tracking-[0.35em] text-fg-3">NEXUS · ADMIN · MODERATION</p>
        <h1 className="mt-2 text-[var(--nexus-font-size-24)] font-semibold">人工复核台</h1>
        <p className="text-13 text-fg-2">需要先登录才能看队列。</p>
      </main>
    );
  }
  if (user.role !== 'admin') {
    return (
      <main className="mx-auto flex max-w-[860px] flex-col gap-3 px-6 py-16" data-admin-denied="not-admin">
        <p className="text-10 font-mono uppercase tracking-[0.35em] text-fg-3">NEXUS · ADMIN · MODERATION</p>
        <h1 className="mt-2 text-[var(--nexus-font-size-24)] font-semibold">人工复核台</h1>
        <p className="text-13 text-fg-2">
          这个页面对 {user.displayName}（role={user.role}）不开放：审核队列只对 role=admin 可见。
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

  const cases = await listReviewQueue();
  return (
    <main className="mx-auto flex max-w-[980px] flex-col gap-5 px-6 py-8" data-admin-queue>
      <header className="relative overflow-hidden rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] bg-bg-1 px-6 py-6">
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-[var(--nexus-color-brand)] opacity-[0.14] blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-16 -left-14 h-48 w-48 rounded-full bg-[var(--nexus-color-accent-2)] opacity-[0.14] blur-3xl" />
        <p className="relative text-10 font-mono uppercase tracking-[0.35em] text-fg-3">NEXUS · ADMIN · MODERATION</p>
        <BrandTitle className="relative mt-2 inline-block text-gradient-brand pb-2 text-28 font-bold tracking-tight">
          人工复核台
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[var(--nexus-color-brand)] to-transparent opacity-70"
          />
        </BrandTitle>
        <p className="relative mt-2 text-12 text-fg-3" data-rules-version={MODERATION_RULES_VERSION}>
          待看 {cases.length} 条 · 规则版本 {MODERATION_RULES_VERSION} · 裁决之后这案就离开队列（放行或拒绝都会）。
        </p>
        <p className="relative mt-1 text-11 text-warn-ink" data-queue-limits-banner>
          机检只挡得住它写得出规则的那部分 —— 看下方"机检覆盖不到的部分"再决定放不放行。
        </p>
        <div className="relative mt-4 flex flex-wrap items-center justify-between gap-3">
          <AdminNav current="moderation" />
          <Link href="/admin/audit" className="text-11 text-accent-2-ink underline" data-moderation-audit-link>
            裁决记录都进审计 →
          </Link>
        </div>
      </header>

      {/* 复核的人必须知道机检没看到什么，否则"队列里只剩这几案"会被读成"其余都是干净的" */}
      <section className="rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] bg-bg-2/60 p-4" data-queue-limits>
        <p className="text-12 font-semibold text-fg-1">这一轮机检覆盖不到的部分：</p>
        <ul className="mt-2 list-none space-y-1 text-11 text-fg-3">
          {MODERATION_LIMITS.map((limit) => (
            <li className="flex gap-2" data-queue-limit key={limit}>
              <span aria-hidden="true" className="text-fg-3">—</span>
              <span>{limit}</span>
            </li>
          ))}
        </ul>
      </section>

      {cases.length === 0 ? (
        <p className="rounded-[var(--nexus-radius-md)] border border-dashed border-[var(--nexus-color-border-subtle)] bg-bg-1 px-6 py-10 text-center text-13 text-fg-2" data-queue-empty>
          队列里没有待看的案子。这不等于平台内容是干净的：机检只挡得住它写得出规则的那部分。
        </p>
      ) : null}

      {cases.map((entry) => (
        <article
          className="flex flex-col gap-2 rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] bg-bg-1 p-4"
          data-queue-case={entry.caseId}
          key={entry.caseId}
        >
          <header className="flex flex-wrap items-baseline gap-3">
            <span className="text-13 font-semibold text-fg-1" data-case-project>
              {entry.projectName}
            </span>
            <span className="text-11 text-fg-3">
              {entry.ownerName} · 第 {entry.publicationVersion} 版 · {entry.visibility} ·{' '}
              {new Date(entry.createdAt).toLocaleString('zh-CN', { hour12: false })}
            </span>
            <span className="rounded-full border border-[var(--nexus-color-border-subtle)] bg-bg-2 px-2 py-0.5 text-11 text-fg-2" data-case-decision={entry.decision}>
              {entry.decision === 'blocked' ? '机检挡下了这次发布' : '机检挂起，页面已发出'}
            </span>
            {entry.reportCount > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--nexus-color-border-subtle)] bg-danger-bg-2 px-2 py-0.5 text-11 text-danger-ink" data-case-reports={String(entry.reportCount)}>
                另有 {entry.reportCount} 条举报
              </span>
            ) : null}
          </header>
          <ul className="flex flex-col gap-2">
            {entry.findings.map((finding, i) => (
              <li className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-subtle)] bg-bg-2/40 px-3 py-2 text-11 text-fg-2" data-case-finding={finding.rule} key={`${finding.rule}-${i}`}>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-fg-3">{finding.rule}</span>
                  <span aria-hidden="true" className="text-fg-3">·</span>
                  <span>{finding.why}</span>
                </div>
                <span className="mt-1 block text-fg-3">
                  位置 {finding.where} · 「{finding.quote}」
                </span>
              </li>
            ))}
          </ul>
          {entry.path ? (
            <a
              href={entry.path}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit min-h-6 items-center rounded px-1 text-11 text-accent-2-ink underline"
              data-case-open
            >
              打开这一版看看 →
            </a>
          ) : (
            <span className="text-11 text-fg-3" data-case-open="none">
              这次发布没发出去，所以没有页面可看。
            </span>
          )}
          <ResolveButtons caseId={entry.caseId} />
        </article>
      ))}
    </main>
  );
}
