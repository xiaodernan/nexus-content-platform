import { performance } from 'node:perf_hooks';
import {
  DesignStore,
  analyzeHealth,
  createDocument,
  createNode,
  createPage,
  diffDocuments,
  generateProject,
  lintDesign,
  manualCommand,
  resolveLayout,
  validateDocument,
  TokenStore,
  type DesignDocument,
  type DesignNode,
} from '../packages/design-model/src';

/**
 * §146 / §147 规模基准：100 / 1000 / 10000 节点下，设计模型的每条热点路径各花多少时间。
 *
 * 这里**不断言阈值**：本机 16GB、还跑着一堆容器，把耗时写死成断言只会制造 flaky 测试，
 * 而 flaky 的下一步通常是把断言删掉——那还不如一开始就把数字记进文档，人眼比阈值可靠。
 * 跑法：`npx tsx scripts/perf-baseline.mts`，输出直接贴进 docs/PERFORMANCE.md。
 */

const SIZES = [100, 1000, 10000];
const REPEAT = 3;

/** 造一棵形状稳定的树：容器套容器到第 6 层，叶子是文本/按钮——节点数精确等于 n */
function buildDocument(n: number): DesignDocument {
  const document = createDocument(`基准 ${n}`);
  const page = createPage('Big');
  document.pages = [page];
  document.activePageId = page.id;
  const root = page.nodes[page.rootId]!;
  const queue: Array<{ parent: DesignNode; depth: number }> = [{ parent: root, depth: 0 }];
  let made = 1;
  while (queue.length && made < n) {
    const { parent, depth } = queue.shift()!;
    const children = depth === 0 ? 12 : 6;
    for (let i = 0; i < children && made < n; i += 1) {
      const branch = depth < 6 && i < 4;
      const type = branch ? 'container' : i % 4 === 0 ? 'button' : 'text';
      const node = createNode({
        type,
        name: `${type}-${made}`,
        parentId: parent.id,
        text: type === 'text' || type === 'button' ? '一句话' : undefined,
        size: type === 'button' ? { width: 120, height: 40 } : undefined,
      });
      if (type === 'text') node.style.fills = [{ kind: 'solid', color: '{color.text}' }];
      if (type === 'button') {
        node.style.fills = [{ kind: 'solid', color: '{color.primary}' }];
        node.typography = { ...node.typography!, color: '{color.on-primary}' };
      }
      page.nodes[node.id] = node;
      parent.children.push(node.id);
      made += 1;
      if (branch) queue.push({ parent: node, depth: depth + 1 });
    }
  }
  return document;
}

function median(runs: number[]): number {
  const sorted = [...runs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function time(runs: number[]): string {
  return `${median(runs).toFixed(1)} ms`;
}

function measure(label: string, fn: () => void): number[] {
  const runs: number[] = [];
  fn(); // 预热：JIT 没热起来的第一个数字没有参考价值
  for (let i = 0; i < REPEAT; i += 1) {
    const started = performance.now();
    fn();
    runs.push(performance.now() - started);
  }
  void label;
  return runs;
}

const rows: string[] = [];

for (const n of SIZES) {
  const document = buildDocument(n);
  const page = document.pages[0]!;
  const tokens = new TokenStore(document.tokens);
  const cells: Record<string, number[]> = {};

  let sizes: Record<string, { width: number; height: number }> = {};
  cells['resolveLayout'] = measure('resolveLayout', () => {
    const layout = resolveLayout(page, { tokens, mode: null });
    sizes = {};
    for (const [id, r] of Object.entries(layout.nodes)) sizes[id] = { width: r.width, height: r.height };
  });
  cells['validateDocument'] = measure('validate', () => validateDocument(document));
  cells['lintDesign'] = measure('lint', () => lintDesign(document, sizes));
  cells['analyzeHealth'] = measure('health', () => analyzeHealth(document));
  cells['generateProject'] = measure('codegen', () => generateProject(document, {}));

  const store = new DesignStore(document);
  const target = Object.keys(page.nodes).find((id) => page.nodes[id]!.type === 'text')!;
  cells['execute + undo'] = measure('edit', () => {
    for (let i = 0; i < 10; i += 1) {
      store.execute(
        manualCommand(`改字号 ${i}`, {
          ops: [{ op: 'set', nodeId: target, path: 'typography.fontSize', value: 15 + (i % 3) }],
        }),
      );
      store.undo();
    }
  });

  const edited = structuredClone(document);
  let touched = 0;
  for (const node of Object.values(edited.pages[0]!.nodes)) {
    if (node.type !== 'text') continue;
    node.text = `改过 ${touched}`;
    touched += 1;
    if (touched >= Math.max(1, Math.round(n * 0.05))) break;
  }
  cells['diffDocuments'] = measure('diff', () => diffDocuments(document, edited, Number.MAX_SAFE_INTEGER));

  const total = Object.values(cells).reduce((a, b) => a + median(b), 0);
  rows.push(
    `| ${n} | ${Object.values(cells).map((r) => time(r)).join(' | ')} | ${total.toFixed(0)} ms |`,
  );
  console.log(`\n${n} 个节点（实建 ${Object.keys(page.nodes).length}，改动 ${touched} 处）`);
  for (const [label, r] of Object.entries(cells)) console.log(`  ${label.padEnd(18)} ${time(r)}`);
}

const header = `| 节点数 | ${['resolveLayout', 'validateDocument', 'lintDesign', 'analyzeHealth', 'generateProject', 'execute + undo', 'diffDocuments'].join(' | ')} | 合计 |`;
console.log(`\n${header}\n|---|${'---|'.repeat(8)}`);
console.log(rows.join('\n'));
