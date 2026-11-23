import fs from 'fs';

const BASE = 'http://127.0.0.1:8001';
const system = fs.readFileSync('apps/ai-service/src/ai_service/canon_digest.txt', 'utf8');
console.log('digest chars:', system.length);

const QUESTIONS = [
  '问典：第四十一次大会散会的那天，潮为什么不动？用中文答一句。',
  '问典：《盐灯守灵日记》里那盏盐灯谁在守？用中文答一句。',
  '问典：《退潮之后》里，守灯人每天早上做什么？用中文答一句。',
];

const call = (label: string) => {
  const payload = {
    requestId: `v1001-${label}-${Date.now().toString(36)}`,
    system,
    user: QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)],
    modelClass: 'balanced' as const,
  };
  const started = Date.now();
  return fetch(`${BASE}/v1/ai/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(async (res) => {
    const ms = Date.now() - started;
    const body = (await res.json().catch(() => null)) as { usage?: { tokensIn?: number; cachedTokens?: number; cacheReported?: boolean } } | null;
    return { label, status: res.status, ms, tokensIn: body?.usage?.tokensIn ?? null, cachedTokens: body?.usage?.cachedTokens ?? null };
  });
};

// Phase A: 12 sequential calls alternating 3 questions
for (let i = 1; i <= 12; i++) {
  console.log(JSON.stringify(await call(`seq-${i}`)));
}

// Phase B: 16 concurrent burst on same lane
const r = await Promise.allSettled(
  Array.from({ length: 16 }, (_, i) => call(`burst16-${i + 1}`)),
);
const fulfilled = r.filter((x) => x.status === 'fulfilled') as PromiseFulfilledResult<{ label: string; status: number; ms: number; cachedTokens: number | null; tokensIn: number | null }>[];
const good = fulfilled.filter((x) => x.value.status === 200);
const cached = good.map((x) => x.value.cachedTokens ?? 0);
const ins = good.map((x) => x.value.tokensIn ?? 0);
console.log(JSON.stringify({
  burst16_ok: good.length,
  burst16_5xx: fulfilled.length - good.length,
  totalCached: cached.reduce((a, b) => a + b, 0),
  totalIn: ins.reduce((a, b) => a + b, 0),
  meanCached: Math.round(cached.reduce((a, b) => a + b, 0) / Math.max(1, cached.length)),
  meanIn: Math.round(ins.reduce((a, b) => a + b, 0) / Math.max(1, ins.length)),
  fullHits: cached.filter((c) => c === ins[0]).length,
  latMax: Math.max(...good.map((x) => x.value.ms)),
}));
