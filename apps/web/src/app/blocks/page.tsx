import Link from 'next/link';
import { listBlocks } from '@/server/domain/blocks';
import { requireUser } from '@/server/domain/session';
import { UnblockButton } from './UnblockButton';
import { getLocale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/** 双语：每行文案按 cookie locale 选（不夹杂） */
const BLOCKS_TXT = {
  zh: {
    backHome: '回主页',
    title: '已拉黑与已屏蔽',
    lede:
      '屏蔽只管你这侧的可见性：对方照样能给你留言，只是你不再看到他的内容与通知。拉黑在此基础上再挡住互动（评论、点赞、关注、改编，两个方向都拒），并解除已有的关注关系。两者都不追溯历史：拉黑之前发出去的评论还在，别人也仍然看得到——删别人的发言是审核的事，不是这里的事。',
    blockMeta: '拉黑：互相不能互动',
    muteMeta: '屏蔽：只是你这侧不再看到',
    blockedSection: (n: number) => `拉黑（${n}）`,
    mutedSection: (n: number) => `屏蔽（${n}）`,
    emptyBlocked: '没有拉黑过任何人。',
    emptyMuted: '没有屏蔽过任何人。',
  },
  en: {
    backHome: 'Back home',
    title: 'Blocked & muted',
    lede:
      'Muting governs what you see on your side: the other person can still leave you messages — you simply no longer see their content or notifications. Blocking adds mutual interaction refusal (comments, likes, follows, remixes, in both directions) and removes any existing follow. Neither is retroactive: comments posted before the block stay, and others still see them — removing someone else’s speech is a moderation matter, not this page’s.',
    blockMeta: 'Blocked: neither side can interact',
    muteMeta: 'Muted: just invisible on your side',
    blockedSection: (n: number) => `Blocked (${n})`,
    mutedSection: (n: number) => `Muted (${n})`,
    emptyBlocked: 'No one is blocked.',
    emptyMuted: 'No one is muted.',
  },
} as const;

/**
 * §132 的名单页：我自己拉黑 / 屏蔽了谁。
 *
 * 这一页是"解除"那条路，没有它，拉黑就只能在当初那个按钮上取消——
 * 而人常常会忘了自己拉黑过谁，或者换了设备就找不到入口。
 * 反过来，**别人是否拉黑了我**不在这里也不在任何地方显示：那是对方的隐私边界，
 * 说出来等于把"谁在躲你"广播出去。这里被挡住的动作只会收到一句不含细节的拒绝。
 */
export default async function BlocksPage() {
  const user = await requireUser();
  const locale = await getLocale();
  const T = BLOCKS_TXT[locale];
  const intlLocale = locale === 'en' ? 'en-US' : 'zh-CN';
  const blocks = await listBlocks(user.id);
  const blocked = blocks.filter((b) => b.kind === 'block');
  const muted = blocks.filter((b) => b.kind === 'mute');

  const row = (b: (typeof blocks)[number]) => (
    <li key={b.targetId} className="bk-row" data-block-row={b.handle ?? b.targetId}>
      <span className="bk-rowMain">
        <span className="bk-rowName" data-block-row-name>
          {b.name}
          {b.handle ? <a href={`/u/${b.handle}`} className="bk-handle">@{b.handle}</a> : null}
        </span>
        <span className="bk-rowMeta">
          {b.kind === 'block' ? T.blockMeta : T.muteMeta} · {new Date(b.createdAt).toLocaleDateString(intlLocale)}
        </span>
      </span>
      <UnblockButton handle={b.handle ?? b.targetId} locale={locale} />
    </li>
  );

  return (
    <main className="bk-page" data-blocks-root>
      <header className="bk-head">
        <h1 className="bk-title">{T.title}</h1>
        <Link href="/" className="bk-backlink" data-blocks-home>
          {T.backHome}
        </Link>
      </header>

      <p className="bk-lede" data-blocks-explainer>
        {T.lede}
      </p>

      <section>
        <h2 className="bk-sectionTitle">{T.blockedSection(blocked.length)}</h2>
        {blocked.length === 0 ? (
          <p className="bk-sectionEmpty" data-blocks-empty="block">
            {T.emptyBlocked}
          </p>
        ) : (
          <ul className="bk-list" data-blocks-list="block">
            {blocked.map(row)}
          </ul>
        )}
      </section>

      <section>
        <h2 className="bk-sectionTitle">{T.mutedSection(muted.length)}</h2>
        {muted.length === 0 ? (
          <p className="bk-sectionEmpty" data-blocks-empty="mute">
            {T.emptyMuted}
          </p>
        ) : (
          <ul className="bk-list" data-blocks-list="mute">
            {muted.map(row)}
          </ul>
        )}
      </section>
    </main>
  );
}
