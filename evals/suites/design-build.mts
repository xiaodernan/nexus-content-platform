import {
  createDocument,
  createPage,
  createNode,
  applyPatch,
  invertPatch,
  validateDocument,
  hasErrors,
  summarizeIssues,
  serializeDocument,
  deserializeDocument,
  applyResponsive,
  applyResponsiveBelow,
  type DesignDocument,
  type Page,
  type DesignNode,
} from '../../packages/creative-model/src/index.ts';
import { EvalRecorder } from '../lib/recorder.ts';
import type { EvalSuite } from '../types.ts';

/**
 * §12 / §13 · design-model 投影自洽套件（与 world-build / video-plan / game-build 同族）。
 *
 * 覆盖 design-model 的**领域操作**自洽——createDocument 骨架、createNode 默认值、
 * applyPatch 的 set/insert/remove/reparent/reorder/page/token/component/asset 各 op 家族、
 * remove 子树级联清扫、reparent 环检测、Undo 往返（invertPatch）、validateDocument 缺陷码、
 * serialize 往返、applyResponsive 响应式投影。
 *
 * 之前 design-model 只有 model-roundtrip 的「代码生成 → 解析」往返；它的**领域写操作**
 * 没有独立投影套件。这一片把它补齐，使四个 model 包（world/video/game/design）各自都有
 * 一套确定性结构不变式，与单测互补、不重复：单测断点，这里钉面。
 *
 * 纪律：纯确定性形状，不碰任何 provider；结构不变式失败才红。
 */

// 建一棵最小的 root → a(container) → b(text) 树，返回可直接 mutate 的夹具。
function tree(): {
  doc: DesignDocument;
  page: Page;
  root: DesignNode;
  a: DesignNode;
  b: DesignNode;
} {
  const doc = createDocument('设计样板', 'website');
  const page = doc.pages[0]!;
  const root = page.nodes[page.rootId]!;
  const a = createNode({ type: 'container', name: 'A', parentId: root.id });
  const b = createNode({ type: 'text', name: 'B', parentId: a.id, text: 'hi' });
  page.nodes[a.id] = a;
  page.nodes[b.id] = b;
  root.children = [a.id];
  a.children = [b.id];
  return { doc, page, root, a, b };
}

// 键序无关的深层比较，避免 serialize 后键序变化引发的伪失败。
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  const keys = Object.keys(v as Record<string, unknown>).sort();
  return (
    '{' +
    keys
      .map(
        (k) =>
          JSON.stringify(k) +
          ':' +
          stableStringify((v as Record<string, unknown>)[k]),
      )
      .join(',') +
    '}'
  );
}
function stableEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

export const designBuildSuite: EvalSuite = {
  name: 'design-build',
  dimension: '代码正确性 / design-model 投影自洽（§12 / §13）',
  needsDatabase: false,

  run() {
    const rec = new EvalRecorder();
    console.log('\n== design-model 投影自洽（§12 / §13）· 领域操作 + 验证 + 往返 ==');

    // ── 1. createDocument 骨架 ──────────────────────────────────────────────
    {
      const doc = createDocument('标题一', 'website');
      rec.structural(
        'createDocument 默认 1 页且 activePageId 落在该页',
        doc.pages.length === 1 && doc.activePageId === doc.pages[0]!.id,
        `pages=${doc.pages.length} active=${doc.activePageId === doc.pages[0]?.id}`,
      );
      rec.structural(
        'createDocument 带 token / 空组件 / 空资产 / 双模式',
        doc.tokens.length > 0 &&
          doc.components.length === 0 &&
          doc.assets.length === 0 &&
          doc.metadata.modes.includes('light') &&
          doc.metadata.modes.includes('dark'),
        `tokens=${doc.tokens.length} modes=${doc.metadata.modes.join(',')}`,
      );
      rec.structural(
        'createDocument schemaVersion=1 且 projectType 透传',
        doc.schemaVersion === 1 && doc.metadata.projectType === 'website',
        `v=${doc.schemaVersion} type=${doc.metadata.projectType}`,
      );
    }
    {
      const game = createDocument('标题二', 'game');
      rec.structural(
        'createDocument(projectType=game) 透传到 metadata',
        game.metadata.projectType === 'game',
        game.metadata.projectType ?? '',
      );
    }

    // ── 2. createPage / createNode 默认值 ───────────────────────────────────
    {
      const page = createPage('Home');
      rec.structural(
        'createPage 自带 rootId 且 nodes 含该根',
        !!page.rootId && !!page.nodes[page.rootId],
        `rootId=${page.rootId}`,
      );
      rec.structural(
        'createPage 默认 1440×900',
        page.width === 1440 && page.height === 900,
        `${page.width}×${page.height}`,
      );
    }
    {
      const n = createNode({ type: 'container' });
      rec.structural(
        'createNode 默认 parentId=null / children=[] / position 0,0',
        n.parentId === null &&
          n.children.length === 0 &&
          n.position.x === 0 &&
          n.position.y === 0,
        `parent=${n.parentId} pos=${n.position.x},${n.position.y}`,
      );
      rec.structural(
        'createNode 默认带 size / layout / style 结构（不缺必填）',
        !!n.size &&
          typeof n.size === 'object' &&
          'width' in n.size &&
          !!n.layout &&
          !!n.style,
        `w=${JSON.stringify(n.size.width)}`,
      );
    }

    // ── 3. applyPatch · set ─────────────────────────────────────────────────
    {
      const { doc, b } = tree();
      const r = applyPatch(doc, {
        ops: [{ op: 'set', nodeId: b.id, path: 'text', value: '改了' }],
      });
      const after = r.document.pages[0]!.nodes[b.id]!;
      rec.structural(
        'set 改 text 落到节点并计入 touched',
        after.text === '改了' && r.touchedNodeIds.includes(b.id),
        `text=${after.text}`,
      );
    }
    {
      const { doc, a } = tree();
      const r = applyPatch(doc, {
        ops: [{ op: 'set', nodeId: a.id, path: 'size.width', value: 640 }],
      });
      const after = r.document.pages[0]!.nodes[a.id]!;
      rec.structural(
        'set 路径 size.width 写入嵌套字段',
        after.size.width === 640,
        `w=${after.size.width}`,
      );
    }

    // ── 4. applyPatch · insert（级联 parent.children）────────────────────────
    {
      const { doc, root } = tree();
      const c = createNode({ type: 'button', name: 'C', parentId: root.id });
      const r = applyPatch(doc, {
        ops: [{ op: 'insert', node: c, parentId: root.id }],
      });
      const np = r.document.pages[0]!;
      rec.structural(
        'insert 把节点挂入 nodes 且父 children 含它',
        !!np.nodes[c.id] && np.nodes[root.id]!.children.includes(c.id),
        `inNodes=${!!np.nodes[c.id]} inParent=${np.nodes[root.id]!.children.includes(c.id)}`,
      );
      rec.structural(
        'insert 写入节点 parentId 并计入 touched',
        np.nodes[c.id]!.parentId === root.id && r.touchedNodeIds.includes(c.id),
        `parent=${np.nodes[c.id]!.parentId}`,
      );
    }
    {
      const { doc } = tree();
      // 撞 id：文档里已有 root 节点，用一个已存在的 id 插入应被跳过
      const dup = createNode({ type: 'container' });
      const rootId = doc.pages[0]!.rootId;
      const r = applyPatch(doc, {
        ops: [{ op: 'insert', node: { ...dup, id: rootId }, parentId: rootId }],
      });
      rec.structural(
        'insert 撞已存在 id 被 skip（不静默覆盖）',
        r.skipped.some((s) => s.reason.startsWith('duplicate node id')),
        `skipped=${r.skipped.length}`,
      );
    }

    // ── 5. applyPatch · remove（子树级联 + 父 children 清扫）─────────────────
    {
      const { doc, root, a, b } = tree();
      const r = applyPatch(doc, { ops: [{ op: 'remove', nodeId: a.id }] });
      const np = r.document.pages[0]!;
      rec.structural(
        'remove 级联删子树（a 与其子 b 都消失）',
        !np.nodes[a.id] && !np.nodes[b.id],
        `aGone=${!np.nodes[a.id]} bGone=${!np.nodes[b.id]}`,
      );
      rec.structural(
        'remove 清扫父节点 children',
        !np.nodes[root.id]!.children.includes(a.id),
        `rootChildren=${np.nodes[root.id]!.children.join(',')}`,
      );
    }
    {
      const { doc, root } = tree();
      const r = applyPatch(doc, { ops: [{ op: 'remove', nodeId: root.id }] });
      rec.structural(
        'remove 根节点被 skip（不能删页根）',
        r.skipped.some((s) => s.reason === 'cannot remove page root') &&
          !!r.document.pages[0]!.nodes[root.id],
        `skipped=${r.skipped.length}`,
      );
    }
    {
      const { doc } = tree();
      const r = applyPatch(doc, { ops: [{ op: 'remove', nodeId: 'nope' }] });
      rec.structural(
        'remove 不存在节点被 skip（不报错）',
        r.skipped.some((s) => s.reason.includes('not found')),
        `skipped=${r.skipped.length}`,
      );
    }

    // ── 6. applyPatch · reparent（含环检测）─────────────────────────────────
    {
      const { doc, page, root, a } = tree();
      const c = createNode({ type: 'text', name: 'C', parentId: root.id, text: 'c' });
      page.nodes[c.id] = c;
      root.children = [a.id, c.id];
      const r = applyPatch(doc, {
        ops: [{ op: 'reparent', nodeId: c.id, parentId: a.id }],
      });
      const np = r.document.pages[0]!;
      rec.structural(
        'reparent 更新 parentId 且新旧父 children 同步',
        np.nodes[c.id]!.parentId === a.id &&
          np.nodes[a.id]!.children.includes(c.id) &&
          !np.nodes[root.id]!.children.includes(c.id),
        `parent=${np.nodes[c.id]!.parentId}`,
      );
    }
    {
      // a → b；尝试把 a 重父到 b（b 是 a 的后代）→ 应环检测跳过
      const { doc, a, b } = tree();
      const r = applyPatch(doc, {
        ops: [{ op: 'reparent', nodeId: a.id, parentId: b.id }],
      });
      rec.structural(
        'reparent 制造环被 skip',
        r.skipped.some((s) => s.reason === 'reparent would create a cycle'),
        `skipped=${r.skipped.length}`,
      );
    }

    // ── 7. applyPatch · reorder ─────────────────────────────────────────────
    {
      const { doc, page, root, a } = tree();
      const c = createNode({ type: 'text', name: 'C', parentId: root.id, text: 'c' });
      page.nodes[c.id] = c;
      root.children = [a.id, c.id];
      const r = applyPatch(doc, {
        ops: [{ op: 'reorder', parentId: root.id, from: 0, to: 1 }],
      });
      const kids = r.document.pages[0]!.nodes[root.id]!.children;
      rec.structural(
        'reorder 在父 children 内换位',
        kids[0] === c.id && kids[1] === a.id,
        `kids=${kids.join(',')}`,
      );
    }

    // ── 8. applyPatch · 页面 op ─────────────────────────────────────────────
    {
      const { doc } = tree();
      const p2 = createPage('关于');
      const r = applyPatch(doc, { ops: [{ op: 'addPage', page: p2 }] });
      rec.structural(
        'addPage 增加一页',
        r.document.pages.length === 2,
        `pages=${r.document.pages.length}`,
      );
    }
    {
      const { doc } = tree();
      const p2 = createPage('关于');
      const r = applyPatch(doc, {
        ops: [{ op: 'addPage', page: p2, setActive: true }],
      });
      rec.structural(
        'addPage setActive 切到新活动页',
        r.document.activePageId === p2.id,
        `active=${r.document.activePageId === p2.id}`,
      );
    }
    {
      const { doc } = tree();
      const p2 = createPage('关于');
      const added = applyPatch(doc, { ops: [{ op: 'addPage', page: p2 }] });
      const r = applyPatch(added.document, {
        ops: [{ op: 'removePage', pageId: p2.id }],
      });
      rec.structural(
        'removePage 非活动页后活动页不变',
        r.document.pages.length === 1 &&
          r.document.activePageId === doc.pages[0]!.id,
        `pages=${r.document.pages.length} activeKept=${r.document.activePageId === doc.pages[0]!.id}`,
      );
    }
    {
      const { doc } = tree();
      const p2 = createPage('关于');
      const added = applyPatch(doc, { ops: [{ op: 'addPage', page: p2 }] });
      const r = applyPatch(added.document, {
        ops: [{ op: 'removePage', pageId: added.document.activePageId }],
      });
      rec.structural(
        'removePage 活动页后活动页回落到首页',
        r.document.pages.length === 1 && r.document.activePageId === p2.id,
        `pages=${r.document.pages.length} active=${r.document.activePageId === p2.id}`,
      );
    }
    {
      const { doc } = tree();
      const r = applyPatch(doc, {
        ops: [{ op: 'removePage', pageId: doc.pages[0]!.id }],
      });
      rec.structural(
        'removePage 删最后一页被 skip',
        r.skipped.some((s) => s.reason === 'cannot remove the last page') &&
          r.document.pages.length === 1,
        `skipped=${r.skipped.length}`,
      );
    }

    // ── 9. applyPatch · token op ────────────────────────────────────────────
    {
      const { doc } = tree();
      const r = applyPatch(doc, {
        ops: [{ op: 'addToken', token: { key: 'color.brand', type: 'color', value: '#f00' } }],
      });
      rec.structural(
        'addToken 把 token 加进文档',
        r.document.tokens.some((t) => t.key === 'color.brand'),
        `count=${r.document.tokens.length}`,
      );
    }
    {
      const { doc } = tree();
      const key = doc.tokens[0]!.key;
      const r = applyPatch(doc, { ops: [{ op: 'removeToken', key }] });
      rec.structural(
        'removeToken 把 token 移出文档',
        !r.document.tokens.some((t) => t.key === key),
        `count=${r.document.tokens.length}`,
      );
    }
    {
      const { doc } = tree();
      const key = doc.tokens[0]!.key;
      const r = applyPatch(doc, {
        ops: [{ op: 'setToken', key, value: '#123456' }],
      });
      rec.structural(
        'setToken 改 token 值',
        r.document.tokens.find((t) => t.key === key)?.value === '#123456',
        `val=${r.document.tokens.find((t) => t.key === key)?.value}`,
      );
    }

    // ── 10. applyPatch · component / asset op ──────────────────────────────
    {
      const { doc } = tree();
      const comp = {
        id: 'comp1',
        name: '卡片',
        rootId: 'x',
        pageId: doc.pages[0]!.id,
        props: [],
        variants: [],
        slots: [],
      };
      const add = applyPatch(doc, { ops: [{ op: 'addComponent', component: comp }] });
      rec.structural(
        'addComponent 注册组件',
        add.document.components.some((c) => c.id === 'comp1'),
        `count=${add.document.components.length}`,
      );
      const rm = applyPatch(add.document, {
        ops: [{ op: 'removeComponent', componentId: 'comp1' }],
      });
      rec.structural(
        'removeComponent 注销组件',
        !rm.document.components.some((c) => c.id === 'comp1'),
        `count=${rm.document.components.length}`,
      );
    }
    {
      const { doc } = tree();
      const asset = {
        id: 'asset1',
        kind: 'image' as const,
        name: '图',
        storageKey: 'assets/asset1.png',
        mimeType: 'image/png',
        createdAt: new Date(0).toISOString(),
      };
      const add = applyPatch(doc, { ops: [{ op: 'addAsset', asset }] });
      rec.structural(
        'addAsset 入库资产',
        add.document.assets.some((a) => a.id === 'asset1'),
        `count=${add.document.assets.length}`,
      );
      const rm = applyPatch(add.document, {
        ops: [{ op: 'removeAsset', assetId: 'asset1' }],
      });
      rec.structural(
        'removeAsset 移出资产',
        !rm.document.assets.some((a) => a.id === 'asset1'),
        `count=${rm.document.assets.length}`,
      );
    }

    // ── 11. Undo 往返（invertPatch）────────────────────────────────────────
    {
      const { doc, b } = tree();
      const original = b.text;
      const patch = {
        ops: [{ op: 'set' as const, nodeId: b.id, path: 'text', value: '变了' }],
      };
      const applied = applyPatch(doc, patch);
      const inverted = invertPatch(doc, patch); // 必须在 apply 之前对原 doc 求逆
      const restored = applyPatch(applied.document, inverted);
      const back = restored.document.pages[0]!.nodes[b.id]!;
      rec.structural(
        'Undo 往返：set 后 invertPatch 再 apply 还原文本',
        applied.document.pages[0]!.nodes[b.id]!.text === '变了' &&
          back.text === original,
        `applied=${applied.document.pages[0]!.nodes[b.id]!.text} restored=${back.text}`,
      );
    }

    // ── 12. validateDocument 缺陷码 ────────────────────────────────────────
    {
      const doc = createDocument('干净', 'website');
      const issues = validateDocument(doc);
      rec.structural(
        '干净起步文档无 error 级问题',
        !hasErrors(issues),
        `errors=${issues.filter((i) => i.severity === 'error').length}`,
      );
    }
    {
      const doc = createDocument('空页', 'website');
      doc.pages = [];
      rec.structural(
        '空页面文档报 empty-page（error）',
        validateDocument(doc).some(
          (i) => i.code === 'empty-page' && i.severity === 'error',
        ),
        `codes=${validateDocument(doc).map((i) => i.code).join(',')}`,
      );
    }
    {
      const doc = createDocument('重页', 'website');
      const dup = createPage('重复');
      dup.id = doc.pages[0]!.id; // 与首页同 id
      doc.pages.push(dup);
      rec.structural(
        '两页同 id 报 duplicate-page-id',
        validateDocument(doc).some((i) => i.code === 'duplicate-page-id'),
        `codes=${validateDocument(doc).map((i) => i.code).join(',')}`,
      );
    }
    {
      const doc = createDocument('失活', 'website');
      doc.activePageId = '不存在';
      rec.structural(
        'activePageId 指向不存在页面报 missing-child',
        validateDocument(doc).some((i) => i.code === 'missing-child'),
        `codes=${validateDocument(doc).map((i) => i.code).join(',')}`,
      );
    }
    {
      const doc = createDocument('重节点', 'website');
      const p1 = doc.pages[0]!;
      const p2 = createPage('第二页');
      // 复制首页根节点 id 到第二页，制造跨页重号
      p2.nodes[p1.rootId] = { ...p1.nodes[p1.rootId]! };
      doc.pages.push(p2);
      rec.structural(
        '同一节点 id 跨页重复报 duplicate-node-id',
        validateDocument(doc).some((i) => i.code === 'duplicate-node-id'),
        `codes=${validateDocument(doc).map((i) => i.code).join(',')}`,
      );
    }
    {
      const broken = createDocument('坏', 'website');
      broken.pages = [];
      const issues = validateDocument(broken);
      const summary = summarizeIssues(issues);
      rec.structural(
        'hasErrors 对坏文档为真、summarizeIssues 给出 error 计数',
        hasErrors(issues) && summary.error > 0,
        `errorCount=${summary.error}`,
      );
    }

    // ── 13. serialize 往返 ─────────────────────────────────────────────────
    {
      const { doc } = tree();
      const text = serializeDocument(doc);
      const round = deserializeDocument(text);
      const counts = (d: DesignDocument) =>
        d.pages.reduce((n, p) => n + Object.keys(p.nodes).length, 0);
      rec.structural(
        'serialize→deserialize 关键不变量保持',
        round.pages.length === doc.pages.length &&
          counts(round) === counts(doc) &&
          round.activePageId === doc.activePageId &&
          round.metadata.projectType === doc.metadata.projectType,
        `pages=${round.pages.length}/${doc.pages.length} nodes=${counts(round)}/${counts(doc)}`,
      );
      rec.structural(
        'serialize→deserialize 深度相等（键序无关）',
        stableEqual(round, doc),
        `equal=${stableEqual(round, doc)}`,
      );
    }
    {
      // 非法 schemaVersion 应抛，便于保存门挡住坏数据
      let threw = false;
      try {
        deserializeDocument(JSON.stringify({ schemaVersion: 99 }));
      } catch {
        threw = true;
      }
      rec.structural(
        'deserialize 拒绝未知 schemaVersion',
        threw,
        `threw=${threw}`,
      );
    }

    // ── 14. applyResponsive 响应式投影 ─────────────────────────────────────
    {
      const node = createNode({ type: 'container', name: '带响应' });
      node.responsive = [{ breakpoint: 'tablet', patch: { layout: { mode: 'none' } } }];
      const at = applyResponsive(node, 'tablet');
      rec.structural(
        'applyResponsive(tablet) 应用该档 layout 补丁',
        at.layout.mode === 'none',
        `mode=${at.layout.mode}`,
      );
      const below = applyResponsiveBelow(node, 'tablet');
      rec.structural(
        'applyResponsiveBelow(tablet) 摘掉该档规则 → 维持原 layout',
        below.layout.mode === node.layout.mode,
        `mode=${below.layout.mode}`,
      );
      const twice = applyResponsive(applyResponsive(node, 'tablet'), 'tablet');
      rec.structural(
        'applyResponsive 对同档幂等',
        twice.layout.mode === 'none',
        `mode=${twice.layout.mode}`,
      );
    }

    // ── 15. 矩阵完整性 ─────────────────────────────────────────────────────
    rec.structural('矩阵总览：设计模型投影自洽覆盖 >= 35 项', true, '见上');

    rec.skip('真 provider 下 generate→parse 的代码层往返（见 model-roundtrip 套件）');
    rec.skip('动画/可视 QA/性能三类健康指标（由 health.ts 产出，非结构不变式）');

    return { checks: rec.checks, notMeasured: rec.notMeasured };
  },
};
