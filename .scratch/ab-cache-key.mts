import fs from 'fs';

const BASE = 'http://127.0.0.1:8001';
const system = fs.readFileSync('apps/ai-service/src/ai_service/canon_digest.txt', 'utf8');

const QUESTIONS = [
  '问典：潮退后那座灯楼下的潮汐表上，第九张谁在祭那一夜的潮？用中文答一句。',
  '问典：雾港灯塔第七级台阶上那双脚印是谁留下的？用中文答一句。',
];

const run = async (label: string) => {
  const rows: string[] = [];
  for (let i = 1; i <= 12; i++) {
    const q = QUESTIONS[(i - 1) % QUESTIONS.length];
    const payload = {
      requestId: `ab-${label}-${i}-${Date.now().toString(36)}`,
      system,
      user: q,
      modelClass: 'balanced' as const,
    };
    const started = Date.now();
    const res = await fetch(`${BASE}/v1/ai/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const ms = Date.now() - started;
    const body = (await res.json().catch(() => null)) as { usage?: { tokensIn?: number; cachedTokens?: number; cacheReported?: boolean } } | null;
    rows.push(JSON.stringify({ i, status: res.status, ms, tokensIn: body?.usage?.tokensIn ?? null, cachedTokens: body?.usage?.cachedTokens ?? null, cacheReported: body?.usage?.cacheReported ?? null }));
    console.log(`[${label}]`, rows[rows.length - 1]);
  }
  const ok = rows.map((r) => JSON.parse(r)).filter((r) => r.status === 200);
  const cached = ok.map((r) => r.cachedTokens ?? 0);
  const mean = cached.length ? cached.reduce((a: number, b: number) => a + b, 0) / cached.length : 0;
  const maxed = cached.filter((c: number) => c > 60000).length;
  console.log(`[${label}] summary: ok=${ok.length}/12 meanCached=${mean.toFixed(0)} fullHits=${maxed}`);
};

await run(process.argv[2] ?? 'A');
