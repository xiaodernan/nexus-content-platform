import type { MetadataRoute } from 'next';
import { listPublicAuthorsForShowcase } from '@/server/domain/profile';

/**
 * §FE-Sitemap — 爬取面只登 公开静态页 + 公开作者页（/u/<handle>），
 * 私有页（studio/tasks/analytics/credits/notifications/api-tokens/invites）一律不入。
 *
 * 诚实人边界：
 * - 只有 `NEXUS_SITE_ORIGIN` 配置了绝对域名（https://…）才吐出真实 sitemap；
 *   没配置就吐空集，**不生成 protocol-invalid 的相对 URL 骗爬虫**；
 * - 本页自己的存在不会让任何私有页面变得公开（robots.txt 同口径）；
 * - 动态作者条目失败（库抖动）时退化为静态集，不 500、不半张空表；
 * - 不缩 lastModified 到“今天”。有真实发布时间就写真实发布时间，没有就不写。
 */

export const dynamic = 'force-dynamic';

const ORIGIN = (process.env.NEXUS_SITE_ORIGIN ?? '').replace(/\/+$/, '');

/** 公开静态路径（顺序固定，判据逐项钉死）。 */
const STATIC_PATHS = ['/discover', '/marketplace', '/search', '/u', '/ship', '/about-nexus'] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!ORIGIN) return [];

  const entries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
    url: `${ORIGIN}${path}`,
  }));

  try {
    const authors = await listPublicAuthorsForShowcase();
    for (const author of authors) {
      if (!author.handle) continue;
      const lastModified = author.latestPublishedAt ? new Date(author.latestPublishedAt) : undefined;
      entries.push({
        url: `${ORIGIN}/u/${encodeURIComponent(author.handle)}`,
        ...(lastModified && !Number.isNaN(lastModified.getTime()) ? { lastModified } : {}),
      });
    }
  } catch {
    // 作者榜读不出来（库抖动/未迁移）就只给静态集——不半抛错给爬虫，也不装作作者路由不存在
  }

  return entries;
}
