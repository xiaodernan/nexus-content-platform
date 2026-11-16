import Link from 'next/link';
import type { ReactElement } from 'react';
import { inbox, type InboxItem } from '@/server/domain/notifications';
import { NOTIFICATION_KINDS, NOTIFICATION_TERMINAL_STATE } from '@/lib/notify-plan';
import { currentUserOrNull } from '@/server/domain/session';
import { MarkRead } from '@/components/NotificationActions';
import { NotificationBell } from '@/components/NotificationBell';
import { NotificationSettings } from '@/components/NotificationSettings';
import { NotifTriage } from '@/components/NotifTriage';
import { getLocale, type Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<Locale, Record<InboxItem['kind'], string>> = {
  zh: {
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
  },
  en: {
    publish: 'Publish',
    moderation: 'Moderation',
    like: 'Like',
    comment: 'Comment',
    follow: 'Follow',
    remix: 'Remix',
    generation: 'Generation',
    agent: 'Agent',
    approval: 'Approval expired',
    build: 'Export',
    marketplace_report: 'Report outcome',
    team: 'Team',
    other: 'Uncategorized',
  },
};

/**
 * 会通知的那一排——把每类到底挂在哪一次"真终态"上。这个字典必须和 `lib/notify-plan.ts` 的
 * `NOTIFICATION_TERMINAL_STATE` 一一对应（zh 那一份直接取 lib 原值保持字节一致；
 * en 是逐条对应的英文版；新增类 forget 会在 notify-producers.test.ts 里红）。
 */
const TERMINAL_EN: Record<keyof typeof NOTIFICATION_TERMINAL_STATE, string> = {
  publish: 'The version you published actually landed: its number, its audience tier and the public page link all in hand — only then is "published" true.',
  moderation: 'A human review reached a conclusion on one version (approved or taken down), written onto that version’s review record.',
  like: 'Someone else’s like under your public work landed in the community-interactions table (un-liking is not a new message).',
  comment: 'A comment someone else left under your public work.',
  follow: 'Someone started following you (un-following stays silent).',
  remix: 'Someone remixed one of your public works into a new document.',
  generation: 'A terminal state for one AI job’s task row: image shipped or errored — you are notified when the row lands.',
  agent: '§112 multi-step job finished: plan written, steps advanced, conclusion delivered.',
  approval: 'A §74 approval gate expired at the pending moment — not "someone agreed", but it genuinely closed.',
  build: '§144 export archived: documents read, code projected out, assets fetched back, the zip closed.',
  marketplace_report: 'The report ticket reached a terminal state (upheld / dismissed) and notifies the reporter once; "under review" is not a conclusion — nothing is sent.',
  team: 'An invite was genuinely honored: someone accepted it and the member row landed — only then is there "someone in your project"; sending, revoking or expiry stay silent.',
};

const COPY: Record<Locale, {
  h1: string;
  anonymousLede: string;
  anonymousLink: string;
  ledeTotal: (displayName: string, total: number, unread: number) => string;
  markAll: string;
  inlineMeter: string;
  empty: string;
  openLink: string;
  unavailableUnknown: string;
  unavailableNone: string;
  markOne: string;
  backedCount: (n: number) => string;
  backedItem: (kind: string, text: string) => string;
  notNotifyTitle: string;
  unbackedEmpty: (total: number) => string;
  unbackedSome: (total: number, remaining: number) => string;
  policyNote: string;
  shortcut: (n: number, limit: number, total: number) => string;
  prevPage: string;
  nextPage: string;
  backHome: string;
}> = {
  zh: {
    h1: '通知',
    anonymousLede: '需要先登录：收件箱按人存放，没有身份就没有可归属的那一份。',
    anonymousLink: '回到首页',
    ledeTotal: (displayName, total, unread) => `${displayName} · 共 ${total} 条 · 未读 ${unread} 条 · 只有你能看到这一页`,
    markAll: '全部标记已读',
    inlineMeter: '当前页',
    empty: '还没有通知。这不是"系统没有产生消息"，而是还没有人做过与你有关的事：只有真到了终态、而且收件人是你的一件事才会写到这里，下面"会通知的"逐类列了各自挂在哪一次收尾上。',
    openLink: '打开',
    unavailableUnknown: '未知',
    unavailableNone: '没有可跳转的页面',
    markOne: '标记已读',
    backedCount: (n) => `会通知的（登记了 ${n} 类，逐类从注册表现算）`,
    backedItem: (kind, text) => `${kind}：${text}`,
    notNotifyTitle: '不通知的，以及为什么',
    unbackedEmpty: (total) => `§164 登记的 ${total} 类，今天都有真实来源了`,
    unbackedSome: (total, remaining) => `§164 登记的 ${total} 类里，这 ${remaining} 类还没有真实来源`,
    policyNote: '没有真终态可挂的那一类不往收件箱里插行；上面"会通知的"逐类写明了各自挂在哪一次收尾上，那张表与生产者普查（`apps/web/test/notify-producers.test.ts`）用的是同一份注册表，所以页面这句不会再和代码里的类数对不上。',
    shortcut: (page, limit, total) => `第 ${page} 页 · 每页 ${limit} 条 · 共 ${total} 条`,
    prevPage: '← 上一页',
    nextPage: '下一页 →',
    backHome: '回到首页',
  },
  en: {
    h1: 'Notifications',
    anonymousLede: 'Sign in first — inboxes belong to people, and there is nothing to attribute without an identity.',
    anonymousLink: 'Back to the home page',
    ledeTotal: (displayName, total, unread) => `${displayName} · ${total} total · ${unread} unread · visible only to you`,
    markAll: 'Mark all as read',
    inlineMeter: 'this page',
    empty: 'No notifications yet. This is not "the system produced no messages" — no one has done anything tied to you yet. Only events that actually reach a terminal state, and whose recipient is you, are written here; each category below names the moment it hangs from.',
    openLink: 'Open',
    unavailableUnknown: 'unknown',
    unavailableNone: 'No page to jump to',
    markOne: 'Mark as read',
    backedCount: (n) => `What notifies you (${n} registered kinds, computed from the registry)`,
    backedItem: (kind, text) => `${kind}: ${text}`,
    notNotifyTitle: 'What does not notify, and why',
    unbackedEmpty: (total) => `All ${total} registered kinds of §164 have real sources today`,
    unbackedSome: (total, remaining) => `Of the ${total} kinds in §164, these ${remaining} have no real source yet`,
    policyNote: 'A kind with nothing to hang on is never inserted into the inbox. The grid above names the landing moment of every notifying kind and uses the same registry as the producer census (`apps/web/test/notify-producers.test.ts`), so the count on this page cannot drift from the code.',
    shortcut: (page, limit, total) => `Page ${page} · ${limit} per page · ${total} total`,
    prevPage: '← Previous page',
    nextPage: 'Next page →',
    backHome: 'Back to the home page',
  },
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

function notNotified(locale: Locale): string[] {
  return locale === 'zh'
    ? [
        '取消点赞 / 取消关注：那是"没发生"，不是一条新消息',
        '收藏（Save）：作者看得见收藏数，但谁收了不在收件箱里说',
        '被机检当场挡下的那次发布：原因在你提交的那一次请求里已经给全了，没有延后发生的事',
        '你自己的浏览与自己的点赞：自己对自己做的事不通知',
      ]
    : [
        'Un-like / un-follow — that is “did not happen”, not a new message',
        'Saves — the author sees the save count, but who saved is never said in the inbox',
        'A publish stopped on the spot by the machine check — the reasons were given in the very request you sent; there is no delayed event',
        'Your own views and your own likes — actions on yourself never notify you',
      ];
}

function Row({ item, locale }: { item: InboxItem; locale: Locale }): ReactElement {
  return (
    <li
      className="notif-row"
      data-notification-item={item.id}
      data-notification-kind={item.kind}
      data-notification-read={item.read ? 'yes' : 'no'}
    >
      <span className="notif-kind">{KIND_LABEL[locale][item.kind]}</span>
      <span className={item.read ? 'notif-title notif-titleMuted' : 'notif-title notif-titleLive'} data-notification-title>
        {item.title}
      </span>
      {item.body ? <span className="notif-body">「{item.body}」</span> : null}
      <span className="notif-time">{stamp(item.createdAt)}</span>
      {item.link ? (
        <Link href={item.link} className="notif-link" data-notification-link>
          {COPY[locale].openLink}
        </Link>
      ) : (
        <span className="notif-unavail" data-notification-unavailable={item.unavailable ?? COPY[locale].unavailableUnknown}>
          {item.unavailable ?? COPY[locale].unavailableNone}
        </span>
      )}
      {item.read ? null : <MarkRead ids={[item.id]} label={COPY[locale].markOne} locale={locale} />}
    </li>
  );
}

/**
 * §164 收件箱。注册表里的每一类都要有真终态可挂，才允许出现在这一页——
 * 这句话的"每一类"从 `NOTIFICATION_KINDS` 现算，不是这里手抄的名单（任务 #94 修的就是抄漏的那一版）。
 *
 * 支持分页：默认第 1 页、每页 50 条；超过一页时显示"另有 N 条未列出"并给出翻页按钮。
 * 双语（2026-11-15）：locale 由 getLocale() 定，全部界面文案在 COPY 中英一辞两字面，数据原样下发。
 */
export default async function NotificationsPage({ searchParams }: { searchParams?: Promise<{ page?: string }> }) {
  const [user, locale] = await Promise.all([currentUserOrNull(), getLocale()]);
  const c = COPY[locale];
  if (!user) {
    return (
      <main className="notif-anonymous" data-notification-denied="anonymous">
        <h1 className="notif-h1">{c.h1}</h1>
        <p className="notif-anonymousLede">{c.anonymousLede}</p>
        <Link href="/" className="notif-anonymousLink">
          {c.anonymousLink}
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
      <h1 className="notif-h1">{c.h1}</h1>
      <p className="notif-lede">{c.ledeTotal(user.displayName, page.total, page.unread)}</p>
      <div className="notif-bellrow">
        <NotificationBell locale={locale} />
        {unreadIds.length > 0 ? <span className="notif-markreadAll"><MarkRead all label={c.markAll} locale={locale} /></span> : null}
      </div>

      {page.items.length > 0 ? <NotifTriage locale={locale} /> : null}

      {page.items.length === 0 ? (
        <p className="notif-empty" data-notification-empty>
          {c.empty}
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
                {c.shortcut(page.pagination.page, page.pagination.limit, page.total)}
              </p>
              <div className="notif-paginationPair">
                {page.pagination.page > 1 ? (
                  <Link
                    href={`/notifications?page=${page.pagination.page - 1}`}
                    className="notif-prev"
                    data-pagination-prev
                  >
                    {c.prevPage}
                  </Link>
                ) : null}
                {page.pagination.hasMore ? (
                  <Link
                    href={`/notifications?page=${page.pagination.page + 1}`}
                    className="notif-next"
                    data-pagination-next
                  >
                    {c.nextPage}
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
            {c.backedCount(KIND_ORDER.length)}
          </h2>
          <ul className="notif-bulletList">
            {KIND_ORDER.map((kind) => (
              <li key={kind} data-notification-backing={kind}>
                <span className="notif-kindName">{KIND_LABEL[locale][kind]}</span>
                {locale === 'zh' ? `：${NOTIFICATION_TERMINAL_STATE[kind]}` : `: ${TERMINAL_EN[kind]}`}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="notif-h2">{c.notNotifyTitle}</h2>
          <ul className="notif-bulletList">
            {notNotified(locale).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="notif-panel">
        <h2 className="notif-h2" data-notification-unbacked-count={page.unbacked.length}>
          {page.unbacked.length === 0
            ? c.unbackedEmpty(KIND_ORDER.length)
            : c.unbackedSome(KIND_ORDER.length, page.unbacked.length)}
        </h2>
        <ul className="notif-bulletList">
          {page.unbacked.map((entry) => (
            <li key={entry.spec} data-notification-unbacked={entry.spec}>
              <span className="notif-kindName">{entry.spec}</span>：{entry.reason}
            </li>
          ))}
        </ul>
        <p className="notif-panelNote">{c.policyNote}</p>
      </section>

      <NotificationSettings locale={locale} />

      <p className="notif-foot">
        <Link href="/" className="notif-link">
          {c.backHome}
        </Link>
      </p>
    </main>
  );
}
