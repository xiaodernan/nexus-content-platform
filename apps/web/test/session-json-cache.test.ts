import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sessionResponseHeaders } from '@/server/http';

/**
 * § 会话相关 JSON 出口的 HTTP 缓存契约账本门（v666 / ADR 0098）。
 *
 * 缺口是成族、可测的：全站一族 GET 端点（`/api/auth/me`、`/api/projects`、`/api/notifications`、
 * `/api/marketplace/earnings` …）的应答随 `nexus_session` cookie 变化，却曾经清一色裸
 * `NextResponse.json`、一个缓存头都不带——把"这份结果受 cookie 影响"瞒着浏览器 / CDN / 反代。
 * 今天没共享缓存所以暂时没人存，但漏 `Vary: Cookie` 正是 §188 在 Accept-Encoding 上、v664 在
 * `/api/discover` 上立过的同一条欠账，落到 cookie 维度更危险（会把 A 用户的私人结果端给 B）。
 *
 * 为什么不逐文件硬改：普查有 20+ 个真实欠账、多数是写端点旁的 GET 与 error 分支，一次性在共享
 * 工作树上改 20+ 文件、又无法在此宿主跑真实 HTTP 合并验证，风险与噪声都过大。故采用账本
 * （与 `docs/evidence/ci/lint-debt.json` 同一纪律）：
 *  - 门 A「防新增」：任何**新的**裸奔私人 GET 出口若不在账本里 → 红。欠账不许扩散。
 *  - 门 B「DOWNWARD」：账本里的路径若已经合规（加了受认可出口）却还赖在账本里 → 红，逼同一笔
 *    修好并销账。账本只许往下减，不许只增不减，也不许"修好了没人记账"。
 *  - 门 C「头契约」：统一的 `sessionResponseHeaders()` 纯函数门，钉它默认 `Vary: Cookie` +
 *    `private, no-store`、追加而非覆盖既有 Vary、尊重调用方更具体的 cache-control、幂等。
 *  - 门 D「迁移防回退」：v666 迁的 4 个端点 GET 必须仍走 privateJson，不许退回裸 json。
 *
 * 判定刻意保守、宁可少报新增也不冤枉：整文件扫描、受认可出口用白名单匹配；账本 path 用
 * `/`-分隔、相对 `apps/web/`。这与 `session-json-cache-ledger.json` 的 population_rule 逐字一致。
 */

const WEB = join(process.cwd(), 'apps/web');
const API = join(WEB, 'src/app/api');
const LEDGER = join(WEB, 'test/session-json-cache-ledger.json');

// 与账本 population_rule / approved_exits 逐字一致的判据。
const SESSION = /currentUserOrNull|requireUser|getCurrentUser|currentUser|SESSION_COOKIE|cookies\(\)/;
const HAS_GET = /export async function GET/;
const APPROVED = /privateJson|discoverResponseHeaders|apiJson|bytesResponse|cache-control|['"]vary['"]|NO_STORE/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name === 'route.ts') out.push(p);
  }
  return out;
}

const toRel = (abs: string) => abs.replace(/\\/g, '/').replace(/^.*?\/apps\/web\//, 'apps/web/');

/** 剥掉 // 行注释与 /* *\/ 块注释，避免门把注释里提到的旧 API 名当成真代码（门不惩罚说明文字）。 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** 当前真实源码里"读 session + 有 GET + 无任何受认可出口"的文件集合。 */
function nakedGetRoutes(): Set<string> {
  const naked = new Set<string>();
  for (const file of walk(API)) {
    const src = readFileSync(file, 'utf8');
    if (!SESSION.test(src) || !HAS_GET.test(src)) continue;
    if (APPROVED.test(src)) continue;
    naked.add(toRel(file));
  }
  return naked;
}

function ledgerDebts(): string[] {
  const parsed = JSON.parse(readFileSync(LEDGER, 'utf8')) as { debts: string[] };
  return parsed.debts.map((p) => p.replace(/\\/g, '/'));
}

describe('会话 JSON 出口缓存契约账本 — 欠账不扩散、修好必销账', () => {
  it('门 A 防新增：真实裸奔集合必须是账本的子集（不许出现没登记的新裸出口）', () => {
    const naked = nakedGetRoutes();
    const debts = new Set(ledgerDebts());
    const unregistered = [...naked].filter((p) => !debts.has(p));
    expect(
      unregistered,
      `这几个读 session 的 GET 出口既无受认可缓存头、又不在账本里——新增裸奔私人响应必须当场登记或修掉:\n${unregistered.join('\n')}`,
    ).toEqual([]);
  });

  it('门 B DOWNWARD：账本里每个路径都仍须真实裸奔（合规了就必须从账本删掉）', () => {
    const naked = nakedGetRoutes();
    const debts = ledgerDebts();
    const stale = debts.filter((p) => !naked.has(p));
    expect(
      stale,
      `这些账本条目已经合规（有了 privateJson / cache-control / bytesResponse 等受认可出口）却还赖在账本里——在同一笔里删掉它们，账本只许往下减:\n${stale.join('\n')}`,
    ).toEqual([]);
  });

  it('账本无重复项：一条路径登记两次会让 DOWNWARD 的记账失真', () => {
    const debts = ledgerDebts();
    expect(new Set(debts).size, '账本有重复条目').toBe(debts.length);
  });
});

describe('sessionResponseHeaders — 会话出口的头契约（纯数据门）', () => {
  it('默认补 Vary: Cookie + private, no-store', () => {
    const h = sessionResponseHeaders();
    expect(h.vary, '应答随 cookie 变化，Cookie 必须进缓存键').toBe('Cookie');
    expect(h['cache-control'], '会话结果属于单个用户且不许下游存').toBe('private, no-store');
  });

  it('既有 Vary 时追加 Cookie 而不覆盖（保住 Accept-Encoding 等维度）', () => {
    const h = sessionResponseHeaders({ vary: 'Accept-Encoding' });
    expect(h.vary, '追加而非覆盖——否则 gzip 协商的 Vary 会被吃掉').toBe('Accept-Encoding, Cookie');
    expect(h['cache-control']).toBe('private, no-store');
  });

  it('已有 Vary 已含 Cookie 时不重复追加（幂等，不计较大小写与空格）', () => {
    expect(sessionResponseHeaders({ vary: 'Cookie' }).vary).toBe('Cookie');
    expect(sessionResponseHeaders({ vary: 'Accept-Encoding, Cookie' }).vary).toBe('Accept-Encoding, Cookie');
    expect(sessionResponseHeaders({ vary: 'cookie, Accept-Encoding' }).vary).toBe('cookie, Accept-Encoding');
  });

  it('尊重调用方已有的 cache-control，不覆盖更具体的策略', () => {
    const h = sessionResponseHeaders({ 'cache-control': 'public, max-age=60' });
    expect(h['cache-control'], '门不替调用方决定——它若真能证明可缓存，该策略必须保留').toBe('public, max-age=60');
    expect(h.vary).toBe('Cookie');
  });

  it('默认头不许声称可被共享缓存存储：无 public / max-age / s-maxage / immutable', () => {
    const cc = sessionResponseHeaders()['cache-control'];
    expect(cc).toMatch(/\bno-store\b/);
    expect(cc).toMatch(/\bprivate\b/);
    for (const forbidden of [/\bpublic\b/, /\bmax-age\b|\bs-maxage\b/, /\bimmutable\b/]) {
      expect(cc).not.toMatch(forbidden);
    }
  });
});

describe('v666 迁移的 4 个只读私人 GET 端点不许退回裸 json', () => {
  const MIGRATED = [
    'apps/web/src/app/api/auth/me/route.ts',
    'apps/web/src/app/api/projects/route.ts',
    'apps/web/src/app/api/notifications/route.ts',
    'apps/web/src/app/api/marketplace/earnings/route.ts',
  ];

  for (const rel of MIGRATED) {
    it(`${rel}：GET 走 privateJson 而非裸 NextResponse.json`, () => {
      const src = stripComments(readFileSync(join(WEB, rel.replace(/^apps\/web\//, '')), 'utf8'));
      const m = /export async function GET[^{]*\{/.exec(src);
      expect(m, `${rel} 没有 GET 了——迁移清单需要更新`).not.toBeNull();
      const start = m!.index + m![0].length;
      const next = /export (?:async )?function (?:POST|PUT|PATCH|DELETE)/.exec(src.slice(start));
      const body = src.slice(start, next ? start + next.index : src.length);
      expect(body, `${rel} 的 GET 体里没有 privateJson——缓存契约会静默丢失`).toMatch(/privateJson\(/);
      // GET 成功路径不许再出现裸 NextResponse.json（错误/其它分支不在此判据内，避免误伤）
      expect(body, `${rel} 的 GET 体里仍有裸 NextResponse.json`).not.toMatch(/NextResponse\.json\(/);
    });
  }
});
