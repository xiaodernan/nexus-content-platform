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

beforeEach(async () => {
  await getRateLimiter().reset();
  delete process.env[ENV_KEY];
});

afterEach(async () => {
  await getRateLimiter().reset();
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
  it('头在场但读不出可用地址 → 进同一个 invalid-xff 桶，不是让路', async () => {
    const statuses: (string | null)[] = [];
    for (let n = 1; n <= 4; n += 1) {
      // 每请求换一串垃圾：旧读法下这是四个不同的桶，等于整道闸不生效
      statuses.push(
        (await ipWriteGate('projects/create', reqWith({ 'x-forwarded-for': `evil-${n}` }), 3, 60_000)).limited ? '429' : '201',
      );
    }
    expect(statuses).toEqual(['201', '201', '201', '429']);
    expect(gateIp(reqWith({ 'x-forwarded-for': 'evil-1' }))).toBe(INVALID_IP_BUCKET);
  });

  it('头缺席时这道闸让路（既有口径，不改）：换 25 次也不挡', async () => {
    for (let n = 0; n < 25; n += 1) {
      expect((await ipWriteGate('projects/create', reqWith({ 'x-anything': String(n) }), 20, 3_600_000)).limited).toBe(false);
    }
  });

  it('换着写最左端打不满限额：25 次里第 21 次起 429（右端才是桶）', async () => {
    const statuses: string[] = [];
    for (let n = 1; n <= 25; n += 1) {
      const res = await ipWriteGate('projects/create', reqWith({ 'x-forwarded-for': `192.0.2.${n % 251}, 198.51.100.9` }), 20, 3_600_000);
      statuses.push(res.limited ? '429' : '201');
    }
    expect(statuses.slice(0, 20)).toEqual(new Array(20).fill('201'));
    expect(statuses.slice(20)).toEqual(new Array(5).fill('429'));
  });

  it('右端不同才是真的换人：两批各自 20 次都放行（别把限流做成一台共享灭火器）', async () => {
    for (let n = 0; n < 20; n += 1) {
      expect(
        (await ipWriteGate('projects/create', reqWith({ 'x-forwarded-for': `203.0.113.7, 198.51.100.${n % 2}` }), 20, 3_600_000))
          .limited,
      ).toBe(false);
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

/**
 * RFC 7239 的 `Forwarded`（`for=…;by=…;proto=…;host=…`，一跳一段、逗号分隔）。
 *
 * 改之前 `readForwardedChain` 只认 `x-forwarded-for` 与 `x-real-ip` 两行，所以一个**只写
 * `Forwarded` 的请求**在处理器这里读出来是"三行头都不在场"：`gateIp()` 返回 `null`，
 * `ipWriteGate` 让路。"读不出地址"归进共享桶照样限，"这行头根本没人读"是免限流，两者差得很远。
 *
 * 但**真 HTTP 路上这一格被 Next 的一半遮住了**（`.scratch/s28-forwarded-live-probe.mts` 活体读到）：
 * `base-server.js:612` 的 `??=` 会在 XFF 缺席时填入 socket 对端，于是只写 `Forwarded` 的请求
 * 到达处理器时 XFF 是在场的——里面是**前置自己的地址**。闸于是照旧生效，只是按 POP 限：
 * 那个前置后面的所有人共用一只桶。所以这一族用例钉的是"读得到读不到"的口径（处理器契约），
 * 而"只写标准头的前置"在 Next 下的真正答案是**部署要让前置补 XFF**，见下面最后那一条用例。
 */
describe('RFC 7239 的 Forwarded：for= 才是那一跳亲眼看到的对端', () => {
  it('只写 Forwarded、不写 XFF 时也要能标识出来', () => {
    expect(clientIp(reqWith({ forwarded: 'for=192.0.2.43' }))).toBe('192.0.2.43');
    expect(gateIp(reqWith({ forwarded: 'for=192.0.2.43' }))).toBe('192.0.2.43');
  });

  it('同样取右端：客户端在 for= 里自称的地址不成为桶', () => {
    expect(clientIp(reqWith({ forwarded: 'for=192.0.2.1;by=10.0.0.1, for=198.51.100.9' }))).toBe('198.51.100.9');
  });

  it('带引号、带端口的 IPv6（RFC 7239 就是把这一整串括在引号里）', () => {
    expect(clientIp(reqWith({ forwarded: 'for="[2001:db8:cafe::1]:47116"' }))).toBe('2001:db8:cafe::1');
  });

  it('for=unknown 与混淆值不是地址：读不出，但不豁免限流', () => {
    expect(clientIp(reqWith({ forwarded: 'for=unknown' }))).toBeNull();
    expect(clientIp(reqWith({ forwarded: 'for="_gzz3"' }))).toBeNull();
    expect(gateIp(reqWith({ forwarded: 'for=unknown' }))).toBe(INVALID_IP_BUCKET);
  });

  it('by= / proto= / host= 都不许被当成对端地址', () => {
    expect(clientIp(reqWith({ forwarded: 'by=203.0.113.60;proto=https;host=example.com;for=192.0.2.43' }))).toBe('192.0.2.43');
    expect(clientIp(reqWith({ forwarded: 'by=203.0.113.60;proto=https;host=example.com' }))).toBeNull();
  });

  it('参数名大小写不敏感、等号两边允许空白', () => {
    expect(clientIp(reqWith({ forwarded: 'FOR = 192.0.2.43' }))).toBe('192.0.2.43');
  });

  it('XFF 与 Forwarded 同时在场时 XFF 说了算（一个形状只有一条链进桶键）', () => {
    expect(clientIp(reqWith({ 'x-forwarded-for': '203.0.113.7, 198.51.100.9', forwarded: 'for=192.0.2.43' }))).toBe(
      '198.51.100.9',
    );
  });

  it('上游那行是垃圾时依次退回：Forwarded，再 x-real-ip', () => {
    expect(clientIp(reqWith({ 'x-forwarded-for': 'evil', forwarded: 'for=192.0.2.43' }))).toBe('192.0.2.43');
    expect(clientIp(reqWith({ forwarded: 'for=unknown', 'x-real-ip': '198.51.100.9' }))).toBe('198.51.100.9');
  });

  it('闸：换着写左端那一跳绕不过去——25 次里第 21 次起挡', async () => {
    const statuses: string[] = [];
    for (let n = 1; n <= 25; n += 1) {
      const res = await ipWriteGate('projects/create', reqWith({ forwarded: `for=192.0.2.${n % 251}, for=198.51.100.9` }), 20, 3_600_000);
      statuses.push(res.limited ? '429' : '201');
    }
    expect(statuses.slice(0, 20)).toEqual(new Array(20).fill('201'));
    expect(statuses.slice(20)).toEqual(new Array(5).fill('429'));
  });

  it('只写 Forwarded 的请求也在闸的视野里：同一对端 25 次里第 21 次起挡', async () => {
    const statuses: string[] = [];
    for (let n = 1; n <= 25; n += 1) {
      const res = await ipWriteGate('projects/create', reqWith({ forwarded: 'for=198.51.100.9' }), 20, 3_600_000);
      statuses.push(res.limited ? '429' : '201');
    }
    expect(statuses.slice(0, 20)).toEqual(new Array(20).fill('201'));
    expect(statuses.slice(20)).toEqual(new Array(5).fill('429'));
  });

  /**
   * 活体读到的形状（`.scratch/s28-forwarded-live-probe.mts` + `probe2.mts`，打真 dev server）：
   * Next 那句 `req.headers['x-forwarded-for'] ??= socket.remoteAddress`（`base-server.js:612`）
   * 意味着**真 HTTP 路上 XFF 永在场**——前置只写 `Forwarded` 时，Next 会把**前置自己的地址**填进 XFF，
   * 而 XFF 优先。于是这一行头里的客户端链走不到，那个前置后面的**所有人共用一只桶**（＝前置的地址）。
   *
   * 实测：同一台机器上先灌满 `::1` 那一格，再发 `Forwarded: for=198.51.100.92` → **429**
   * （`retryAfterMs` 接在灌满那批之后往下走，说明桶就是 `::1`）；把同一个地址串改写进
   * `x-forwarded-for` → **404**（全新的一格）。地址一样、写法不一样 ⇒ 桶不一样。
   *
   * 这一条不是给"这样做对了"作证，是给**部署口径**作证：只写 `Forwarded` 的前置必须补 XFF，
   * 否则这道闸会把整 POP 算成一个人。见 `docs/adr/0071-…` 的后果 2 与 `docs/ENVIRONMENT.md`。
   */
  it('Next 注入的那一段会盖住 Forwarded：只写标准头的前置把自己变成一只共享桶', () => {
    const proxy = reqWith({ 'x-forwarded-for': '198.51.100.1', forwarded: 'for=192.0.2.50, for=192.0.2.51' });
    // XFF 在场且读得出 ⇒ 就是它；`Forwarded` 里那两个客户端地址一个都不进桶键
    expect(clientIp(proxy)).toBe('198.51.100.1');
    expect(gateIp(proxy)).toBe('198.51.100.1');
    // 换着写 `Forwarded` 的右端不换手：整 POP 落在前置那一只桶里
    const buckets = new Set<string>();
    for (let n = 1; n <= 8; n += 1) {
      buckets.add(gateIp(reqWith({ 'x-forwarded-for': '198.51.100.1', forwarded: `for=192.0.2.${n}` }))!);
    }
    expect([...buckets]).toEqual(['198.51.100.1']);
  });
});
