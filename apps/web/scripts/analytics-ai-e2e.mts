/**
 * §169-AI · 创作者读账大模型解读 —— 真实 live E2E（一次性）。
 * 用法：`cd apps/web && npx tsx scripts/analytics-ai-e2e.mts <projectId> <ownerId>`
 */
process.env.NEXUS_DATABASE_URL ??= 'postgres://nexus:nexus_dev_only@localhost:55433/nexus';

import { buildCreatorFact, analyzeCreatorFacts } from '../src/server/domain/analytics-agent';
import { AGENT_NARRATE_SYSTEM_PROMPT, buildCreatorDigest } from '../src/server/domain/analytics-agent-ai';

const [projectId, ownerId] = process.argv.slice(2);
if (!projectId || !ownerId) {
  console.error('usage: tsx scripts/analytics-ai-e2e.mts <projectId> <ownerId>');
  process.exit(1);
}

async function main() {
  const fact = await buildCreatorFact(projectId!, ownerId!);
  if (!fact) {
    console.error('buildCreatorFact returned null (project missing or not owner)');
    process.exit(2);
  }
  const findings = analyzeCreatorFacts(fact);
  const digest = buildCreatorDigest(fact, findings);

  process.stdout.write('===== DIGEST =====\n' + digest + '\n');

  const t0 = performance.now();
  const resp = await fetch('http://127.0.0.1:8131/v1/ai/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      requestId: `analytics-e2e-${Date.now()}`,
      system: AGENT_NARRATE_SYSTEM_PROMPT,
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
  process.exit(0);
}

void main().catch((e) => { console.error(e); process.exit(1); });
