import { createDocument, createNode, createPage } from '../../packages/creative-model/src/index.ts';
import {
  buildCodeIndex,
  codeIndexChars,
  fitCodeIndexToBudget,
  rankCodeFiles,
  CODE_INDEX_OMISSIONS,
  DEFAULT_CODE_CHAR_BUDGET,
} from '../../apps/web/src/server/domain/code-index.ts';
import { EvalRecorder } from '../lib/recorder.ts';
import type { EvalSuite } from '../types.ts';

/**
 * §85 · §69 Code Index —— "找到真正相关代码"这一半有没有量出来。
 *
 * 为什么这一格先量：目录（buildCodeIndex）是 Agent 拿到的唯一代码坐标，它错了，
 * Coding Agent 改的每一个文件都是猜的；而它是**纯函数**、输入是真 codegen 的产物——
 * 不需要 provider、不需要库、不需要时钟，今天就能钉住。
 *
 * 口径（与 scripts/eval-baseline.mts 同原则）：
 * - 数字打印进 EVALUATION.md 由人比对；结构不变式失败才判红；
 * - 检索只钉**决定性**的查询（当前页加权 / 选中节点加权 / 精确符号名），
 *   模糊查询的命中顺序属于"数字难看"，不进 gate。
 *
 * notMeasured 见 run() 末尾——语义检索与 Tool selection 都不在本机。
 */
export const codeIndexSuite: EvalSuite = {
  name: 'code-index',
  dimension: 'code correctness（§69 Code Index 检索）',
  needsDatabase: false,

  run() {
    const rec = new EvalRecorder();
    const document = fixtureDocument();
    const page = document.pages[0]!;
    const index = buildCodeIndex(document);
    const files = index.files;

    console.log(`\n== Code Index（§69）· 载体=真 codegen 产物 · ${files.length} 个文件 ==`);

    // ---------------------------------------------------------- 结构不变式
    rec.structural('totals.files == files.length', index.totals.files === files.length, files.length);
    rec.structural(
      'totals.symbols == Σsymbols',
      index.totals.symbols === files.reduce((sum, f) => sum + f.symbols.length, 0),
      index.totals.symbols,
    );
    rec.structural(
      'totals.codeChars == Σchars',
      index.totals.codeChars === files.reduce((sum, f) => sum + f.chars, 0),
      index.totals.codeChars,
    );
    rec.structural('pageFiles == 页数', index.totals.pageFiles === document.pages.length, index.totals.pageFiles);
    rec.structural('unreadableFiles == 0（发射器产物 TS 读得回）', index.totals.unreadableFiles === 0, index.totals.unreadableFiles);
    rec.structural(
      '没有语法诊断的文件混在里面（tsx/ts 全为 0，css/text 为 null）',
      files.every((f) => f.syntaxErrors === 0 || f.syntaxErrors === null),
      files.filter((f) => (f.syntaxErrors ?? 0) > 0).map((f) => f.path).join(',') || 'none',
    );
    rec.structural(
      '文件路径不重复',
      new Set(files.map((f) => f.path)).size === files.length,
      files.length,
    );
    rec.structural(
      'design anchors > 0（投影里的节点锚点被目录认领）',
      files.reduce((sum, f) => sum + f.designAnchors, 0) > 0,
      files.reduce((sum, f) => sum + f.designAnchors, 0),
    );
    rec.check(
      'omissions 是声明过的那份（Agent 看到的"这里没列什么"与目录一致）',
      index.omissions.length === CODE_INDEX_OMISSIONS.length &&
        index.omissions.every((o) => CODE_INDEX_OMISSIONS.includes(o)),
      `${index.omissions.length} 条`,
    );
    rec.structural('generatedFrom.documentId 指回载体', index.generatedFrom.documentId === document.id, index.generatedFrom.documentId);

    // 同一份文档两次投影逐字节相同（§16：目录是算出来的，不是攒出来的）
    const second = buildCodeIndex(document);
    rec.check('同一份文档两次投影完全一致（§16）', JSON.stringify(index) === JSON.stringify(second), 'JSON.stringify deep-equal');

    // ---------------------------------------------------------- 检索 · 决定性查询
    const pageFile = files.find((f) => f.origin.kind === 'page');
    if (!pageFile) {
      rec.check('目录里有 page 类文件', false, 'pageFiles=0——目录不完整');
    } else {
      // 当前页加权（无 query）：唯一该命中的就是这一页
      const byPage = rankCodeFiles(index, { pageId: page.id });
      rec.check(
        '当前页加权：pageId 顶上来的那份就是 page 类文件',
        byPage.length > 0 && byPage[0]!.path === pageFile.path && byPage[0]!.score >= 12,
        byPage.map((m) => `${m.path}@${m.score}`).join(' ') || '无命中',
      );

      // 精确符号名（组件名来自目录自己，不手写）：完全命中该排第一
      const component = pageFile.symbols.find((s) => s.kind === 'component');
      if (!component) {
        rec.check('page 文件里读得出 component 符号', false, 'symbols 里没有 component');
      } else {
        const byComponent = rankCodeFiles(index, { query: component.name });
        const top = byComponent[0];
        rec.check(
          `符号名 query「${component.name}」：第一名带该符号且完全命中`,
          !!top &&
            top.score >= 10 &&
            top.reasons.some((r) => r.includes('完全命中')) &&
            files.find((f) => f.path === top.path)!.symbols.some((s) => s.name === component.name),
          top ? `${top.path}@${top.score} [${top.reasons.join('|')}]` : '无命中',
        );
      }
    }

    // 选中节点加权：code-only 区域该被顶上来
    const regionFile = files.find((f) => f.origin.kind === 'node-region');
    if (!regionFile) {
      rec.check('目录里有 code-only 区域文件', false, '夹具里的 code 节点没进目录');
    } else if (regionFile.origin.kind === 'node-region') {
      const byNode = rankCodeFiles(index, { nodeIds: [regionFile.origin.nodeId] });
      const top = byNode[0];
      rec.check(
        '选中节点加权：node-region 顶上来且理由写了"选中节点"',
        !!top && top.path === regionFile.path && top.reasons.includes('选中节点'),
        top ? `${top.path}@${top.score} [${top.reasons.join('|')}]` : '无命中',
      );

      // 区域里的符号名：词法检索真的查得到它（大小写不同也行）
      const variable = regionFile.symbols.find((s) => s.kind === 'variable');
      if (variable) {
        const byVariable = rankCodeFiles(index, { query: variable.name.toLowerCase() });
        const top = byVariable[0];
        rec.check(
          `区域符号 query「${variable.name.toLowerCase()}」：命中的是区域文件`,
          !!top && top.path === regionFile.path,
          top ? `${top.path}@${top.score}` : '无命中',
        );
      }
    }

    // ---------------------------------------------------------- 预算
    const whole = codeIndexChars(index);
    const fittedDefault = fitCodeIndexToBudget(index, DEFAULT_CODE_CHAR_BUDGET);
    rec.check(
      `小载体在默认预算（${DEFAULT_CODE_CHAR_BUDGET} 字符）内不裁`,
      codeIndexChars(fittedDefault) === whole,
      `${whole} 字符`,
    );

    // 极小预算：只要求"裁得有道理"——留下 ≥1 个文件、totals 报的是未裁那份的数
    const fittedTiny = fitCodeIndexToBudget(index, 1);
    rec.check(
      '预算=1：至少留一个文件',
      fittedTiny.files.length >= 1,
      `${fittedTiny.files.length} 个文件`,
    );
    rec.structural(
      '预算=1：trimmed 有记录（裁了哪几步说清楚）',
      (fittedTiny.trimmed?.length ?? 0) >= 1,
      JSON.stringify(fittedTiny.trimmed ?? []),
    );
    rec.structural(
      '预算=1：totals 仍来自未裁的那份（不少报数）',
      fittedTiny.totals.files === index.totals.files && fittedTiny.totals.symbols === index.totals.symbols,
      `totals.files=${fittedTiny.totals.files} totals.symbols=${fittedTiny.totals.symbols}`,
    );

    // ---------------------------------------------------------- 读数（不进 gate）
    console.log(`  文件数 ${files.length} · 符号 ${index.totals.symbols}（导出 ${index.totals.exportedSymbols}）· 组件 ${index.totals.components} · 函数 ${index.totals.functions}`);
    console.log(`  内部依赖 ${index.totals.internalDeps} · 外部依赖 ${index.totals.externalDeps} · 未解析 ${index.totals.unresolvedDeps} · 代码 ${index.totals.codeChars} 字符`);
    console.log(`  节点锚点 ${files.reduce((sum, f) => sum + f.designAnchors, 0)} · code-only 区域 ${index.totals.nodeRegionFiles} 份`);

    rec.skip('语义检索 / 意图判断（词法目录没有这一半；向量化要 embedding provider，§49）');
    rec.skip('Tool selection / Agent task completion（要真 provider，本机没有）');
    rec.skip('真实 provider 下目录的增量更新成本（目录目前是全量重算，见 docs/adr）');

    return { checks: rec.checks, notMeasured: rec.notMeasured };
  },
};

/**
 * 评测载体：一个真实文档 + 一个 code-only 区域。
 * 名字与 eval-baseline 的夹具同口径（中文页面名是特意选的——
 * 切词那条路在 CJK 上最容易静默退化）。
 */
function fixtureDocument() {
  const document = createDocument('评测样板 CodeIndex', 'website');
  const page = createPage('Home');
  document.pages = [page];
  document.activePageId = page.id;

  const banner = createNode({ type: 'container', name: '首屏横幅', parentId: page.rootId, size: { width: 960, height: 320 } });
  const bannerText = createNode({ type: 'text', name: '主标题', parentId: banner.id, text: '把想法变成作品' });
  const footer = createNode({ type: 'container', name: '页脚', parentId: page.rootId, size: { width: 960, height: 64 } });
  const footerText = createNode({ type: 'text', name: '页脚文案', parentId: footer.id, text: '© 评测样板' });
  const region = createNode({ type: 'code', name: '定价逻辑', parentId: page.rootId });
  region.code = {
    language: 'ts',
    content:
      'const PRICING = [{ tier: "pro", price: 99 }];\n' +
      'export function nextTier(current: string): string {\n' +
      '  return current === "free" ? "pro" : "studio";\n}\n',
    readOnly: true,
  };

  page.nodes[banner.id] = banner;
  page.nodes[bannerText.id] = bannerText;
  page.nodes[footer.id] = footer;
  page.nodes[footerText.id] = footerText;
  page.nodes[region.id] = region;
  page.nodes[page.rootId]!.children = [banner.id, footer.id, region.id];
  banner.children = [bannerText.id];
  footer.children = [footerText.id];
  return document;
}
