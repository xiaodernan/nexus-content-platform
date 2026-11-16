/**
 * §INSIGHT-3 · 观察坞 AI 解读 —— 真实 live E2E 复现脚本。
 * 用法：`cd apps/web && npx tsx scripts/insight-analyze-e2e.mts`
 * 前提：ai-service sidecar 在 :8131（Clash Verge 7897 节点）；NEXUS_DATABASE_URL 可选。
 */
process.env.NEXUS_DATABASE_URL ??= 'postgres://nexus:nexus_dev_only@localhost:55433/nexus';

import { collectInsightSnapshot } from '../src/server/domain/insight';
import { buildInsightDigest, INSIGHT_AI_SYSTEM_PROMPT } from '../src/server/domain/insightAi';
import { leastSquares } from '../src/lib/insight-math';

async function main() {
  const snap = await collectInsightSnapshot();
  const opensFit = leastSquares(snap.series30d.opens);
  const publishFit = leastSquares(snap.series30d.publishes);
  const projectRatio = snap.totals.projects === 0 ? 1 : Math.min(1, snap.totals.published / snap.totals.projects);
  const guestShare = snap.totals.users + snap.totals.guests === 0 ? 0 : snap.totals.guests / (snap.totals.users + snap.totals.guests);
  const interactionRate = snap.opens30d === 0 ? 0 : (snap.likes30d + snap.comments30d) / snap.opens30d;
  const botShare = snap.opens30d === 0 ? 0 : snap.botOpens30d / snap.opens30d;
  const creditBurn = snap.credits30d.granted === 0 ? null : snap.credits30d.consumed / snap.credits30d.granted;

  const digest = buildInsightDigest({
    snapshot: snap,
    ratios: { publishRate: projectRatio, guestShare, interactionRate, botShare, creditBurn },
    opensSlope: opensFit?.slope ?? null,
    opensR2: opensFit?.r2 ?? null,
    publishSlope: publishFit?.slope ?? null,
    publishR2: publishFit?.r2 ?? null,
    locale: 'zh',
  });

  const t0 = performance.now();
  const resp = await fetch('http://127.0.0.1:8131/v1/ai/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      requestId: `insight-e2e-${Date.now()}`,
      system: INSIGHT_AI_SYSTEM_PROMPT,
      user: digest,
      modelClass: 'fast',
    }),
  });
  const ms = Math.round(performance.now() - t0);
  const payload = await resp.text();
  let parsed: Record<string, unknown> | null = null;
  try { parsed = JSON.parse(payload) as Record<string, unknown>; } catch { /* raw */ }
  console.log(JSON.stringify({
    status: resp.status,
    ms,
    capability: parsed?.capability,
    model: parsed?.model,
    usage: parsed?.usage,
    text: parsed?.text,
    rawOnError: resp.status === 200 ? undefined : payload.slice(0, 500),
  }, null, 2));
}

void main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
