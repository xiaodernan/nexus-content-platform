import {
  createDocument,
  createNode,
  createPage,
  generatePageComponent,
  codeToPageOps,
  type DesignDocument,
} from '../../packages/creative-model/src/index.ts';
import { EvalRecorder } from '../lib/recorder.ts';
import type { EvalSuite } from '../types.ts';

/**
 * §19 / §16 · 投影自洽矩阵——"生成 → 解析 → 零补丁零 issue"从单一夹具扩到一组矩阵。
 *
 * `scripts/eval-baseline.mts` 的 Design accuracy 一节在 DEMO provider 补丁跑完之后
 * 会对文档走一遍往返；这里把它从"顺手量一笔"变成**载体矩阵**：平台今天最常发的那几种
 * 形状（横向带、网格、tablet 档的 gap/columns、tablet 档的 none 翻转）逐一过
 * generate → parse，逐一要求"零问题、零补丁"。
 *
 * 为什么这条进 eval 而不进单测：单测断的是**点**（这个 pivot 会转、那个 padding 会回写），
 * 这条钉的是**面**——载体加了一格布局形状，"生成物能不能被自家解析器读回来"只有
 * 这种矩阵才答得出。它与设计-model 的既有单测互补，不重复：矩阵里任何一格红了，
 * 说明发射器/解析器对这个形状对不上，而单测那张网没罩到。
 *
 * 纪律与 code-index suite 一致：数字打印、结构不变式失败才红。
 */
interface RoundTripCell {
  name: string;
  /** 每格自己的文档；codegen 组件名固定 'Home' */
  build(): DesignDocument;
}

const CELLS: RoundTripCell[] = [
  {
    name: 'A 基础横幅+页脚（普通 website starter）',
    build() {
      const document = createDocument('自洽 A', 'website');
      const page = createPage('Home');
      document.pages = [page];
      document.activePageId = page.id;
      const banner = createNode({ type: 'container', name: '首屏横幅', parentId: page.rootId, size: { width: 960, height: 320 } });
      const headline = createNode({ type: 'text', name: '主标题', parentId: banner.id, text: '把想法变成作品' });
      const footer = createNode({ type: 'container', name: '页脚', parentId: page.rootId, size: { width: 960, height: 64 } });
      const cta = createNode({ type: 'text', name: '页脚文案', parentId: footer.id, text: '© 评测样板' });
      page.nodes[banner.id] = banner;
      page.nodes[headline.id] = headline;
      page.nodes[footer.id] = footer;
      page.nodes[cta.id] = cta;
      page.nodes[page.rootId]!.children = [banner.id, footer.id];
      banner.children = [headline.id];
      footer.children = [cta.id];
      return document;
    },
  },
  {
    name: 'B 横向带 + gap/padding + 对齐（水平模式实战形状）',
    build() {
      const document = createDocument('自洽 B', 'website');
      const page = createPage('Home');
      document.pages = [page];
      document.activePageId = page.id;
      const band = createNode({
        type: 'container',
        name: '横向带',
        parentId: page.rootId,
        size: { width: 1200, height: 96 },
        layout: { mode: 'horizontal', gap: 24, padding: { top: 12, right: 12, bottom: 12, left: 12 }, justify: 'space-between', items: 'center' },
      });
      const title = createNode({ type: 'text', name: '名字', parentId: band.id, text: '评测带' });
      const action = createNode({ type: 'button', name: '动作', parentId: band.id, text: '发布' });
      page.nodes[band.id] = band;
      page.nodes[title.id] = title;
      page.nodes[action.id] = action;
      page.nodes[page.rootId]!.children = [band.id];
      band.children = [title.id, action.id];
      return document;
    },
  },
  {
    name: 'C 网格 3 列容器（§20 grid）',
    build() {
      const document = createDocument('自洽 C', 'website');
      const page = createPage('Home');
      document.pages = [page];
      document.activePageId = page.id;
      const grid = createNode({
        type: 'grid',
        name: '三格网格',
        parentId: page.rootId,
        size: { width: 960, height: 240 },
        layout: { columns: 3, gap: 16 },
      });
      const cells = ['甲', '乙', '丙'].map((label) => {
        const cell = createNode({ type: 'container', name: `单元格 ${label}`, parentId: grid.id, size: { width: 280, height: 200 } });
        const caption = createNode({ type: 'text', name: `文案 ${label}`, parentId: cell.id, text: label });
        cell.children = [caption.id];
        page.nodes[caption.id] = caption;
        page.nodes[cell.id] = cell;
        return cell;
      });
      page.nodes[grid.id] = grid;
      page.nodes[page.rootId]!.children = [grid.id];
      grid.children = cells.map((cell) => cell.id);
      return document;
    },
  },
  {
    name: 'D tablet 档 mode=none 父级翻转（§14 tier-flip，孩子失去 flow）',
    build() {
      const document = createDocument('自洽 D', 'website');
      const page = createPage('Home');
      document.pages = [page];
      document.activePageId = page.id;
      const actions = createNode({
        type: 'container',
        name: '动作区',
        parentId: page.rootId,
        size: { width: 720, height: 80 },
        layout: { mode: 'horizontal', gap: 16 },
      });
      const a = createNode({ type: 'button', name: '按钮一', parentId: actions.id, text: '确认' });
      const b = createNode({ type: 'button', name: '按钮二', parentId: actions.id, text: '取消' });
      actions.responsive = [
        { breakpoint: 'tablet', patch: { layout: { mode: 'none' } } },
      ];
      page.nodes[actions.id] = actions;
      page.nodes[a.id] = a;
      page.nodes[b.id] = b;
      page.nodes[page.rootId]!.children = [actions.id];
      actions.children = [a.id, b.id];
      return document;
    },
  },
  {
    name: 'E tablet 档 gap/columns 合并单条规则（常见响应式形状）',
    build() {
      const document = createDocument('自洽 E', 'website');
      const page = createPage('Home');
      document.pages = [page];
      document.activePageId = page.id;
      const grid = createNode({
        type: 'grid',
        name: '自适应网格',
        parentId: page.rootId,
        size: { width: 960, height: 200 },
        layout: { columns: 4, gap: 24 },
      });
      grid.responsive = [
        { breakpoint: 'tablet', patch: { layout: { gap: 8, columns: 2 } } },
      ];
      const items = ['一', '二', '三', '四'].map((label) => {
        const cell = createNode({ type: 'container', name: `单元格 ${label}`, parentId: grid.id });
        page.nodes[cell.id] = cell;
        return cell;
      });
      page.nodes[grid.id] = grid;
      page.nodes[page.rootId]!.children = [grid.id];
      grid.children = items.map((cell) => cell.id);
      return document;
    },
  },
  {
    name: 'F 纵向栈 + gap + justify-center（vertical 模式实战形状）',
    build() {
      const document = createDocument('自洽 F', 'website');
      const page = createPage('Home');
      document.pages = [page];
      document.activePageId = page.id;
      const stack = createNode({
        type: 'container',
        name: '纵向栈',
        parentId: page.rootId,
        size: { width: 480, height: 320 },
        layout: { mode: 'vertical', gap: 16, justify: 'center', items: 'stretch' },
      });
      const t1 = createNode({ type: 'text', name: '行一', parentId: stack.id, text: '一' });
      const t2 = createNode({ type: 'text', name: '行二', parentId: stack.id, text: '二' });
      page.nodes[stack.id] = stack;
      page.nodes[t1.id] = t1;
      page.nodes[t2.id] = t2;
      page.nodes[page.rootId]!.children = [stack.id];
      stack.children = [t1.id, t2.id];
      return document;
    },
  },
  {
    name: 'G grid 4 列进阶（§20 grid 多格形状）',
    build() {
      const document = createDocument('自洽 G', 'website');
      const page = createPage('Home');
      document.pages = [page];
      document.activePageId = page.id;
      const grid = createNode({
        type: 'grid',
        name: '自适应网格',
        parentId: page.rootId,
        size: { width: 960, height: 240 },
        layout: { columns: 4, gap: 12 },
      });
      const cells = ['甲', '乙', '丙', '丁', '戊'].map((label) => {
        const cell = createNode({
          type: 'container',
          name: `单元 ${label}`,
          parentId: grid.id,
          size: { width: 200, height: 100 },
        });
        page.nodes[cell.id] = cell;
        return cell;
      });
      page.nodes[grid.id] = grid;
      page.nodes[page.rootId]!.children = [grid.id];
      grid.children = cells.map((c) => c.id);
      return document;
    },
  },
  {
    name: 'H token 驱动几何（gap={space.4} padding={space.2}）',
    build() {
      const document = createDocument('自洽 H', 'website');
      const page = createPage('Home');
      document.pages = [page];
      document.activePageId = page.id;
      const band = createNode({
        type: 'container',
        name: 'Token 带',
        parentId: page.rootId,
        size: { width: 720, height: 80 },
        layout: {
          mode: 'horizontal',
          gap: '{space.4}',
          padding: {
            top: '{space.2}',
            right: '{space.2}',
            bottom: '{space.2}',
            left: '{space.2}',
          },
          justify: 'space-between',
        },
      });
      const a = createNode({ type: 'button', name: '按钮一', parentId: band.id, text: '确认' });
      const b = createNode({ type: 'button', name: '按钮二', parentId: band.id, text: '取消' });
      page.nodes[band.id] = band;
      page.nodes[a.id] = a;
      page.nodes[b.id] = b;
      page.nodes[page.rootId]!.children = [band.id];
      band.children = [a.id, b.id];
      return document;
    },
  },
  {
    name: 'I stack 叠放模式（§20 stack 形状）',
    build() {
      const document = createDocument('自洽 I', 'website');
      const page = createPage('Home');
      document.pages = [page];
      document.activePageId = page.id;
      const stack = createNode({
        type: 'container',
        name: '叠放层',
        parentId: page.rootId,
        size: { width: 400, height: 400 },
        layout: { mode: 'stack' },
      });
      const back = createNode({ type: 'image', name: '底图', parentId: stack.id });
      const front = createNode({ type: 'text', name: '浮层', parentId: stack.id, text: '标题' });
      page.nodes[stack.id] = stack;
      page.nodes[back.id] = back;
      page.nodes[front.id] = front;
      page.nodes[page.rootId]!.children = [stack.id];
      stack.children = [back.id, front.id];
      return document;
    },
  },
  {
    name: 'J wrap 流式换行（§20 wrap 形状）',
    build() {
      const document = createDocument('自洽 J', 'website');
      const page = createPage('Home');
      document.pages = [page];
      document.activePageId = page.id;
      const wrap = createNode({
        type: 'container',
        name: '换行流',
        parentId: page.rootId,
        size: { width: 600, height: 200 },
        layout: { mode: 'wrap', columns: 3, gap: 8 },
      });
      const tags = ['一', '二', '三', '四', '五', '六'].map((label) => {
        const tag = createNode({
          type: 'text',
          name: `标签 ${label}`,
          parentId: wrap.id,
          text: label,
        });
        page.nodes[tag.id] = tag;
        return tag;
      });
      page.nodes[wrap.id] = wrap;
      page.nodes[page.rootId]!.children = [wrap.id];
      wrap.children = tags.map((t) => t.id);
      return document;
    },
  },
  {
    name: 'K 双层响应式（tablet 改 columns + mobile 改 mode）',
    build() {
      const document = createDocument('自洽 K', 'website');
      const page = createPage('Home');
      document.pages = [page];
      document.activePageId = page.id;
      const grid = createNode({
        type: 'grid',
        name: '分级网格',
        parentId: page.rootId,
        size: { width: 960, height: 200 },
        layout: { columns: 4, gap: 24 },
      });
      grid.responsive = [
        { breakpoint: 'tablet', patch: { layout: { columns: 2 } } },
        { breakpoint: 'mobile', patch: { layout: { mode: 'vertical' } } },
      ];
      const items = ['一', '二', '三', '四'].map((label) => {
        const cell = createNode({ type: 'container', name: `单元 ${label}`, parentId: grid.id });
        page.nodes[cell.id] = cell;
        return cell;
      });
      page.nodes[grid.id] = grid;
      page.nodes[page.rootId]!.children = [grid.id];
      grid.children = items.map((c) => c.id);
      return document;
    },
  },
];

export const modelRoundtripSuite: EvalSuite = {
  name: 'model-roundtrip',
  dimension: '代码正确性 / 投影自洽（§16 · §19）',
  needsDatabase: false,

  run() {
    const rec = new EvalRecorder();
    console.log('\n== 投影自洽矩阵（§16 / §19）· generate → parse · 每格零 issue 零补丁 ==');

    let cellsOk = 0;
    let cellsFailing = 0;
    for (const cell of CELLS) {
      const document = cell.build();
      for (const page of document.pages) {
        const generated = generatePageComponent(page, { cssVarPrefix: 'nx' }, page.name);
        const parsed = codeToPageOps(generated.contents, page, { cssVarPrefix: 'nx', tokens: document.tokens });
        const clean = parsed.issues.length === 0 && parsed.ops.length === 0;
        rec.structural(
          `格「${cell.name}」· 生成→解析零 issue 零补丁`,
          clean,
          `issues=${parsed.issues.length} ops=${parsed.ops.length}`,
        );
        if (clean) cellsOk += 1;
        else {
          cellsFailing += 1;
          for (const issue of parsed.issues.slice(0, 5)) {
            console.log(`    issue line ${issue.line}: ${issue.message}`);
          }
        }
      }
    }

    rec.structural(
      `矩阵总览：${CELLS.length} 格载体全部自洽`,
      cellsFailing === 0,
      `${cellsOk}/${CELLS.length}`,
    );

    // 矩阵本身别空转：cells 与每个载体的节点数都要被消费到
    rec.structural('矩阵格数 >= 5（不是空壳）', CELLS.length >= 5, CELLS.length);

    rec.skip('code-only 区域的往返（解析器对映射不回去的片段按设计落 unmapped，不在"零补丁"判据里）');
    rec.skip('真 provider 下补丁的往返（DEMO provider 的读数见 scripts/eval-baseline.mts）');
    rec.skip('xl/wide 档的 tier-flip round-trip（e2e 里已钉 F8/腿 S；这里不重复测浏览器腿）');

    return { checks: rec.checks, notMeasured: rec.notMeasured };
  },
};
