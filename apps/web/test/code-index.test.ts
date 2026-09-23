import { describe, expect, it } from 'vitest';
import {
  createDocument,
  createNode,
  createPage,
  type DesignDocument,
  type DesignNode,
} from '@nexus/design-model';
import {
  buildCodeDigest,
  buildCodeIndex,
  codeIndexChars,
  fitCodeIndexToBudget,
  queryTokens,
  rankCodeFiles,
} from '../src/server/domain/code-index';

/**
 * §69 Code Index 的单元测试：不打库、不发网络——目录本来就是文档的纯投影，
 * 接上真 Postgres 只会让"这个符号为什么没被认出来"变成"数据库里那份文档是什么"。
 */

function appendNode(page: ReturnType<typeof createPage>, parent: DesignNode, node: DesignNode): DesignNode {
  page.nodes[node.id] = node;
  parent.children.push(node.id);
  return node;
}

function fixture(): DesignDocument {
  const document = createDocument('目录基准');
  const home = createPage('首页');
  const settlement = createPage('结算页');
  document.pages = [home, settlement];
  document.activePageId = home.id;

  for (const page of [home, settlement]) {
    const root = page.nodes[page.rootId]!;
    const button = createNode({ type: 'button', name: '提交订单', parentId: root.id, text: '提交' });
    appendNode(page, root, button);
    const copy = createNode({ type: 'text', name: '说明', parentId: root.id, text: '一句话说明' });
    appendNode(page, root, copy);
  }

  // code-only 区域：映射不回模型的片段（§19），它是项目里的代码但不属于任何生成文件
  const settlementRoot = settlement.nodes[settlement.rootId]!;
  const region = createNode({ type: 'code', name: '优惠券倒计时', parentId: settlementRoot.id });
  region.code = {
    language: 'tsx',
    readOnly: false,
    content: `export function CouponCountdown({ minutes }: { minutes: number }) {
  return <span>{minutes}</span>;
}
const MASK = 'coupon';
function parseMask(raw: string) {
  return raw.trim();
}
export interface CouponProps {
  minutes: number;
}
export type MaskKind = 'partial' | 'full';
`,
  };
  appendNode(settlement, settlementRoot, region);

  const brokenRoot = home.nodes[home.rootId]!;
  const broken = createNode({ type: 'code', name: '坏片段', parentId: brokenRoot.id });
  broken.code = { language: 'ts', readOnly: true, content: 'export function oops( { return 1' };
  appendNode(home, brokenRoot, broken);

  return document;
}

describe('buildCodeIndex（§69）', () => {
  it('生成的页面文件带真实符号、归属与节点锚点', () => {
    const index = buildCodeIndex(fixture());
    const pageFiles = index.files.filter((file) => file.origin.kind === 'page');
    expect(pageFiles).toHaveLength(2);

    const home = pageFiles.find((file) => file.origin.kind === 'page' && file.origin.pageName === '首页');
    expect(home).toBeDefined();
    // 中文页面名过不了 pascalCase，落到 PageN.tsx：文件名没有信息，所以 origin 必须带页面名
    expect(home!.path).toBe('components/nexus/Page1.tsx');
    expect(home!.symbols.map((symbol) => symbol.name)).toContain('Page1');
    expect(home!.symbols.find((symbol) => symbol.name === 'Page1')?.kind).toBe('component');
    expect(home!.symbols.find((symbol) => symbol.name === 'Page1')?.exported).toBe(true);
    expect(home!.designAnchors).toBeGreaterThanOrEqual(3);
    expect(home!.syntaxErrors).toBe(0);
  });

  it('汇总文件里的相对 import 解析成目录内路径，页面文件则没有内部依赖', () => {
    const index = buildCodeIndex(fixture());
    const barrel = index.files.find((file) => file.origin.kind === 'barrel');
    expect(barrel?.deps).toEqual(['components/nexus/Page1.tsx', 'components/nexus/Page2.tsx']);
    expect(barrel?.unresolvedDeps).toEqual([]);
    const pageFile = index.files.find((file) => file.origin.kind === 'page');
    expect(pageFile?.deps).toEqual([]);
  });

  it('tokens.css 的符号是自定义属性，不是 JS 声明', () => {
    const index = buildCodeIndex(fixture());
    const css = index.files.find((file) => file.origin.kind === 'tokens');
    expect(css?.language).toBe('css');
    expect(css?.syntaxErrors).toBeNull();
    expect(css?.symbols.every((symbol) => symbol.kind === 'css-variable')).toBe(true);
    expect(css?.symbols.some((symbol) => symbol.name.startsWith('--nx-'))).toBe(true);
  });

  it('code-only 区域按声明的语言解析，符号种类来自 AST', () => {
    const index = buildCodeIndex(fixture());
    const region = index.files.find((file) => file.origin.kind === 'node-region' && file.origin.nodeName === '优惠券倒计时');
    expect(region).toBeDefined();
    expect(region?.path).toMatch(/^code-only\/.+\.tsx$/);
    const kinds = new Map(region!.symbols.map((symbol) => [symbol.name, symbol.kind]));
    // 返回 JSX 且大驼峰 → component；小写开头返回 JSX → 仍记 function；无 JSX → variable/interface/type
    expect(kinds.get('CouponCountdown')).toBe('component');
    expect(kinds.get('parseMask')).toBe('function');
    expect(kinds.get('MASK')).toBe('variable');
    expect(kinds.get('CouponProps')).toBe('interface');
    expect(kinds.get('MaskKind')).toBe('type');
    const component = region!.symbols.find((symbol) => symbol.name === 'CouponCountdown');
    expect(component?.params).toEqual(['{minutes}']);
    expect(component?.exported).toBe(true);
    expect(region!.symbols.find((symbol) => symbol.name === 'MASK')?.exported).toBe(false);
  });

  it('解析失败的文件如实报出来，不报成"没有符号"', () => {
    const index = buildCodeIndex(fixture());
    const broken = index.files.find((file) => file.origin.kind === 'node-region' && file.origin.nodeName === '坏片段');
    expect(broken).toBeDefined();
    expect(broken!.syntaxErrors ?? 0).toBeGreaterThan(0);
    expect(index.totals.unreadableFiles).toBe(1);
    // 组件文件自己仍然是干净的：一个坏区域不能把整份目录说成全错
    expect(index.files.filter((file) => file.origin.kind === 'page').every((file) => (file.syntaxErrors ?? 0) === 0)).toBe(true);
  });

  it('totals 与逐条列表对得上，同一份文档两次构建结果完全一致', () => {
    const document = fixture();
    const index = buildCodeIndex(document);
    expect(index.totals.files).toBe(index.files.length);
    expect(index.totals.symbols).toBe(index.files.reduce((sum, file) => sum + file.symbols.length, 0));
    expect(index.totals.exportedSymbols).toBe(index.files.reduce((sum, file) => sum + file.symbols.filter((s) => s.exported).length, 0));
    expect(index.totals.internalDeps).toBe(2);
    expect(index.totals.nodeRegionFiles).toBe(2);
    expect(index.totals.nodeRegionChars).toBeGreaterThan(0);
    expect(JSON.stringify(buildCodeIndex(document))).toBe(JSON.stringify(index));
  });
});

describe('相关性排序（§69 的"找到真正相关代码"）', () => {
  it('中文页面名命中对应文件，尽管文件名里没有任何中文', () => {
    const index = buildCodeIndex(fixture());
    const ranked = rankCodeFiles(index, { query: '把结算页的提交按钮改一下' });
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0]!.path).toContain('Page2.tsx');
    expect(ranked[0]!.reasons.some((reason) => reason.includes('结算页'))).toBe(true);
  });

  it('符号名与节点名分别加权，当前页与选中节点各算一次', () => {
    const index = buildCodeIndex(fixture());
    const bySymbol = rankCodeFiles(index, { query: 'CouponCountdown', limit: 5 });
    expect(bySymbol[0]?.reasons.some((reason) => reason.includes('CouponCountdown'))).toBe(true);

    const region = index.files.find((file) => file.origin.kind === 'node-region' && file.origin.nodeName === '优惠券倒计时');
    const nodeId = (region!.origin as { nodeId: string }).nodeId;
    const pageId = (region!.origin as { pageId: string }).pageId;
    const bySelection = rankCodeFiles(index, { pageId, nodeIds: [nodeId], limit: 3 });
    expect(bySelection[0]?.path).toBe(region!.path);
    expect(bySelection[0]?.reasons).toContain('选中节点');
    expect(bySelection[0]!.score).toBeGreaterThan(bySelection[1]!.score);
  });

  it('没命中就是空，不发一份"看起来相关"的猜测', () => {
    const index = buildCodeIndex(fixture());
    expect(rankCodeFiles(index, { query: 'zzz 不存在的东西 qqq' })).toEqual([]);
  });

  it('切词：ASCII 按非字母数字切开，中文按相邻两字切开', () => {
    expect(queryTokens('把 Button 改圆')).toEqual(expect.arrayContaining(['button', '改圆']));
    expect(queryTokens('a1')).toEqual(['a1']);
    expect(queryTokens('单')).toEqual(['单']);
  });
});

describe('预算（§68 对代码目录同样成立）', () => {
  it('超预算时按固定优先级裁，totals 保持未裁的那一份', () => {
    const index = buildCodeIndex(fixture());
    const budget = Math.max(600, Math.floor(codeIndexChars(index) * 0.5));
    const fitted = fitCodeIndexToBudget(index, budget);
    expect(fitted.files.length).toBeLessThanOrEqual(index.files.length);
    expect(fitted.totals).toEqual(index.totals);
    expect(fitted.dropped).toBeDefined();
    expect(fitted.trimmed?.length).toBeGreaterThan(0);
    expect(codeIndexChars(fitted)).toBeLessThan(codeIndexChars(index));
  });

  it('预算小到装不下任何东西时，说自己装不下而不是假装裁好了', () => {
    const index = buildCodeIndex(fixture());
    const fitted = fitCodeIndexToBudget(index, 12);
    expect(codeIndexChars(fitted)).toBeGreaterThan(12);
    expect(fitted.trimmed?.some((line) => line.includes('最小目录'))).toBe(true);
  });

  it('摘要只带靠前的命中，被省掉的按数量如实说', () => {
    const index = buildCodeIndex(fixture());
    const digest = buildCodeDigest(index, { query: '页', maxChars: 90 });
    expect(digest.files.length).toBeLessThan(index.files.length);
    expect(digest.omittedFiles).toBe(index.files.length - digest.files.length);
    expect(digest.trimmed.length).toBeGreaterThan(0);
    expect(digest.totals).toEqual(index.totals);
    expect(JSON.stringify(digest).length).toBeLessThan(2_000);
  });

  it('摘要里带命中理由与出处，读的人能核对为什么是这几份', () => {
    const index = buildCodeIndex(fixture());
    const digest = buildCodeDigest(index, { query: '结算页 CouponCountdown' });
    const first = digest.files[0]!;
    expect(first.origin).toContain('结算页');
    expect(first.reasons.length).toBeGreaterThan(0);
    expect(first.symbols.some((symbol) => symbol.includes('CouponCountdown'))).toBe(true);
    expect(digest.query).toBe('结算页 CouponCountdown');
  });
});
