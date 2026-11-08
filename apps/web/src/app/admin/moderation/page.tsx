import Link from 'next/link';
import { listReviewQueue, MODERATION_LIMITS, MODERATION_RULES_VERSION } from '@/server/domain/moderation';
import { currentUserOrNull } from '@/server/domain/session';
import { ResolveButtons } from './ResolveButtons';
import { AdminNav } from '@/components/AdminNav';

export const dynamic = 'force-dynamic';

/**
 * §131 的人工复核台。机检只能把可疑的挂上来，下结论必须是这里——
 * 没有这一页，案子就会永远停在 pending，而 `moderation` 那一列又变回一个没人读的死字段。
 *
 * 默认拒绝：没登录说"要登录"，不是 admin 说"只对审核员开放"，两种都不泄露队列里有什么
 * （连案子数都不给）。谁是 admin 由 `/admin/users` 提权（判定在 `domain/roles.ts`，每次尝试进审计）。
 */
export default async function AdminModerationPage() {
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="mx-auto max-w-[720px] px-6 py-16" data-admin-denied="anonymous">
        <h1 className="text-[var(--nexus-font-size-21)] font-semibold">人工复核台</h1>
        <p className="mt-2 text-13 text-fg-2">需要先登录才能看队列。</p>
      </main>
    );
  }
  if (user.role !== 'admin') {
    return (
      <main className="mx-auto max-w-[720px] px-6 py-16" data-admin-denied="not-admin">
        <h1 className="text-[var(--nexus-font-size-21)] font-semibold">人工复核台</h1>
        <p className="mt-2 text-13 text-fg-2">
          这个页面对 {user.displayName}（role={user.role}）不开放：审核队列只对 role=admin 可见。
        </p>
        <p className="mt-1 text-11 text-fg-3">
          成为审核员要走 <Link href="/admin/users" className="text-accent-2-ink underline">账号与角色</Link>
          由现有审核员提权（不能改自己、guest 不给提权，每次尝试都进审计）。
        </p>
        <Link href="/" className="mt-4 inline-block text-12 text-accent-2-ink underline">
          回到我的项目
        </Link>
      </main>
    );
  }

  const cases = await listReviewQueue();
  return (
    <main className="mx-auto flex max-w-[980px] flex-col gap-[var(--nexus-space-6)] px-6 py-10" data-admin-queue>
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-[var(--nexus-font-size-21)] font-semibold">人工复核台</h1>
          <p className="mt-1 text-12 text-fg-3" data-rules-version={MODERATION_RULES_VERSION}>
            待看 {cases.length} 案 · 规则版本 {MODERATION_RULES_VERSION} · 裁决之后这案就离开队列（放行/拒绝都会）
          </p>
        </div>
        <AdminNav current="moderation" />
      </header>

      {/* 复核的人必须知道机检没看到什么，否则"队列里只剩这几案"会被读成"其余都是干净的" */}
      <section className="rounded-[var(--nexus-radius-sm)] bg-bg-2 p-3" data-queue-limits>
        <p className="text-12 text-fg-2">这一轮机检覆盖不到的部分：</p>
        <ul className="mt-1 space-y-[2px]">
          {MODERATION_LIMITS.map((limit) => (
            <li className="text-11 text-fg-3" data-queue-limit key={limit}>
              · {limit}
            </li>
          ))}
        </ul>
      </section>

      {cases.length === 0 ? (
        <p className="text-13 text-fg-2" data-queue-empty>
          队列里没有待看的案子。这不等于平台内容是干净的：机检只挡得住它写得出规则的那部分。
        </p>
      ) : null}

      {cases.map((entry) => (
        <article
          className="flex flex-col gap-2 rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-subtle)] p-3"
          data-queue-case={entry.caseId}
          key={entry.caseId}
        >
          <header className="flex flex-wrap items-baseline gap-2">
            <span className="text-13 font-semibold text-fg-1" data-case-project>
              {entry.projectName}
            </span>
            <span className="text-11 text-fg-3">
              {entry.ownerName} · 第 {entry.publicationVersion} 版 · {entry.visibility} ·{' '}
              {new Date(entry.createdAt).toLocaleString('zh-CN', { hour12: false })}
            </span>
            <span className="text-11 text-fg-2" data-case-decision={entry.decision}>
              {entry.decision === 'blocked' ? '机检挡下了这次发布' : '机检挂起，页面已发出'}
            </span>
            {entry.reportCount > 0 ? (
              <span className="text-11 text-danger-ink" data-case-reports={String(entry.reportCount)}>
                另有 {entry.reportCount} 条举报
              </span>
            ) : null}
          </header>
          <ul className="flex flex-col gap-1">
            {entry.findings.map((finding, i) => (
              <li className="text-11 text-fg-2" data-case-finding={finding.rule} key={`${finding.rule}-${i}`}>
                <span className="font-mono text-fg-3">{finding.rule}</span> · {finding.why}
                <span className="block text-fg-3">
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
              className="inline-flex min-h-6 items-center rounded px-1 text-11 text-accent-2-ink underline"
              data-case-open
            >
              打开这一版看看
            </a>
          ) : (
            <span className="text-11 text-fg-3" data-case-open="none">
              这次发布没发出去，所以没有页面可看
            </span>
          )}
          <ResolveButtons caseId={entry.caseId} />
        </article>
      ))}
    </main>
  );
}
