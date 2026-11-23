/**
 * §PROOF-TRANSPORT-CACHE · 2026-11-18
 * 目的：直接证明「ai-service 出站传输层（StickyPromptCacheTransport）注入的
 * prompt_cache_key 让同一 digest 的第二次调用真实命中前缀缓存」——不经过 Next dev，
 * 只打 `/v1/ai/chat`（studio 里每一次 AI 调用最终都走这条路）。
 *
 * 方法：两问同 digest、同 system（SYSTEM_PROMPT 整字节）、问句只变一行；
 * 每次打印 usage.cachedTokens / tokensIn / cacheReported。全程不落任何 key 到日志。
 */
import { SYSTEM_PROMPT } from '../apps/web/src/lib/bibleAsk';

const SERVICE = process.env.NEXUS_AI_SERVICE_URL ?? 'http://127.0.0.1:8001';
console.log('system chars:', SYSTEM_PROMPT.length);

const call = async (requestId: string, user: string) => {
  const started = Date.now();
  const res = await fetch(`${SERVICE}/v1/ai/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestId, system: SYSTEM_PROMPT, user, modelClass: 'balanced' }),
  });
  const body = (await res.json().catch(() => null)) as any;
  const usage = body?.usage ?? {};
  console.log(
    JSON.stringify({
      requestId,
      status: res.status,
      ms: Date.now() - started,
      tokensIn: usage.tokensIn ?? null,
      tokensOut: usage.tokensOut ?? null,
      cachedTokens: usage.cachedTokens ?? null,
      cacheReported: usage.cacheReported ?? null,
      model: body?.model ?? null,
      capability: body?.capability ?? null,
      error: body?.error ?? null,
    }),
  );
  return body;
};

await call('proof-transport-001', '典籍里，雾港灯塔那盏常亮的灯叫什么名字？');
await call('proof-transport-002', '典籍里，雾港灯塔那盏常亮的灯叫什么名字？');
await call('proof-transport-003', '典籍里，学院最后一次散会之后谁画了石狮的腮？');
