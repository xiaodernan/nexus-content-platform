import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clientIp, gateIp, getRateLimiter, INVALID_IP_BUCKET, ipWriteGate, rateKey } from '../src/server/security/rateLimit';

/**
 * `x-forwarded-for` 的读法。
 *
 * 这条链的写法是**追加**：每一跳把自己亲眼看到的对端补在最右边。所以左边那些段是
 * "上游谁说的"，最右边那一段才是"离本应用最近的那一跳说：这就是我接到的连接"。
 * 取最左端＝取客户端随手写的那一行——每请求换一个值就换一个限流桶，13 处
 * `ipWriteGate` 与 30 处 `rateKey(route, clientIp(req), user.id)` 的按 IP 那半当场空转。
 *
 * 还有一条不是假设的事实：`node_modules/next/dist/server/base-server.js:612` 用的是
 * `req.headers['x-forwarded-for'] ??= originalRequest.socket.remoteAddress`——**头缺席时**
 * 才拿 socket 地址填，头在场时原样透传，不追加也不校验。所以"客户端自带一行头"与
 * "Next 自己填的"在处理器里长得一模一样，代码分辨不出来；能分辨的只有部署拓扑
 * （`NEXUS_TRUSTED_PROXY_COUNT`），这条限度写在 ADR-0070 的后果里，不在这里假装解决。
 */

function reqWith(headers: Record<string, string>): Request {
  return new Request('http://localhost:3100/api/projects', { headers });
}

const ENV_KEY = 'NEXUS_TRUSTED_PROXY_COUNT';
const savedEnv = process.env[ENV_KEY];

beforeEach(() => {
  getRateLimiter().reset();
  delete process.env[ENV_KEY];
});

afterEach(() => {
  getRateLimiter().reset();
  if (savedEnv === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = savedEnv;
});

describe('clientIp：取可信链的右端，不是客户端写的最左端', () => {
  it('反代追加过的链条：右端是它亲眼看到的对端，左端是客户端自称的', () => {
    expect(clientIp(reqWith({ 'x-forwarded-for': '203.0.113.7, 198.51.100.9' }))).toBe('198.51.100.9');
  });

  it('换着写最左端不再换桶（这是"一行头绕过整道闸"的那条路）', () => {
    const seen = new Set<string | null>();
    for (let n = 1; n <= 3; n += 1) {
      seen.add(clientIp(reqWith({ 'x-forwarded-for': `192.0.2.${n}, 198.51.100.9` })));
    }
    expect([...seen]).toEqual(['198.51.100.9']);
  });

  it('只有一段时就是那一段——dev 下 Next 用 socket 地址填进来的那一版照旧可用', () => {
    expect(clientIp(reqWith({ 'x-forwarded-for': '::1' }))).toBe('::1');
    expect(clientIp(reqWith({ 'x-forwarded-for': '203.0.113.7' }))).toBe('203.0.113.7');
  });

  it('链条比声明的跳数短就取到最左可用段（缺的跳只可能是客户端自己那一跳）', () => {
    process.env[ENV_KEY] = '3';
    expect(clientIp(reqWith({ 'x-forwarded-for': '198.51.100.9' }))).toBe('198.51.100.9');
  });

  it('NEXUS_TRUSTED_PROXY_COUNT 把右端往左挪：两级可信跳时客户端在倒数第二段', () => {
    process.env[ENV_KEY] = '2';
    expect(clientIp(reqWith({ 'x-forwarded-for': '203.0.113.7, 198.51.100.9, 203.0.113.20' }))).toBe('198.51.100.9');
  });

  it('非法的计数值退回 1，不退回"最左端"那种旧读法', () => {
    for (const raw of ['0', '-2', 'abc', '', '1.5', '99']) {
      process.env[ENV_KEY] = raw;
      expect(clientIp(reqWith({ 'x-forwarded-for': '203.0.113.7, 198.51.100.9' }))).toBe('198.51.100.9');
    }
  });

  it('带端口的 IPv4 与方括号里的 IPv6：归一化成地址本身', () => {
    expect(clientIp(reqWith({ 'x-forwarded-for': '203.0.113.7, 198.51.100.9:5000' }))).toBe('198.51.100.9');
    expect(clientIp(reqWith({ 'x-forwarded-for': '203.0.113.7, [2001:db8::1]:443' }))).toBe('2001:db8::1');
  });

  it('回落 x-real-ip（nginx 的 $remote_addr 是被覆盖写的，不是追加的）', () => {
    expect(clientIp(reqWith({ 'x-real-ip': '198.51.100.9' }))).toBe('198.51.100.9');
    expect(clientIp(reqWith({ 'x-forwarded-for': 'not-an-ip', 'x-real-ip': '198.51.100.9' }))).toBe('198.51.100.9');
  });

  it('头整个缺席 → 标识不出来（审计与限流都按"没有 IP"记，不编一个）', () => {
    expect(clientIp(reqWith({}))).toBeNull();
    expect(gateIp(reqWith({}))).toBeNull();
  });

  it('审计口径：垃圾头不算"有 IP"', () => {
    expect(clientIp(reqWith({ 'x-forwarded-for': 'unknown, , , ' }))).toBeNull();
  });
});

describe('ipWriteGate：垃圾头不该换来免限流', () => {
  it('头在场但读不出可用地址 → 进同一个 invalid-xff 桶，不是让路', () => {
    const statuses: (string | null)[] = [];
    for (let n = 1; n <= 4; n += 1) {
      // 每请求换一串垃圾：旧读法下这是四个不同的桶，等于整道闸不生效
      statuses.push(ipWriteGate('projects/create', reqWith({ 'x-forwarded-for': `evil-${n}` }), 3, 60_000).limited ? '429' : '201');
    }
    expect(statuses).toEqual(['201', '201', '201', '429']);
    expect(gateIp(reqWith({ 'x-forwarded-for': 'evil-1' }))).toBe(INVALID_IP_BUCKET);
  });

  it('头缺席时这道闸让路（既有口径，不改）：换 25 次也不挡', () => {
    for (let n = 0; n < 25; n += 1) {
      expect(ipWriteGate('projects/create', reqWith({ 'x-anything': String(n) }), 20, 3_600_000).limited).toBe(false);
    }
  });

  it('换着写最左端打不满限额：25 次里第 21 次起 429（右端才是桶）', () => {
    const statuses: string[] = [];
    for (let n = 1; n <= 25; n += 1) {
      const res = ipWriteGate('projects/create', reqWith({ 'x-forwarded-for': `192.0.2.${n % 251}, 198.51.100.9` }), 20, 3_600_000);
      statuses.push(res.limited ? '429' : '201');
    }
    expect(statuses.slice(0, 20)).toEqual(new Array(20).fill('201'));
    expect(statuses.slice(20)).toEqual(new Array(5).fill('429'));
  });

  it('右端不同才是真的换人：两批各自 20 次都放行（别把限流做成一台共享灭火器）', () => {
    for (let n = 0; n < 20; n += 1) {
      expect(ipWriteGate('projects/create', reqWith({ 'x-forwarded-for': `203.0.113.7, 198.51.100.${n % 2}` }), 20, 3_600_000).limited).toBe(false);
    }
  });
});

describe('限流键形状没变（SECURITY.md：路由 + 身份 + IP）', () => {
  it('rateKey 仍按三段拼，右端读法只换第三段的值', () => {
    expect(rateKey('auth/login', '9.9.9.9', 'u')).toBe('auth/login|u|9.9.9.9');
    expect(rateKey('auth/register', null)).toBe('auth/register|anon|no-ip');
    expect(rateKey('projects/create', clientIp(reqWith({ 'x-forwarded-for': '203.0.113.7, 198.51.100.9' })))).toBe(
      'projects/create|anon|198.51.100.9',
    );
  });
});
