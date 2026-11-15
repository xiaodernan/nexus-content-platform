import type { ReactElement } from 'react';
import Link from 'next/link';
import { currentUserOrNull } from '@/server/domain/session';
import { InviteAcceptPanel } from './InviteAcceptPanel';
import { getLocale, type Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/**
 * 双语 COPY（2026-11-15 公开试玩面 wave）：zh 与 en 同构、无混写；服务端文案（lib/domain）原文渲染。
 */
const COPY: Record<Locale, {
  title: string;
  asUserPrefix: string;
  asUserSuffix: string;
  anonymousUser: string;
  ifNotYou: string;
  loginFirst: string;
  backToLogin: string;
}> = {
  zh: {
    title: '接受项目邀请',
    asUserPrefix: '你正在以 ',
    asUserSuffix: ' 的身份接受邀请。',
    anonymousUser: '当前用户',
    ifNotYou: '如果这封邀请不是发给这个邮箱的，服务端会拒绝——换个账号登录再来。',
    loginFirst: '接受邀请需要先登录：服务端要核对你的邮箱与邀请发给的邮箱是不是同一个。登录后重新打开这条链接即可。',
    backToLogin: '回首页登录',
  },
  en: {
    title: 'Accept project invitation',
    asUserPrefix: 'You are accepting this invitation as ',
    asUserSuffix: '.',
    anonymousUser: 'the current user',
    ifNotYou: 'If this invitation was not sent to this email, the server will refuse — sign in with the right account and open the link again.',
    loginFirst: 'Sign in first — the server checks that your email matches the invite’s addressee. Sign in, then open this link again.',
    backToLogin: 'Back to home to sign in',
  },
};

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
  const c = COPY[locale];
  const user = await currentUserOrNull();
  return (
    <main className="iv-page" data-invite-accept-page>
      <header className="iv-head">
        <h1 className="iv-title">{c.title}</h1>
        {user ? (
          <p className="iv-lede">
            {c.asUserPrefix}<span className="iv-ledeStrong">{user.email ?? user.displayName ?? c.anonymousUser}</span>{c.asUserSuffix}
            {' '}
            {c.ifNotYou}
          </p>
        ) : (
          <p className="iv-lede">
            {c.loginFirst}
          </p>
        )}
      </header>
      {user ? (
        <InviteAcceptPanel token={token} locale={locale} />
      ) : (
        <Link href="/" className="iv-backlink">
          {c.backToLogin}
        </Link>
      )}
    </main>
  );
}
