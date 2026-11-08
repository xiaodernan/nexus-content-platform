import { describe, expect, it } from 'vitest';
import { IP_RATE_RULES } from '../src/server/security/rateLimit';

/**
 * IP 窗口闸的规则表是唯一真值：e2e 的 paced 跑法、ENVIRONMENT.md、`/api/admin/rate-limit`
 * 都照它读。钉住这几格是为了让"改动闸本身"是有意的、可见的——
 * 改了就必须一起改文档与这几格，不能让数字悄悄挪。
 */
describe('IP_RATE_RULES（IP 窗口闸唯一真值）', () => {
  it('恰好这 11 条——其余闸要进来得显式补，不能靠"忘加"免检', () => {
    expect(Object.keys(IP_RATE_RULES).sort()).toEqual(
      [
        'account/api-tokens',
        'account/avatar',
        'ai/jobs',
        'ai/run',
        'auth/register',
        'blocks',
        'follow',
        'marketplace/create',
        'projects/create',
        'published/interact',
        'published/report',
      ].sort(),
    );
  });

  it('每一格都是正数（limit ≥ 1，窗口 ≥ 1 分钟）——缺成本号等于没装', () => {
    for (const [route, rule] of Object.entries(IP_RATE_RULES)) {
      expect(rule.limit, route).toBeGreaterThanOrEqual(1);
      expect(rule.windowMs, route).toBeGreaterThanOrEqual(60_000);
    }
  });

  it('e2e 的节奏按这两格算：projects/create 20 次/小时、auth/register 10 次/小时', () => {
    expect(IP_RATE_RULES['projects/create']).toEqual({ limit: 20, windowMs: 3_600_000 });
    expect(IP_RATE_RULES['auth/register']).toEqual({ limit: 10, windowMs: 3_600_000 });
  });
});
