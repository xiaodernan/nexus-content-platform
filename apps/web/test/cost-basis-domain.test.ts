import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { UsageSchema } from '@nexus/schemas';
import { MemoryRateLimiter } from '../src/server/security/rateLimitMemory';
import { getRateLimiter, setRateLimiter } from '../src/server/security/rateLimit';

/**
 * §COST-2 · `costBasis` 只能取契约值域里的值。
 *
 * 起因（2026-11-23 实读）：`/api/bible/q` 与 `/api/insight/chat` 在 `cachedTokens`、
 * `cacheReported` 旁边写死 `costBasis: 'usage'`——一个契约 enum（`unknown | configured`）
 * 里根本不存在的字面量。provider 其实**已经**算出了这一档，就在同一条 usage 上，
 * 却被这个字符串顶掉了。危害与 ADR-0262「没报 ≠ 报了 0」、ADR-0310「两个读数各说各话」同族：
 * 界面拿到一个字典里没有的值，只能归进兜底桶，于是"算得出钱"与"不知道多少钱"被压成同一句话。
 *
 * 判据是**契约自己**（`UsageSchema.shape.costBasis.safeParse`），不是测试里再抄一份清单——
 * 抄一份就又多一处会过期。
 */
const ROOT = process.cwd();

function costBasisLegal(value: string): boolean {
  return UsageSchema.shape.costBasis.safeParse(value).success;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name === 'route.ts') out.push(full);
  }
  return out;
}

describe('§COST-2 costBasis 值域门', () => {
  it('没有任何 api 路由把 costBasis 写死成契约外的字面量', () => {
    const offenders: string[] = [];
    for (const file of walk(join(ROOT, 'apps/web/src/app/api'))) {
      const src = readFileSync(file, 'utf8');
      // 只抓"赋了一个字符串字面量"的写法；透传变量不在射程内（它本来就该等于 provider 报的那一档）
      for (const m of src.matchAll(/costBasis:\s*(?:'([^']+)'|"([^"]+)")/g)) {
        const literal = m[1] ?? m[2] ?? '';
        if (!costBasisLegal(literal)) {
          offenders.push(`${file.replace(ROOT, 'repo')} → costBasis: '${literal}'`);
        }
      }
    }
    expect(offenders, `契约 enum 之外的 costBasis 字面量：\n${offenders.join('\n')}`).toEqual([]);
  });

  it('契约自己承认这两个值（防止本门写成永远绿的空门）', () => {
    expect(costBasisLegal('unknown')).toBe(true);
    expect(costBasisLegal('configured')).toBe(true);
    expect(costBasisLegal('usage')).toBe(false);
  });
});

// ── 真路由直通：问典报的是 provider 那一档，不是自造的字面量 ──

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => {
      jar.set(name, value);
    },
    delete: (name: string) => {
      jar.delete(name);
    },
  }),
}));
vi.mock('../src/server/domain/session', () => ({
  requireUser: async () => ({ id: 'user-cost-basis-gate' }),
}));
vi.mock('../src/server/observability', () => ({
  increment: () => {},
  observe: () => {},
}));

let pricingMode: 'priced' | 'absent' = 'priced';
let chatCallCount = 0;
vi.mock('../src/server/ai/client', () => ({
  chatWithCharacter: async () => {
    chatCallCount += 1;
    return {
      ok: true as const,
      response: {
        requestId: 'cost-basis-gate',
        capability: 'real' as const,
        provider: 'openai-compatible',
        model: 'gpt-6.2-sol',
        text: '典籍曰：潮候院的收件人不是人，是潮。',
        usage: {
          tokensIn: 4421,
          tokensOut: 13,
          cachedTokens: 4421,
          cacheReported: true,
          ...(pricingMode === 'priced' ? { costUsd: 0.0004, costBasis: 'configured' as const } : {}),
        },
      },
    };
  },
}));

import { POST } from '../src/app/api/bible/q/route';

function ask(ip: string, question: string): Request {
  jar.set('nexus_csrf', 'csrf-token');
  return new Request('http://localhost/api/bible/q', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': 'csrf-token', 'x-forwarded-for': ip },
    body: JSON.stringify({ question, locale: 'zh' }),
  });
}

beforeAll(() => {
  const previous = getRateLimiter();
  setRateLimiter(new MemoryRateLimiter());
  return () => setRateLimiter(previous);
});
afterAll(() => setRateLimiter(undefined));

describe('§COST-2 POST /api/bible/q 直通 provider 的成本档', () => {
  it('价目表算得出来：echo configured，且金额按轮累加（不是 0、不是自造字面量）', async () => {
    pricingMode = 'priced';
    chatCallCount = 0;
    const res = await POST(ask('203.0.113.201', '《收件人》里谁收到了签收单？'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { costBasis?: string; costUsd?: number };
    expect(body.costBasis, '必须落在契约值域内').toBe('configured');
    expect(chatCallCount).toBeGreaterThan(1);
    // 一轮 analyze + 一轮 draft 都花钱：只报最后一稿会把成本凭空少一截
    expect(body.costUsd).toBeCloseTo(0.0004 * chatCallCount, 10);
  });

  it('provider 没报单价：报 unknown + 0，字段必须存在（undefined 会被 JSON 抹掉，等于没读数）', async () => {
    pricingMode = 'absent';
    chatCallCount = 0;
    const res = await POST(ask('203.0.113.202', '第二章讲谁？'));
    expect(res.status).toBe(200);
    const raw = await res.text();
    const body = JSON.parse(raw) as Record<string, unknown>;
    expect('costBasis' in body, '缺读数也要显式说 unknown，不能把字段整个丢掉').toBe(true);
    expect(body.costBasis).toBe('unknown');
    expect(body.costUsd).toBe(0);
    expect(costBasisLegal(String(body.costBasis))).toBe(true);
  });

  it('报文里永远不出现 "usage" 这个曾经自造的值', async () => {
    pricingMode = 'priced';
    const res = await POST(ask('203.0.113.203', '铜锚在哪一篇第一次出现？'));
    const raw = await res.text();
    expect(/"costBasis":"usage"/.test(raw), `报文里出现了自造值：${raw.slice(0, 200)}`).toBe(false);
  });
});
