/**
 * 第二站探针：P2 / P3 的预期反了，这里用**同一个地址串写进两行不同的头**把它钉死。
 *
 * S1 只写 `Forwarded: for=198.51.100.92`（全新地址）。若处理器读的是这一行 ⇒ 桶是
 *      `198.51.100.92` ⇒ 应该放行（404）。若 Next 先把 `x-forwarded-for` 用 socket 地址
 *      填上（`??=`），而 XFF 优先 ⇒ 桶是 `::1`（上一趟灌满的那只）⇒ 429，
 *      且 `retryAfterMs` 会接在上一趟那几次 429 之后继续往下走（同一只桶的到期时间）。
 * S2 把**同一个地址串**写进 `x-forwarded-for: 198.51.100.92` ⇒ 全新桶 ⇒ 404。
 *
 * 两站合起来就是判据：地址一样、写法不一样 ⇒ 桶不一样，说明 `Forwarded` 那一条在 Next 之路上
 * 根本没被走到（XFF 永在场，且它赢）。
 */
const BASE = process.env.NEXUS_PROBE_BASE ?? 'http://localhost:3100';
const CSRF = 'e5f7a9c1b3d52086';
const ADDR = '198.51.100.92';

async function hit(headers: Record<string, string>, tag: string) {
  const res = await fetch(`${BASE}/api/published/report`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: `nexus_csrf=${CSRF}`, 'x-csrf-token': CSRF, ...headers },
    body: JSON.stringify({ path: `/n/probe/s28b-${tag}-${Date.now()}`, reason: 'spam', detail: 's28 活体探针第二站' }),
  });
  return { status: res.status, text: await res.text() };
}

const s1 = await hit({ forwarded: `for=${ADDR}` }, 's1');
const s2 = await hit({ 'x-forwarded-for': ADDR }, 's2');
console.log(`S1 只写 Forwarded（${ADDR}）：${s1.status} ${s1.text}`);
console.log(`S2 同一地址写进 XFF：${s2.status} ${s2.text}`);
console.log(
  `判定：S1=${s1.status} ${s1.status === 429 ? '⇒ 走的是 Next 注入的 XFF（`::1`），`Forwarded` 那一条在这条路上没被走到' : '⇒ `Forwarded` 被读到了'} / ` +
    `S2=${s2.status} ${s2.status === 404 ? '⇒ 同一地址换一行头就是另一只桶' : '⇒ 预期外的红'}`,
);
