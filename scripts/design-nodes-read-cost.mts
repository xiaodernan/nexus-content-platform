import { performance } from 'node:perf_hooks';
import postgres from 'postgres';
import { getDb } from '../apps/web/src/server/db/client';
import { designNodes, pages } from '../apps/web/src/server/db/schema';
import { asc, eq } from 'drizzle-orm';

/**
 * `loadDocument` 读 10000 个节点那一步：**drizzle 的行映射** vs **裸 sql**。
 *
 * 为什么量这个：首屏那约 1.3 秒里，裸 sql 读同样五张表只要 155ms（安静机器），
 * 而真 `loadDocument`（走 drizzle）要 2~3 秒 ⇒ **大头在 drizzle 的逐行映射**上，
 * 不在数据库、也不在组装。
 *
 * **必须交错量**（A/B/A/B…）：这台机器的负载会漂，一次量完 A 再量 B 的数不可比
 * （今天已经吃过"两次不同构建不能比"的亏）。
 */
const url = process.env.NEXUS_DATABASE_URL ?? '';
const sql = postgres(url, { max: 1, prepare: false });
const db = getDb();

const projectId = process.argv[2];
if (!projectId) {
  console.log('用法: tsx design-nodes-read-cost.mts <projectId>');
  process.exit(1);
}

const [page] = await db.select().from(pages).where(eq(pages.projectId, projectId)).limit(1);
if (!page) {
  console.log('那一页不存在');
  await sql.end();
  process.exit(1);
}
const pageId = page.id;
const nodeCount = (await sql`SELECT count(*)::int AS n FROM design_nodes WHERE page_id = ${pageId}`)[0] as { n: number };
console.log(`页面 ${pageId}，节点 ${nodeCount.n} 个\n`);

async function viaDrizzle(): Promise<number> {
  const t0 = performance.now();
  const rows = await db.select().from(designNodes).where(eq(designNodes.pageId, pageId)).orderBy(asc(designNodes.id));
  // 模拟 loadDocument 的组装：把 data 当成节点塞进 Record
  const nodes: Record<string, unknown> = {};
  for (const row of rows) nodes[row.id] = row.data;
  return performance.now() - t0;
}

async function viaBareSql(): Promise<number> {
  const t0 = performance.now();
  const rows = await sql`SELECT id, data FROM design_nodes WHERE page_id = ${pageId} ORDER BY id`;
  const nodes: Record<string, unknown> = {};
  for (const row of rows) nodes[(row as { id: string }).id] = (row as { data: unknown }).data;
  return performance.now() - t0;
}

// 交错量（预热一遍丢掉第一次）
await viaDrizzle();
await viaBareSql();
const drizzle: number[] = [];
const bare: number[] = [];
const ROUNDS = 4;
for (let i = 0; i < ROUNDS; i += 1) {
  drizzle.push(await viaDrizzle());
  bare.push(await viaBareSql());
}
const mid = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const d = mid(drizzle);
const b = mid(bare);
console.log(`drizzle 读+组装：${drizzle.map((t) => t.toFixed(0)).join(' / ')}ms（中位 ${d.toFixed(0)}ms）`);
console.log(`裸 sql 读+组装：${bare.map((t) => t.toFixed(0)).join(' / ')}ms（中位 ${b.toFixed(0)}ms）`);
console.log(`\n⇒ 差 ${(d - b).toFixed(0)}ms（drizzle 那一层多花 ${((d / b - 1) * 100).toFixed(0)}%）`);

await sql.end();
