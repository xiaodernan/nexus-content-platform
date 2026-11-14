import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §166 sitemap.xml / robots.txt 接线判据（2026-11-14 事故重写）。
 *
 * 历史：2026-11 曾有一片把这两份 metadata 路由改写成"静态公开页清单 + NEXUS_SITE_ORIGIN"的版本，
 * 把原有的真实发布路径清单和 `requestOrigin()` 信任链覆盖了。本判据把**原设计**钉死，
 * 防止任何人为了"顺手加进几个页"再一次悄悄抹掉它：
 */
const ROOT = process.cwd();
const SITEMAP = join(ROOT, 'apps/web/src/app/sitemap.ts');
const ROBOTS = join(ROOT, 'apps/web/src/app/robots.ts');
const ORIGIN_LIB = join(ROOT, 'apps/web/src/lib/origin.ts');
const PUBLISH_DOMAIN = join(ROOT, 'apps/web/src/server/domain/publish.ts');

const sitemapSrc = readFileSync(SITEMAP, 'utf8');
const robotsSrc = readFileSync(ROBOTS, 'utf8');
const originLibSrc = readFileSync(ORIGIN_LIB, 'utf8');
const publishDomainSrc = readFileSync(PUBLISH_DOMAIN, 'utf8');

describe('§166 /sitemap.xml 接线', () => {
  it('force-dynamic + 走 requestOrigin()（不写死 origin、不瞎猜 localhost）', () => {
    expect(sitemapSrc).toMatch(/export const dynamic = 'force-dynamic'/);
    expect(sitemapSrc).toContain("from '@/lib/origin'");
    expect(sitemapSrc).toContain('requestOrigin');
    expect(sitemapSrc).not.toContain('NEXUS_SITE_ORIGIN');
    // 拿不到 origin 就空清单（page 不 500、不发假 <loc>）
    expect(sitemapSrc).toContain('if (!origin) {');
  });

  it('发布路径来自真实查询（listSitemapEntries），不手写清单', () => {
    expect(sitemapSrc).toContain("from '@/server/domain/publish'");
    expect(sitemapSrc).toContain('listSitemapEntries(');
    expect(sitemapSrc).toContain('SITEMAP_LIMIT');
    expect(sitemapSrc).toContain('absolute(');
    // 发布域查询确实只放 public + 非 rejected + 未删（信任链在 domain 层，判据随附）
    expect(publishDomainSrc).toContain("eq(publishedProjects.visibility, 'public')");
    expect(publishDomainSrc).toContain("ne(publishedProjects.moderation, 'rejected')");
    expect(publishDomainSrc).toContain('isNull(projects.deletedAt)');
  });

  it('changefreq / priority 不猜；lastmod 只用真实发布时间', () => {
    expect(sitemapSrc).not.toMatch(/changeFrequency\s*:/);
    expect(sitemapSrc).not.toMatch(/priority\s*:/);
    expect(sitemapSrc).toContain('lastModified: row.publishedAt');
    expect(sitemapSrc).toContain('discover');
  });
});

describe('§166 /robots.txt 接线', () => {
  it('走 requestOrigin()，allow 清单只含大门 + 三个公开门', () => {
    expect(robotsSrc).toMatch(/export const dynamic = 'force-dynamic'/);
    expect(robotsSrc).toContain("from '@/lib/origin'");
    expect(robotsSrc).toContain('requestOrigin');
    expect(robotsSrc).not.toContain('NEXUS_SITE_ORIGIN');
    expect(robotsSrc).toMatch(/allow: \['\/n\/', '\/u\/', '\/discover', '\/'\]/);
  });

  it('私有/归属判定/API 面全部 disallow（含 search、analytics、notifications、admin）', () => {
    for (const blocked of ['/studio', '/world', '/preview', '/api', '/admin', '/search', '/analytics', '/notifications']) {
      expect(robotsSrc, `robots.txt 缺 disallow ${blocked}`).toContain(blocked);
    }
  });

  it('sitemap 仅在有 origin 时出现（没配就不写）', () => {
    expect(robotsSrc).toMatch(/origin \? \{ sitemap: \[`\$\{origin\}\/sitemap\.xml`\] \} : \{\}/);
  });
});

describe('§166 origin 信任链（lib/origin.ts）', () => {
  it('配置优先：NEXUS_PUBLIC_ORIGIN 被采用，且用 URL().origin 的语义', () => {
    expect(originLibSrc).toContain('NEXUS_PUBLIC_ORIGIN');
    expect(originLibSrc).toContain('URL(');
  });

  it('headers 兜底只有成对协议头才采信；两者皆无 → 编不出地址时不返回猜测值', () => {
    expect(originLibSrc).toContain('x-forwarded-host');
    expect(originLibSrc).toContain('x-forwarded-proto');
    expect(originLibSrc).toContain('null');
  });
});
