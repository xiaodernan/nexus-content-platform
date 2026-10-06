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
  other: '未分类',
};

/** 时间按 UTC 印：§168 的归属日就是按 UTC 切的，两处用两套时区只会对不上 */
function stamp(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/**
 * 页面上写清楚的边界：哪些事进收件箱、哪些刻意不进（§159）。
 *
 * "会通知的"这一列**不在这里写**——它从 `lib/notify-plan.ts` 的 `NOTIFICATION_TERMINAL_STATE` 现算，
 * 一行一类。上一版这里是手写的四条，而登记已经长到十类，于是页面在说谎（任务 #94）。
 * "不通知的"反过来：那是刻意的排除，写下来才有意义，所以它留成字面清单。
 */
const KIND_ORDER = Object.keys(NOTIFICATION_KINDS) as (keyof typeof NOTIFICATION_TERMINAL_STATE)[];

const NOT_NOTIFIED = [
  '取消点赞 / 取消关注：那是"没发生"，不是一条新消息',
  '收藏（Save）：作者看得见收藏数，但谁收了不在收件箱里说',
  '被机检当场挡下的那次发布：原因在你提交的那一次请求里已经给全了，没有延后发生的事',
  '你自己的浏览与自己的点赞：自己对自己做的事不通知',
];

function Row({ item }: { item: InboxItem }): ReactElement {
  return (
    <li
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-[var(--nexus-color-border-subtle)] py-2 last:border-b-0"
      data-notification-item={item.id}
      data-notification-kind={item.kind}
      data-notification-read={item.read ? 'yes' : 'no'}
    >
      <span className="rounded-[var(--nexus-radius-sm)] bg-bg-2 px-1.5 py-0.5 text-11 text-fg-3">{KIND_LABEL[item.kind]}</span>
      <span className={item.read ? 'text-13 text-fg-3' : 'text-13 text-fg-1'} data-notification-title>
        {item.title}
      </span>
      {item.body ? <span className="w-full text-11 text-fg-3">「{item.body}」</span> : null}
      <span className="text-11 text-fg-3">{stamp(item.createdAt)}</span>
      {item.link ? (
        <Link href={item.link} className="text-11 text-accent-2 underline" data-notification-link>
          打开
        </Link>
      ) : (
        <span className="text-11 text-warn" data-notification-unavailable={item.unavailable ?? '未知'}>
          {item.unavailable ?? '没有可跳转的页面'}
        </span>
      )}
      {item.read ? null : <MarkRead ids={[item.id]} label="标记已读" />}
    </li>
  );
}

/**
 * §164 收件箱。注册表里的每一类都要有真终态可挂，才允许出现在这一页——
 * 这句话的"每一类"从 `NOTIFICATION_KINDS` 现算，不是这里手抄的名单（任务 #94 修的就是抄漏的那一版）。
 * 
 * 支持分页：默认第 1 页、每页 50 条；超过一页时显示"另有 N 条未列出"并给出翻页按钮。
 */
export default async function NotificationsPage({ searchParams }: { searchParams?: { page?: string } }) {
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="mx-auto max-w-[900px] px-6 py-16" data-notification-denied="anonymous">
        <h1 className="text-[var(--nexus-font-size-21)] font-semibold">通知</h1>
        <p className="mt-2 text-13 text-fg-2">需要先登录：收件箱按人存放，没有身份就没有可归属的那一份。</p>
        <Link href="/" className="mt-4 inline-block text-12 text-accent-2 underline">
          回到首页
        </Link>
      </main>
    );
  }

  const currentPage = Math.max(1, parseInt(searchParams?.page ?? '1', 10) || 1);
  const page = await inbox(user.id, { page: currentPage, limit: 50 });
  const unreadIds = page.items.filter((item) => !item.read).map((item) => item.id);

  return (
    <main className="mx-auto max-w-[900px] px-6 py-10" data-notification-page>
      <h1 className="text-[var(--nexus-font-size-21)] font-semibold text-fg-1">通知</h1>
      <p className="mt-1 text-12 text-fg-3">
        {user.displayName} · 共 {page.total} 条 · 未读 {page.unread} 条 · 只有你能看到这一页
      </p>
      <div className="mt-2">
        <NotificationBell />
        {unreadIds.length > 0 ? <span className="ml-3 inline-flex"><MarkRead all label="全部标记已读" /></span> : null}
      </div>

      {page.items.length === 0 ? (
        <p className="mt-6 rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] bg-bg-1 p-4 text-12 text-fg-3" data-notification-empty>
          还没有通知。这不是"系统没有产生消息"，而是还没有人做过与你有关的事：
          只有真到了终态、而且收件人是你的一件事才会写到这里，下面"会通知的"逐类列了各自挂在哪一次收尾上。
        </p>
      ) : (
        <>
          <ul className="mt-4 rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] bg-bg-1 px-4 py-1">
            {page.items.map((item) => (
              <Row key={item.id} item={item} />
            ))}
          </ul>
          {page.pagination ? (
            <div className="mt-3 flex items-center justify-between">
              <p className="text-11 text-fg-3">
                第 {page.pagination.page} 页 · 每页 {page.pagination.limit} 条 · 共 {page.total} 条
              </p>
              <div className="flex gap-2">
                {page.pagination.page > 1 ? (
                  <Link
                    href={`/notifications?page=${page.pagination.page - 1}`}
                    className="rounded-[var(--nexus-radius-sm)] bg-bg-2 px-3 py-1.5 text-12 text-fg-2 hover:bg-bg-3"
                    data-pagination-prev
                  >
                    ← 上一页
                  </Link>
                ) : null}
                {page.pagination.hasMore ? (
                  <Link
                    href={`/notifications?page=${page.pagination.page + 1}`}
                    className="rounded-[var(--nexus-radius-sm)] bg-accent-1 px-3 py-1.5 text-12 text-accent-2 hover:bg-accent-2"
                    data-pagination-next
                  >
                    下一页 →
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      )}

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        <div>
          <h2 className="text-12 font-semibold text-fg-1" data-notification-backed-count={KIND_ORDER.length}>
            会通知的（登记了 {KIND_ORDER.length} 类，逐类从注册表现算）
          </h2>
          <ul className="mt-1 list-disc pl-4 text-11 text-fg-3">
            {KIND_ORDER.map((kind) => (
              <li key={kind} data-notification-backing={kind}>
                <span className="text-fg-2">{KIND_LABEL[kind]}</span>：{NOTIFICATION_TERMINAL_STATE[kind]}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-12 font-semibold text-fg-1">不通知的，以及为什么</h2>
          <ul className="mt-1 list-disc pl-4 text-11 text-fg-3">
            {NOT_NOTIFIED.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-6 rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] bg-bg-1 p-4">
        <h2 className="text-12 font-semibold text-fg-1" data-notification-unbacked-count={page.unbacked.length}>
          {page.unbacked.length === 0
            ? `§164 登记的 ${KIND_ORDER.length} 类，今天都有真实来源了`
            : `§164 登记的 ${KIND_ORDER.length} 类里，这 ${page.unbacked.length} 类还没有真实来源`}
        </h2>
        <ul className="mt-1 space-y-1 text-11 text-fg-3">
          {page.unbacked.map((entry) => (
            <li key={entry.spec} data-notification-unbacked={entry.spec}>
              <span className="text-fg-2">{entry.spec}</span>：{entry.reason}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-11 text-fg-3">
          没有真终态可挂的那一类不往收件箱里插行；上面"会通知的"逐类写明了各自挂在哪一次收尾上，
          那张表与生产者普查（`apps/web/test/notify-producers.test.ts`）用的是同一份注册表，
          所以页面这句不会再和代码里的类数对不上。
        </p>
      </section>

      <NotificationSettings />

      <p className="mt-8 text-11 text-fg-3">
        <Link href="/" className="text-accent-2 underline">
          回到首页
        </Link>
      </p>
    </main>
  );
}
