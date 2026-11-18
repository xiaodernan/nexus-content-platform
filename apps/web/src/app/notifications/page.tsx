import Link from 'next/link';
import type { ReactElement } from 'react';
import { inbox, type InboxItem } from '@/server/domain/notifications';
import { NOTIFICATION_KINDS, NOTIFICATION_TERMINAL_STATE, NOTIFICATION_TERMINAL_STATE_EN } from '@/lib/notify-plan';
import { currentUserOrNull } from '@/server/domain/session';
import { getLocale, type Locale } from '@/lib/i18n';
import { MarkRead } from '@/components/NotificationActions';
import { NotificationBell } from '@/components/NotificationBell';
import { NotificationSettings } from '@/components/NotificationSettings';
import { NotifTriage } from '@/components/NotifTriage';

export const dynamic = 'force-dynamic';

/** 双语：每行文案按 cookie locale 选（不夹杂） */
const NOTIF_TXT = {
  zh: {
    kindLabel: {
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
    } as Record<InboxItem['kind'], string>,
    notNotified: [
      '取消点赞 / 取消关注：那是"没发生"，不是一条新消息',
      '收藏（Save）：作者看得见收藏数，但谁收了不在收件箱里说',
      '被机检当场挡下的那次发布：原因在你提交的那一次请求里已经给全了，没有延后发生的事',
      '你自己的浏览与自己的点赞：自己对自己做的事不通知',
    ],
    anonymousTitle: '通知',
    anonymousLede: '需要先登录：收件箱按人存放，没有身份就没有可归属的那一份。',
    anonymousLink: '回到首页',
    open: '打开',
    unavailableFallback: '没有可跳转的页面',
    unknownUnavailable: '未知',
    markRead: '标记已读',
    markAllRead: '全部标记已读',
    title: '通知',
    lede: (name: string, total: number, unread: number) =>
      `${name} · 共 ${total} 条 · 未读 ${unread} 条 · 只有你能看到这一页`,
    empty:
      '还没有通知。这不是"系统没有产生消息"，而是还没有人做过与你有关的事：只有真到了终态、而且收件人是你的一件事才会写到这里，下面"会通知的"逐类列了各自挂在哪一次收尾上。',
    paginationNote: (page: number, limit: number, total: number) =>
      `第 ${page} 页 · 每页 ${limit} 条 · 共 ${total} 条`,
    prevPage: '← 上一页',
    nextPage: '下一页 →',
    backedHeading: (n: number) => `会通知的（登记了 ${n} 类，逐类从注册表现算）`,
    notNotifiedHeading: '不通知的，以及为什么',
    unbackedHeadingAll: (n: number) => `§164 登记的 ${n} 类，今天都有真实来源了`,
    unbackedHeadingSome: (n: number, missing: number) =>
      `§164 登记的 ${n} 类里，这 ${missing} 类还没有真实来源`,
    panelNote:
      '没有真终态可挂的那一类不往收件箱里插行；上面"会通知的"逐类写明了各自挂在哪一次收尾上，那张表与生产者普查（apps/web/test/notify-producers.test.ts）用的是同一份注册表，所以页面这句不会再和代码里的类数对不上。',
    backHome: '回到首页',
  },
  en: {
    kindLabel: {
      publish: 'Publish',
      moderation: 'Moderation',
      like: 'Like',
      comment: 'Comment',
      follow: 'Follow',
      remix: 'Remix',
      generation: 'Generation',
      agent: 'Agent',
      approval: 'Approval lapsed',
      build: 'Build',
      marketplace_report: 'Report verdict',
      team: 'Team',
      other: 'Other',
    } as Record<InboxItem['kind'], string>,
    notNotified: [
      'Unliking / unfollowing: that is “nothing happened”, not a new message',
      'Saving (Save): authors see the saved count, but who saved it is not said in the inbox',
      'A publish stopped on the spot by the machine check: the reason was already fully given with the request you submitted; nothing happens later',
      'Your own browsing and your own likes: things you do to yourself do not notify',
    ],
    anonymousTitle: 'Notifications',
    anonymousLede: 'You need to sign in first: an inbox is stored per person — without an identity there is nothing to attribute.',
    anonymousLink: 'Back to home',
    open: 'Open',
    unavailableFallback: 'No page to jump to',
    unknownUnavailable: 'unknown',
    markRead: 'Mark read',
    markAllRead: 'Mark all read',
    title: 'Notifications',
    lede: (name: string, total: number, unread: number) =>
      `${name} · ${total} total · ${unread} unread · only you can see this page`,
    empty:
      'Nothing here yet. This does not mean “the system never produced a message” — it means no one has done anything that concerns you yet: only an event that reached a final state addressed to you lands here; each category below lists where it is hung.',
    paginationNote: (page: number, limit: number, total: number) =>
      `Page ${page} · ${limit} per page · ${total} total`,
    prevPage: '← Previous',
    nextPage: 'Next →',
    backedHeading: (n: number) => `Will notify (registered ${n}, computed from the registry)`,
    notNotifiedHeading: 'Will not notify, and why',
    unbackedHeadingAll: (n: number) => `All ${n} registered categories have real sources today`,
    unbackedHeadingSome: (n: number, missing: number) =>
      `${missing} of the ${n} registered categories have no real source yet`,
    panelNote:
      'A category with no real final state to hang it on never inserts a row into the inbox; each category above names the completion state it fires on — that table and the producer census (apps/web/test/notify-producers.test.ts) share the same registry, so this page’s sentence can no longer drift from the class count in code.',
    backHome: 'Back to home',
  },
} as const;

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

function Row({ item, locale }: { item: InboxItem; locale: Locale }): ReactElement {
  const T = NOTIF_TXT[locale];
  return (
    <li
      className="notif-row"
      data-notification-item={item.id}
      data-notification-kind={item.kind}
      data-notification-read={item.read ? 'yes' : 'no'}
    >
      <span className="notif-kind">{T.kindLabel[item.kind]}</span>
      <span className={item.read ? 'notif-title notif-titleMuted' : 'notif-title notif-titleLive'} data-notification-title>
        {item.title}
      </span>
      {item.body ? <span className="notif-body">「{item.body}」</span> : null}
      <span className="notif-time">{stamp(item.createdAt)}</span>
      {item.link ? (
        <Link href={item.link} className="notif-link" data-notification-link>
          {T.open}
        </Link>
      ) : (
        <span className="notif-unavail" data-notification-unavailable={item.unavailable ?? T.unknownUnavailable}>
          {item.unavailable ?? T.unavailableFallback}
        </span>
      )}
      {item.read ? null : <MarkRead ids={[item.id]} label={T.markRead} locale={locale} />}
    </li>
  );
}

/**
 * §164 收件箱。注册表里的每一类都要有真终态可挂，才允许出现在这一页——
 * 这句话的"每一类"从 `NOTIFICATION_KINDS` 现算，不是这里手抄的名单（任务 #94 修的就是抄漏的那一版）。
 * 
 * 支持分页：默认第 1 页、每页 50 条；超过一页时显示"另有 N 条未列出"并给出翻页按钮。
 */
export default async function NotificationsPage({ searchParams }: { searchParams?: Promise<{ page?: string }> }) {
  const locale = await getLocale();
  const T = NOTIF_TXT[locale];
  const terminalState = locale === 'en' ? NOTIFICATION_TERMINAL_STATE_EN : NOTIFICATION_TERMINAL_STATE;
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="notif-anonymous" data-notification-denied="anonymous">
        <h1 className="notif-h1">{T.anonymousTitle}</h1>
        <p className="notif-anonymousLede">{T.anonymousLede}</p>
        <Link href="/" className="notif-anonymousLink">
          {T.anonymousLink}
        </Link>
      </main>
    );
  }

  // searchParams 在这一版 Next 里是 Promise：不同步 await 就永远是 undefined，
  // 于是 `?page=N` 被静默吞掉、翻页按钮点了也停在第一页（本页其余各处都已是 await 写法）。
  const params = (await searchParams) ?? {};
  const currentPage = Math.max(1, parseInt(params.page ?? '1', 10) || 1);
  const page = await inbox(user.id, { page: currentPage, limit: 50 });
  const unreadIds = page.items.filter((item) => !item.read).map((item) => item.id);

  return (
    <main className="notif-page" data-notification-page>
      <h1 className="notif-h1">{T.title}</h1>
      <p className="notif-lede">
        {T.lede(user.displayName ?? user.email ?? '', page.total, page.unread)}
      </p>
      <div className="notif-bellrow">
        <NotificationBell locale={locale} />
        {unreadIds.length > 0 ? <span className="notif-markreadAll"><MarkRead all label={T.markAllRead} locale={locale} /></span> : null}
      </div>

      {page.items.length > 0 ? <NotifTriage locale={locale} /> : null}

      {page.items.length === 0 ? (
        <p className="notif-empty" data-notification-empty>
          {T.empty}
        </p>
      ) : (
        <>
          <ul className="notif-list">
            {page.items.map((item) => (
              <Row key={item.id} item={item} locale={locale} />
            ))}
          </ul>
          {page.pagination ? (
            <div className="notif-pagination">
              <p className="notif-paginationNote">
                {T.paginationNote(page.pagination.page, page.pagination.limit, page.total)}
              </p>
              <div className="notif-paginationPair">
                {page.pagination.page > 1 ? (
                  <Link
                    href={`/notifications?page=${page.pagination.page - 1}`}
                    className="notif-prev"
                    data-pagination-prev
                  >
                    {T.prevPage}
                  </Link>
                ) : null}
                {page.pagination.hasMore ? (
                  <Link
                    href={`/notifications?page=${page.pagination.page + 1}`}
                    className="notif-next"
                    data-pagination-next
                  >
                    {T.nextPage}
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      )}

      <section className="notif-grid2">
        <div>
          <h2 className="notif-h2" data-notification-backed-count={KIND_ORDER.length}>
            {T.backedHeading(KIND_ORDER.length)}
          </h2>
          <ul className="notif-bulletList">
            {KIND_ORDER.map((kind) => (
              <li key={kind} data-notification-backing={kind}>
                <span className="notif-kindName">{T.kindLabel[kind]}</span>{locale === 'en' ? ': ' : '：'}{terminalState[kind]}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="notif-h2">{T.notNotifiedHeading}</h2>
          <ul className="notif-bulletList">
            {T.notNotified.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="notif-panel">
        <h2 className="notif-h2" data-notification-unbacked-count={page.unbacked.length}>
          {page.unbacked.length === 0
            ? T.unbackedHeadingAll(KIND_ORDER.length)
            : T.unbackedHeadingSome(KIND_ORDER.length, page.unbacked.length)}
        </h2>
        <ul className="notif-bulletList">
          {page.unbacked.map((entry) => (
            <li key={entry.spec} data-notification-unbacked={entry.spec}>
              <span className="notif-kindName">{entry.spec}</span>{locale === 'en' ? ': ' : '：'}{entry.reason}
            </li>
          ))}
        </ul>
        <p className="notif-panelNote">
          {T.panelNote}
        </p>
      </section>

      <NotificationSettings locale={locale} />

      <p className="notif-foot">
        <Link href="/" className="notif-link">
          {T.backHome}
        </Link>
      </p>
    </main>
  );
}
