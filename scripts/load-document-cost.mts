import { performance } from 'node:perf_hooks';
import postgres from 'postgres';

/**
 * 量**真实的** `loadDocument`（apps/web/src/server/domain/projects 里那一个）花多久，
 * 并与"用裸 sql 读同样几张表"对照。
 *
 * 为什么要这个对照：首屏那约 1.3 秒里，读 10000 行 + 组装只占 **155ms**
 * （`scripts/jsonb-agg-probe.mts` 用裸 sql 量过）——那剩下 ≈1.15 秒在哪？
 * 这一份把**真函数**（drizzle 行映射 + 真组装）也量一遍：
 * 若真函数也只要 ~200ms，那 1.15 秒就不在读与组装里（RSC 序列化 / 浏览器那一段）；
 * 若真函数要 1.3 秒，那差距就在 **drizzle 的行映射**上（裸 sql 不做那层映射）。
 *
 * 用法：`NEXUS_DATABASE_URL=... npx tsx scripts/load-document-cost.mts <projectId>`
 */
const projectId = process.argv[2];
if (!projectId) {
  console.log('用法: tsx load-document-cost.mts <projectId>');
  process.exit(1);
}

const t0 = performance.now();
const { loadDocument } = await import('../apps/web/src/server/domain/projects');
const tImport = performance.now() - t0;
console.log(`import 真函数（含 drizzle + schema）：${tImport.toFixed(0)}ms`);

// ① 真函数
const realTimes: number[] = [];
let doc: Awaited<ReturnType<typeof loadDocument>> = null;
for (let i = 0; i < 3; i += 1) {
  const t = performance.now();
  doc = await loadDocument(projectId);
  realTimes.push(performance.now() - t);
}
realTimes.sort((a, b) => a - b);
console.log(`\n真 loadDocument：中位 ${realTimes[1]!.toFixed(0)}ms（各次 ${realTimes.map((t) => t.toFixed(0)).join(' / ')}）`);
console.log(`  读出来的节点数：${Object.keys(doc?.pages[0]?.nodes ?? {}).length}`);

// ② 裸 sql 读同样的表（不做 drizzle 行映射）
const sql = postgres(process.env.NEXUS_DATABASE_URL ?? '', { max: 1, prepare: false });
const pageId = doc?.pages[0]?.id;
if (!pageId) {
  console.log('那一页不存在（文档没读出来）');
  await sql.end();
  process.exit(1);
}
const bareTimes: number[] = [];
for (let i = 0; i < 3; i += 1) {
  const t = performance.now();
  await sql`SELECT id, name, root_node_id, width, height, background_color, sort_index, project_id
            FROM pages WHERE project_id = ${projectId}::uuid ORDER BY sort_index, id`;
  await sql`SELECT key, type, value, modes, description, sort_index
            FROM design_tokens WHERE project_id = ${projectId}::uuid ORDER BY sort_index, key`;
  await sql`SELECT id, name, page_id, root_node_id, variants, props, slots
            FROM components WHERE project_id = ${projectId}::uuid ORDER BY id`;
  await sql`SELECT id, name, kind, storage_key, mime, bytes, width, height
            FROM assets WHERE project_id = ${projectId}::uuid ORDER BY created_at`;
  await sql`SELECT id, page_id, parent_id, node_type, name, sort_index, data, updated_at
            FROM design_nodes WHERE page_id = ${pageId} ORDER BY id`;
  bareTimes.push(performance.now() - t);
}
bareTimes.sort((a, b) => a - b);
console.log(`\n裸 sql 读同样的五张表：中位 ${bareTimes[1]!.toFixed(0)}ms（各次 ${bareTimes.map((t) => t.toFixed(0)).join(' / ')}）`);
console.log(`\n⇒ 差 ${(realTimes[1]! - bareTimes[1]!).toFixed(0)}ms = drizzle 行映射 + 真组装那一层`);

// ③ 序列化那份文档（首屏 RSC 载荷的大小）
const json = JSON.stringify(doc);
console.log(`\n文档 JSON：${(json.length / 1024 / 1024).toFixed(2)} MB`);
const tSer = performance.now();
JSON.stringify(doc);
console.log(`JSON.stringify：${(performance.now() - tSer).toFixed(0)}ms`);

await sql.end();
// 连接关掉后 Node 的事件循环可能还挂着（postgres 客户端的定时器）→ 显式退出，
// 否则脚本会在量完之后**挂住不退出**（管道里 stdout 是缓冲的，一挂住输出就丢了）。
process.exit(0);
