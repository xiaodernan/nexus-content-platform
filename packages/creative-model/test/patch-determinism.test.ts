import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createDocument, createNode, createPage } from "../src/nodes";
import { applyPatch } from "../src/patch";
import type { PatchOp } from "../src/patch";
import type { AssetRef, DesignDocument, DesignNode } from "../src/types";

/**
 * **apply 必须是确定的**：同一条 op 天生要被打两次——客户端在内存里那一份上打一次，
 * 自动保存把同一条 op 送去服务端，服务端在**库里那一份**上再打一次（#62② 的补丁路径，
 * `patchProjectDocument`）。两边各打各的还要是同一份真值（§16），唯一的办法就是
 * "同一条 op + 同一份输入文档 ⇒ 同一份输出文档"。
 *
 * 这条性质不是洁癖。第三十四片的复制体 id 用 `uid()` 现场摇（ADR-0079）：两份文档
 * 内容一样、id 不一样，于是第三十五片"更新实例"那串点名复制体内部的 op 在服务端那份上
 * `node ... not found` → 整批 409 → 客户端换整份 PUT 兜底 → **界面照样好看，缺陷看不见**。
 * 是 e2e 的 PATCH 计数抓出来的，模型层当时没有任何东西看着这条路。
 *
 * 这一片把话说到词汇表整体上：每一条 op 都要过"两份一模一样的文档各打一次，结果必须相同"，
 * 而且**清单由契约反过来钉**——`contracts/design-patch.schema.json` 里有的 op，这里没有用例就红，
 * 免得又变成"加了 op 忘了写见证"的第五处手抄清单。
 *
 * 注：`applyPatch` 会写 `metadata.updatedAt = new Date()`，那是墙钟不是结构，比较前先抹掉。
 */

const CONTRACT_OPS = (() => {
  const url = new URL("../../../contracts/design-patch.schema.json", import.meta.url);
  const contract = JSON.parse(readFileSync(fileURLToPath(url), "utf8")) as unknown;
  const ops = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object") {
      const rec = node as Record<string, unknown>;
      const op = rec.op;
      if (op && typeof op === "object" && typeof (op as { const?: unknown }).const === "string")
        ops.add((op as { const: string }).const);
      Object.values(rec).forEach(walk);
    }
  };
  walk(contract);
  return ops;
})();

function fixture() {
  const doc = createDocument("Demo", "website");
  const home = doc.pages[0]!;
  const second = createPage("第二页");
  doc.pages.push(second);

  const box = createNode({
    type: "frame",
    name: "盒子",
    parentId: home.rootId,
    size: { width: 120, height: 40 },
  });
  const label = createNode({ type: "text", name: "标签", parentId: box.id, text: "提交" });
  box.children = [label.id];
  home.nodes[box.id] = box;
  home.nodes[label.id] = label;
  home.nodes[home.rootId]!.children = [...home.nodes[home.rootId]!.children, box.id];

  const asset: AssetRef = {
    id: "ast_1",
    name: "图",
    kind: "image",
    storageKey: "ast_1.png",
    mimeType: "image/png",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  doc.assets = [asset];
  doc.components = [
    { id: "cmp_1", name: "盒子", rootId: box.id, pageId: home.id, props: [], variants: [], slots: [] },
  ];
  return { doc, home, second, box, label, asset };
}

const f = fixture();
/** 复制体里那颗节点的真实 id 只能在 apply 之后才知道，末尾那条用例拿它对照两边 */
const instanceBodyId = applyPatch(structuredClone(f.doc), {
  pageId: f.home.id,
  ops: [{ op: "instantiate", componentId: "cmp_1", instanceId: "ins_1" }],
}).document.pages[0]!.nodes["ins_1"]!.children[0]!;

type Case = { op: string; setup?: PatchOp[]; ops: PatchOp[] };

const CASES: Case[] = [
  { op: "set", ops: [{ op: "set", nodeId: f.label.id, path: "text", value: "立即购买" }] },
  { op: "unset", ops: [{ op: "unset", nodeId: f.box.id, path: "states" }] },
  {
    op: "merge",
    ops: [{ op: "merge", nodeId: f.box.id, path: "style", value: { opacity: 0.5 } }],
  },
  {
    op: "insert",
    ops: [
      {
        op: "insert",
        node: { ...structuredClone(f.label), id: "tex_new", children: [], parentId: f.box.id },
        parentId: f.box.id,
        index: 0,
      },
    ],
  },
  { op: "remove", ops: [{ op: "remove", nodeId: f.label.id }] },
  {
    op: "reparent",
    ops: [{ op: "reparent", nodeId: f.label.id, parentId: f.home.rootId, index: 0 }],
  },
  { op: "reorder", ops: [{ op: "reorder", parentId: f.home.rootId, from: 0, to: 1 }] },
  { op: "instantiate", ops: [{ op: "instantiate", componentId: "cmp_1", instanceId: "ins_9" }] },
  {
    op: "addToken",
    ops: [{ op: "addToken", token: { key: "color.accent", type: "color", value: "#ff0055" } }],
  },
  {
    op: "setToken",
    setup: [{ op: "addToken", token: { key: "color.accent", type: "color", value: "#ff0055" } }],
    ops: [{ op: "setToken", key: "color.accent", value: "#00ff55" }],
  },
  {
    op: "removeToken",
    setup: [{ op: "addToken", token: { key: "color.accent", type: "color", value: "#ff0055" } }],
    ops: [{ op: "removeToken", key: "color.accent" }],
  },
  {
    op: "setVisualDna",
    ops: [{ op: "setVisualDna", dna: null }],
  },
  {
    op: "addComponent",
    ops: [
      {
        op: "addComponent",
        component: {
          id: "cmp_new",
          name: "新组件",
          rootId: f.label.id,
          pageId: f.home.id,
          props: [],
          variants: [],
          slots: [],
        },
      },
    ],
  },
  { op: "removeComponent", ops: [{ op: "removeComponent", componentId: "cmp_1" }] },
  {
    op: "restoreComponent",
    setup: [{ op: "instantiate", componentId: "cmp_1", instanceId: "ins_1" }],
    ops: [
      {
        op: "restoreComponent",
        component: f.doc.components[0]!,
        nodes: [{ pageId: f.home.id, nodeId: "ins_1" }],
      },
    ],
  },
  {
    op: "addAsset",
    ops: [
      {
        op: "addAsset",
        asset: { ...f.asset, id: "ast_new", name: "新图", storageKey: "ast_new.png" },
      },
    ],
  },
  { op: "removeAsset", ops: [{ op: "removeAsset", assetId: "ast_1" }] },
  {
    op: "restoreAsset",
    setup: [{ op: "removeAsset", assetId: "ast_1" }],
    ops: [
      {
        op: "restoreAsset",
        asset: f.asset,
        paints: [],
        nodes: [{ pageId: f.home.id, nodeId: f.box.id, assetId: "ast_1" }],
      },
    ],
  },
  {
    op: "addPage",
    ops: [
      {
        op: "addPage",
        page: { ...structuredClone(f.second), id: "pg_new", name: "新页" },
      },
    ],
  },
  { op: "removePage", ops: [{ op: "removePage", pageId: f.second.id }] },
];

const withoutClock = (doc: DesignDocument): DesignDocument => ({
  ...doc,
  metadata: { ...doc.metadata, updatedAt: "" },
});

describe("apply 的确定性：同一条 op 在两份一模一样的文档上打出同一份结果（ADR-0079）", () => {
  it("清单由契约钉：design-patch 契约里的每一条 op 都要有一条确定性用例", () => {
    // 契约读空了也要红，否则这条门自己会变成惰性臂
    expect(CONTRACT_OPS.size).toBeGreaterThanOrEqual(20);
    const covered = new Set(CASES.map((c) => c.op));
    const missing = [...CONTRACT_OPS].filter((op) => !covered.has(op));
    expect(missing, `契约里有、这里没有确定性用例的 op：${missing.join(' / ')}`).toEqual([]);
    const extra = [...covered].filter((op) => !CONTRACT_OPS.has(op));
    expect(extra, `用例点名了契约里没有的 op（词表漂了）：${extra.join(' / ')}`).toEqual([]);
  });

  for (const c of CASES) {
    it(`${c.op}：两份文档各打 setup + ops，落出来的节点表与文档结构一致`, () => {
      const run = (): { doc: DesignDocument; skipped: { index: number; reason: string }[] } => {
        let doc = structuredClone(f.doc);
        if (c.setup?.length) {
          const s = applyPatch(doc, { pageId: f.home.id, ops: c.setup });
          expect(s.skipped, `${c.op} 的 setup 落了空：${JSON.stringify(s.skipped)}`).toEqual([]);
          doc = s.document;
        }
        const r = applyPatch(doc, { pageId: f.home.id, ops: c.ops });
        return { doc: r.document, skipped: r.skipped };
      };
      const left = run();
      const right = run();
      // 前提：这一条 op 真的落了地（打空的 op 比"两份一样的空"没有意义）
      expect(left.skipped, JSON.stringify(left.skipped)).toEqual([]);
      expect(right.skipped, JSON.stringify(right.skipped)).toEqual([]);
      expect(withoutClock(right.doc)).toEqual(withoutClock(left.doc));
    });
  }

  it("实例化以后从客户端那份算出的 id，在服务端那份上指的就是同一颗节点", () => {
    const client = applyPatch(structuredClone(f.doc), {
      pageId: f.home.id,
      ops: [{ op: "instantiate", componentId: "cmp_1", instanceId: "ins_1" }],
    }).document;
    const server = applyPatch(structuredClone(f.doc), {
      pageId: f.home.id,
      ops: [{ op: "instantiate", componentId: "cmp_1", instanceId: "ins_1" }],
    }).document;
    const body = (doc: DesignDocument): DesignNode =>
      doc.pages[0]!.nodes[doc.pages[0]!.nodes["ins_1"]!.children[0]!]!;
    // 复制体不是壳子的别名：它确实在文档里，而且两边是同一颗
    expect(body(client).id).toBe(instanceBodyId);
    expect(body(server).id).toBe(body(client).id);
    expect(body(server)).not.toBe(body(client));
  });
});
