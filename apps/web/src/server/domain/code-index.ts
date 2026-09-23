import { generateProject, type DesignDocument } from '@nexus/design-model';
import ts from 'typescript';

/**
 * §69 Code Index：项目的代码目录（File / Symbol / Function / Class / Component / Dependency）。
 *
 * 为什么从 codegen 的产物建，而不是直接读设计模型：Agent 要回答的是"改哪份代码"，
 * 而代码是模型的投影（§16）。这里如果自己走一遍模型去"推算"会有哪些文件，
 * 就等于造第二套对代码的认知——它和 codegen 一旦漂移，目录就开始说谎。
 * 所以输入固定是 `generateProject()` 真发出来的那一份，归属由发射器标注（`GeneratedFile.origin`）。
 *
 * 为什么不持久化进 `files` 表：那张表是现成的，但库里存代码就是第二份真值——
 * 页面改名、token 改动、mode 切换都会让它过期，而这份目录没有任何一项是算不出来的。
 * 算得出来的东西写进库，迟早有一天读到的是旧的（docs/adr/0007）。
 *
 * 三条纪律（§159）：
 * 1. 符号、依赖、行号都从**真实 AST** 读（TypeScript 编译器），不靠正则猜；
 *    解析不出来的文件要说"解析失败"，不能报"0 个符号"。
 * 2. 只列得出来的。被预算裁掉的文件与符号单独计数，totals 永远来自未裁的那一份。
 * 3. 相关性排序是**词法**的，不是语义的：命中了什么逐条写在结果里，没命中就发空，不猜意图。
 */

export type CodeSymbolKind =
  | 'function'
  | 'component'
  | 'class'
  | 'variable'
  | 'interface'
  | 'type'
  | 'enum'
  | 'css-variable';

export type CodeFileOrigin =
  | { kind: 'page'; pageId: string; pageName: string }
  | { kind: 'tokens' }
  | { kind: 'barrel' }
  /** 模型里映射不回去的 code-only 区域（§19）：它是代码，但不在生成的 .tsx 里作为代码存在 */
  | { kind: 'node-region'; pageId: string; pageName: string; nodeId: string; nodeName: string };

export interface CodeSymbol {
  name: string;
  kind: CodeSymbolKind;
  /** 1 起始，指向真实文件里的位置——Agent 拿到就能跳过去 */
  line: number;
  exported: boolean;
  /** 函数/组件声明上读得到的参数名；读不到就是空数组，不编 */
  params: string[];
}

export interface CodeFileEntry {
  path: string;
  language: 'tsx' | 'ts' | 'css' | 'text';
  origin: CodeFileOrigin;
  lines: number;
  chars: number;
  symbols: CodeSymbol[];
  /** 指向项目内其它文件的 import，已解析成同一份目录里的 path */
  deps: string[];
  /** 项目外的 import（react、第三方包），只留模块名 */
  externals: string[];
  /** 写了相对路径但目录里没有对应文件：多半是 CSS/资源这类不参与代码结构的引用 */
  unresolvedDeps: string[];
  /** 发射器写进这份代码里的节点锚点数，用来核对"多少节点真的进了代码" */
  designAnchors: number;
  /** 语法诊断条数；null = 这类文件不做语法解析（CSS / 纯文本），不是"0 个错" */
  syntaxErrors: number | null;
}

export interface CodeIndexTotals {
  files: number;
  pageFiles: number;
  nodeRegionFiles: number;
  symbols: number;
  exportedSymbols: number;
  components: number;
  functions: number;
  classes: number;
  interfaces: number;
  internalDeps: number;
  externalDeps: number;
  /** 指向了目录里不存在的文件的相对 import 数：链接断了就说断，不悄悄丢掉 */
  unresolvedDeps: number;
  codeChars: number;
  /** 解析失败的文件数：>0 就说明这份目录不完整，不能当成全量在用 */
  unreadableFiles: number;
  /** code-only 区域里装着的代码字符：它们在生成的 .tsx 里是字符串，不在代码结构里 */
  nodeRegionChars: number;
}

export interface CodeIndex {
  schemaVersion: 1;
  generatedFrom: {
    documentId: string;
    documentName: string;
    updatedAt: string;
    /** 目录是对哪个 mode 的投影生成的；换 mode 代码内容会变，所以这个要写清楚 */
    mode: string | null;
  };
  files: CodeFileEntry[];
  totals: CodeIndexTotals;
  omissions: string[];
  dropped?: { files: number; symbols: number; anchors: boolean };
  trimmed?: string[];
}

export const CODE_INDEX_OMISSIONS: string[] = [
  '代码正文本身（这里只有目录与位置；要读实现得按 path 取，仍然受 §68 预算约束）',
  '第三方包内部的符号（只记被 import 了什么，不展开 node_modules）',
  'CSS 变量与代码里 var(--nx-*) 引用之间的边（两边都列了，没连成图）',
  '语义检索与意图判断（这里是词法匹配；向量化要 embedding provider，见 §49）',
  'code-only 区域在生成的组件里是作为字符串带出的（codegen 的 leaf 分支），所以它们的符号不并进 .tsx 的目录；目录给它们的位置 code-only/<页面>/<节点>.<语言> 是我们自己起的寻址名，导出的工程里没有这份文件',
];

/** 中日韩文字：汉字 + 假名 + 谚文，切词与"这个词够不够长"都要用（中文页面名进不了文件名，见下） */
const CJK_RANGES = '\\u3400-\\u9fff\\u3040-\\u30ff\\uac00-\\ud7af';
const CJK_CHAR = new RegExp(`[${CJK_RANGES}]`);
const CJK_RUN = new RegExp(`[${CJK_RANGES}]+`, 'g');

type FileAnalysis = Pick<CodeFileEntry, 'symbols' | 'deps' | 'externals' | 'syntaxErrors'>;

function stripQuotes(specifier: string): string {
  return specifier.replace(/^['"]|['"]$/g, '');
}

function isComponentBody(node: ts.Node): boolean {
  let found = false;
  const visit = (current: ts.Node): void => {
    if (found) return;
    if (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current) || ts.isJsxFragment(current)) {
      found = true;
      return;
    }
    current.forEachChild(visit);
  };
  node.forEachChild(visit);
  return found;
}

function parameterName(parameter: ts.ParameterDeclaration): string {
  const name = parameter.name;
  if (ts.isIdentifier(name)) return name.text;
  // 解构参数：`{ minutes }` 这种写法在 React 组件里是常态，直接 getText() 会连类型标注一起带出来。
  // 稀疏数组（`[, a]`）里的空洞没有名字，getText() 给空串，正好如实反映"这一位没名字"。
  if (ts.isObjectBindingPattern(name)) {
    return `{${name.elements.map((element) => element.name.getText()).join(', ')}}`;
  }
  return `[${name.elements.map((element) => element.getText()).join(', ')}]`;
}

function parameterNames(signature: ts.SignatureDeclarationBase): string[] {
  return signature.parameters.map(parameterName).slice(0, 12);
}

/** 返回 JSX 且名字大驼峰——这就是 React 组件，判定来自 AST，不是文件名猜的 */
function functionKind(name: string, body: ts.Node): CodeSymbolKind {
  return isComponentBody(body) && /^[A-Z]/.test(name) ? 'component' : 'function';
}

/**
 * 一个源文件里的顶层符号与依赖。只走**顶层语句**：
 * 函数体里的局部变量不是目录要回答的问题，收进来只会把预算吃光。
 * import 进来的名字算依赖不算符号——它们没有在本文件里定义。
 */
function analyzeTypeScript(fileName: string, sourceText: string): FileAnalysis {
  const scriptKind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.ES2020, true, scriptKind);
  const symbols: CodeSymbol[] = [];
  const deps: string[] = [];
  const externals: string[] = [];
  const lineOf = (pos: number) => source.getLineAndCharacterOfPosition(pos).line + 1;

  const push = (name: string, kind: CodeSymbolKind, pos: number, exported: boolean, params: string[] = []) => {
    if (name) symbols.push({ name, kind, line: lineOf(pos), exported, params });
  };

  for (const statement of source.statements) {
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
    const exported = Boolean(modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));

    if (ts.isImportDeclaration(statement)) {
      const specifier = stripQuotes(statement.moduleSpecifier.getText());
      (specifier.startsWith('.') ? deps : externals).push(specifier);
      continue;
    }

    if (ts.isExportDeclaration(statement)) {
      const specifier = statement.moduleSpecifier ? stripQuotes(statement.moduleSpecifier.getText()) : null;
      if (specifier) (specifier.startsWith('.') ? deps : externals).push(specifier);
      const clause = statement.exportClause;
      if (clause && ts.isNamedExports(clause)) {
        for (const element of clause.elements) push(element.name.text, 'variable', element.name.pos, true);
      }
      continue;
    }

    if (ts.isFunctionDeclaration(statement) && statement.name) {
      push(statement.name.text, functionKind(statement.name.text, statement), statement.name.pos, exported, parameterNames(statement));
      continue;
    }

    if (ts.isClassDeclaration(statement) && statement.name) {
      push(statement.name.text, 'class', statement.name.pos, exported);
      continue;
    }

    if (ts.isInterfaceDeclaration(statement)) {
      push(statement.name.text, 'interface', statement.name.pos, exported);
      continue;
    }

    if (ts.isTypeAliasDeclaration(statement)) {
      push(statement.name.text, 'type', statement.name.pos, exported);
      continue;
    }

    if (ts.isEnumDeclaration(statement)) {
      push(statement.name.text, 'enum', statement.name.pos, exported);
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        const initializer = declaration.initializer;
        const fn =
          initializer !== undefined && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
            ? initializer
            : null;
        push(
          declaration.name.text,
          fn ? functionKind(declaration.name.text, fn) : 'variable',
          declaration.name.pos,
          exported,
          fn ? parameterNames(fn) : [],
        );
      }
      continue;
    }
  }

  // parseDiagnostics 不是 typescript 的公开字段，但自 4.x 起稳定存在；取不到就报 null（"没查"），不报 0
  const diagnostics = (source as unknown as { parseDiagnostics?: readonly unknown[] }).parseDiagnostics;
  return { symbols, deps: [...new Set(deps)], externals: [...new Set(externals)], syntaxErrors: Array.isArray(diagnostics) ? diagnostics.length : null };
}

/** CSS 只取自定义属性：那就是 tokens.css 的"符号"，选择器列出来对定位没有价值 */
function analyzeCss(sourceText: string): FileAnalysis {
  const symbols: CodeSymbol[] = [];
  sourceText.split('\n').forEach((line, index) => {
    const match = /^\s*(--[A-Za-z0-9-]+)\s*:/.exec(line);
    if (match?.[1]) symbols.push({ name: match[1], kind: 'css-variable', line: index + 1, exported: false, params: [] });
  });
  return { symbols, deps: [], externals: [], syntaxErrors: null };
}

function analyzeByLanguage(fileName: string, sourceText: string, language: CodeFileEntry['language']): FileAnalysis {
  if (language === 'css') return analyzeCss(sourceText);
  if (language === 'tsx' || language === 'ts') return analyzeTypeScript(fileName, sourceText);
  return { symbols: [], deps: [], externals: [], syntaxErrors: null };
}

function languageOf(extension: string): CodeFileEntry['language'] {
  if (extension === 'tsx' || extension === 'ts' || extension === 'css') return extension;
  return 'text';
}

/** 锚点是 codegen 自己写的属性，数个数就够：这里要回答"多少节点真的进了代码"，不是它们的结构 */
function countAnchors(sourceText: string): number {
  return sourceText.match(/data-nexus-id=/g)?.length ?? 0;
}

function entryOf(path: string, sourceText: string, language: CodeFileEntry['language'], origin: CodeFileOrigin, designAnchors: number): CodeFileEntry {
  return {
    path,
    language,
    origin,
    lines: sourceText.split('\n').length,
    chars: sourceText.length,
    designAnchors,
    unresolvedDeps: [],
    ...analyzeByLanguage(path, sourceText, language),
  };
}

function joinPath(dir: string, specifier: string): string {
  const segments = dir ? dir.split('/').filter(Boolean) : [];
  for (const part of specifier.split('/')) {
    if (part === '.' || part === '') continue;
    if (part === '..') segments.pop();
    else segments.push(part);
  }
  return segments.join('/');
}

/**
 * 把 `./Page1` 这种说明符对回目录里真实存在的文件。TypeScript 的候选顺序：
 * 原样 → .tsx → .ts → /index.ts。对不上就留在 unresolvedDeps 里——
 * 目录里的依赖图要么是真的，要么如实说自己断了几条。
 */
function resolveDeps(files: CodeFileEntry[]): void {
  const known = new Set(files.map((file) => file.path));
  for (const file of files) {
    const resolved: string[] = [];
    const unresolved: string[] = [];
    for (const specifier of file.deps) {
      const dir = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';
      const target = joinPath(dir, specifier);
      const hitPath = [target, `${target}.tsx`, `${target}.ts`, `${target}/index.ts`].find((candidate) => known.has(candidate));
      if (hitPath) resolved.push(hitPath);
      else unresolved.push(specifier);
    }
    file.deps = [...new Set(resolved)].sort();
    file.unresolvedDeps = [...new Set(unresolved)].sort();
  }
}

export interface BuildCodeIndexOptions {
  /** 投影到哪个主题 mode；与 codegen 同一个入参，保证目录说的就是发出去的那份代码 */
  mode?: string | null;
}

/**
 * 由设计文档产出 §69 目录。纯函数：不读库、不碰时钟，同一份文档两次结果完全一致。
 * 成本随节点数线性增长（要先做一遍 codegen），10k 那档实测见 docs/PERFORMANCE.md。
 */
export function buildCodeIndex(document: DesignDocument, options: BuildCodeIndexOptions = {}): CodeIndex {
  const mode = options.mode ?? null;
  const files: CodeFileEntry[] = [];

  for (const file of generateProject(document, { mode })) {
    const extension = file.path.split('.').pop() ?? '';
    files.push(entryOf(file.path, file.contents, languageOf(extension), file.origin, countAnchors(file.contents)));
  }

  // code-only 区域：模型里的代码片段，不属于任何生成文件，但确实是"项目里的代码"（§19）
  for (const page of document.pages) {
    for (const node of Object.values(page.nodes)) {
      if (!node.code) continue;
      const { language, content } = node.code;
      const path = `code-only/${page.id}/${node.id}.${language}`;
      files.push(
        entryOf(path, content, languageOf(language), { kind: 'node-region', pageId: page.id, pageName: page.name, nodeId: node.id, nodeName: node.name }, 0),
      );
    }
  }

  resolveDeps(files);

  return {
    schemaVersion: 1,
    generatedFrom: {
      documentId: document.id,
      documentName: document.name,
      updatedAt: document.metadata.updatedAt,
      mode,
    },
    files,
    totals: totalsOf(files),
    omissions: CODE_INDEX_OMISSIONS,
  };
}
function totalsOf(files: CodeFileEntry[]): CodeIndexTotals {
  const kindCount = (kind: CodeSymbolKind) =>
    files.reduce((sum, file) => sum + file.symbols.filter((symbol) => symbol.kind === kind).length, 0);
  const regions = files.filter((file) => file.origin.kind === 'node-region');
  return {
    files: files.length,
    pageFiles: files.filter((file) => file.origin.kind === 'page').length,
    nodeRegionFiles: regions.length,
    symbols: files.reduce((sum, file) => sum + file.symbols.length, 0),
    exportedSymbols: files.reduce((sum, file) => sum + file.symbols.filter((symbol) => symbol.exported).length, 0),
    components: kindCount('component'),
    functions: kindCount('function'),
    classes: kindCount('class'),
    interfaces: kindCount('interface'),
    internalDeps: files.reduce((sum, file) => sum + file.deps.length, 0),
    externalDeps: files.reduce((sum, file) => sum + new Set(file.externals).size, 0),
    unresolvedDeps: files.reduce((sum, file) => sum + file.unresolvedDeps.length, 0),
    codeChars: files.reduce((sum, file) => sum + file.chars, 0),
    unreadableFiles: files.filter((file) => (file.syntaxErrors ?? 0) > 0).length,
    nodeRegionChars: regions.reduce((sum, file) => sum + file.chars, 0),
  };
}

export function codeIndexChars(index: CodeIndex): number {
  return JSON.stringify(index).length;
}

/**
 * 目录自己也要有预算：docs/PERFORMANCE.md 那一档实测下来，全量发给 Agent 就又把 §68 反着做了一遍。
 * 裁剪按固定优先级，totals 始终来自未裁的那一份——宁可少列条目，不许少报数。
 */
export const DEFAULT_CODE_CHAR_BUDGET = 8_000;
const SYMBOLS_PER_FILE = 60;

export function fitCodeIndexToBudget(index: CodeIndex, maxChars: number = DEFAULT_CODE_CHAR_BUDGET): CodeIndex {
  if (maxChars <= 0 || codeIndexChars(index) <= maxChars) return index;

  const dropped = { files: 0, symbols: 0, anchors: false };
  const trimmed: string[] = [];
  let files = index.files.map((file) => ({ ...file }));

  // 1) 锚点计数：帮人核对投影完整性，帮不了机器定位
  if (files.some((file) => file.designAnchors > 0)) {
    dropped.anchors = true;
    files = files.map((file) => ({ ...file, designAnchors: 0 }));
    trimmed.push('去掉了每个文件的节点锚点计数');
  }
  // 2) 每文件符号截到前 N 个：符号按出现顺序，排在前面的就是顶层入口
  let droppedSymbols = 0;
  files = files.map((file) => {
    if (file.symbols.length <= SYMBOLS_PER_FILE) return file;
    droppedSymbols += file.symbols.length - SYMBOLS_PER_FILE;
    return { ...file, symbols: file.symbols.slice(0, SYMBOLS_PER_FILE) };
  });
  if (droppedSymbols > 0) {
    dropped.symbols = droppedSymbols;
    trimmed.push(`每个文件最多列 ${SYMBOLS_PER_FILE} 个符号，省掉 ${droppedSymbols} 个`);
  }
  // 3) 参数名是目录里最贵、又最少被用来定位的一项
  if (codeIndexChars({ ...index, files }) > maxChars) {
    files = files.map((file) => ({ ...file, symbols: file.symbols.map((symbol) => ({ ...symbol, params: [] })) }));
    trimmed.push('去掉了符号的参数名');
  }
  // 4) 文件按 codegen 顺序保留前若干个（页面顺序就是文档顺序，砍尾巴等于砍后面的页面）
  if (codeIndexChars({ ...index, files }) > maxChars) {
    let keep = files.length - 1;
    while (keep > 1 && codeIndexChars({ ...index, files: files.slice(0, keep) }) > maxChars) keep -= 1;
    dropped.files = files.length - keep;
    files = files.slice(0, Math.max(keep, 1));
    trimmed.push(`只列前 ${Math.max(keep, 1)} 个文件，另有 ${dropped.files} 个未展开（总数仍在 totals 里）`);
  }

  const next: CodeIndex = { ...index, files, dropped, trimmed };
  if (codeIndexChars(next) > maxChars) {
    trimmed.push(`即便只剩骨架仍是 ${codeIndexChars(next)} 字符：预算 ${maxChars} 比这份项目的最小目录还小`);
  }
  return next;
}

export interface CodeRankInput {
  /** 用户原话；词法匹配，不做语义猜测 */
  query?: string | null;
  /** 当前页：这一页的代码几乎总是要动 */
  pageId?: string | null;
  /** 选中的节点：命中 code-only 区域时加权 */
  nodeIds?: string[];
  limit?: number;
}

export interface CodeFileMatch {
  path: string;
  score: number;
  /** 为什么命中：每一项都是"字段=命中的词"，读的人能核对而不是听天书 */
  reasons: string[];
}

/**
 * 切词：ASCII 词按非字母数字切开，CJK 额外按相邻两字切（"结算页"要能命中"结算"）。
 * 只切不加工——没有词形还原也没有同义词表，那些要么要 provider，要么是一份会过期的词典。
 */
export function queryTokens(query: string): string[] {
  const ascii = query
    .toLowerCase()
    .split(/[^a-z0-9_$-]+/)
    .filter((token) => token.length >= 2);
  const bigrams: string[] = [];
  for (const run of query.match(CJK_RUN) ?? []) {
    if (run.length === 1) bigrams.push(run);
    for (let i = 0; i + 2 <= run.length; i += 1) bigrams.push(run.slice(i, i + 2));
  }
  return [...new Set([...ascii, ...bigrams])];
}

function hit(haystack: string, token: string): boolean {
  const needle = token.toLowerCase();
  const value = haystack.toLowerCase();
  if (!needle || !value) return false;
  if (value.includes(needle)) return true;
  // 反方向只认长度 ≥3 的中文词：否则"页"这种单字会把每份文件都命中一遍
  return CJK_CHAR.test(needle) && needle.length >= 3 && needle.includes(value);
}

/** 同分时谁更像要改的地方：页面组件是一页的入口，区域片段与样式/汇总次之 */
function originTier(origin: CodeFileOrigin): number {
  switch (origin.kind) {
    case 'page':
      return 0;
    case 'node-region':
      return 1;
    case 'barrel':
      return 2;
    case 'tokens':
      return 3;
  }
}

/** §69 的后半句："找到真正相关代码"。纯词法，命中理由逐条列出。 */
export function rankCodeFiles(index: CodeIndex, input: CodeRankInput): CodeFileMatch[] {
  const tokens = input.query ? queryTokens(input.query) : [];
  const nodeIds = new Set(input.nodeIds ?? []);
  const limit = input.limit ?? 8;
  const matches: CodeFileMatch[] = [];

  for (const file of index.files) {
    const origin = file.origin;
    const pageName = origin.kind === 'page' || origin.kind === 'node-region' ? origin.pageName : null;
    const nodeName = origin.kind === 'node-region' ? origin.nodeName : null;
    const reasons: string[] = [];
    let score = 0;

    // 每个字段最多计一次分：否则"结算页"切出来的十来个二元组会在同一份文件上叠到 80 分，
    // 排序就变成了"谁的名字长谁赢"，而不是"谁真的相关"。
    if (input.pageId && 'pageId' in origin && origin.pageId === input.pageId) {
      score += 12;
      reasons.push('当前页');
    }
    if (nodeIds.size && origin.kind === 'node-region' && nodeIds.has(origin.nodeId)) {
      score += 16;
      reasons.push('选中节点');
    }

    let symbolHit = 0;
    let symbolName = '';
    for (const token of tokens) {
      const symbol = file.symbols.find((candidate) => hit(candidate.name, token));
      if (symbol) {
        const exact = symbol.name.toLowerCase() === token;
        if ((exact ? 10 : 5) > symbolHit) {
          symbolHit = exact ? 10 : 5;
          symbolName = symbol.name;
        }
      }
      if (pageName && hit(pageName, token) && !reasons.includes(`页面「${pageName}」`)) {
        score += 8;
        reasons.push(`页面「${pageName}」`);
      }
      if (nodeName && hit(nodeName, token) && !reasons.includes(`节点「${nodeName}」`)) {
        score += 8;
        reasons.push(`节点「${nodeName}」`);
      }
      if (hit(file.path, token) && !reasons.includes(`路径 ${file.path}`)) {
        score += 4;
        reasons.push(`路径 ${file.path}`);
      }
      if (file.externals.some((external) => hit(external, token)) && !reasons.includes(`外部依赖 ${token}`)) {
        score += 2;
        reasons.push(`外部依赖 ${token}`);
      }
    }
    if (symbolHit) {
      score += symbolHit;
      reasons.push(`符号 ${symbolName}${symbolHit === 10 ? ' 完全命中' : ''}`);
    }

    if (score > 0) matches.push({ path: file.path, score, reasons: [...new Set(reasons)] });
  }

  const byPath = new Map(index.files.map((file) => [file.path, file]));
  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const tierA = originTier(byPath.get(a.path)!.origin);
    const tierB = originTier(byPath.get(b.path)!.origin);
    return tierA - tierB || a.path.localeCompare(b.path);
  });
  return matches.slice(0, limit);
}

export interface CodeDigestFile {
  path: string;
  language: CodeFileEntry['language'];
  /** 这份文件是从哪儿来的，用人话说清楚（含页面名，因为中文页面名进不了文件名） */
  origin: string;
  pageName: string | null;
  lines: number;
  symbols: string[];
  deps: string[];
  externals: string[];
  unresolvedDeps: string[];
  reasons: string[];
}

export interface CodeDigest {
  schemaVersion: 1;
  mode: string | null;
  query: string | null;
  /** 发给 Agent 的那一份：排序靠前 + 预算内 */
  files: CodeDigestFile[];
  totals: CodeIndexTotals;
  budgetChars: number;
  /** 目录里有、这次没发出去的文件数（不等于"不存在"） */
  omittedFiles: number;
  trimmed: string[];
  omissions: string[];
}

function describeOrigin(origin: CodeFileOrigin): string {
  switch (origin.kind) {
    case 'page':
      return `生成自页面「${origin.pageName}」`;
    case 'node-region':
      return `code-only 区域「${origin.nodeName}」（页面「${origin.pageName}」）`;
    case 'tokens':
      return '生成的 token 样式表';
    case 'barrel':
      return '页面导出汇总';
  }
}

/**
 * 发给 provider 的那一份。§68 的"发目录不发文档"在代码这边同样成立：
 * 只带排序靠前的文件的符号名与依赖，不带代码正文——正文要 Agent 明确伸手取，
 * 取的时候仍然受预算约束。
 */
export function buildCodeDigest(index: CodeIndex, input: CodeRankInput & { maxChars?: number } = {}): CodeDigest {
  const maxChars = input.maxChars ?? DEFAULT_CODE_CHAR_BUDGET;
  const ranked = rankCodeFiles(index, { ...input, limit: index.files.length });
  const byPath = new Map(index.files.map((file) => [file.path, file]));
  const files: CodeDigestFile[] = [];
  const trimmed: string[] = [];

  for (const match of ranked) {
    const file = byPath.get(match.path);
    if (!file) continue;
    const candidate: CodeDigestFile = {
      path: file.path,
      language: file.language,
      origin: describeOrigin(file.origin),
      pageName: file.origin.kind === 'page' || file.origin.kind === 'node-region' ? file.origin.pageName : null,
      lines: file.lines,
      symbols: file.symbols.slice(0, 40).map((symbol) => `${symbol.kind}:${symbol.name}${symbol.exported ? '' : '(局部)'}`),
      deps: file.deps,
      externals: file.externals,
      unresolvedDeps: file.unresolvedDeps,
      reasons: match.reasons,
    };
    if (JSON.stringify({ schemaVersion: 1, files: [...files, candidate] }).length > maxChars) {
      trimmed.push(`预算 ${maxChars} 字符用满：还有 ${ranked.length - files.length} 个命中的文件没发出去`);
      break;
    }
    files.push(candidate);
  }

  if (!files.length && (input.query || input.pageId || input.nodeIds?.length)) {
    trimmed.push('没有任何文件命中这轮请求的关键词与位置：宁可发空目录，也不发一份看起来相关的猜测');
  }

  return {
    schemaVersion: 1,
    mode: index.generatedFrom.mode,
    query: input.query ?? null,
    files,
    totals: index.totals,
    budgetChars: maxChars,
    omittedFiles: index.files.length - files.length,
    trimmed,
    omissions: index.omissions,
  };
}
