/**
 * §PROOF-BURST-12 · 交错提问稳定性实测 · 2026-11-18
 * 目的：回答「并行会话打 aizzz relay，缓存是不是会乱」——交替两个不同问题连续 12 次，
 * 统计 cachedTokens 命中曲线；证明交替 payload 不破坏 system prefix 的复用。
 * system = SYSTEM_PROMPT（5 章正典 + 86 回响 ≈ 55k chars），transport lane 是 digest 路最代表性的样本。
 */
import { SYSTEM_PROMPT } from '../apps/web/src/lib/bibleAsk';

const SERVICE = process.env.NEXUS_AI_SERVICE_URL ?? 'http://127.0.0.1:8001';
const questions = [
  '典籍里，雾港灯塔那盏常亮的灯叫什么名字？',
  '典籍里，四十一次大会散会之后谁画了石狮的腮？',
] as const;

const results: Record<string, unknown>[] = [];
for (let i = 0; i < 12; i += 1) {
  const idx = i % 2;
  const res = await fetch(`${SERVICE}/v1/ai/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      requestId: `burst-${String(i + 1).padStart(2, '0')}`,
      system: SYSTEM_PROMPT,
      user: questions[idx],
      modelClass: 'balanced',
    }),
  });
  const body = (await res.json().catch(() => null)) as any;
  const u = body?.usage ?? {};
  results.push({
    n: i + 1,
    q: idx + 1,
    status: res.status,
    tokensIn: u.tokensIn ?? null,
    cachedTokens: u.cachedTokens ?? null,
    cacheReported: u.cacheReported ?? null,
  });
  console.log(JSON.stringify(results[results.length - 1]));
}
const hits = results.filter((r) => (r.cachedTokens as number | null) && (r.cachedTokens as number) > 0).length;
console.log(`\n命中 ${hits}/12`);
