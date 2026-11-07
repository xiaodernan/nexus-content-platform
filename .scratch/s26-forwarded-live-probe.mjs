/**
 * 第二十六片的活体探针：打**真的 Next dev server**，不经手搓 Request。
 *
 * 为什么还要这一趟：`client-ip.test.ts` 与 `guest-write-gate.integration.test.ts` 都是直接调
 * 路由处理函数，`x-forwarded-for` 是我自己造的——它们证明"给定这一行头，闸读哪一段"，
 * 没证明"这一行头真能原样走到处理器"（Next 有可能改写或追加）。
 * `node_modules/next/dist/server/base-server.js:612` 那句 `??=` 是**读源码**，不是观测。
 *
 * 前置读数（curl 打的 21 趟，`.scratch/s26-live-1..21.json`）：左端每请求换、右端固定
 * `198.51.100.77` → 前 20 次 404、第 21 次 429，`retryAfterMs=3579721`。
 * 那一只桶现在正好是满的（20/20），于是这两站才有区分度：
 *
 *   P1 `x-forwarded-for: 198.51.100.77`（就一段，还是那只满桶）
 *      → 预期 **429**。它同时证明两件事：这一行头确实原样走到了处理器
 *        （Next 若拿 socket 覆盖掉，桶就成了 `::1`，这里就不会是 429），
 *        以及"单段"与"链条右端"落进同一只桶。
 *   P2 `x-forwarded-for: 198.51.100.77, 192.0.2.200`（左端是那只满桶，右端全新）
 *      → 预期 **404**（不是 429）。**旧读法在这一站会 429**——它取最左端，
 *        取到的正是满掉的那只桶；新读法看的是右端，那只桶还空着。
 *
 * 两站各一次请求，不批量灌名额（P2 会让 middleware 签一个 guest，记在账上）。
 */
const BASE = process.env.NEXUS_PROBE_BASE ?? 'http://localhost:3100';
const CSRF = 'e5f7a9c1b3d52086';

async function report(forwarded) {
  const res = await fetch(`${BASE}/api/published/report`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `nexus_csrf=${CSRF}`,
      'x-csrf-token': CSRF,
      'x-forwarded-for': forwarded,
    },
    body: JSON.stringify({ path: `/n/probe/s26-${Date.now()}`, reason: 'spam', detail: 's26 活体探针' }),
  });
  return { status: res.status, body: await res.text() };
}

const p1 = await report('198.51.100.77');
const p2 = await report('198.51.100.77, 192.0.2.200');
console.log(`P1 单段＝满桶：${p1.status} ${p1.body}`);
console.log(`P2 左端满、右端新：${p2.status} ${p2.body}`);
console.log(
  `判定：P1=429 ${p1.status === 429 ? '✓（头原样到达，且单段就是右端）' : '✗（头被改写或桶不是右端）'} / ` +
    `P2=404 ${p2.status === 404 ? '✓（闸看的是右端；旧读法这里会 429）' : '✗（左端那一只满桶还在决定归属）'}`,
);
