import { readFileSync } from 'node:fs';
const base = JSON.parse(readFileSync('contracts/fixtures/ai-request-with-index.json', 'utf8'));
for (const review of [false, true]) {
  const body = { ...base, requestId: `review-e2e-${review}-${Date.now()}`, review, dryRun: true };
  const r = await fetch('http://127.0.0.1:3200/v1/ai/run', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const out = await r.json();
  const stages = (out.activities || []).map(a => a.stage);
  console.log(JSON.stringify({ review, status: r.status, ok: out.ok ?? out.capability, stages, usage: out.usage ?? out.response?.usage, error: out.error }, null, 1));
}
