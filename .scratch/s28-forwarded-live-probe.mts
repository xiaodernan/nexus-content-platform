/**
 * 第二十八片的活体探针：打**真的 Next dev server**，不经手搓 Request。
 *
 * 集成测试直接调路由处理函数，`Forwarded` 那行头是我自己造的 `Headers`——它们证明
 * "给定这一行头，闸读哪一段"，没证明两件事：
 *   ① Next 会不会把 `Forwarded` 改写或丢掉（`base-server.js:612` 那句 `??=` 只管 `x-forwarded-for`，
 *      读源码看不出一个上游头有没有被别的中间件吃掉）；
 *   ② 优先级（XFF 抢在 `Forwarded` 前面）在真 HTTP 路上是不是同一条形状。
 *
 * 名额：`published/report` 那道闸 20/小时/IP，所以要用一只**全新的 TEST-NET 地址**当右端
 * （`198.51.100.90`），21 次连打第 21 次才挡得住。代价如实记：放行的那 20 次各建了一个 guest。
 */
const BASE = process.env.NEXUS_PROBE_BASE ?? 'http://localhost:3100';
const CSRF = 'e5f7a9c1b3d52086';
const FULL = '198.51.100.90';

async function hit(headers: Record<string, string>, tag: string) {
  const res = await fetch(`${BASE}/api/published/report`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `nexus_csrf=${CSRF}`,
      'x-csrf-token': CSRF,
      ...headers,
    },
    body: JSON.stringify({ path: `/n/probe/s28-${tag}-${Date.now()}`, reason: 'spam', detail: 's28 活体探针' }),
  });
  const text = await res.text();
  return { status: res.status, text };
}

const fill = async (i: number) =>
  hit({ forwarded: `for=192.0.2.${(i % 250) + 1};by=10.0.0.1, for=${FULL}` }, `fill${i}`);

// ① 灌桶：左端每请求换一跳，右端固定＝反代亲眼看到的对端
const statuses: number[] = [];
for (let i = 1; i <= 21; i += 1) statuses.push((await fill(i)).status);
const overflow = await fill(22);

// ② 单段就是那只满桶：证明 `Forwarded` 真的原样走到处理器（没被 Next 丢掉）
const p1 = await hit({ forwarded: `for=${FULL}` }, 'p1');
// ③ 左端满、右端全新：取右端才放行；旧读法（取最左）这里会 429
const p2 = await hit({ forwarded: `for=${FULL}, for=192.0.2.240` }, 'p2');
// ④ 两行头同时在场且互相矛盾：XFF 赢 ⇒ 满桶 ⇒ 429；若 Forwarded 赢则是 404
const p3 = await hit({ 'x-forwarded-for': FULL, forwarded: 'for=192.0.2.241' }, 'p3');

console.log(`灌桶 21 次：${statuses.join(',')}`);
console.log(`第 22 次：${overflow.status} ${overflow.text}`);
console.log(`P1 单段＝满桶：${p1.status} ${p1.text}`);
console.log(`P2 左端满、右端新：${p2.status} ${p2.text}`);
console.log(`P3 XFF 满 + Forwarded 新：${p3.status} ${p3.text}`);
console.log(
  [
    `灌桶前 20 全放行、第 21 次 429：${statuses.slice(0, 20).every((s) => s === 404) && statuses[20] === 429 ? '✓' : '✗'}`,
    `P1=429（头原样到达且单段＝右端）：${p1.status === 429 ? '✓' : '✗'}`,
    `P2=404（看的是右端；旧读法这里 429）：${p2.status === 404 ? '✓' : '✗'}`,
    `P3=429（同时在场时 XFF 说了算）：${p3.status === 429 ? '✓' : '✗'}`,
  ].join(' / '),
);
