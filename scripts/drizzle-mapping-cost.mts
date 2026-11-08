import { performance } from 'node:perf_hooks';
import postgres from 'postgres';
import { getDb } from '../apps/web/src/server/db/client';
import { designNodes, pages, projects } from '../apps/web/src/server/db/schema';
import { and, desc, eq, ilike } from 'drizzle-orm';

/**
 * 「drizzle 的逐行映射」这层开销，在**搜索路径**上还有没有？
 *
 * 读路径已量过并修掉（`loadDocument` 读 design_nodes：drizzle 817ms vs 裸 sql 499ms）。
 * 同一层映射在搜索路径上同样在跑：`search.ts` 按节点名 `ilike` + 按 updatedAt 排序。
 *
 * **只读**（这一份不写库：共享的隔离库里有我刚量过的那一档，插假节点会污染它）。
 *
 * 量的方式同读路径那一格：**交错**（A/B/A/B…）——这台机器负载会漂，
 * 一次量完 A 再量 B 的数不可比（今天已经吃过"两次不同构建不能比"的亏）。
 *
 * 用法：`NEXUS_DATABASE_URL=... npx tsx scripts/drizzle-mapping-cost.mts <projectId>`
 */
const url = process.env.NEXUS_DATABASE_URL ?? '';
const sql = postgres(url, { max: 1, prepare: false });
const db = getDb();

const projectId = process.argv[2];
if (!projectId) {
  console.log('用法: tsx drizzle-mapping-cost.mts <projectId>');
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

const mid = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

// drizzle 版：只选需要的列（它会为每一行做映射）——search.ts 的形状
const drizzleSearch = async (term: string): Promise<void> => {
  await db
    .select({ id: designNodes.id, name: designNodes.name, pageId: designNodes.pageId })
    .from(designNodes)
    .innerJoin(pages, eq(designNodes.pageId, pages.id))
    .innerJoin(projects, eq(pages.projectId, projects.id))
    .where(and(eq(projects.ownerId, projectId), ilike(designNodes.name, `%${term}%`)))
    .orderBy(desc(designNodes.updatedAt))
    .limit(20);
};

// 裸 sql 版：同样的语义，不经映射
const bareSearch = async (term: string): Promise<void> => {
  await sql`SELECT n.id, n.name, n.page_id FROM design_nodes n
            JOIN pages p ON n.page_id = p.id
            WHERE p.project_id = ${projectId}::uuid AND n.name ILIKE ${`%${term}%`}
            ORDER BY n.updated_at DESC LIMIT 20`;
};

console.log('搜索路径（按名字 ilike + 按 updatedAt 排）');
for (const [label, term] of [['常见前缀（命中多）', 'Perf'], ['罕见词（命中少）', 'Perf 4242']] as const) {
  await drizzleSearch(term);
  await bareSearch(term);
  const d: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    let t0 = performance.now();
    await drizzleSearch(term);
    d.push(performance.now() - t0);
    t0 = performance.now();
    await bareSearch(term);
    b.push(performance.now() - t0);
  }
  console.log(`  —— ${label}：「${term}」——`);
  console.log(`     drizzle：中位 ${mid(d).toFixed(1)}ms（${d.map((t) => t.toFixed(1)).join(' / ')}）`);
  console.log(`     裸 sql：中位 ${mid(b).toFixed(1)}ms（${b.map((t) => t.toFixed(1)).join(' / ')}）`);
  console.log(`     ⇒ 差 ${(mid(d) - mid(b)).toFixed(1)}ms`);
}

await sql.end();
// 连接关掉后 Node 的事件循环可能还挂着（postgres 客户端的定时器）→ 显式退出，
// 否则脚本会在量完之后**挂住不退出**（管道里 stdout 是缓冲的，一挂住输出就丢了）。
process.exit(0);
