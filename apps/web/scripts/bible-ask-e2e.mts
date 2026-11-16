/**
 * §BIBLE-4 问典 · 合像 E2E：用真实 digest 打付费 provider。
 * 用法：pnpm? —— 直接 `cd apps/web && npx tsx scripts/bible-ask-e2e.mts`（一次性，手动）。
 */
import { SYSTEM_PROMPT } from '../src/lib/bibleAsk';

const body = {
  requestId: 'bible-ask-e2e-2026-11-17',
  system: SYSTEM_PROMPT,
  user: 'Question language: zh\nQuestion: 《收件人》里，三路人最后在雾港遇见了什么？一句两句话回答。',
  modelClass: 'fast' as const,
};

async function main() {
  const t0 = performance.now();
  const resp = await fetch('http://127.0.0.1:8131/v1/ai/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const ms = Math.round(performance.now() - t0);
  const payload = await resp.text();
  let parsed: unknown = null;
  try { parsed = JSON.parse(payload); } catch { /* raw */ }
  console.log(JSON.stringify({
    status: resp.status,
    ms,
    rawBody: resp.status === 200 ? undefined : payload.slice(0, 2000),
    capability: (parsed as Record<string, unknown> | null)?.capability,
    model: (parsed as Record<string, unknown> | null)?.model,
    usage: (parsed as Record<string, unknown> | null)?.usage,
    text: (parsed as Record<string, unknown> | null)?.text,
  }, null, 2));
}

void main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
