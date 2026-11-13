/**
 * LLM 路径在线实测（blueprint docs/SPRINGCLOUD-BLUEPRINT.md 的 P0 第一刀）
 *
 * §146/§147 的味道：这里**不断言阈值**——这台机器上还有别的容器和进程在跑，
 * 把耗时写死成断言只会制作 flaky。测到的数字如实写进 ADR / CURRENT-STATE，人眼比对。
 *
 * 三组测量分开打：
 *  A. cold-unique：N 次**不同** user 尾巴（同一稳定 system 前缀）——app 级缓存必 MISS，
 *     测的就是 provider 前缀缓存能不能把尾部之前的部分打中（wkapi.pro prefix cache）。
 *  B. warm-repeat：同一 (system, user) 连发两次——app 级 Redis 完成缓存，第二次应≈0ms。
 *  C. /healthz 里 llmCache 计数前后差值——把 "计数器真的动了" 落纸，而不是口头保证。
 *
 * 跑法：`npx tsx scripts/llm-path-live-probe.mts`
 * 环境：NEXUS_AI_SERVICE_URL（默认 http://127.0.0.1:3200）、NEXUS_LLM_PROBE_N（默认 6）。
 * 本脚本**不**需要任何 key——ai-service 自己持有 provider 凭据；脚本只看 HTTP + 回执。
 * 真实计费调用：N 次真模型 + 2 次（第二次命中 app 缓存），不是免费的，但约 10 次量级。
 */
import { performance } from 'node:perf_hooks';

const BASE = process.env.NEXUS_AI_SERVICE_URL ?? 'http://127.0.0.1:3200';
const N = Math.max(1, Math.min(20, Number(process.env.NEXUS_LLM_PROBE_N ?? '6') || 6));

type Usage = {
  provider: string;
  model: string;
  modelClass: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  costUsd: number;
  toolCalls: number;
  demoMode: boolean;
  cachedTokens: number;
  reasoningTokens: number;
};
type ChatResponse = {
  requestId: string;
  capability: string;
  provider: string;
  model: string;
  text: string;
  usage?: Usage;
  error?: { code?: string; message?: string };
};
type ProbeRow = {
  group: 'A' | 'B';
  http: number;
  ms: number;
  ok: boolean;
  capability: string | null;
  model: string | null;
  tokensIn: number;
  tokensOut: number;
  cachedTokens: number;
  reasoningTokens: number;
  detail: string | null;
};

/** 稳定 system 前缀：这条字符串在 N 次冷请求之间一字不变,wkapi.pro 前缀缓存的对象 */
const STABLE_SYSTEM = [
  '你是 NEXUS 设计工作室的坐席助手"设计坐席"。',
  '你的职责：把设计师模糊的口头诉求，变成对设计文档的可执行建议（不编造、不承诺自己做不到的事）。',
  '规矩：1) 建议必须绑定到具体图层或页面；2) 不确定的地方先说不确定；3) 回答中文，口语、短句；4) 只回答这一轮的问题。',
  '本场景：公开页设计评审（SaaS 官网营销页）。目标受众：中国区 B2B 技术买家（CTO / 技术合伙人）。',
  '品牌约束：主色固定为 --nexus-primary（品牌橙），不允许建议换成蓝紫系；字体用系统默认中文无衬线栈。',
  '内容纪律：不写营销吹嘘词（"业界领先""颠覆""赋能"）；数据必须可核实，编不出来就说"我没有这个数据"。',
  '交付格式：先给结论（一句话），再给 1-3 条可执行建议（每条 ≤ 40 字），最后一句"还有什么要我做吗"。',
].join('\n');

const USER_BASE = '首页 Hero 区主标题偏弱，想让它更有冲击力，但别破坏品牌色，帮我提一个方向，40 字以内说清。';

async function chat(system: string, user: string, id: string): Promise<ProbeRow> {
  const started = performance.now();
  try {
    const res = await fetch(`${BASE}/v1/ai/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requestId: id, system, user, modelClass: 'balanced' }),
      signal: AbortSignal.timeout(120_000),
    });
    const raw = await res.text();
    const ms = performance.now() - started;
    let json: ChatResponse | null = null;
    try {
      json = JSON.parse(raw) as ChatResponse;
    } catch {
      return row('A', res.status, ms, false, null, null, 0, 0, 0, 0, `unparseable body: ${raw.slice(0, 80)}`);
    }
    const err = json.error?.code ?? json.error?.message ?? null;
    const ok = res.status === 200 && !err;
    return {
      group: 'A',
      http: res.status,
      ms,
      ok,
      capability: json.capability ?? null,
      model: json.model ?? null,
      tokensIn: json.usage?.tokensIn ?? 0,
      tokensOut: json.usage?.tokensOut ?? 0,
      cachedTokens: json.usage?.cachedTokens ?? 0,
      reasoningTokens: json.usage?.reasoningTokens ?? 0,
      detail: err,
    };
  } catch (cause) {
    const ms = performance.now() - started;
    return row('A', 0, ms, false, null, null, 0, 0, 0, 0, cause instanceof Error ? cause.message : String(cause));
  }
}

function row(
  group: 'A' | 'B',
  http: number,
  ms: number,
  ok: boolean,
  capability: string | null,
  model: string | null,
  tokensIn: number,
  tokensOut: number,
  cachedTokens: number,
  reasoningTokens: number,
  detail: string | null,
): ProbeRow {
  return { group, http, ms, ok, capability, model, tokensIn, tokensOut, cachedTokens, reasoningTokens, detail };
}

async function llmCacheCounters(): Promise<{ hits: number; misses: number; hitRate: number } | null> {
  try {
    const res = await fetch(`${BASE}/healthz`, { signal: AbortSignal.timeout(5_000) });
    const body = (await res.json()) as { llmCache?: { hits?: number; misses?: number; hit_rate?: number } | null };
    if (!res.ok || !body.llmCache) return null;
    return {
      hits: body.llmCache.hits ?? 0,
      misses: body.llmCache.misses ?? 0,
      hitRate: body.llmCache.hit_rate ?? 0,
    };
  } catch {
    return null;
  }
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}

const before = await llmCacheCounters();
const stamp = Date.now();

// A: cold, unique tail (app cache must MISS; provider prefix has a fair chance on the stable system)
const coldRows: ProbeRow[] = [];
for (let i = 1; i <= N; i += 1) {
  const r = await chat(STABLE_SYSTEM, `${USER_BASE}（场景代号 ${i}-${stamp}）`, `probe_a_${stamp}_${i}`);
  coldRows.push(r);
  console.log(`A#${i} http=${r.http} ms=${r.ms.toFixed(0)} ok=${r.ok} model=${r.model} in=${r.tokensIn} cached=${r.cachedTokens} out=${r.tokensOut}${r.detail ? ' err=' + r.detail : ''}`);
}

// B: warm repeat — identical (system, user) twice
const warmUser = `${USER_BASE}（warm-repeat-${stamp}）`;
const warm1 = await chat(STABLE_SYSTEM, warmUser, `probe_b_${stamp}_1`);
warm1.group = 'B';
const warm2 = await chat(STABLE_SYSTEM, warmUser, `probe_b_${stamp}_2`);
warm2.group = 'B';
console.log(`B#1 http=${warm1.http} ms=${warm1.ms.toFixed(0)} ok=${warm1.ok} in=${warm1.tokensIn} cached=${warm1.cachedTokens}${warm1.detail ? ' err=' + warm1.detail : ''}`);
console.log(`B#2 http=${warm2.http} ms=${warm2.ms.toFixed(0)} ok=${warm2.ok} in=${warm2.tokensIn} cached=${warm2.cachedTokens}${warm2.detail ? ' err=' + warm2.detail : ''}`);

const after = await llmCacheCounters();

const coldOk = coldRows.filter((r) => r.ok);
const times = coldOk.map((r) => r.ms).slice().sort((a, b) => a - b);
const coldFailures = coldRows.length - coldOk.length;
const totalIn = coldRows.reduce((a, r) => a + r.tokensIn, 0);
const totalCached = coldRows.reduce((a, r) => a + r.cachedTokens, 0);

console.log('');
console.log('=== summary');
console.log(`target: ${BASE}`);
console.log(`A cold-unique: n=${coldRows.length} ok=${coldOk.length} failed=${coldFailures} p50=${pct(times, 50).toFixed(0)}ms p95=${pct(times, 95).toFixed(0)}ms min=${(times[0] ?? 0).toFixed(0)}ms max=${(times[times.length - 1] ?? 0).toFixed(0)}ms`);
console.log(`A prefix cache: total tokensIn=${totalIn} cached=${totalCached} hit=${totalIn > 0 ? ((totalCached / totalIn) * 100).toFixed(1) : '0'}%`);
console.log(`B warm-repeat: first=${warm1.ms.toFixed(0)}ms second=${warm2.ms.toFixed(0)}ms (second should be ~0-5ms when app Redis cache is warm)`);
if (before && after) {
  console.log(`C llmCache counters: before hits=${before.hits} misses=${before.misses} -> after hits=${after.hits} misses=${after.misses} (delta hits=${after.hits - before.hits} misses=${after.misses - before.misses})`);
} else {
  console.log('C llmCache counters: unavailable from /healthz');
}
console.log(`error rate (A): ${coldRows.length > 0 ? ((coldFailures / coldRows.length) * 100).toFixed(1) : '0.0'}%`);
