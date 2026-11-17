/**
 * §BIBLE-4 · 问典 digest live E2E：默认连打同 payload 两次，第二次应因为 prefix cache 命中 cachedTokens > 0。
 * 用法：`cd apps/web && npx tsx scripts/bible-ask-e2e.mts`（前提：:8131 sidecar，Clash 节点 7897）。
 */
import { SYSTEM_PROMPT } from '../src/lib/bibleAsk';

const questions = [
  '《收件人》里，三路人在雾港遇见了什么？一句话回答。',
  '《收件人》里，三路人在雾港遇见了什么？一句话回答。',
];

async function call(idx: number, body: unknown): Promise<void> {
  const t0 = performance.now();
  const resp = await fetch('http://127.0.0.1:8131/v1/ai/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const ms = Math.round(performance.now() - t0);
  const payload = await resp.text();
  let parsed: Record<string, unknown> | null = null;
  try { parsed = JSON.parse(payload) as Record<string, unknown>; } catch { /* raw */ }
  console.log(JSON.stringify({
    call: idx,
    status: resp.status,
    ms,
    usage: parsed?.usage ?? undefined,
    capability: parsed?.capability,
    text: parsed?.text,
    rawOnError: resp.status === 200 ? undefined : payload.slice(0, 500),
  }, null, 2));
}

async function main(): Promise<void> {
  for (let i = 0; i < questions.length; i += 1) {
    await call(i + 1, {
      requestId: `bible-ask-e2e-${Date.now()}-${i}`,
      system: SYSTEM_PROMPT,
      user: `Question language: zh\nQuestion: ${questions[i]}`,
      modelClass: 'fast',
    });
  }
  process.exit(0);
}

void main().catch((e) => { console.error(e); process.exit(1); });
