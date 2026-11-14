import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §SITEMAP/ROBOTS — 爬取面契约门。
 *
 * 判据：
 *  1. 两个 metadata 路由默认导出函数；force-dynamic（作者榜要库）；
 *  2. sitemap 静态集**精确**等于 ['/discover','/marketplace','/search','/u','/ship','/about-nexus']；
 *     每个路径对应的 app/<path>/page.tsx 真实存在，且**不得** requireUser/projectVisibleTo/requireAdmin
 *     （公开页面被悄悄关门口不该悄悄化）；
 *  3. 作者条目只取 `handle`，失败退化不 500；
 *  4. robots 允许 '/'；私有/admin/api/studio/tasks/invites 一律 disallow 且带尾斜杠或精确名；
 *  5. 两处都不写死绝对域名——只有 NEXUS_SITE_ORIGIN 配置才有输出物（不欺负协议）。
 */
const ROOT = process.cwd();
const SITEMAP = join(ROOT, 'apps/web/src/app/sitemap.ts');
const ROBOTS = join(ROOT, 'apps/web/src/app/robots.ts');

const sitemapSrc = readFileSync(SITEMAP, 'utf8');
const robotsSrc = readFileSync(ROBOTS, 'utf8');

const STATIC_PATHS = ['/discover', '/marketplace', '/search', '/u', '/ship', '/about-nexus'];

describe('§SITEMAP/ROBOTS 爬取面契约', () => {
  it('两个路由可读、默认导出、sitemap force-dynamic', () => {
    expect(sitemapSrc).toMatch(/export const dynamic = 'force-dynamic'/);
    expect(sitemapSrc).toContain('export default async function sitemap(');
    expect(robotsSrc).toContain('export default function robots(');
  });

  it('静态集精确等于判据清单（不是子集、不是超集）', () => {
    const m = sitemapSrc.match(/STATIC_PATHS = \[([^\]]+)\]/);
    expect(m, 'sitemap.ts 里找不到 STATIC_PATHS 字面').not.toBeNull();
    const literals = [...m![1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!);
    expect(literals).toEqual(STATIC_PATHS);
  });

  it('每个静态路径真实存在 且 不含登录门（公开页不被悄悄关门）', () => {
    for (const path of STATIC_PATHS) {
      const page = join(ROOT, 'apps/web/src/app', path, 'page.tsx');
      expect(existsSync(page), `${path} 没有对应的 page.tsx`).toBe(true);
      const body = readFileSync(page, 'utf8');
      for (const gate of ['requireUser', 'projectVisibleTo', 'requireAdmin']) {
        expect(body, `${path} 被 ${gate} 堵门——进了 sitemap 就是公开页承诺`).not.toContain(gate);
      }
    }
  });

  it('作者条目只取 handle（URL 段来自真实公开 handle，不是拼凑）', () => {
    expect(sitemapSrc).toContain('listPublicAuthorsForShowcase');
    expect(sitemapSrc).toContain('encodeURIComponent(author.handle)');
    expect(sitemapSrc).toContain('author.handle');
    // 失败退化：try/catch 有且只有一处包住作者榜
    const catchCount = (sitemapSrc.match(/} catch {/g) ?? []).length;
    expect(catchCount).toBe(1);
  });

  it('没配置 NEXUS_SITE_ORIGIN 时 sitemap 返回空集（不发协议非法相对 URL）', () => {
    expect(sitemapSrc).toContain("process.env.NEXUS_SITE_ORIGIN");
    expect(sitemapSrc).toMatch(/if \(!ORIGIN\) return \[\]/);
    expect(robotsSrc).toContain("process.env.NEXUS_SITE_ORIGIN");
    expect(robotsSrc).toContain("origin ? { sitemap: `${origin}/sitemap.xml` } : {}");
  });

  it('robots 放行 / 且私有/admin/api 面 disallow', () => {
    expect(robotsSrc).toMatch(/allow: '\/'/);
    for (const blocked of ['/admin/', '/api/', '/studio/', '/tasks/', '/invites/', '/credits', '/notifications', '/api-tokens']) {
      expect(robotsSrc, `robots 少了 disallow ${blocked}`).toContain(blocked);
    }
    // 不得出现写死的绝对地址域名（本仓库没有公网主机名）
    expect(robotsSrc).not.toMatch(/https?:\/\/[a-z0-9.-]+/i);
    expect(sitemapSrc).not.toMatch(/https?:\/\/[a-z0-9.-]+/i);
  });
});
