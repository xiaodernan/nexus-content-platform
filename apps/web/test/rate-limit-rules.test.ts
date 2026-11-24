import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { IP_RATE_RULES } from '../src/server/security/rateLimit';

/**
 * IP 窗口闸的规则表是唯一真值：e2e 的 paced 跑法、ENVIRONMENT.md、`/api/admin/rate-limit`
 * 都照它读。钉住这几格是为了让"改动闸本身"是有意的、可见的——
 * 改了就必须一起改文档与这几格，不能让数字悄悄挪。
 */
describe('IP_RATE_RULES（IP 窗口闸唯一真值）', () => {
  it('恰好这 20 条——其余闸要进来得显式补，不能靠"忘加"免检', () => {
    expect(Object.keys(IP_RATE_RULES).sort()).toEqual(
      [
        'account/api-tokens',
        'account/avatar',
        'ai/explain',
        'ai/jobs',
        'ai/run',
        'ai/tide-diary',
        'ai/world-step',
        'analytics/agent-narrate',
        'auth/login',
        'auth/register',
        'bible/q',
        'blocks',
        'follow',
        'insight/analyze',
        'insight/chat',
        'insight/login',
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
    // auth/login 按 (IP, 邮箱) 分桶挡单账号爆破：10 次 / 15 分钟。
    expect(IP_RATE_RULES['auth/login']).toEqual({ limit: 10, windowMs: 900_000 });
    // insight/login 才是撞库主防面：IP 总闸 30 次 / 5 分钟，换邮箱也绕不过。
    expect(IP_RATE_RULES['insight/login']).toEqual({ limit: 30, windowMs: 300_000 });
  });

  it('这张表与代码里的闸是同一批：表里每条都有调用点，调用点也都在表里（派生，不手填）', () => {
    // 上一腿钉住的是「人写下的名单」，这一腿钉住的是「代码真实装了哪些闸」。
    // 两个方向都要：表里多一条没有读者的规则，`/api/admin/rate-limit` 端给管理员的就是一句谎；
    // 代码里多一条不在表里的闸，成本和窗口就没人写下来，面板也画不出它。
    const called = gateKeysIn(fileURLToPath(new URL('../src', import.meta.url)));
    // `auth/register`、`auth/login`、`insight/login` 是 `ipWriteGate` 之外的那一族：
    // 它们直接读 `IP_RATE_RULES[...]`，扫描器看不见，必须手工登记——
    // 漏一个就等于这道闸没写下来，管理员面板端出的是半张图。
    called.add('auth/register');
    called.add('auth/login');
    called.add('insight/login');
    const tabled = new Set(Object.keys(IP_RATE_RULES));
    const orphan = [...tabled].filter((k) => !called.has(k)).sort();
    const unlisted = [...called].filter((k) => !tabled.has(k)).sort();
    expect(orphan, `表里有 ${orphan.length} 条闸没有任何调用点：${orphan.join('；')}`).toEqual([]);
    expect(unlisted, `代码里有 ${unlisted.length} 条闸没写进表：${unlisted.join('；')}`).toEqual([]);
  });
});

/** 扫 `apps/web/src` 里所有 `ipWriteGate('<key>'` 的调用点，收成一张名单。 */
function gateKeysIn(dir: string): Set<string> {
  const needle = "ipWriteGate('";
  const out = new Set<string>();
  for (const f of tsFiles(dir)) {
    const text = readFileSync(f, 'utf8');
    let i = text.indexOf(needle);
    while (i >= 0) {
      const start = i + needle.length;
      const end = text.indexOf("'", start);
      if (end > start) out.add(text.slice(start, end));
      i = text.indexOf(needle, end);
    }
  }
  return out;
}

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return tsFiles(p);
    return n.endsWith('.ts') || n.endsWith('.tsx') ? [p] : [];
  });
}
