import Link from 'next/link';
import type { ReactElement } from 'react';
import { inbox, type InboxItem } from '@/server/domain/notifications';
import { NOTIFICATION_KINDS, NOTIFICATION_TERMINAL_STATE } from '@/lib/notify-plan';
import { currentUserOrNull } from '@/server/domain/session';
import { MarkRead } from '@/components/NotificationActions';
import { NotificationBell } from '@/components/NotificationBell';
import { NotificationSettings } from '@/components/NotificationSettings';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<InboxItem['kind'], string> = {
  publish: '发布',
  moderation: '审核',
  like: '点赞',
  comment: '评论',
  follow: '关注',
  remix: '改编',
  generation: '生成',
  agent: 'Agent',
  approval: '审批作废',
  build: '导出',
  marketplace_report: '举报结论',
  team: '团队',
  other: '未分类',
};

/** 时间戳 UTC 印：§168 的归属日就是按 UTC 切的，两处用两套时区只会对不上 */
function stamp(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/**
 * "会通知的"这份清单是 `NOTIFICATION_KINDS` 现算，不是手抄的名单（任务 #94 修的就是抄漏的那一版）。
 * "不通知"反过来：那是刻意的排除，写下来才有意义，所以它留成字面清单。
 */
const KIND_ORDER = Object.keys(NOTIFICATION_KINDS) as (keyof typeof NOTIFICATION_TERMINAL_STATE)[];

const NOT_NOTIFIED = [
  '取消点赞 / 取消关注：那是"没发生"，不是一条新消息',
  '收藏（Save）：作者看得见收藏数，但谁收了不在收件箱里',
  '被机检当场挡下的那次发布：原因在你提交的那一次请求里已经给全了，没有延后发生的事',
  '你自己的浏览与自己的点赞：自己对自己做的事不通知',
];

/** 收件箱的数据钩子（data-notification-*）是 e2e、键盘路径与生产者普查共用的靶子：搬家可以改样式，改名不行 */
function Row({ item }: { item: InboxItem }): ReactElement {
  return (
    <li
      className="group relative flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-[var(--nexus-color-border-subtle)] px-3 py-3 transition-colors last:border-b-0 hover:bg-[var(--nexus-color-bg-2)]"
      data-notification-item={item.id}
      data-notification-kind={item.kind}
      data-notification-read={item.read ? 'yes' : 'no'}
    >
      {item.read ? null : (
        <span
          aria-hidden="true"
          className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-[var(--nexus-color-brand)]"
        />
      )}
      <span className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-subtle)] bg-[var(--nexus-color-bg-2)] px-2 py-0.5 text-12 font-mono uppercase tracking-wide text-fg-3">
        {KIND_LABEL[item.kind]}
      </span>
      <span className={item.read ? 'text-13 text-fg-3' : 'text-13 font-medium text-fg-1'} data-notification-title>
        {item.title}
      </span>
      {item.body ? <span className="w-full text-12 text-fg-3">「{item.body}」</span> : null}
      <span className="ml-auto text-12 font-mono tabular-nums text-fg-3">{stamp(item.createdAt)}</span>
      {item.link ? (
        <Link
          href={item.link}
          className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-subtle)] bg-[var(--nexus-color-bg-1)] px-2 py-0.5 text-12 text-accent-2-ink no-underline transition-colors hover:border-[var(--nexus-color-brand)] hover:text-fg-1"
          data-notification-link
        >
          打开 →
        </Link>
      ) : (
        <span className="text-12 text-warn-ink" data-notification-unavailable={item.unavailable ?? '未知'}>
          {item.unavailable ?? '没有可跳转的页面'}
        </span>
      )}
      {item.read ? null : <MarkRead ids={[item.id]} label="标记已读" />}
    </li>
  );
}

/** 铃铛衬线：空态与成员行共用的装饰，不承载信息，纯 aria-hidden */
function BellGlyph({ className }: { className?: string }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M6 9.5a6 6 0 0 1 12 0c0 4.5 1.5 6.5 2 7.5H4c.5-1 2-3 2-7.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M10 20a2.2 2.2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * §164 收件箱。注册表里的每一类都要有真终态可挂，才允许出现在这一页—
 * 这句话的"每一类"是 `NOTIFICATION_KINDS` 现算，不是这里手抄的名单。
 * 支持分页：默认第 1 页、每页 50 条；超过一页时显示"另有 N 条未列出"并给出翻页按钮。
 */
export default async function NotificationsPage({ searchParams }: { searchParams?: Promise<{ page?: string }> }) {
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="mx-auto max-w-[900px] px-6 py-16" data-notification-denied="anonymous">
        <p className="text-12 font-mono uppercase tracking-[0.35em] text-fg-3">NEXUS · INBOX</p>
        <h1 className="mt-2 text-[var(--nexus-font-size-21)] font-semibold">通知</h1>
        <p className="mt-2 text-13 text-fg-2">需要先登录：收件箱按人存放，没有身份就没有可归属的那一份。</p>
        <Link
          href="/"
          className="mt-4 inline-flex items-center gap-1 rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] px-4 py-2 text-13 text-accent-2-ink no-underline transition-colors hover:border-[var(--nexus-color-brand)]"
        >
          ← 回到首页
        </Link>
      </main>
    );
  }

  // searchParams 在这一版 Next 里是 Promise：不同步 await 就永远是 undefined。
  // 于是 `?page=N` 被静默吞掉、翻页按钮点了也停在第一页（本页其余各处都已 await 写法）。
  const params = (await searchParams) ?? {};
  const currentPage = Math.max(1, parseInt(params.page ?? '1', 10) || 1);
  const page = await inbox(user.id, { page: currentPage, limit: 50 });
  const unreadIds = page.items.filter((item) => !item.read).map((item) => item.id);
  const pageNumber = page.pagination?.page ?? currentPage;

  return (
    <main className="mx-auto max-w-[1140px] px-6 py-8" data-notification-page>
      {/* hero：第一个 <p> 必须是订单行（e2e 读 [data-notification-page] p 取第一个），别往这行上面加 <p> */}
      <header className="relative overflow-hidden rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] bg-bg-1 px-6 py-7 sm:px-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[var(--nexus-color-brand)] opacity-[0.10] blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-28 -left-20 h-64 w-64 rounded-full bg-[var(--nexus-color-accent-2)] opacity-[0.12] blur-3xl"
        />
        <p className="relative text-13 text-fg-3">
          {user.displayName} · 共 {page.total} 条 · 未读 {page.unread} 条 · 只有你能看到这一份
        </p>
        <h1 className="relative mt-2 inline-block bg-gradient-to-br from-[#eef1f6] via-[#8b9cf8] to-[var(--nexus-color-accent-1)] bg-clip-text pb-2 text-28 font-bold tracking-tight text-transparent">
          通知
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[var(--nexus-color-brand)] to-transparent opacity-70"
          />
        </h1>
        <div className="relative mt-4 flex flex-wrap items-center gap-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] bg-[var(--nexus-color-bg-2)] px-3 py-2 text-center sm:min-w-[5.5rem]">
              <div className="text-21 font-bold tabular-nums leading-6 text-fg-1">{page.unread}</div>
              <div className="text-12 font-mono uppercase tracking-widest text-fg-3">未读</div>
            </div>
            <div className="rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] bg-[var(--nexus-color-bg-2)] px-3 py-2 text-center sm:min-w-[5.5rem]">
              <div className="text-21 font-bold tabular-nums leading-6 text-fg-1">{page.total}</div>
              <div className="text-12 font-mono uppercase tracking-widest text-fg-3">全部</div>
            </div>
            <div className="rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] bg-[var(--nexus-color-bg-2)] px-3 py-2 text-center sm:min-w-[5.5rem]">
              <div className="text-21 font-bold tabular-nums leading-6 text-fg-1">{pageNumber}</div>
              <div className="text-12 font-mono uppercase tracking-widest text-fg-3">页</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <NotificationBell />
            {unreadIds.length > 0 ? (
              <span className="inline-flex">
                <MarkRead all label="全部标记已读" />
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* 左栏：收件箱本体 */}
        <section>
          {page.items.length === 0 ? (
            <div
              className="flex flex-col items-center rounded-[var(--nexus-radius-md)] border border-dashed border-[var(--nexus-color-border-subtle)] bg-bg-1 px-6 py-16 text-center"
              data-notification-empty
            >
              <BellGlyph className="h-10 w-10 text-fg-3 opacity-60" />
              <p className="mt-4 max-w-md text-13 leading-6 text-fg-3">
                还没有通知。这不是"系统没有产生消息"，而是还没有人做过与你有关的事。
                只有真到了终态、而且收件人是你的一件事才会写到这里，下方"会通知的"逐类列了各自挂在哪一次收尾上。
              </p>
              <Link href="/" className="mt-5 text-13 text-accent-2-ink underline">
                回到首页 →
              </Link>
            </div>
          ) : (
            <div className="overflow-hidden rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] bg-bg-1">
              <ul className="py-1">
                {page.items.map((item) => (
                  <Row key={item.id} item={item} />
                ))}
              </ul>
              {page.pagination ? (
                <div className="flex items-center justify-between border-t border-[var(--nexus-color-border-subtle)] px-4 py-3">
                  <p className="text-12 text-fg-3">
                    第 {page.pagination.page} 页 · 每页 {page.pagination.limit} 条 · 共 {page.total} 条
                  </p>
                  <div className="flex gap-2">
                    {page.pagination.page > 1 ? (
                      <Link
                        href={`/notifications?page=${page.pagination.page - 1}`}
                        className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-subtle)] bg-[var(--nexus-color-bg-2)] px-3 py-1.5 text-13 text-fg-2 no-underline transition-colors hover:border-[var(--nexus-color-brand)] hover:text-fg-1"
                        data-pagination-prev
                      >
                        ← 上一页
                      </Link>
                    ) : null}
                    {page.pagination.hasMore ? (
                      <Link
                        href={`/notifications?page=${page.pagination.page + 1}`}
                        className="rounded-[var(--nexus-radius-sm)] bg-accent-1 px-3 py-1.5 text-13 text-accent-fg no-underline transition-colors hover:bg-accent-2"
                        data-pagination-next
                      >
                        下一页 →
                      </Link>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </section>

        {/* 右栏：注册表速览（sticky） */}
        <aside className="space-y-5 self-start lg:sticky lg:top-6">
          <section className="rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] bg-bg-1 p-4">
            <h2
              className="flex items-center justify-between text-13 font-semibold text-fg-1"
              data-notification-backed-count={KIND_ORDER.length}
            >
              会通知的
              <span className="rounded-full border border-[var(--nexus-color-border-subtle)] bg-[var(--nexus-color-bg-2)] px-2 py-0.5 text-12 font-mono text-fg-3">
                登记 {KIND_ORDER.length} 类
              </span>
            </h2>
            <p className="mt-1 text-12 font-mono uppercase tracking-widest text-fg-3">
              逐类从 NOTIFICATION_KINDS 现算
            </p>
            <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-12 text-fg-3">
              {KIND_ORDER.map((kind) => (
                <li
                  key={kind}
                  data-notification-backing={kind}
                  className="flex items-baseline justify-between gap-2 border-b border-[var(--nexus-color-border-subtle)] py-1 last:border-b-0"
                >
                  <span className="text-fg-2">{KIND_LABEL[kind]}</span>
                  <span className="text-right text-fg-3">{NOTIFICATION_TERMINAL_STATE[kind]}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] bg-bg-1 p-4">
            <h2 className="text-13 font-semibold text-fg-1">不通知的，以及为什么</h2>
            <ul className="mt-2 space-y-1.5 text-12 leading-6 text-fg-3">
              {NOT_NOTIFIED.map((line) => (
                <li key={line} className="flex gap-2">
                  <span aria-hidden="true">—</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      {/* 长尾：未接线的类 + 设置 */}
      <section className="mt-6 rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] bg-bg-1 p-4">
        <h2 className="text-13 font-semibold text-fg-1" data-notification-unbacked-count={page.unbacked.length}>
          {page.unbacked.length === 0
            ? `§164 登记的 ${KIND_ORDER.length} 类，今天都有真实来源了`
            : `§164 登记的 ${KIND_ORDER.length} 类里，这 ${page.unbacked.length} 类还没有真实来源`}
        </h2>
        {page.unbacked.length > 0 ? (
          <ul className="mt-2 space-y-1 text-12 text-fg-3">
            {page.unbacked.map((entry) => (
              <li key={entry.spec} data-notification-unbacked={entry.spec}>
                <span className="text-fg-2">{entry.spec}</span>：{entry.reason}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-2 text-12 text-fg-3">
          没有真终态可挂的那一类不往收件箱里插行；上方"会通知的"逐类写明了各自挂在哪一次收尾上。
          那张表与生产者普查（`apps/web/test/notify-producers.test.ts`）用的是同一份注册表，
          所以页面这句不会再和代码里的类数对不上。
        </p>
      </section>

      <NotificationSettings />

      <footer className="mt-8 flex items-center gap-3 text-12 text-fg-3">
        <BellGlyph className="h-4 w-4" />
        <span>§164 收件箱</span>
        <span aria-hidden="true">·</span>
        <Link href="/" className="text-accent-2-ink underline">
          回到首页
        </Link>
      </footer>
    </main>
  );
}
