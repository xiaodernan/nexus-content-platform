import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { emit } from '@/server/domain/notifications';
import { createProject } from '@/server/domain/projects';
import { getDb } from '@/server/db/client';
import { notifications, projects, users } from '@/server/db/schema';

/**
 * ADR 0065 — the PHYSICAL basis of the job lane's at-least-once safety, graded against a real DB.
 *
 * The worker may run `emit` twice for one job: a crash after the notification row is written but before
 * XACK re-delivers the entry. Nothing in the queue can prevent that second call — at-least-once means
 * exactly this. Safety comes from `notifications.dedupe_key` being UNIQUE (schema + migration 0010) and
 * `emit` inserting with `ON CONFLICT DO NOTHING`. Two calls with the same `build:<exportId>` key must
 * leave ONE row.
 *
 * This is the one fact a mock cannot prove: it needs the real UNIQUE index to actually reject the
 * second insert. Where no Postgres answers, the whole file skips (a durability proof cannot grade a
 * host with no database), same discipline as job-queue.test.ts for Redis.
 */

// Probe the DB at MODULE LOAD (top-level await) so describe.skipIf sees a settled answer. A guard
// computed inside beforeAll would be evaluated by skipIf too early (it runs at collection time).
const dbUp = await (async () => {
  try {
    await getDb().execute(sql`select 1`);
    return true;
  } catch (err) {
    console.warn('[job-lane-idempotency] DB 不可用，跳过真库证明：', err instanceof Error ? err.message : String(err));
    return false;
  }
})();

let userId: string | null = null;
let projectId: string | null = null;
const exportId = `lane-proof-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

beforeAll(async () => {
  if (!dbUp) return;
  const db = getDb();
  const stamp = Date.now();
  const [row] = await db
    .insert(users)
    .values({ displayName: `lane-proof-${stamp}`, email: `lane+${stamp}@nexus.test`, role: 'creator' })
    .returning({ id: users.id });
  userId = row?.id ?? null;
  if (userId) projectId = (await createProject(userId, { name: `lane-proof-${stamp}`, kind: 'website' })).id;
});

afterAll(async () => {
  if (!userId) return;
  const db = getDb();
  await db.delete(notifications).where(eq(notifications.userId, userId));
  if (projectId) await db.delete(projects).where(eq(projects.id, projectId));
  await db.delete(users).where(eq(users.id, userId));
});

const buildEvent = (recipientId: string, pid: string) => ({
  kind: 'build' as const,
  recipientId,
  projectId: pid,
  projectName: '幂等证明作品',
  // The producer-minted anchor. Identical on both deliveries — that is the whole test.
  exportId,
  ok: true,
  counts: { design: 1, code: 2, assets: 0 },
  missingAssets: 0,
  durationMs: 42,
  detail: null,
});

describe.skipIf(!dbUp)('build.complete 幂等锚点（真库唯一索引）', () => {
  it('同一 exportId 写两次 → created 然后 duplicate，收件箱里恰好一行', async () => {
    const event = buildEvent(userId!, projectId!);
    const first = await emit(event);
    const second = await emit(event); // the crash-before-XACK redelivery

    expect(first).toBe('created');
    expect(second).toBe('duplicate');

    const rows = await getDb()
      .select({ id: notifications.id, dedupeKey: notifications.dedupeKey })
      .from(notifications)
      .where(and(eq(notifications.userId, userId!), eq(notifications.dedupeKey, `build:${exportId}`)));
    expect(rows).toHaveLength(1);
  });

  it('另一件导出（不同 exportId）仍会出声——dedupe 没把"每次导出都是新事"误伤掉', async () => {
    const other = await emit({ ...buildEvent(userId!, projectId!), exportId: `${exportId}-second` });
    expect(other).toBe('created');
    const rows = await getDb()
      .select({ id: notifications.id })
      .from(notifications)
      .where(eq(notifications.userId, userId!));
    expect(rows.length).toBe(2); // the first export + this second one
  });
});
