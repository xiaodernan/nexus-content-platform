import Link from 'next/link';
import { listBlocks } from '@/server/domain/blocks';
import { requireUser } from '@/server/domain/session';
import { getLocale, type Locale } from '@/lib/i18n';
import { UnblockButton } from './UnblockButton';

export const dynamic = 'force-dynamic';

const COPY: Record<Locale, {
  title: string;
  backlink: string;
  explainer: string;
  blockEmpty: string;
  muteEmpty: string;
  sectionBlocks: (n: number) => string;
  sectionMutes: (n: number) => string;
  kindBlock: string;
  kindMute: string;
}> = {
  zh: {
    title: '已拉黑与已屏蔽',
    backlink: '回主页',
    explainer: '屏蔽只管你这侧的可见性：对方照样能给你留言，只是你不再看到他的内容与通知。拉黑在此基础上再挡住互动（评论、点赞、关注、改编，两个方向都拒），并解除已有的关注关系。两者都不追溯历史：拉黑之前发出去的评论还在，别人也仍然看得到——删别人的发言是审核的事，不是这里的事。',
    blockEmpty: '没有拉黑过任何人。',
    muteEmpty: '没有屏蔽过任何人。',
    sectionBlocks: (n) => `拉黑（${n}）`,
    sectionMutes: (n) => `屏蔽（${n}）`,
    kindBlock: '拉黑：互相不能互动',
    kindMute: '屏蔽：只是你这侧不再看到',
  },
  en: {
    title: 'Blocked & muted',
    backlink: 'Home',
    explainer: 'Mute governs only your own visibility: the other person can still write to you — you just stop seeing their content and notifications. Block does all that and also cuts off interaction (comments, likes, follows, remixes — both directions) and undoes existing follows. Neither reaches back in history: comments made before the block stay, and others can still see them — deleting someone’s speech is moderation’s job, not this page’s.',
    blockEmpty: 'No one blocked.',
    muteEmpty: 'No one muted.',
    sectionBlocks: (n) => `Blocked (${n})`,
    sectionMutes: (n) => `Muted (${n})`,
    kindBlock: 'Block: no interaction either way',
    kindMute: 'Mute: you stop seeing them',
  },
};

/**
 * §132 的名单页：我自己拉黑 / 屏蔽了谁。
 *
 * 这一页是"解除"那条路，没有它，拉黑就只能在当初那个按钮上取消——
 * 而人常常会忘了自己拉黑过谁，或者换了设备就找不到入口。
 * 反过来，**别人是否拉黑了我**不在这里也不在任何地方显示：那是对方的隐私边界，
 * 说出来等于把"谁在躲你"广播出去。这里被挡住的动作只会收到一句不含细节的拒绝。
 *
 * 双语（2026-11-15）：locale 由 getLocale() 读。
 */
export default async function BlocksPage() {
  const [user, locale] = await Promise.all([requireUser(), getLocale()]);
  const c = COPY[locale];
  const dateLocale = locale === 'zh' ? 'zh-CN' : 'en-US';
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
          {b.kind === 'block' ? c.kindBlock : c.kindMute} · {new Date(b.createdAt).toLocaleDateString(dateLocale)}
        </span>
      </span>
      <UnblockButton handle={b.handle ?? b.targetId} locale={locale} />
    </li>
  );

  return (
    <main className="bk-page" data-blocks-root>
      <header className="bk-head">
        <h1 className="bk-title">{c.title}</h1>
        <Link href="/" className="bk-backlink" data-blocks-home>
          {c.backlink}
        </Link>
      </header>

      <p className="bk-lede" data-blocks-explainer>
        {c.explainer}
      </p>

      <section>
        <h2 className="bk-sectionTitle">{c.sectionBlocks(blocked.length)}</h2>
        {blocked.length === 0 ? (
          <p className="bk-sectionEmpty" data-blocks-empty="block">
            {c.blockEmpty}
          </p>
        ) : (
          <ul className="bk-list" data-blocks-list="block">
            {blocked.map(row)}
          </ul>
        )}
      </section>

      <section>
        <h2 className="bk-sectionTitle">{c.sectionMutes(muted.length)}</h2>
        {muted.length === 0 ? (
          <p className="bk-sectionEmpty" data-blocks-empty="mute">
            {c.muteEmpty}
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
