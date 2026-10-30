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

export interface RateLimitDecision {
  allowed: boolean;
  count: number;
  retryAfterMs: number;
}

export interface RateLimiter {
  /**
   * 记一次命中并返回是否放行；同时回带当前计数供 Retry-After 参考。
   *
   * **异步**是这一片新还的债：接口原来是同步的，那就只有"进程内"这一种后端写得出来。
   * 而一次 Redis 往返必须有地方等它——把 seam 做成同步，等于把多实例那条路堵死在类型上。
   *
   * 漏掉 `await` 谁抓得住，两半不一样，别当成一条：
   * - **这一半（回决策）由 `tsc` 当场拦下**——`Promise` 上没有 `allowed`，读它就报错。
   *   44 个调用点是靠这条网一次性点齐的（臂 A1：摘掉一个 `await`，编译立刻指到用它的那一行）。
   * - **下面那个 `reset` 那一半类型检查是瞎的**：`Promise<void>` 不接住不报错，
   *   靠的是 eslint `no-floating-promises`（臂 A2：摘掉 `await`，`tsc` 一句不说，lint 报 9:5）。
   *   今天内存驱动下漏 `await` 恰好也能生效——`async` 方法体在第一个 await 之前是同步跑的。
   *   所以这条**只有在换成 Redis 驱动之后才真正咬人**：那时漏掉的那个 await 变成"清桶这件事
   *   也许在测试已经开始之后才发生"，而内存驱动永远测不出它。这也是这一片先把 15 个
   *   `reset()` 调用点全部补上 await 的原因，而不是"反正内存版同步能用"。
   */
  hit(key: string, limit: number, windowMs: number): Promise<RateLimitDecision>;
  reset(key?: string): Promise<void>;
}

class MemoryRateLimiter implements RateLimiter {
  private readonly hits = new Map<string, number[]>();

  async hit(key: string, limit: number, windowMs: number): Promise<RateLimitDecision> {
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

  async reset(key?: string): Promise<void> {
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
 * 不是豁免：写一行 `x-forwarded-for: whatever`（或 `Forwarded: for=whatever`）若能换来免限流，
 * 那就是给所有 IP 闸留了一条"垃圾头绕过去"的公共出口。旧读法给每一串不同的垃圾各开一只桶，
 * 效果就是绕过去；归进同一只桶才是"限住"。
 * 桶名的字面量仍是 `invalid-xff`——它是既有读数与日志里的形状，三行头共用这一格不必各起一名。
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

/**
 * RFC 7239 的 `Forwarded`：一跳一段（逗号分隔），段内 `for=…;by=…;proto=…;host=…`。
 *
 * 只有 `for=` 是"这一跳亲眼看到的对端"；`by=` 说的是代理自己，`host=`/`proto=` 是被请求的
 * 那一侧，把它们当地址会让整条链变成"谁的头写得花哨谁换桶"。`for=unknown` 与混淆值
 * （`for="_gzz3"`，RFC 7239 §6.1 的例子）读不出地址——与垃圾的 XFF 同格：**归共享桶，不豁免**。
 */
function readRfc7239Tokens(value: string): string[] {
  const tokens: string[] = [];
  for (const hop of value.split(',')) {
    for (const param of hop.split(';')) {
      const eq = param.indexOf('=');
      if (eq < 0) continue;
      if (param.slice(0, eq).trim().toLowerCase() !== 'for') continue;
      const raw = param.slice(eq + 1).trim();
      const quoted = raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"');
      const address = normalizeAddress(quoted ? raw.slice(1, -1) : raw);
      if (address) tokens.push(address);
    }
  }
  return tokens;
}

/**
 * 三行头的读法与优先级：`x-forwarded-for` → `Forwarded`（RFC 7239）→ `x-real-ip`。
 *
 * 先读哪一行只取决于"哪一行给出了地址"，不改变链条语义：三行都是追加/覆盖写的同一族东西，
 * 取的都是可信链右端第 `trustedProxyCount()` 段。同时在场时 XFF 说了算——两条链一起进桶键
 * 会让同一个对端因写法不同落进两只桶，那正是"换一行头换一个桶"的另一种版本。
 *
 * `x-real-ip` 排在最后是有道理的：nginx 那类配置里它是**覆盖写**的（`X-Real-IP $remote_addr`），
 * 客户端自带的那一份早被冲掉，所以它是三行里最不容易被伪造的一行；但它只有一段，
 * 多跳拓扑下只有前面两行能给右端。
 *
 * **真 HTTP 路上这一支多半走不到**：`base-server.js:612` 的 `??=` 在 XFF 缺席时填入 socket 对端，
 * 于是 `x-forwarded-for` 在处理器里几乎总在案（活体读数见 `.scratch/s28-forwarded-live-probe.mts`）。
 * 一个只写 `Forwarded` 的前置因此不是"绕开闸"，而是**它的用户全落进前置那一只桶**——
 * 部署要么让前置补写 XFF，要么按 ADR-0071 的后果 2 处理，别指望这段代码替拓扑做主。
 */
function readForwardedChain(request: Request): ForwardedChain {
  const realRaw = request.headers.get('x-real-ip');
  const real = realRaw === null ? null : normalizeAddress(realRaw);
  const xff = request.headers.get('x-forwarded-for');
  const forwarded = request.headers.get('forwarded');
  const headerPresent = xff !== null || forwarded !== null || realRaw !== null;

  if (xff !== null) {
    const tokens = xff
      .split(',')
      .map(normalizeAddress)
      .filter((token): token is string => token !== null);
    if (tokens.length > 0) return { headerPresent, tokens };
  }
  if (forwarded !== null) {
    const forwardedTokens = readRfc7239Tokens(forwarded);
    if (forwardedTokens.length > 0) return { headerPresent, tokens: forwardedTokens };
  }
  return { headerPresent, tokens: real ? [real] : [] };
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
 * 1. **头都不写的请求不进这个桶**（`x-forwarded-for` / `Forwarded` / `x-real-ip` 三行都不在场）。
 *    限流只能限住能标识的对象；给标识不出的请求一个共享桶，会把同部署下的
 *    正常用户一起挡掉——那是用一种故障换另一种故障。真实 HTTP 路上走不到这一格：
 *    Next 在头缺席时就把 socket 地址填进去（`base-server.js:612`）。
 *    **头在场却读不出地址的不算这一格**——那是有人写了行垃圾，归进 `INVALID_IP_BUCKET`
 *    照样限（写一行垃圾不该换来免限流）。
 * 2. IP 是粗粒度身份：同一 NAT 后的多人共用一个桶。所以限额取宽，
 *    真正的"这个人"仍由各路由原有的按身份闸去管——这里是兜底，不是替代。
 */
export async function ipWriteGate(
  route: string,
  req: Request,
  limit: number,
  windowMs: number,
): Promise<{ limited: false } | { limited: true; retryAfterMs: number }> {
  const ip = gateIp(req);
  if (!ip) return { limited: false };
  const rl = await getRateLimiter().hit(rateKey(route, ip), limit, windowMs);
  return rl.allowed ? { limited: false } : { limited: true, retryAfterMs: rl.retryAfterMs };
}

/** 拼限流桶的键：路由 + 身份（用户或 IP）。 */
export function rateKey(route: string, ip: string | null, userId?: string | null): string {
  return `${route}|${userId ?? 'anon'}|${ip ?? 'no-ip'}`;
}
