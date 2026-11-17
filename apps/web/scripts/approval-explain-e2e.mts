/**
 * §73-AI · 审批挂起的挂起记录 live E2E（dao 真实行 + 真 provider）。
 * 用法：`cd apps/web && npx tsx scripts/approval-explain-e2e.mts <taskId>`（用例到 DB 里的 awaiting_approval 行）。
 * 前提：:8131 sidecar + Clash 节点 7897。
 */
process.env.NEXUS_DATABASE_URL ??= 'postgres://nexus:nexus_dev_only@localhost:55433/nexus';

import { getDb } from '../src/server/db/client';
import { agentTasks } from '../src/server/db/schema';
import { eq } from 'drizzle-orm';
import { buildApprovalDigest, AGENT_EXPLAIN_SYSTEM_PROMPT } from '../src/server/domain/agent-explain';

const taskId = process.argv[2] ?? 'c5ebd27e-8a20-45f2-86aa-964c02357c00';

async function main(): Promise<void> {
  const db = getDb();
  const [row] = await db.select().from(agentTasks).where(eq(agentTasks.id, taskId)).limit(1);
  if (!row) {
    console.error('task not found');
    process.exit(2);
  }
  const record = (row.result ?? {}) as { approvals?: unknown; heldOpCount?: unknown };
  const approvals = Array.isArray(record.approvals) ? record.approvals : [];
  const held = typeof record.heldOpCount === 'number' ? record.heldOpCount : null;
  const digest = buildApprovalDigest(
    {
      taskId: row.id,
      agentKey: row.agentKey,
      projectId: row.projectId,
      status: row.status as 'awaiting_approval',
      requiresApproval: row.requiresApproval,
      approvals,
      heldOpCount: held,
      capability: row.capability ?? null,
      createdAt: row.createdAt.toISOString(),
      awaitingSince: row.awaitingSince?.toISOString() ?? null,
      expiresAt: null,
    } as never,
    'zh',
  );

  process.stdout.write('===== DIGEST =====\n' + digest.user + '\n');

  const t0 = performance.now();
  const resp = await fetch('http://127.0.0.1:8131/v1/ai/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      requestId: `approval-explain-e2e-${Date.now()}`,
      system: AGENT_EXPLAIN_SYSTEM_PROMPT,
      user: digest.user,
      modelClass: 'fast',
    }),
  });
  const ms = Math.round(performance.now() - t0);
  const raw = await resp.text();
  let parsed: Record<string, unknown> | null = null;
  try { parsed = JSON.parse(raw) as Record<string, unknown>; } catch { /* raw */ }
  console.log(JSON.stringify({
    status: resp.status,
    ms,
    capability: parsed?.capability,
    model: parsed?.model,
    usage: parsed?.usage,
    text: parsed?.text,
    rawOnError: resp.status === 200 ? undefined : raw.slice(0, 600),
  }, null, 2));
  process.exit(0);
}

void main().catch((e) => { console.error(e); process.exit(1); });
