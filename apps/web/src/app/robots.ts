import type { MetadataRoute } from 'next';

/**
 * §FE-Robots — 节制爬虫体积，不劝退：
 * - 所有真正半公开/私有面一律 Disallow（studio、tasks、analytics、credits、notifications、api-tokens、invites）；
 * - `/admin/*` 与 `/api/*` 不参与索引；
 * - 不写死 Sitemap 绝对地址：只有 `NEXUS_SITE_ORIGIN` 配置时才出现（没配置就不出），
 *   不产出 protocol-invalid 值。
 */
export default function robots(): MetadataRoute.Robots {
  const origin = (process.env.NEXUS_SITE_ORIGIN ?? '').replace(/\/+$/, '');

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin/',
          '/api/',
          '/studio/',
          '/tasks/',
          '/game/',
          '/world/',
          '/analytics',
          '/credits',
          '/notifications',
          '/api-tokens',
          '/invites/',
        ],
      },
    ],
    ...(origin ? { sitemap: `${origin}/sitemap.xml` } : {}),
  };
}
