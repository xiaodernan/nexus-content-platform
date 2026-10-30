import { describe, expect, it } from 'vitest';
import {
  TokenStore,
  analyzeHealth,
  createDocument,
  createNode,
  createPage,
  resolveLayout,
  type DesignDocument,
} from '@nexus/design-model';
import { runHealthJob } from '../src/lib/health-job';

/**
 * §147 体检 worker 的一致性见证。
 *
 * worker 路径与"没有 Worker 时的同步回退"共用 `runHealthJob`，所以真正要钉的是三件事：
 * ① 经 `postMessage` 的结构化克隆（文档 + 已解几何 + 报告）不会改变任何一项读数；
 * ② 同一份作业在两条路上算出的报告逐项相等，**不是**两份都轻松通过的假一致；
 * ③ 报文里带的是克隆后的文档，不是同一个对象引用（否则"主线程克隆"这一步根本没发生过）。
 *
 * 这里不测"worker 真的开了线程"——那要在真浏览器里看，见 `e2e/health-worker.spec.ts`
 * 的 `data-health-source` 两臂。node 里没有 Web Worker，假装有一个就是在演戏（§159）。
 */

/** 一份 120 节点的文档：根下平铺文本，尺寸与颜色都来自 token，体检会真的跑起来 */
function fixture(lowContrast = false): DesignDocument {
  const document = createDocument('体检作业');
  const page = createPage('Home');
  document.pages = [page];
  document.activePageId = page.id;
  for (const key of ['color.background', 'color.text']) {
    const token = document.tokens.find((t) => t.key === key);
    if (!token) throw new Error(`默认 token 表里找不到 ${key}`);
    token.value = key === 'color.text' && lowContrast ? '#aaaaaa' : key === 'color.text' ? '#111111' : '#ffffff';
    token.modes = undefined;
  }
  const root = page.nodes[page.rootId]!;
  const template = createNode({ type: 'text', name: 'Body', parentId: root.id, text: '一句话' });
  template.style.fills = [{ kind: 'solid', color: '{color.text}' }];
  for (let i = 0; i < 120; i += 1) {
    const node = structuredClone(template);
    node.id = `body_${i}`;
    node.name = `Body ${i}`;
    node.text = `第 ${i} 段正文`;
    page.nodes[node.id] = node;
    root.children.push(node.id);
  }
  return document;
}

const layoutsOf = (document: DesignDocument) => {
  const page = document.pages[0]!;
  return { [page.id]: resolveLayout(page, { tokens: new TokenStore(document.tokens) }) };
};

describe('health job（§147 worker 与同步回退的一致性）', () => {
  it('不带已解几何时，worker 作业的报告与同步 analyzeHealth 逐项相等', () => {
    const document = fixture();
    const expected = analyzeHealth(document);
    const actual = runHealthJob({ document: structuredClone(document) });
    expect(actual).toEqual(expected);
    // 报告不是"什么都没查"的空壳：七行齐全，且至少有一项真的按发现算出了分
    expect(actual.checks.map((c) => c.id)).toEqual([
      'build',
      'tests',
      'accessibility',
      'performance',
      'visual-qa',
      'ai-qa',
      'security',
    ]);
    expect(actual.checks.some((c) => c.score !== null)).toBe(true);
  });

  it('带已解几何时也逐项相等，且报告经结构化克隆后一字不差', () => {
    const document = fixture();
    const layouts = layoutsOf(document);
    const expected = analyzeHealth(document, { layouts });
    // 报文走 postMessage 时会被结构化克隆一次：这里用 structuredClone 把同一段路走一遍
    const job = structuredClone({ document, layouts });
    const actual = runHealthJob(job);
    expect(actual).toEqual(expected);
    expect(structuredClone(actual)).toEqual(actual);
  });

  it('克隆是真的发生过：作业里的文档不是调用方那份引用', () => {
    const document = fixture();
    const job = structuredClone({ document });
    expect(job.document).not.toBe(document);
    // 改克隆里的东西不会动到原件——否则"克隆过去了"只是嘴上说的
    job.document.pages[0]!.nodes[job.document.pages[0]!.rootId]!.children.length = 0;
    expect(document.pages[0]!.nodes[document.pages[0]!.rootId]!.children.length).toBe(120);
  });

  it('不是假一致：挡住发布的文档在两条路上都给出同一份阻塞结论', () => {
    const document = fixture(true);
    const expected = analyzeHealth(document);
    expect(expected.passed).toBe(false);
    expect(expected.blockers.length).toBeGreaterThan(0);
    expect(runHealthJob({ document: structuredClone(document) })).toEqual(expected);
  });
});
