import type { ReactElement } from 'react';
import Link from 'next/link';
import { currentUserOrNull } from '@/server/domain/session';
import { InviteAcceptPanel } from './InviteAcceptPanel';

export const dynamic = 'force-dynamic';

/**
 * §133 teamCollaboration（#201-203）：兑现邀请的落地页。
 *
 * 按**当前登录用户**接受：token（链接里）证明"这枚邀请是真的"，登录用户的邮箱证明
 * "这封是发给我的"（accept 路由里校，缺一不可）。所以没登录就什么都做不了——
 * 这一页对未登录的人只说一句话：先去登录，再打开这条链接。
 */
export default async function InviteAcceptPage({ params }: { params: Promise<{ token: string }> }): Promise<ReactElement> {
  const { token } = await params;
  const user = await currentUserOrNull();
  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-[var(--nexus-space-4)] px-[var(--nexus-space-4)] py-[var(--nexus-space-6)]" data-invite-accept-page>
      <header className="flex flex-col gap-1">
        <h1 className="text-14 font-medium text-fg-1">接受项目邀请</h1>
        {user ? (
          <p className="text-12 text-fg-3">
            你正在以 <span className="text-fg-1">{user.email ?? user.displayName ?? '当前用户'}</span> 的身份接受邀请。
            如果这封邀请不是发给这个邮箱的，服务端会拒绝——换个账号登录再来。
          </p>
        ) : (
          <p className="text-12 text-fg-3">
            接受邀请需要先登录：服务端要核对你的邮箱与邀请发给的邮箱是不是同一个。
            登录后重新打开这条链接即可。
          </p>
        )}
      </header>
      {user ? (
        <InviteAcceptPanel token={token} />
      ) : (
        <Link href="/" className="text-13 text-accent-2-ink underline">
          回首页登录
        </Link>
      )}
    </main>
  );
}
