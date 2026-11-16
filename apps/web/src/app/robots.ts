import type { MetadataRoute } from 'next';
import { requestOrigin } from '@/lib/origin';

export const dynamic = 'force-dynamic';

/**
 * §166 robots.txt。
 *
 * 只放"对所有人打开就有内容"的路径：`/n/<handle>/<slug>`（§56 发布快照）、
 * `/u/<handle>`（§60 主页）、`/discover`（§61 发现流）、`/pulse`（聚合匿名观测大厅）、`/observatory`（公共观测大厅，规则外推+行动项）、`/bible` 12 卷 + 4 款游戏（quiz / well / search / whisper）。
 * 其余一律挡：
 * - `/studio`、`/world`、`/preview` 按归属判定（§80），访客点开是 404，收录了只会制造死链；
 * - `/api` 是数据与鉴权面，不是给人读的页面；
 * - `/admin` 审核台（§131）；
 * - `/search` 的结果页是查询拼出来的薄页面，收录它等于把站内搜索当成站点内容（Google 明确不推荐）；
 * - `/analytics` 是 §168 创作者自己的统计面板，按归属判定，收录了只会把别人的创作数据挂到搜索引擎上；
 * - `/notifications` 是 §164 收件箱，同上：里面写着谁点赞、谁改编了他，这些不该出现在公网结果里。
 *
 * 注意：robots 只管"要不要来抓"，不管"抓到能不能看"。unlisted 页面允许被抓但带
 * `noindex`（见 seo.ts）——因为它对匿名访客确实可见，屏蔽抓取反而会让已分享的链接
 * 出现在索引里却没有正确的 canonical 说法。真正的 private 在这里之前就已经 404。
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const { origin } = await requestOrigin();
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/n/', '/u/', '/discover', '/', '/pulse', '/observatory', '/bible', '/bible/quiz', '/bible/well', '/bible/search', '/bible/echo-001-patrol-road-notes', '/bible/echo-002-lamp-wick-notes', '/bible/echo-003-salt-lamp-vigil-diary', '/bible/echo-004-ninth-knock', '/bible/echo-005-lamp-rope-memoir', '/bible/echo-006-the-handoff-of-the-lamp', '/bible/001-last-ember-of-the-tide-conclave', '/bible/002-the-forty-first-convocation', '/bible/003-the-tide-sand-table', '/bible/004-the-eighth-lamp', '/bible/005-letters-never-posted', '/bible/006-the-final-seal'],
        disallow: ['/studio', '/world', '/preview', '/api', '/admin', '/search', '/analytics', '/notifications'],
      },
    ],
    ...(origin ? { sitemap: [`${origin}/sitemap.xml`] } : {}),
  };
}
