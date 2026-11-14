import Link from 'next/link';
import { currentUserOrNull } from '@/server/domain/session';
import { AdminNav } from '@/components/AdminNav';
import { getLocale, type Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/**
 * 管理台首页（§A11Y-4）——十处的总入口。
 *
 * `/admin` 之前没有 index route：访客或管理员打开 /admin 会拿到的是根 not-found
 * （内容平台里每一处门面都言之有物，唯独这一格说自己是 404）——不是"没人告诉你哪里能去"，而是
 * 十一处真实入口摆在手边却没有任何一张脸。本页补这一张脸。
 *
 * 零行为：本页只导航，不读库、不发请求、不递 box、不写审计——每张卡一句话说清
 * "这一格是干什么的"，卡内没有假数据、没有百分比占位、没有"loading…"。测试锚
 * `admin-home-style.test.ts`；导航语义锚 AdminNav（§A11Y-3）的 data-admin-link 全集。
 *
 * v760：全双语（zh/en 同序同义，按 cookie getLocale 取）。
 */
const AREAS = [
  { slug: 'users', href: '/admin/users', titleZh: '账号与角色', titleEn: 'Accounts & roles', noteZh: '看账号、改角色与套餐、回收游客账号——营业员的眼睛，不会误删。', noteEn: 'Browse accounts, change roles and plans, reclaim guest accounts — the operator’s view, built not to misfire.' },
  { slug: 'moderation', href: '/admin/moderation', titleZh: '复核台', titleEn: 'Moderation', noteZh: '违规与被举报的内容逐条过眼：接受、驳回、保持——每一票带读屏可见标签。', noteEn: 'Walk every violating or reported item one by one: accept, reject, hold — with screen-reader labels on every vote.' },
  { slug: 'marketplace', href: '/admin/marketplace', titleZh: '市场工单', titleEn: 'Marketplace queue', noteZh: '售后争议（退款、投诉、交付）人工结案——客服队列的硬门。', noteEn: 'Post-sale disputes — refunds, complaints, fulfillment — get a manual verdict. The human gate on the queue.' },
  { slug: 'audit', href: '/admin/audit', titleZh: '审计事件', titleEn: 'Audit events', noteZh: '跨实例的 append-only 审计流按时间筛——谁在什么时候干了什么。', noteEn: 'The cross-instance append-only audit stream, filtered by time — who did what, when.' },
  { slug: 'realtime', href: '/admin/realtime', titleZh: '实时总线', titleEn: 'Realtime bus', noteZh: '线路帧计数：发布总数/过大丢弃/线路失败/熔断状态—— wire 上真正在发生的事。', noteEn: 'Wire frame counters: total published / oversized dropped / wire failures / breaker state — what is happening on the wire, right now.' },
  { slug: 'rate-limit', href: '/admin/rate-limit', titleZh: '限流闸', titleEn: 'Rate limiting', noteZh: '每客户端令牌桶 live 读数—— memory 诚实说自己按副本数翻倍，redis 真实 PING。', noteEn: 'Per-client token-bucket reads, live — memory honestly says it doubles per replica; redis actually PINGs.' },
  { slug: 'access', href: '/admin/access', titleZh: '访问账', titleEn: 'Access log', noteZh: '全平台凭据热点：谁在扫库、哪一枚 token 最热——按 1/7/30 天分档。', noteEn: 'Platform-wide credential hotspots: who is scanning, which token is the hottest — bucketed by 1/7/30 days.' },
  { slug: 'observability', href: '/admin/observability', titleZh: '观测', titleEn: 'Observability', noteZh: '进程计数器（本实例）+ 库里三账（跨重启）——两半，别合并。', noteEn: 'Process counters (this instance) + the library’s three ledgers (across restarts) — two halves, never merged.' },
  { slug: 'gateway', href: '/admin/gateway', titleZh: '网关态势', titleEn: 'Gateway', noteZh: '网关此刻给谁路由、注册中心记着谁、每实例还活不活——错处自现。', noteEn: 'Who the gateway routes to right now, which registry members it remembers, whether each instance is alive — misroutes reveal themselves.' },
  { slug: 'discover-cache', href: '/admin/discover-cache', titleZh: '发现页缓存', titleEn: 'Discover cache', noteZh: '/discover 缓存的命中/水位/失效总线心跳——读缓存，不动缓存。', noteEn: 'Hit/watermark/invalidation heartbeat of the /discover cache — read it, never touch it.' },
  { slug: 'health', href: '/admin/health', titleZh: '健康总览', titleEn: 'Health', noteZh: 'ai/java/gateway/redis/postgres 五层一致性——拿不到就是“未测到”，不是down；每层独立超时。', noteEn: 'ai/java/gateway/redis/postgres five-layer consistency — unreachable means “unmeasured”, never down; each layer has its own timeout.' },
] as const;

const COPY: Record<Locale, {
  deniedAnonymous: string;
  deniedNotAdmin: (name: string, role: string) => string;
  kicker: string;
  title: string;
  lede: string;
  cardsAria: string;
  footLine1: string;
  footLine2: string;
}> = {
  zh: {
    deniedAnonymous: '需要先登录才能看。',
    deniedNotAdmin: (name, role) => `这个页面对 ${name}（role=${role}）不开放：控制台只对 role=admin 可见。`,
    kicker: 'admin console',
    title: '管理台',
    lede: '控制面上你能做的每一件事，今安静地摆在十一张卡里；单击进入前，先读卡的一句话。先看读数（观测 / 审计 / 访问账），再动手（删 / 复核 / 拉黑 / 轮换凭据）——本页不为任何人决定该不该点，只说清那一格是干什么的。',
    cardsAria: '管理台十一处入口',
    footLine1: '控制面只对 role=admin 可见；不给非 admin 任何读数——本页也不会。',
    footLine2: '想知道"刚才谁干了什么"：审计事件 ∣ 想知道"系统现在崩了吗"：观测 ∣ 想知道"谁在扫我这台"：访问账。',
  },
  en: {
    deniedAnonymous: 'You must sign in first.',
    deniedNotAdmin: (name, role) => `This page is not open to ${name} (role=${role}): the console is visible only to role=admin.`,
    kicker: 'admin console',
    title: 'Admin console',
    lede: 'Everything you can do on the control plane sits quietly in eleven cards; read the one-liner on a card before you click in. Read first (observability / audit / access log), act second (delete / review / ban / rotate credentials) — this page never decides for you whether to click, it only says what each cell does.',
    cardsAria: 'Eleven entries into the admin console',
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
            {c.lede}
          </p>
        </div>
        <AdminNav current="home" />
      </header>

      <section
        aria-label={c.cardsAria}
        className="adm-cards"
        data-admin-home-cards
      >
        {AREAS.map((area) => (
          <Link
            key={area.slug}
            href={area.href}
            data-admin-home-card={area.slug}
            className="adm-card"
          >
            <div>
              <p className="adm-slug">{area.slug}</p>
              <h2 className="adm-cardTitle">
                {locale === 'en' ? area.titleEn : area.titleZh}
              </h2>
              <p className="adm-note">{locale === 'en' ? area.noteEn : area.noteZh}</p>
            </div>
            <span
              aria-hidden="true"
              className="adm-arrow"
            >
              →
            </span>
          </Link>
        ))}
      </section>

      <footer className="adm-foot">
        <p>
          {c.footLine1} {c.footLine2}
        </p>
      </footer>
    </main>
  );
}
