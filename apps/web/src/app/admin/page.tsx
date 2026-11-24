import Link from 'next/link';
import { currentUserOrNull } from '@/server/domain/session';
import { AdminNav } from '@/components/AdminNav';
import { ADMIN_AREAS, AdminHomeCards } from './AdminHomeCards';
import { getLocale, type Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/**
 * 管理台首页（§A11Y-4）——十四处的总入口。
 *
 * `/admin` 之前没有 index route：访客或管理员打开 /admin 会拿到的是根 not-found
 * （内容平台里每一处门面都言之有物，唯独这一格说自己是 404）——不是"没人告诉你哪里能去"，而是
 * 十四处真实入口摆在手边却没有任何一张脸。本页补这一张脸。
 *
 * 零行为：本页只导航，不读库、不发请求、不递 box、不写审计——每张卡一句话说清
 * "这一格是干什么的"，卡内没有假数据、没有百分比占位、没有"loading…"。测试锚
 * `admin-home-style.test.ts`；导航语义锚 AdminNav（§A11Y-3）的 data-admin-link 全集。
 *
 * v760：全双语（zh/en 同序同义，按 cookie getLocale 取）。
 */
const COPY: Record<Locale, {
  deniedAnonymous: string;
  deniedNotAdmin: (name: string, role: string) => string;
  observerLine: string;
  kicker: string;
  title: string;
  lede: (count: number) => string;
  footLine1: string;
  footLine2: string;
}> = {
  zh: {
    deniedAnonymous: '需要先登录才能看。',
    deniedNotAdmin: (name, role) => `这个页面对 ${name}（role=${role}）不开放：控制台只对 role=admin 可见。`,
    observerLine: '只读观察站：口令 123（公开）→ /admin/observe',
    kicker: 'admin console',
    title: '管理台',
    lede: (count) => `控制面的常用入口，今安静地摆在${count}张卡里；单击进入前，先读卡的一句话。先看读数（观测 / 审计 / 访问账），再动手（删 / 复核 / 拉黑 / 轮换凭据）——本页不为任何人决定该不该点，只说清那一格是干什么的。`,
    footLine1: '控制面只对 role=admin 可见；不给非 admin 任何读数——本页也不会。',
    footLine2: '想知道"刚才谁干了什么"：审计事件 ∣ 想知道"系统现在崩了吗"：观测 ∣ 想知道"谁在扫我这台"：访问账。',
  },
  en: {
    deniedAnonymous: 'You must sign in first.',
    deniedNotAdmin: (name, role) => `This page is not open to ${name} (role=${role}): the console is visible only to role=admin.`,
    observerLine: 'Read-only observer: pass 123 (public) → /admin/observe',
    kicker: 'admin console',
    title: 'Admin console',
    lede: (count) => `Common entry points into the control plane sit quietly in ${count} cards; read the one-liner on a card before you click in. Read first (observability / audit / access log), act second (delete / review / ban / rotate credentials) — this page never decides for you whether to click, it only says what each cell does.`,
    footLine1: 'The control plane is visible only to role=admin; no reads go to non-admins — this page included.',
    footLine2: 'Want to know “who did what just now”: Audit events ∣ “Is the system down right now”: Observability ∣ “Who is scanning this host”: Access log.',
  },
};

export default async function AdminHomePage() {
  const locale = await getLocale();
  const c = COPY[locale];
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="adm-denied" data-admin-denied="anonymous">
        <h1 className="adm-deniedTitle">{c.title}</h1>
        <p className="adm-deniedText">{c.deniedAnonymous}</p>
        <p className="adm-deniedObserver">
          <Link href="/admin/observe" data-admin-denied-observe>{c.observerLine}</Link>
        </p>
      </main>
    );
  }
  if (user.role !== 'admin') {
    return (
      <main className="adm-denied" data-admin-denied="not-admin">
        <h1 className="adm-deniedTitle">{c.title}</h1>
        <p className="adm-deniedText">
          {c.deniedNotAdmin(user.displayName, user.role)}
        </p>
        <p className="adm-deniedObserver">
          <Link href="/admin/observe" data-admin-denied-observe>{c.observerLine}</Link>
        </p>
      </main>
    );
  }

  return (
    <main className="adm-shell" data-admin-home-root>
      <header className="adm-head">
        <div>
          <p className="adm-kicker" data-admin-home-kicker>
            {c.kicker}
          </p>
          <h1 className="adm-title">
            {c.title}
          </h1>
          <p className="adm-lede">
            {c.lede(ADMIN_AREAS.length)}
          </p>
        </div>
        <AdminNav current="home" />
      </header>

      <AdminHomeCards locale={locale} />

      <footer className="adm-foot">
        <p>
          {c.footLine1} {c.footLine2}
        </p>
      </footer>
    </main>
  );
}
