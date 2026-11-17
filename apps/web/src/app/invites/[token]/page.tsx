import type { ReactElement } from 'react';
import Link from 'next/link';
import { currentUserOrNull } from '@/server/domain/session';
import { InviteAcceptPanel } from './InviteAcceptPanel';
import { getLocale, type Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/** 双语：每行文案按 cookie locale 选（不夹杂） */
const IV_TXT = {
  zh: {
    title: '接受项目邀请',
    signedIn: (who: string) => (
      <>
        你正在以 <span className="iv-ledeStrong">{who}</span> 的身份接受邀请。如果这封邀请不是发给这个邮箱的，服务端会拒绝——换个账号登录再来。
      </>
    ),
    signedOut:
      '接受邀请需要先登录：服务端要核对你的邮箱与邀请发给的邮箱是不是同一个。登录后重新打开这条链接即可。',
    currentUser: '当前用户',
    backHome: '回首页登录',
  },
  en: {
    title: 'Accept a project invitation',
    signedIn: (who: string) => (
      <>
        You are accepting this invitation as{' '}
        <span className="iv-ledeStrong">{who}</span>. If this invitation was not sent to that address, the server will refuse it — sign in with the matching account instead.
      </>
    ),
    signedOut:
      'Accepting an invitation requires signing in first: the server must check that your address matches the one the invitation was addressed to. Sign in, then reopen this link.',
    currentUser: 'current user',
    backHome: 'Back to home to sign in',
  },
} as const;

/**
 * 双语 COPY（2026-11-15 公开试玩面 wave）：zh 与 en 同构、无混写；服务端文案（lib/domain）原文渲染。
 */

/**
 * §133 teamCollaboration（#201-203）：兑现邀请的落地页。
 *
 * 按**当前登录用户**接受：token（链接里）证明"这枚邀请是真的"，登录用户的邮箱证明
 * "这封是发给我的"（accept 路由里校，缺一不可）。所以没登录就什么都做不了——
 * 这一页对未登录的人只说一句话：先去登录，再打开这条链接。
 *
 * 双语（2026-11-15）：`getLocale()` 从 cookie 读；locale 透传给 InviteAcceptPanel。
 */
export default async function InviteAcceptPage({ params }: { params: Promise<{ token: string }> }): Promise<ReactElement> {
  const { token } = await params;
  const locale = await getLocale();
  const user = await currentUserOrNull();
  const T = IV_TXT[locale];
  return (
    <main className="iv-page" data-invite-accept-page>
      <header className="iv-head">
        <h1 className="iv-title">{T.title}</h1>
        {user ? (
          <p className="iv-lede">{T.signedIn(user.email ?? user.displayName ?? T.currentUser)}</p>
        ) : (
          <p className="iv-lede">{T.signedOut}</p>
        )}
        )}
      </header>
      {user ? (
        <InviteAcceptPanel token={token} locale={locale} />
      ) : (
        <Link href="/" className="iv-backlink">
          {T.backHome}
        </Link>
      )}
    </main>
  );
}
