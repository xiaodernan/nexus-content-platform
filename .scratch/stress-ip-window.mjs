const BASE = 'http://localhost:3100';
const results = [];
for (let i = 0; i < 36; i += 1) {
  const t0 = Date.now();
  const r = await fetch(`${BASE}/api/insight/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.66' },
    body: JSON.stringify({ password: 'nope' }),
    signal: AbortSignal.timeout(20000),
  });
  results.push({ status: r.status, ms: Date.now() - t0 });
}
const tally = {};
for (const r of results) tally[r.status] = (tally[r.status] ?? 0) + 1;
console.log('statuses:', JSON.stringify(tally));
console.log('order:', results.map((r) => r.status).join(','));
