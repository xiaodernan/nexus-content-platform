import type { MetadataRoute } from 'next';
import { requestOrigin } from '@/lib/origin';
import { listSitemapEntries } from '@/server/domain/publish';

export const dynamic = 'force-dynamic';

/**
 * §166 sitemap。
 *
 * 清单里的每一条都必须是"爬虫点开真的能看到东西"的地址：可见性判定与
 * `resolvePublishedPath` 同一口径（unlisted / rejected / 已删除项目都不进），
 * 否则就是在教搜索引擎索引一堆 404。
 *
 * 不写 `changefreq` / `priority`：前者要的是"这一版多久变一次"的信号，
 * 而发布是就地换版本、没有规律；后者是营销话术。两个都不猜（§159）。
 * `lastmod` 用真实发布时间戳。
 */
const SITEMAP_LIMIT = 5000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { origin } = await requestOrigin();
  if (!origin) {
    // <loc> 只认绝对地址。给不出 origin 就说明这次渲染不知道自己对外叫什么——
    // 交空清单，比交一份全是相对路径（或编出来的 localhost）的坏清单好。
    console.warn('[sitemap] 没有可用的对外 origin，本次返回空清单');
    return [];
  }
  const rows = await listSitemapEntries(SITEMAP_LIMIT + 1);
  if (rows.length > SITEMAP_LIMIT) {
    console.warn(`[sitemap] 公开版本超过 ${SITEMAP_LIMIT} 条，本次只列最新的这些`);
  }
  const absolute = (path: string) => `${origin}${path}`;
  return [
    // 发现页没有"发布时间"这种东西，不拿 now() 冒充 lastmod
    { url: absolute('/discover') },
    ...rows.slice(0, SITEMAP_LIMIT).map((row) => ({
      url: absolute(row.path),
      lastModified: row.publishedAt,
    })),
  ];
}
