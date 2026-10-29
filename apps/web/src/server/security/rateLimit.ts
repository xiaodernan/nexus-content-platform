/**
 * 速率限制：滑动窗口（SECURITY.md「认证与授权」——按 用户 + IP + 路由）。
 *
 * 后端可替换（§64）：默认用进程内内存驱动，够用且单进程 dev 正确。
 * 生产多实例时换成 Redis 驱动（ZRANGEBYSCORE + ZADD 的有序集滑动窗口），
 * 保持本接口形状不变即可——和 storage 的 resolveStorage 一个套路。
 * 内存驱动在多实例下退化为「每实例独立限流」，这是要接 Redis 的原因，
 * 但绝不是「不限量」：单实例仍能挡住暴力破解。
 */

import { increment } from '../observability';

export interface RateLimiter {
  /** 记一次命中并返回是否放行；同时回带当前窗口计数供 Retry-After 参考。 */
  hit(key: string, limit: number, windowMs: number): { allowed: boolean; count: number; retryAfterMs: number };
  reset(key?: string): void;
}

class MemoryRateLimiter implements RateLimiter {
  private readonly hits = new Map<string, number[]>();

  hit(key: string, limit: number, windowMs: number): { allowed: boolean; count: number; retryAfterMs: number } {
    const now = Date.now();
    const cutoff = now - windowMs;
    const window = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    const allowed = window.length < limit;
    if (allowed) window.push(now);
    this.hits.set(key, window);
    /**
     * 只取键的第一段（路由字面量）当标签，不看后面两段。
     * 限流键的形状是 `路由|身份|IP`，而 `auth/login` 那一格的"身份"传的是**邮箱**
     * （`rateKey('auth/login', ip, parsed.data.email.toLowerCase())`）——整串键进指标标签，
     * 等于把账号名单与 IP 抄进一个内存里长住、访问面还可能更宽的地方。
     * 闸的判定次数不需要知道是谁；要查具体人时去审计表，那张表有访问门与保留期。
     */
    increment('nexus_rate_limit_decisions_total', { gate: key.split('|')[0] ?? 'unknown', allowed: String(allowed) });
    // 窗口里最早那条到期的时间 = 再过多久能腾出一个名额。
    const oldest = window[0] ?? now;
    return { allowed, count: window.length, retryAfterMs: allowed ? 0 : Math.max(0, oldest + windowMs - now) };
  }

  reset(key?: string): void {
    if (key === undefined) this.hits.clear();
    else this.hits.delete(key);
  }
}

let singleton: RateLimiter | undefined;

export function getRateLimiter(): RateLimiter {
  if (!singleton) singleton = new MemoryRateLimiter();
  return singleton;
}

/**
 * 反代链上我们信几跳（从面向本应用的那一跳开始数）。默认 1。
 *
 * 决定"从右边数第几段"，不是"信不信反代"的开关：`x-forwarded-for` 的写法是**追加**，
 * 每一跳把自己亲眼看到的对端补到最右边，所以最右那一段才是"离本应用最近的连接"，
 * 它左边的全部是上游（或客户端自己）说的。一级可信反代 ⇒ 取最右；两级（CDN → LB → 本机）
 * ⇒ 最右那段是 LB 看到的 CDN 出口地址，客户端在倒数第二段 ⇒ 取 2。
 */
const DEFAULT_TRUSTED_PROXY_COUNT = 1;
/** 超过这个数就是配错了（没有哪个真实拓扑有这么长）——宁可退回默认，也不要"从左边数"。 */
const MAX_TRUSTED_PROXY_COUNT = 8;

/**
 * 头在场、但一个地址都解析不出来时，闸把这批请求归到这一个桶里。
 * 不是豁免：写一行 `x-forwarded-for: whatever` 若能换来免限流，那就是给所有 IP 闸留了
 * 一条"垃圾头绕过去"的公共出口。旧读法给每一串不同的垃圾各开一只桶，效果就是绕过去；
 * 归进同一只桶才是"限住"。
 */
export const INVALID_IP_BUCKET = 'invalid-xff';

function trustedProxyCount(): number {
  const raw = process.env.NEXUS_TRUSTED_PROXY_COUNT;
  if (raw === undefined || raw.trim() === '') return DEFAULT_TRUSTED_PROXY_COUNT;
  const n = Number(raw);
  // 读不出可信跳数就按"一级可信"走：这是 dev（Next 用 socket 地址填那一格）与
  // 单反代部署的共同形状，而且**绝不会**退回"取最左端"那种客户端想写什么就写什么的读法。
  if (!Number.isInteger(n) || n < 1 || n > MAX_TRUSTED_PROXY_COUNT) return DEFAULT_TRUSTED_PROXY_COUNT;
  return n;
}

/**
 * 把一段写进限流键的地址归一化：去空白、去方括号、去 IPv4 的端口，认不出的一律 null。
 * 认不出来就当它不存在（链条短一段），而不是当它"是一个身份"——`evil-1` 拼进桶键
 * 与 `1.2.3.4` 拼进桶键，对闸来说没有区别，那正是旧读法能被一行头绕过的原因。
 */
function normalizeAddress(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const bracketed = /^\[(.*)\](?::\d{1,5})?$/.exec(text);
  const body = bracketed ? bracketed[1]!.trim() : text;
  const v4 = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::\d{1,5})?$/.exec(body);
  if (v4) {
    const ip = v4[1]!;
    return ip.split('.').every((octet) => Number(octet) <= 255) ? ip : null;
  }
  // IPv6：至少有一个冒号，且只剩十六进制、冒号、`::` 缩写里那些合法字符
  if (body.includes(':') && /^[0-9a-fA-F:.%]+$/.test(body)) return body;
  return null;
}

interface ForwardedChain {
  /** 请求里到底有没有这一行头——「没有」与「有但读不出」在闸那里是两种处理，不能混。 */
  headerPresent: boolean;
  /** 从右往左排的可信段在读不出时已被丢掉；空数组＝这一行头里没有一个地址。 */
  tokens: string[];
}

function readForwardedChain(request: Request): ForwardedChain {
  const realRaw = request.headers.get('x-real-ip');
  const real = realRaw === null ? null : normalizeAddress(realRaw);
  const xff = request.headers.get('x-forwarded-for');
  if (xff !== null) {
    const tokens = xff
      .split(',')
      .map(normalizeAddress)
      .filter((token): token is string => token !== null);
    if (tokens.length > 0) return { headerPresent: true, tokens };
    // XFF 一整行都是垃圾时退回 x-real-ip：有反代时那是**覆盖写**的字段
    // （nginx `X-Real-IP $remote_addr`），客户端写的那一份早被冲掉了。
    return { headerPresent: true, tokens: real ? [real] : [] };
  }
  if (real) return { headerPresent: true, tokens: [real] };
  return { headerPresent: realRaw !== null, tokens: [] };
}

/** 从右端往左数第 `trustedProxyCount()` 段；链条比声明的跳数短就取最左那一段。 */
function pickTrusted(tokens: string[]): string | null {
  if (tokens.length === 0) return null;
  return tokens[Math.max(0, tokens.length - trustedProxyCount())] ?? null;
}

/**
 * 从请求头取调用方 IP（反代下用 x-forwarded-for **右端**那一段）。
 *
 * 旧读法取的是 `split(',')[0]`——链条最左端，也就是客户端随手写的那一段。每请求换一个值
 * 就换一个限流桶，`ipWriteGate` 的 13 处与 `rateKey(route, clientIp(req), user.id)` 的
 * 30 处按 IP 那半当场空转（ADR-0060 那道"堵住免成本写入口"的闸等于没挡住）。
 *
 * 一条代码挡不住的限度，说清而不是绕过去：`base-server.js:612` 用的是
 * `req.headers['x-forwarded-for'] ??= originalRequest.socket.remoteAddress`——头**缺席**时
 * 才拿 socket 地址填，头在场时原样透传。所以"客户端自带一行头"与"Next 填的"在处理器里
 * 长得一模一样，分辨不出来；直接暴露（前面没有会追加的反代）时取右端也仍然信了客户端写的
 * 那一段。那一档要靠部署补一个前置反代，或把 `NEXUS_TRUSTED_PROXY_COUNT` 按真实拓扑设对。
 * 见 `docs/adr/0070-forwarded-ip-take-rightmost-trusted-hop.md`。
 */
export function clientIp(request: Request): string | null {
  return pickTrusted(readForwardedChain(request).tokens);
}

/**
 * 限流用的身份：与 `clientIp` 同源，但把"头缺席"与"头在场却读不出"分开。
 *
 * - `null`：没有任何一条可标识的信息——按既有口径让路（给标识不出的请求一个共享桶，
 *   是把同部署下的正常用户一起挡掉，用一种故障换另一种故障）。真实 HTTP 路上走不到这一格，
 *   因为 Next 会把 socket 地址填进 XFF；走得到的是内部直调与测试。
 * - `INVALID_IP_BUCKET`：头来了却读不出地址——这不是"标识不出"，是"有人写了行垃圾"，
 *   所以不豁免，全部归进同一个桶。
 */
export function gateIp(request: Request): string | null {
  const chain = readForwardedChain(request);
  if (!chain.headerPresent) return null;
  if (chain.tokens.length === 0) return INVALID_IP_BUCKET;
  return pickTrusted(chain.tokens);
}

/**
 * 身份之前的闸：§137 的 guest 自动签发把"按 user.id 限流"这一族变成了空转。
 *
 * 中间件给每个没有会话 cookie 的请求签一个**随机** token 并写回 cookie，
 * `requireUser()` 拿不到会话行就**就地建一个 guest 用户**。于是按 `user.id`
 * 拼的限流键对"不存 cookie 的客户端"每次都是新键——实测（`.scratch` 探针，
 * 打 `/api/published/report`）：
 *   12 个不同 token → 建 12 个 guest 用户、**0 次 429**；
 *   同一个 token 打 12 次 → 只建 1 个 guest，第 11 次起 429（按身份的那道闸本身是生效的）。
 * 更糟的是 `POST /api/projects`、`POST /api/ai/run`、`POST /api/account/api-tokens`
 * 这几条**本来就没有任何限流**：于是一个绕开 cookie 的客户端可以无上限地
 * 建用户 + 项目 + 文档 + 任务行，把"首次体验"变成一条免成本的写入口。
 *
 * 所以在拿到身份**之前**先按 IP 挡一道，且闸门必须放在 `requireUser()` 之前——
 * 被挡住的请求一个 guest 都不该建（建了就是"限流了但还是付了代价"）。
 * 与 `auth/register` 同一形状（那一格早就这么做了：`rateKey('auth/register', ip)`）。
 *
 * 两条限度，说清而不是绕过去：
 * 1. **头都不写的请求不进这个桶**（`x-forwarded-for` / `x-real-ip` 两行都不在场）。
 *    限流只能限住能标识的对象；给标识不出的请求一个共享桶，会把同部署下的
 *    正常用户一起挡掉——那是用一种故障换另一种故障。真实 HTTP 路上走不到这一格：
 *    Next 在头缺席时就把 socket 地址填进去（`base-server.js:612`）。
 *    **头在场却读不出地址的不算这一格**——那是有人写了行垃圾，归进 `INVALID_IP_BUCKET`
 *    照样限（写一行垃圾不该换来免限流）。
 * 2. IP 是粗粒度身份：同一 NAT 后的多人共用一个桶。所以限额取宽，
 *    真正的"这个人"仍由各路由原有的按身份闸去管——这里是兜底，不是替代。
 */
export function ipWriteGate(
  route: string,
  req: Request,
  limit: number,
  windowMs: number,
): { limited: false } | { limited: true; retryAfterMs: number } {
  const ip = gateIp(req);
  if (!ip) return { limited: false };
  const rl = getRateLimiter().hit(rateKey(route, ip), limit, windowMs);
  return rl.allowed ? { limited: false } : { limited: true, retryAfterMs: rl.retryAfterMs };
}

/** 拼限流桶的键：路由 + 身份（用户或 IP）。 */
export function rateKey(route: string, ip: string | null, userId?: string | null): string {
  return `${route}|${userId ?? 'anon'}|${ip ?? 'no-ip'}`;
}
