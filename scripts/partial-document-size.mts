import { performance } from 'node:perf_hooks';
import postgres from 'postgres';
import { getDb } from '../apps/web/src/server/db/client';
import { pages } from '../apps/web/src/server/db/schema';
import { eq } from 'drizzle-orm';
import { resolveLayout } from '../packages/design-model/src/layout';
import { visiblePaintOrder } from '../packages/design-model/src/viewport';
import type { DesignNode } from '../packages/design-model/src/types';

/**
 * 「首屏只带视口内内容」这条路，**载荷能小多少**？
 *
 * 形态（2026-10-21 核对出来的）：
 * ① 服务端算**全量布局**（它有全量文档）→ 几何是算出来的，与内容无关 ✓
 * ② 首屏传：**全量几何**（瘦 layout，不含 `node`）+ **视口内那些节点的完整 node**（几何+样式+文字）
 * ③ 客户端照 `visiblePaintOrder` 裁剪（判据是纯几何的 ✓）
 *
 * 这一份量四样：
 * - 今天的整份文档（基线）
 * - 整份 resolved layout（含 node ⇒ 几何与内容揉在一起 ⇒ 今天 RSC 载荷的主体）
 * - **瘦 layout**（只有几何）
 * - 瘦 layout + 视口内的完整 node
 */
const url = process.env.NEXUS_DATABASE_URL ?? '';
const sql = postgres(url, { max: 1, prepare: false });
const db = getDb();

const projectId = process.argv[2];
if (!projectId) {
  console.log('用法: tsx partial-document-size.mts <projectId>');
  process.exit(1);
}

const [pageRow] = await db.select().from(pages).where(eq(pages.projectId, projectId)).limit(1);
if (!pageRow) {
  console.log('那一页不存在');
  await sql.end();
  process.exit(1);
}
const pageId = pageRow.id;
const nodeRows = (await db.execute(
  // 原始行（绕开映射，与 loadDocument 那一改法一致）
  (await import('drizzle-orm')).sql`SELECT id, data FROM design_nodes WHERE page_id = ${pageId} ORDER BY id`,
)) as unknown as Array<{ id: string; data: DesignNode }>;

const nodes: Record<string, DesignNode> = {};
for (const row of nodeRows) nodes[row.id] = row.data;

const page = {
  id: pageId,
  name: pageRow.name,
  rootId: pageRow.rootNodeId,
  width: pageRow.width,
  height: pageRow.height,
  nodes,
  background: '#fff',
} as unknown as Parameters<typeof resolveLayout>[0];

// 全量布局
const t0 = performance.now();
const layout = resolveLayout(page);
const tLayout = performance.now() - t0;

const mb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
const kb = (bytes: number): string => `${(bytes / 1024).toFixed(0)} KB`;

// ① 今天的整份文档
const docJson = JSON.stringify({ id: pageId, pages: [page] });

// ② 整份 resolved layout（今天 RSC 载荷的主体：几何 + 内容揉在一起）
const layoutJson = JSON.stringify(layout);

// ③ 瘦 layout：只有几何
const thin = {
  rootId: layout.rootId,
  width: layout.width,
  height: layout.height,
  paintOrder: layout.paintOrder,
  nodes: Object.fromEntries(
    Object.entries(layout.nodes).map(([id, n]) => [
      id,
      { id: n.id, x: n.x, y: n.y, width: n.width, height: n.height, depth: n.depth, parentId: n.parentId, children: n.children },
    ]),
  ),
};
const thinJson = JSON.stringify(thin);

// ④ 瘦 layout + 视口内的完整 node（首屏那一档的真实载荷）
//    视口取浏览器里那块：1440×900 的画布、zoom 1、pan 0（perf-browser 的默认档）
const view = { x: 0, y: 0, width: 1440, height: 900 };
const visible = visiblePaintOrder(layout, view);
const visibleIds = new Set(visible.ids);
const contentNodes = Object.fromEntries(
  Object.entries(layout.nodes)
    .filter(([id]) => visibleIds.has(id))
    .map(([id, n]) => [id, n.node]),
);
const partialJson = JSON.stringify({ ...thin, content: contentNodes });

// ⑤ 几何用**数组**编码（省掉每个字段的 key）：x/y/w/h/depth/parentId/children
const thinArray = {
  rootId: layout.rootId,
  width: layout.width,
  height: layout.height,
  paintOrder: layout.paintOrder,
  // [x, y, w, h, depth, parentId, children]
  nodes: Object.fromEntries(
    Object.entries(layout.nodes).map(([id, n]) => [
      id,
      [n.x, n.y, n.width, n.height, n.depth, n.parentId, n.children],
    ]),
  ),
};
const thinArrayWithContent = JSON.stringify({
  ...thinArray,
  content: contentNodes,
});

console.log(`节点 ${Object.keys(nodes).length} 个，布局求解 ${tLayout.toFixed(0)}ms`);
console.log(`视口内可见：${visible.ids.length} 个（裁掉 ${visible.culled} 个）\n`);
console.log(`① 今天的整份文档（基线）        ${mb(docJson.length)}`);
console.log(`② 整份 resolved layout（含 node） ${mb(layoutJson.length)}`);
console.log(`③ 瘦 layout（对象，只有几何）     ${kb(thinJson.length)}`);
console.log(`④ 瘦 layout + 视口内完整 node     ${kb(partialJson.length)}`);
console.log(`⑤ 瘦 layout（数组编码）+ 视口内容  ${kb(thinArrayWithContent.length)}`);
console.log(`\n⇒ ④相对①：${(docJson.length / partialJson.length).toFixed(1)}× 小`);
console.log(`⇒ ⑤相对①：${(docJson.length / thinArrayWithContent.length).toFixed(1)}× 小`);

await sql.end();
process.exit(0);
