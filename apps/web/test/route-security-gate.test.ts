import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 安全结构门（§SECURITY / ADR-0002 的横向收口）。
 *
 * 这一组不测某个端点的行为，测的是**路由文件的形状**——因为「漏了一道门」在响应码上
 * 完全看不出差别：一条忘了 `csrfOk` 的写路由，正常请求照样 200。只有从代码形状上钉，
 * 新加一条路由时才会在这里红，而不是等一次事故。
 *
 * 三条不变量（2026-10-23 横向审计核过的现状，不是理想）：
 * 1. 用 cookie 会话身份（`requireUser` / `currentUserOrNull`）的写路由必须过 `csrfOk`。
 *    例外只有「只读 POST / 405 stub」——它们不改任何状态，见 `CSRF_EXEMPT` 的逐条理由。
 * 2. v1 公网写路由必须过 `authorizeApiRequest`（API-key），不许有裸端点。
 * 3. `published/*` 是**匿名可写**入口：`csrfOk` 与 `getRateLimiter` 缺一不可
 *    （否则可被刷统计 / 打库）。
 *
 * 为什么不是「每个写路由都要限流」：限流不是免费的（每个入口一份窗口状态），
 * 只有匿名可写与高频入口才值得。把「全都要」写成不变量会逼着人给低频管理端也塞一个
 * 形式上的限流——那是给不存在的保护留一段代码（§159 的反面）。
 */

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const API_DIR = join(REPO_ROOT, 'apps', 'web', 'src', 'app', 'api');

/** 递归收 `api/` 下所有 .ts，相对路径统一成正斜杠（Windows 上 join 出的是反斜杠） */
function routeSources(): { rel: string; source: string }[] {
  const out: { rel: string; source: string }[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!full.endsWith('.ts')) continue;
      out.push({
        rel: full.slice(API_DIR.length).replaceAll('\\', '/'),
        source: readFileSync(full, 'utf8').replace(/\r\n/g, '\n'),
      });
    }
  };
  walk(API_DIR);
  return out;
}

const WRITE_EXPORT = /export\s+async\s+function\s+(POST|PATCH|DELETE|PUT)\b/;
const COOKIE_IDENTITY = /\b(requireUser|currentUserOrNull)\s*\(/;
const CSRF = /\bcsrfOk\s*\(/;
const RATE_LIMIT = /\bgetRateLimiter\s*\(/;
const API_KEY = /\bauthorizeApiRequest\s*\(/;
const MUTATION =
  /\b(recordVisit|recordGameCompletion|softDeleteProject)\s*\(|\.(update|insert|delete)\s*\(/;

/**
 * 不要求 CSRF 的写路由——每一条都要说得出「它不改状态」。
 * 名单只许缩不许涨：往里加一条等于给一个写入口免掉 CSRF，必须在 review 里被看见。
 */
const CSRF_EXEMPT = new Map<string, string>([
  ['/projects/[projectId]/knowledge/block/route.ts', '只读：取整块语料'],
  ['/projects/[projectId]/knowledge/search/route.ts', '只读：检索'],
  ['/projects/[projectId]/retrieve/route.ts', '只读：检索'],
  ['/realtime/route.ts', 'POST 是 405 stub，通道只读'],
]);

describe('安全结构门：写路由的三道门必须齐', () => {
  const routes = routeSources();
  const writes = routes.filter((r) => WRITE_EXPORT.test(r.source));

  it('扫到的写路由不是空集（空集不能绿成「一致」）', () => {
    expect(writes.length, `${API_DIR} 下一条写路由都没扫到，下面几条是在比空集`).toBeGreaterThanOrEqual(40);
  });

  it('用 cookie 会话身份的写路由必须过 csrfOk（只读 / 405 stub 除外）', () => {
    const offenders = writes
      .filter((r) => COOKIE_IDENTITY.test(r.source) && !CSRF.test(r.source))
      .filter((r) => !CSRF_EXEMPT.has(r.rel))
      .map((r) => r.rel);
    expect(
      offenders,
      `这些写路由用了 cookie 身份却没有 csrfOk（可被跨站伪造）：${offenders.join(' ')}`,
    ).toEqual([]);
  });

  it('例外名单不许烂、也不许悄悄扩大：每条都还在，且真的不写库', () => {
    const byRel = new Map(writes.map((r) => [r.rel, r.source]));
    for (const [rel, why] of CSRF_EXEMPT) {
      const source = byRel.get(rel);
      expect(
        source,
        `例外名单里的 ${rel}（${why}）已经不存在或不再是写路由：名单要跟着删，否则它只是给未来开的口子`,
      ).toBeDefined();
      expect(
        MUTATION.test(source!),
        `${rel} 被标成「${why}」，但源码里出现了写库调用：它不该再免 CSRF`,
      ).toBe(false);
    }
  });

  it('v1 公网写路由必须过 authorizeApiRequest（API-key）', () => {
    const v1 = writes.filter((r) => r.rel.startsWith('/v1/'));
    expect(v1.length, 'v1 下一条写路由都没扫到').toBeGreaterThanOrEqual(3);
    const offenders = v1.filter((r) => !API_KEY.test(r.source)).map((r) => r.rel);
    expect(offenders, `这些 v1 写路由没有 API-key 校验：${offenders.join(' ')}`).toEqual([]);
  });

  it('published/* 匿名可写：csrfOk 与 getRateLimiter 缺一不可', () => {
    const pub = writes.filter((r) => r.rel.startsWith('/published/'));
    expect(pub.length, 'published 下一条写路由都没扫到').toBeGreaterThanOrEqual(4);
    const missing = pub
      .filter((r) => !CSRF.test(r.source) || !RATE_LIMIT.test(r.source))
      .map((r) => r.rel);
    expect(missing, `这些匿名写入口缺 CSRF 或限流（可被刷统计 / 打库）：${missing.join(' ')}`).toEqual([]);
  });
});
