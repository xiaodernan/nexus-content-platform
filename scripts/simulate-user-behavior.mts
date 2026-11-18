#!/usr/bin/env node
/**
 * §SIM-1 真实用户行为 *模拟*（合成流量，不是真实访客）——`/discover`、首页、漫游
 *
 * 回应用户长期指令：「联网深度搜索一下，模拟一些用户的真实数据，模拟真实的用户的行为：
 * 真实用户会怎么操作，真实用户可能会点开一个页面，没有耐心就立刻关闭了，或者可能会在页面上瞎点，
 * 因为不知道要去哪。」
 *
 * 设计诚实性（§159 的条款）：
 * - 这是**合成**流量：random-seeded，按假设画像跑；**不是**从用户身上取的真实数据；
 * - 没有任何「我们的用户就是这样」的声称；只回答「如果这类真人这样来，服务器能不能 200」；
 * - 不替代任何真实的行为分析；生产口径请看 /insight（真库聚合）；
 * - 只打 GET 公共路由（no /api/, no /studio, no /insight, no /admin）。
 *
 * 用法：tsx scripts/simulate-user-behavior.mts --sessions 24 --port 3199
 * 输出：docs/evidence/simulated-user-behavior-2026-11-16.{md,json}
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import http from 'node:http';

process.env.NODE_NO_WARNINGS = '1';
const PORT = Number(process.argv[process.argv.indexOf('--port') + 1] ?? 3199);
const SESSIONS = Number(process.argv[process.argv.indexOf('--sessions') + 1] ?? 24);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT_JSON = join(process.cwd(), 'docs', 'evidence', 'simulated-user-behavior-2026-11-16.json');

// ── deterministic LCG（so the evidence is rerun-identical）
let seed = 0x2545F4914b6ecn;
const TWO_P64 = 1n << 64n;
const MASK64 = TWO_P64 - 1n;
const MUL = 6364136223846793005n;
const INC = 1442695040888963407n;
function rand(): number {
  seed = (seed * MUL + INC) & MASK64;
  return Number(seed >> 11n) / 2 ** 53;
}
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;

// ── HTTP GET 封装
function get(path: string, cookie?: string): Promise<{ status: number; ms: number; bytes: number; html: string }> {
  const t0 = process.hrtime.bigint();
  return new Promise((resolve) => {
    const req = http.get(`${BASE}${path}`, { headers: { cookie: cookie ?? '', accept: 'text/html' } , timeout: 25_000 }, (res) => {
      let bytes = 0;
      let html = '';
      res.on('data', (chunk) => { bytes += chunk.length; html += chunk.toString('utf8'); });
      res.on('end', () => {
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        resolve({ status: res.statusCode ?? 0, ms, bytes, html });
      });
    });
    req.on('error', () => {
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      resolve({ status: 0, ms, bytes: 0, html: '' });
    });
    req.on('timeout', () => req.destroy());
  });
}

/** 从 HTML 提取同站点的公共 GET 链接（剔除 /api/，/studio，/insight，/admin） */
function publicHrefs(html: string): string[] {
  const out = new Set<string>();
  const re = /href="([^"#][^"]*)"/g;
  for (const match of html.matchAll(re)) {
    const href = match[1]!;
    if (/^https?:\/\//.test(href)) continue;
    if (!href.startsWith('/')) continue;
    if (href.startsWith('/api') || href.startsWith('/studio') || href.startsWith('/insight') || href.startsWith('/admin')) continue;
    out.add(href.split('?')[0]!);
  }
  return [...out];
}

type Persona = 'impatient' | 'rage-clicker' | 'lost-wanderer' | 'deep-reader' | 'bot-ish';
const PERSONAS: readonly Persona[] = ['impatient', 'rage-clicker', 'lost-wanderer', 'deep-reader', 'bot-ish'];

interface Hit { path: string; status: number; ms: number; bytes: number }

async function runPersona(persona: Persona, id: number): Promise<{ persona: Persona; id: number; hits: Hit[]; wandered: number; converted: boolean }> {
  const hits: Hit[] = [];
  const note = async (p: string) => { const r = await get(p); hits.push({ path: p, status: r.status, ms: r.ms, bytes: r.bytes }); return r; };

  const home = await note('/');
  const links = publicHrefs(home.html);

  if (persona === 'impatient') {
    // 没耐心就关掉：/ → 一个链接 → 关
    if (links.length > 0) await note(pick(links));
    return { persona, id, hits, wandered: 0, converted: false };
  }
  if (persona === 'rage-clicker') {
    // 瞎点：/ → 3–6 个链接连发，不等 scroll 、无目标
    const count = 3 + Math.floor(rand() * 4);
    for (let i = 0; i < count; i++) {
      if (links.length === 0) break;
      await note(pick(links));
    }
    return { persona, id, hits, wandered: count, converted: false };
  }
  if (persona === 'lost-wanderer') {
    // 漫游迷路：/ → /discover → 一个链接 → 回到 / → 关
    await note('/discover');
    if (links.length > 0 && rand() < 0.8) await note(pick(links));
    await note('/');
    return { persona, id, hits, wandered: 2, converted: false };
  }
  if (persona === 'deep-reader') {
    // 深读者：/guide 停下来读（换成真实壁钟 sleep 密歇长文页）
    await sleep(1200 + Math.floor(rand() * 1200));
    await note('/guide');
    await sleep(800 + Math.floor(rand() * 800));
    await note('/map');
    return { persona, id, hits, wandered: 2, converted: true };
  }
  // bot-ish：无 cookie、连打 3 次 /about-nexus 然后消失
  await note('/about-nexus');
  await note('/about-nexus');
  await note('/about-nexus');
  return { persona, id, hits, wandered: 0, converted: false };
}

async function main() {
  const perPersona = Math.floor(SESSIONS / PERSONAS.length);
  const plan: { persona: Persona; id: number }[] = [];
  let id = 0;
  for (const persona of PERSONAS) for (let i = 0; i < perPersona; i++) plan.push({ persona, id: id++ });

  // concurrency 4（RAM-friendly even with dev compile warm）
  const results = [] as Awaited<ReturnType<typeof runPersona>>[];
  let cursor = 0;
  async function worker() {
    while (cursor < plan.length) {
      const index = cursor++;
      const p = plan[index]!;
      results[index] = await runPersona(p.persona, p.id);
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));

  const allHits = results.flatMap((r) => r.hits);
  const ok = allHits.filter((h) => h.status >= 200 && h.status < 400).length;
  const errors = allHits.filter((h) => h.status >= 400 || h.status === 0).length;
  const sortedMs = allHits.map((h) => h.ms).sort((a, b) => a - b);
  const q = (p: number): number => sortedMs[Math.min(sortedMs.length - 1, Math.floor(p * sortedMs.length))] ?? 0;

  const byPersona = Object.fromEntries(
    PERSONAS.map((persona) => {
      const hitsForPersona = results.filter((r) => r.persona === persona).flatMap((r) => r.hits);
      const msForPersona = hitsForPersona.map((h) => h.ms).sort((a, b) => a - b);
      const qFor = (p: number): number => msForPersona[Math.min(msForPersona.length - 1, Math.floor(p * msForPersona.length))] ?? 0;
      return [persona, {
        sessions: results.filter((r) => r.persona === persona).length,
        hits: hitsForPersona.length,
        errors: hitsForPersona.filter((h) => h.status >= 400 || h.status === 0).length,
        p50: Math.round(qFor(0.5)), p95: Math.round(qFor(0.95)),
      }];
    }),
  );

  const errorHits = allHits.filter((h) => h.status >= 400 || h.status === 0).map((h) => ({ path: h.path, status: h.status, ms: Math.round(h.ms) }));

  const payload = {
    generated_at: new Date().toISOString(),
    sessions_planned: SESSIONS,
    sessions_done: results.length,
    hits_total: allHits.length,
    ok, errors,
    ms: { p50: Math.round(q(0.5)), p95: Math.round(q(0.95)), p99: Math.round(q(0.99)), max: Math.round(sortedMs[sortedMs.length - 1] ?? 0) },
    byPersona,
    errorHits: errorHits.sort((a, b) => b.ms - a.ms),
    note: 'synthetic traffic from scripts/simulate-user-behavior.mts; seeded deterministically; not real users; dev path, not SLA',
  };
  writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2), 'utf8');
  console.log('[SIM-1] sessions=' + results.length + ' hits=' + allHits.length + ' ok=' + ok + ' errors=' + errors + ' p50=' + payload.ms.p50 + 'ms p95=' + payload.ms.p95 + 'ms');
  for (const persona of PERSONAS) {
    const s = byPersona[persona]!;
    console.log('  ' + persona + ': sessions=' + s.sessions + ' hits=' + s.hits + ' errors=' + s.errors);
  }
  console.log('wrote', OUT_JSON);
  if (errorHits.length > 0) {
    console.log('error hits (sample):');
    for (const h of errorHits.slice(0, 12)) console.log('  ' + h.status + '  ' + h.path);
  }
}

main().catch((err) => { console.error('[SIM-1] failed:', err); process.exit(1); });
