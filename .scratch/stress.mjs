// 只读 + 失败登录的压力探针：不烧 provider token，不发真通知。
const base = 'http://127.0.0.1:3100';
const wave = async (label, url, n, init = () => ({})) => {
  const t0 = Date.now();
  const out = await Promise.all(Array.from({ length: n }, async (_, i) => {
    try {
      const r = await fetch(base + url, { ...init(i), cache: 'no-store' });
      return { status: r.status };
    } catch (e) { return { status: 0, err: String(e).slice(0, 40) }; }
  }));
  const counts = {};
  for (const x of out) counts[x.status] = (counts[x.status] || 0) + 1;
  const ms = Date.now() - t0;
  return { label, n, ms, rps: +(n / (ms / 1000)).toFixed(1), counts };
};
const results = [];
results.push(await wave('discover 200 并发', '/api/discover', 200));
results.push(await wave('home 200 并发', '/', 200));
results.push(await wave('撞库 120 次错口令', '/api/auth/login', 120, (i) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: `stress${i % 7}@example.test`, password: 'definitely-wrong' }),
})));
console.log(JSON.stringify(results, null, 1));
