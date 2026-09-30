import Link from 'next/link';
import type { ReactElement } from 'react';
import { inbox, type InboxItem } from '@/server/domain/notifications';
import { currentUserOrNull } from '@/server/domain/session';
import { MarkRead } from '@/components/NotificationActions';
import { NotificationBell } from '@/components/NotificationBell';

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
  other: '未分类',
};

/** 时间按 UTC 印：§168 的归属日就是按 UTC 切的，两处用两套时区只会对不上 */
function stamp(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/** 页面上写清楚的边界：哪些事进收件箱、哪些刻意不进、哪三类还没有来源（§159） */
const NOTIFIED = [
  '你发布的那一版完成了（第几版、给谁看的那一档）',
  '人工审核对某一版做出的结论：通过或下架',
  '别人点赞、评论、改编了你的公开作品，或开始关注你',
  '一次生成先后收尾：一次 AI 请求（生成），或一份多步 Agent 作业（几步走完、结论是什么）',
];

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
 * §164 收件箱。四类里今天真有终态的才会出现在这里，还没来源的那一类原样列在页面下面——
 * "收件箱覆盖到哪一类"这件事如果只能从代码里读出来，就等着被人当成做完了的四类。
 */
export default async function NotificationsPage() {
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

  const page = await inbox(user.id, 50);
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
          还没有通知。这不是"系统没有产生消息"，而是还没有人做过与你有关的事：发布、审核结论、别人对你的作品动手，
          这三类才往这里写。
        </p>
      ) : (
        <ul className="mt-4 rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] bg-bg-1 px-4 py-1">
          {page.items.map((item) => (
            <Row key={item.id} item={item} />
          ))}
        </ul>
      )}
      {page.total > page.items.length ? (
        <p className="mt-2 text-11 text-fg-3">这一页只列出最近 {page.items.length} 条，总数是 {page.total} 条（没有分页）。</p>
      ) : null}

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        <div>
          <h2 className="text-12 font-semibold text-fg-1">会通知的</h2>
          <ul className="mt-1 list-disc pl-4 text-11 text-fg-3">
            {NOTIFIED.map((line) => (
              <li key={line}>{line}</li>
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
        <h2 className="text-12 font-semibold text-fg-1">
          {`§164 原文列的四类里，这 ${page.unbacked.length} 类还没有真实来源`}
        </h2>
        <ul className="mt-1 space-y-1 text-11 text-fg-3">
          {page.unbacked.map((entry) => (
            <li key={entry.spec} data-notification-unbacked={entry.spec}>
              <span className="text-fg-2">{entry.spec}</span>：{entry.reason}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-11 text-fg-3">
          摘掉的两类都有真终态在背后：Generation complete 挂在一次 AI 请求的任务行上，
          Agent task complete 挂在 §112 的多步作业上（计划落库、逐步推进、最后收尾）。
          留着的那一类要的是"会完成的构建操作"，那件事本身还没有，所以不往收件箱里插行。
        </p>
      </section>

      <p className="mt-8 text-11 text-fg-3">
        <Link href="/" className="text-accent-2 underline">
          回到首页
        </Link>
      </p>
    </main>
  );
}
