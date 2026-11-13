import Link from 'next/link';
import { listBlocks } from '@/server/domain/blocks';
import { requireUser } from '@/server/domain/session';
import { UnblockButton } from './UnblockButton';
import { BrandTitle } from '@/components/BrandTitle';

export const dynamic = 'force-dynamic';

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
  const blocks = await listBlocks(user.id);
  const blocked = blocks.filter((b) => b.kind === 'block');
  const muted = blocks.filter((b) => b.kind === 'mute');

  const row = (b: (typeof blocks)[number]) => (
    <li
      key={b.targetId}
      className="group flex items-center justify-between gap-3 rounded-xl border border-[var(--nexus-color-border-subtle)] bg-bg-1 px-4 py-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--nexus-color-brand)] hover:shadow-[0_18px_48px_rgb(91_108_255/0.2)]"
      data-block-row={b.handle ?? b.targetId}
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-13 text-fg-1" data-block-row-name>
          {b.name}
          {b.handle ? <a href={`/u/${b.handle}`} className="ml-2 text-11 text-accent-2-ink underline">@{b.handle}</a> : null}
        </span>
        <span className="text-11 text-fg-3">
          {b.kind === 'block' ? '拉黑：互相不能互动' : '屏蔽：只是你这侧不再看到'} · {new Date(b.createdAt).toLocaleDateString('zh-CN')}
        </span>
      </span>
      <UnblockButton handle={b.handle ?? b.targetId} />
    </li>
  );

  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-4 px-6 py-10" data-blocks-root>
      <header className="relative flex flex-wrap items-baseline justify-between gap-4">
        <div className="relative flex flex-col gap-1">
          <span className="font-mono text-10 uppercase tracking-[0.22em] text-[var(--nexus-color-accent-2-ink)]">
            BOUNDARY
          </span>
          <BrandTitle            className="relative inline-block text-gradient-brand pb-2 text-28 font-bold tracking-tight"
            data-blocks-title
          >
            已拉黑与已屏蔽
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[var(--nexus-color-brand)] to-transparent opacity-70"
            />
          </BrandTitle>
        </div>
        <Link href="/" className="whitespace-nowrap text-accent-2-ink underline" data-blocks-home>
          回主页
        </Link>
      </header>

      <p className="text-11 text-fg-3" data-blocks-explainer>
        屏蔽只管你这侧的可见性：对方照样能给你留言，只是你不再看到他的内容与通知。
        拉黑在此基础上再挡住互动（评论、点赞、关注、改编，两个方向都拒），并解除已有的关注关系。
        两者都不追溯历史：拉黑之前发出去的评论还在，别人也仍然看得到——删别人的发言是审核的事，不是这里的事。
      </p>

      <section>
        <h2 className="font-mono text-11 uppercase tracking-[0.2em] text-[var(--nexus-color-accent-2-ink)]">拉黑 · {blocked.length}</h2>
        {blocked.length === 0 ? (
          <p className="mt-1 text-12 text-fg-3" data-blocks-empty="block">
            没有拉黑过任何人。
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2" data-blocks-list="block">
            {blocked.map(row)}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-mono text-11 uppercase tracking-[0.2em] text-[var(--nexus-color-accent-2-ink)]">屏蔽 · {muted.length}</h2>
        {muted.length === 0 ? (
          <p className="mt-1 text-12 text-fg-3" data-blocks-empty="mute">
            没有屏蔽过任何人。
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2" data-blocks-list="mute">
            {muted.map(row)}
          </ul>
        )}
      </section>
    </main>
  );
}
