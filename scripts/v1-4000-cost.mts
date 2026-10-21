import { performance } from 'node:perf_hooks';
import { gzipSync } from 'node:zlib';
import { createDocument, createNode, createPage } from '../packages/design-model/src/nodes';
import { applyPatch } from '../packages/design-model/src/patch';
import { resolveLayout } from '../packages/design-model/src/layout';
import type { DesignDocument, DesignNode } from '../packages/design-model/src/types';

/**
 * 公开 API 那一档的**载荷与耗时**（ROADMAP 里那条还欠着的）：
 * "4000 节点档的 GET 响应体积与 PATCH 耗时仍未量"。
 *
 * 为什么值得量：外部 Agent 与 MCP 接入那一格（M8 整格还是 `[~]`）的输入就是它——
 * **一枚凭据读一份 4000 节点的文档，响应多大、要多久**；改一个节点**要多久**。
 * 没有这两个数，"外部 Agent 能不能用"就只能靠感觉。
 *
 * 这一份在**内存里**量（不建项目、不发请求）：
 * - GET 响应体积 ≈ 文档 JSON 的字节数（再给 gzip 后的大小 ⇒ 传输那一层的下界）
 * - PATCH 耗时 ≈ `applyPatch`（写路径那一层：它要算补丁、落库前的形状）
 * - 顺带量**布局求解**（客户端那一层：外部 Agent 那边的画布也要算）
 */
const N = Number.parseInt(process.argv[2] ?? '4000', 10);

function build(n: number): DesignDocument {
  const document = createDocument(`公开 API ${n} 档`);
  const page = createPage('Api', 1440, 900);
  document.pages = [page];
  document.activePageId = page.id;
  const root = page.nodes[page.rootId]!;
  const kids: DesignNode[] = [];
  for (let i = 1; i < n; i += 1) {
    const node = createNode({
      type: 'text',
      name: `t-${i}`,
      text: `第 ${i} 行`,
      parentId: root.id,
      position: { x: 0, y: i * 24 },
    });
    page.nodes[node.id] = node;
    kids.push(node);
  }
  root.children = kids.map((k) => k.id);
  return document;
}

function median(xs: number[]): number {
  return [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
}

const document = build(N);
const page = document.pages[0]!;
const nodeCount = Object.keys(page.nodes).length;

// ① GET 响应体积（文档 JSON；再给 gzip 后的大小）
const tJson = performance.now();
const json = JSON.stringify(document);
const jsonMs = performance.now() - tJson;
const gzip = gzipSync(json).length;

// ② 布局求解（客户端那一层）
const layoutTimes: number[] = [];
for (let i = 0; i < 3; i += 1) {
  const t0 = performance.now();
  resolveLayout(page);
  layoutTimes.push(performance.now() - t0);
}

// ③ PATCH 耗时：改一个节点（那是外部 Agent 最常做的事）
const targetId = page.nodes[page.rootId]!.children[10]!;
const patchTimes: number[] = [];
for (let i = 0; i < 5; i += 1) {
  const t0 = performance.now();
  applyPatch(document, {
    id: `probe-${i}`,
    summary: '改字号',
    pageId: page.id,
    ops: [{ op: 'set', nodeId: targetId, path: 'typography.fontSize', value: 16 + i }],
  });
  patchTimes.push(performance.now() - t0);
}

console.log(`公开 API 那一档：${nodeCount} 个节点`);
console.log(`  GET 响应（文档 JSON）: ${(json.length / 1024 / 1024).toFixed(2)} MB，gzip 后 ${(gzip / 1024 / 1024).toFixed(2)} MB`);
console.log(`  JSON.stringify      : ${jsonMs.toFixed(1)}ms`);
console.log(`  布局求解             : 中位 ${median(layoutTimes).toFixed(1)}ms（${layoutTimes.map((t) => t.toFixed(0)).join(' / ')}）`);
console.log(`  PATCH（改一个节点）  : 中位 ${median(patchTimes).toFixed(1)}ms（${patchTimes.map((t) => t.toFixed(1)).join(' / ')}）`);
console.log(`  ⇒ 一个外部 Agent 读一份 ${nodeCount} 节点的文档：载荷 ${(gzip / 1024 / 1024).toFixed(2)} MB（gzip）`);
console.log(`  ⇒ 改一个节点：${median(patchTimes).toFixed(1)}ms（不含网络与落库）`);
