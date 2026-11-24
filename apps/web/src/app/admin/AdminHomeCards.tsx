import Link from 'next/link';
import type { Locale } from '@/lib/i18n';

export const ADMIN_AREAS = [
  { slug: 'observe', href: '/admin/observe', titleZh: '观察站（只读 · 口令 123）', titleEn: 'Observer (read-only · pass 123)', noteZh: '口令 123 公开进入。看平台所有用户的真实行为——注册、打开、点赞、评论、收藏、任务结局与规则建议', noteEn: 'Pass 123 to enter. What every real user on the platform does — signups, opens, likes, comments, saves, task outcomes, rule-based advice.' },
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
  { slug: 'behavior-sim', href: '/admin/behavior-sim', titleZh: '行为演练', titleEn: 'Behavior drill', noteZh: '合成用户行为模拟：没耐心就关掉、乱点、深读者……只进入疑似爬虫口径，不冒充真实用户观测。', noteEn: 'Synthetic user-behavior drills: rushers, random clicks and idle readers enter only the suspected-bot tally, never observed real-user behavior.' },
  { slug: 'health', href: '/admin/health', titleZh: '健康总览', titleEn: 'Health', noteZh: 'ai/java/gateway/redis/postgres 五层一致性——拿不到就是“未测到”，不是down；每层独立超时。', noteEn: 'ai/java/gateway/redis/postgres five-layer consistency — unreachable means “unmeasured”, never down; each layer has its own timeout.' },
  { slug: 'canon-review', href: '/admin/canon-review', titleZh: '正典评审', titleEn: 'Canon review', noteZh: '仅在已配置且可用的真实 provider 下评审候选回响：对照全部既有锚句逐条挑疑似新专名、设定冲突、锚句撞句与能否进正典。只读，不改写候选。', noteEn: 'Only with an available configured real provider: review a candidate echo against every existing anchor for new proper nouns, setting conflicts, anchor collisions and canon eligibility. Read-only.' },
] as const;

const CARDS_ARIA: Record<Locale, (count: number) => string> = {
  zh: (count) => `管理台${count}处入口`,
  en: (count) => `${count} entries into the admin console`,
};

export function AdminHomeCards({ locale }: { locale: Locale }) {
  return (
    <section aria-label={CARDS_ARIA[locale](ADMIN_AREAS.length)} className="adm-cards" data-admin-home-cards>
      {ADMIN_AREAS.map((area) => (
        <Link key={area.slug} href={area.href} data-admin-home-card={area.slug} className="adm-card">
          <div>
            <p className="adm-slug">{area.slug}</p>
            <h2 className="adm-cardTitle">{locale === 'en' ? area.titleEn : area.titleZh}</h2>
            <p className="adm-note">{locale === 'en' ? area.noteEn : area.noteZh}</p>
          </div>
          <span aria-hidden="true" className="adm-arrow">→</span>
        </Link>
      ))}
    </section>
  );
}
