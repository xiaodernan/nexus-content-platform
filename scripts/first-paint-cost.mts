/**
 * §147 的下一格（10000 档**首屏**）：先量清楚那 7 秒花在哪。
 *
 * 已知（docs/PERFORMANCE.md 的分段）：10000 档生产构建下「导航 → HTML 到手」要 **7.2 秒**，
 * 而「最后一个脚本到手 → 第一个节点画出」还有 2.3 秒（水合、首屏求解、首次绘制都在这一截）。
 *
 * 这一份量**服务端那几段**，而且**不 import 应用层**（那一层在深夜编译要十几分钟，量不动）：
 * ① 数据库读那一段（真数，直连）；
 * ② 组装那一段（**下界**——这里用的是最朴素的组装，应用那条路还多一层 drizzle 的行映射，只会更慢）；
 * ③ 序列化与压缩那一段（真数）。
 *
 * 用法：`npx tsx scripts/first-paint-cost.mts <projectId> [库地址]`
 */
import { performance } from 'node:perf_hooks';
import postgres from 'postgres';

const projectId = process.argv[2];
const url = process.argv[3] ?? 'postgres://nexus:nexus_dev_only@localhost:55100/nexus_regress';
if (!projectId) {
  console.log('用法: tsx first-paint-cost.mts <projectId> [库地址]');
  process.exit(1);
}

const t0 = performance.now();
const mark = (label: string): void => {
  console.log(`[${((performance.now() - t0) / 1000).toFixed(2)}s] ${label}`);
};

const sql = postgres(url, { max: 1 });

// ① 数据库读：节点是**每节点一行**（`design_nodes` 表，`data` 是 jsonb）
const readStart = performance.now();
const pageRows = await sql<{ id: string; name: string; root_node_id: string; width: number; height: number }[]>`
  SELECT id, name, root_node_id, width, height FROM pages WHERE project_id = ${projectId}::uuid
`;
const nodeRows = await sql<{ id: string; page_id: string; parent_id: string | null; node_type: string; name: string; sort_index: number; data: unknown }[]>`
  SELECT id, page_id, parent_id, node_type, name, sort_index, data
  FROM design_nodes WHERE page_id IN (SELECT id FROM pages WHERE project_id = ${projectId}::uuid)
`;
const readMs = performance.now() - readStart;
mark(`数据库读：${nodeRows.length} 个节点行，${readMs.toFixed(0)}ms`);

// ② 组装（**下界**：最朴素的组装；应用那条路还多一层 drizzle 行映射）
const buildStart = performance.now();
const nodes: Record<string, unknown> = {};
for (const row of nodeRows) {
  nodes[row.id] = { id: row.id, type: row.node_type, name: row.name, ...(row.data as object) };
}
const buildMs = performance.now() - buildStart;
mark(`组装（最朴素的下界）：${buildMs.toFixed(0)}ms`);

// ③ 序列化与压缩
const document = { id: projectId, name: pageRows[0]?.name ?? '', pages: pageRows.map((p) => ({ ...p, nodes })) };
const serStart = performance.now();
const json = JSON.stringify(document);
const serMs = performance.now() - serStart;
const { gzipSync } = await import('node:zlib');
const gzip = gzipSync(json);
mark(`JSON 序列化：${serMs.toFixed(0)}ms，${(json.length / 1024 / 1024).toFixed(2)} MB（gzip ${(gzip.length / 1024 / 1024).toFixed(2)} MB）`);

await sql.end();

console.log('\n小结（服务端这一侧）：');
console.log(`  数据库读：${readMs.toFixed(0)}ms`);
console.log(`  组装：≥ ${buildMs.toFixed(0)}ms（这是下界，应用那条路更慢）`);
console.log(`  序列化：${serMs.toFixed(0)}ms，体积 ${(json.length / 1024 / 1024).toFixed(2)} MB（gzip ${(gzip.length / 1024 / 1024).toFixed(2)} MB）`);
console.log('  —— RSC 序列化与浏览器那一段没在这里量（要看 perf-browser 的分段读数）');
