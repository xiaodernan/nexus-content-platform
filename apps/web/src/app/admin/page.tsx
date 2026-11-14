import Link from 'next/link';
import { currentUserOrNull } from '@/server/domain/session';
import { AdminNav } from '@/components/AdminNav';

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
 */
const AREAS = [
  { slug: 'users', href: '/admin/users', title: '账号与角色', note: '看账号、改角色与套餐、回收游客账号——营业员的眼睛，不会误删。' },
  { slug: 'moderation', href: '/admin/moderation', title: '复核台', note: '违规与被举报的内容逐条过眼：接受、驳回、保持——每一票带读屏可见标签。' },
  { slug: 'marketplace', href: '/admin/marketplace', title: '市场工单', note: '售后争议（退款、投诉、交付）人工结案——客服队列的硬门。' },
  { slug: 'audit', href: '/admin/audit', title: '审计事件', note: '跨实例的 append-only 审计流按时间筛——谁在什么时候干了什么。' },
  { slug: 'realtime', href: '/admin/realtime', title: '实时总线', note: '线路帧计数：发布总数/过大丢弃/线路失败/熔断状态—— wire 上真正在发生的事。' },
  { slug: 'rate-limit', href: '/admin/rate-limit', title: '限流闸', note: '每客户端令牌桶 live 读数—— memory 诚实说自己按副本数翻倍，redis 真实 PING。' },
  { slug: 'access', href: '/admin/access', title: '访问账', note: '全平台凭据热点：谁在扫库、哪一枚 token 最热——按 1/7/30 天分档。' },
  { slug: 'observability', href: '/admin/observability', title: '观测', note: '进程计数器（本实例）+ 库里三账（跨重启）——两半，别合并。' },
  { slug: 'gateway', href: '/admin/gateway', title: '网关态势', note: '网关此刻给谁路由、注册中心记着谁、每实例还活不活——错处自现。' },
  { slug: 'discover-cache', href: '/admin/discover-cache', title: '发现页缓存', note: '/discover 缓存的命中/水位/失效总线心跳——读缓存，不动缓存。' },
  { slug: 'health', href: '/admin/health', title: '健康总览', note: 'ai/java/gateway/redis/postgres 五层一致性——拿不到就是“未测到”，不是down；每层独立超时。' },
] as const;

export default async function AdminHomePage() {
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="adm-denied" data-admin-denied="anonymous">
        <h1 className="adm-deniedTitle">管理台</h1>
        <p className="adm-deniedText">需要先登录才能看。</p>
      </main>
    );
  }
  if (user.role !== 'admin') {
    return (
      <main className="adm-denied" data-admin-denied="not-admin">
        <h1 className="adm-deniedTitle">管理台</h1>
        <p className="adm-deniedText">
          这个页面对 {user.displayName}（role={user.role}）不开放：控制台只对 role=admin 可见。
        </p>
      </main>
    );
  }

  return (
    <main className="adm-shell" data-admin-home-root>
      <header className="adm-head">
        <div>
          <p className="adm-kicker" data-admin-home-kicker>
            admin console
          </p>
          <h1 className="adm-title">
            管理台
          </h1>
          <p className="adm-lede">
            控制面上你能做的每一件事，今安静地摆在十一张卡里；单击进入前，先读卡的一句话。
            先看读数（观测 / 审计 / 访问账），再动手（删 / 复核 / 拉黑 / 轮换凭据）——
            本页不为任何人决定该不该点，只说清那一格是干什么的。
          </p>
        </div>
        <AdminNav current="home" />
      </header>

      <section
        aria-label="管理台十一处入口"
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
                {area.title}
              </h2>
              <p className="adm-note">{area.note}</p>
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
          控制面只对 role=admin 可见；不给非 admin 任何读数——本页也不会。
          想知道"刚才谁干了什么"：审计事件 ∣ 想知道"系统现在崩了吗"：观测 ∣ 想知道"谁在扫我这台"：访问账。
        </p>
      </footer>
    </main>
  );
}
