import {
  DEFAULT_INDEX_CHAR_BUDGET,
  buildDesignIndex,
  designDocumentChars,
  designIndexChars,
  fitIndexToBudget,
  type DesignDocument,
} from '@nexus/design-model';
import { worldCounts } from '@nexus/world-model';
import { DEFAULT_CORPUS_CHAR_BUDGET, ProjectContextSchema, emptyCorpusDigest, type ProjectContextPayload } from '@nexus/schemas';
import { listProjectAssets } from './assets';
import { buildCodeIndex, codeIndexChars, fitCodeIndexToBudget, DEFAULT_CODE_CHAR_BUDGET } from './code-index';
import { listCharacters } from './characters';
import { knowledgeStats, retrieveProjectKnowledge, type RetrievedChunk } from './knowledge';
import { countMemoriesByScope } from './memories';
import { loadDocument } from './projects';
import { getPublication } from './publish';
import { listSnapshots } from './snapshots';
import { loadWorld } from './worlds';

/**
 * §67 Context Engine 的服务端装配。
 *
 * 为什么要有这一处而不是各处现拼：§66 要求 Agent 每次都拿到同一批上下文（选中、页面、
 * 视口、设计系统、项目文件、资产、用户请求），而 §68 禁止把整份文档/整个 repo 塞进去。
 * 这两条只有在**一处**装配时才可能同时被验证——所以这里产出的是可核对的目录 + 摘要，
 * 面板与（将来的）Agent 请求都从同一份出发。
 *
 * 三条边界（§159）：
 * 1. 装配只读，不写库、不顺手创建任何东西；
 * 2. 读不出来的域（世界文档坏了、角色行不合规）不静默消失，原因随报文一起出去；
 * 3. §71 的七个分支里没做的就写 `not-indexed`，不拿"暂时还没有"冒充"已经索引好了"。
 */

export interface BuildContextOptions {
  /** 设计目录的字符预算；超了按固定优先级裁，裁剪结果随报文出去 */
  maxIndexChars?: number;
  /** §69 代码目录的字符预算，与设计目录分开：两者的裁剪优先级不一样 */
  maxCodeChars?: number;
  recentChangeLimit?: number;
  /**
   * §49 的语料按相关性取回给这一轮用的查询词（AI 请求里就是用户那句提示）。
   * 不给就不查：装配是只读的，但一次全文检索不是零成本，`/context` 面板那种"看看上下文长什么样"
   * 的调用不该替每次打开都付一遍。
   */
  corpusQuery?: string;
  /** 语料摘录的字符预算，与设计/代码目录分开：三者各有各的裁剪优先级 */
  maxCorpusChars?: number;
}

export type ContextResult =
  | {
      ok: true;
      context: ProjectContextPayload;
      /**
       * 装配过程中读到的那份权威文档。目录本来就是它的投影，再让调用方 loadDocument 一次
       * 就是白白重跑一遍全表重建（10k 节点那一档实测最贵的就是这一步），所以顺手带出去。
       */
      document: DesignDocument;
    }
  | { ok: false; reason: string };

const RECENT_DEFAULT = 8;
/** 先多要几条候选，再按字符预算裁；被裁掉的数量要能说出来而不是静默丢（§68） */
const CORPUS_CANDIDATES = 12;

/**
 * 相关块的预算裁剪：分数高的先占位置。装不下的那条**不挡住后面更短的**——
 * "这一整块太大"与"轮到它时已经没位置"是两回事，前者不该让后面的相关内容一起消失。
 */
function fitCorpusToBudget(items: RetrievedChunk[], maxChars: number) {
  const kept: RetrievedChunk[] = [];
  let usedChars = 0;
  for (const item of items) {
    const cost = item.title.length + item.snippet.length;
    if (usedChars + cost > maxChars) continue;
    usedChars += cost;
    kept.push(item);
  }
  return { kept, usedChars, omitted: items.length - kept.length };
}

function tally<T extends string>(items: T[]): { kind: T; count: number }[] {
  const counts = new Map<T, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));
}

export async function buildProjectContext(
  projectId: string,
  ownerId: string,
  options: BuildContextOptions = {},
): Promise<ContextResult> {
  const maxIndexChars = options.maxIndexChars ?? DEFAULT_INDEX_CHAR_BUDGET;
  const maxCodeChars = options.maxCodeChars ?? DEFAULT_CODE_CHAR_BUDGET;
  const recentLimit = options.recentChangeLimit ?? RECENT_DEFAULT;
  const maxCorpusChars = options.maxCorpusChars ?? DEFAULT_CORPUS_CHAR_BUDGET;
  const corpusQuery = options.corpusQuery?.trim() ?? '';

  const document = await loadDocument(projectId);
  if (!document) return { ok: false, reason: '这个项目读不出设计文档（不存在或已删除），目录无从算起。' };

  const fullIndex = buildDesignIndex(document);
  const index = fitIndexToBudget(fullIndex, maxIndexChars);
  // §69：代码目录是对 codegen 产物的解析，而 codegen 是文档的纯投影——所以它在这里是 CPU 密集
  // 而不是 IO。10k 节点那一档的耗时见 docs/PERFORMANCE.md。
  const codeIndex = fitCodeIndexToBudget(buildCodeIndex(document), maxCodeChars);

  const [world, characters, memoryCounts, assetRows, knowledge, snapshots, publication, retrieved] =
    await Promise.all([
      loadWorld(projectId),
      listCharacters(projectId),
      countMemoriesByScope(ownerId, projectId),
      listProjectAssets(projectId),
      knowledgeStats(projectId),
      listSnapshots(projectId),
      getPublication(projectId),
      // §49 的检索接口就是这一条，装配方不自己写 SQL；没给查询词就不付这一遍
      corpusQuery ? retrieveProjectKnowledge(projectId, corpusQuery, CORPUS_CANDIDATES) : Promise.resolve(null),
    ]);
  const corpus = retrieved ? fitCorpusToBudget(retrieved.items, maxCorpusChars) : null;

  const unavailable = [
    '当前选中 / 页面 / 视口是画布的本地状态，由浏览器侧的 Context Engine 补上（§66 那三项不在这里）',
    '代码正文：目录说了有哪几份文件、里面有什么符号，但还没有"按 path 取正文"的通道给 Agent（§69 的后半截）',
    '语义检索与相关性排序：要 embedding provider，§49 只落了全文 + 子串，§69 的排序是词法的',
    '资产像素内容：只带元数据与引用计数',
    '上下文里发的语料摘录是命中位置附近的窗口，不是整块正文：整块能按出处走 GET /api/projects/<id>/knowledge/block 取回，但这一轮没有替你取',
  ];

  const context: ProjectContextPayload = {
    projectId,
    generatedAt: new Date().toISOString(),
    sizes: {
      fullDocumentChars: designDocumentChars(document),
      indexChars: designIndexChars(index),
      budgetChars: maxIndexChars,
      codeIndexChars: codeIndexChars(codeIndex),
    },
    design: index,
    code: codeIndex,
    world: world?.ok
      ? {
          present: true,
          name: world.document.name,
          kinds: Object.entries(worldCounts(world.document))
            .map(([kind, count]) => ({ kind, count }))
            .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind)),
          links: world.document.links.length,
          reason: null,
        }
      : { present: false, name: null, kinds: [], links: 0, reason: world ? world.reason : null },
    characters: {
      count: characters.items.length,
      items: characters.items.map((character) => ({
        id: character.id,
        name: character.profile.name,
        relationships: character.profile.relationships.length,
      })),
      unreadable: characters.unreadable,
    },
    memory: {
      scopes: Object.entries(memoryCounts).map(([scope, count]) => ({ scope, count })),
      total: Object.values(memoryCounts).reduce((a, b) => a + b, 0),
    },
    assets: {
      count: assetRows.length,
      kinds: tally(assetRows.map((asset) => asset.kind)),
    },
    knowledge: {
      chunks: knowledge.total,
      vectorized: knowledge.vectorized,
      vectorAvailable: knowledge.vectorized > 0,
      sources: Object.entries(knowledge.bySource).map(([sourceType, count]) => ({ sourceType, count })),
    },
    // §49 × §66-71 的那一半：语料的**内容**按相关性进上下文，而不只是报一个块数。
    // 每一项都带着"这条是怎么被查到的"（matchedBy / score）与出处（sourceType / sourceId / 第几块），
    // 收到的一方才知道哪句可以当真、哪句该回库里核对。
    corpus:
      retrieved && corpus
        ? {
            query: corpusQuery,
            candidates: retrieved.items.length,
            used: corpus.kept.length,
            omitted: corpus.omitted,
            budgetChars: maxCorpusChars,
            usedChars: corpus.usedChars,
            vectorAvailable: retrieved.vectorAvailable,
            items: corpus.kept.map((item) => ({
              sourceType: item.sourceType,
              sourceId: item.sourceId,
              chunkIndex: item.chunkIndex,
              title: item.title,
              excerpt: item.snippet,
              score: Number(item.score.toFixed(4)),
              matchedBy: item.matchedBy,
            })),
          }
        : // 没给查询词（或一条都没查到）也要发这一栏，而不是省略它：
          // 收到的一方据此分清"这一轮没查语料库"与"查了但都不相关"
          emptyCorpusDigest(maxCorpusChars),
    recentChanges: snapshots.slice(0, recentLimit).map((snapshot) => ({
      label: snapshot.label,
      source: snapshot.source,
      summary: snapshot.summary,
      createdAt: snapshot.createdAt,
    })),
    publishing: {
      published: Boolean(publication),
      visibility: publication?.visibility ?? null,
      path: publication?.path ?? null,
      version: publication?.version ?? 0,
      views: publication?.views ?? 0,
      publishedAt: publication?.publishedAt ?? null,
    },
    branches: [
      { name: 'Design', status: 'indexed', note: `页面/结构/组件/资产/token/交互 + 跨引用边（§70）` },
      {
        name: 'Code',
        // 有文件解析不出来或被预算裁掉时只说 partial：目录不完整还自称索引好了，就是 §159
        status: codeIndex.totals.unreadableFiles > 0 || codeIndex.dropped ? 'partial' : 'indexed',
        note:
          `${codeIndex.totals.files} 个文件、${codeIndex.totals.symbols} 个符号、${codeIndex.totals.internalDeps} 条内部依赖（§69，真实 AST）` +
          (codeIndex.totals.unreadableFiles > 0 ? `；${codeIndex.totals.unreadableFiles} 个文件语法解析失败，目录不含其符号` : '') +
          (codeIndex.dropped ? `；目录被压进 ${maxCodeChars} 字符预算，省掉的见 trimmed` : ''),
      },
      {
        name: 'Assets',
        status: 'partial',
        note: `只有元数据与引用计数：${assetRows.length} 个资产，其中 ${index.totals.orphanAssets} 个没被设计引用`,
      },
      { name: 'Agents', status: 'not-indexed', note: 'Agent 的活动与产出还没进装配（§26 事件流在 ai-service 侧）' },
      {
        name: 'Data',
        status: 'partial',
        note: `世界 ${world?.ok ? '有' : '没有'}、角色 ${characters.items.length}、记忆 ${Object.values(memoryCounts).reduce((a, b) => a + b, 0)} 条：只带条数与标题，正文按 id 取`,
      },
      { name: 'Runtime', status: 'not-indexed', note: '预览跑在沙箱里，运行期指标（§82/§83）还没回流到上下文' },
      {
        name: 'Publishing',
        status: publication ? 'partial' : 'not-indexed',
        note: publication
          ? `已发布为 ${publication.visibility}（${publication.path}，v${publication.version}）`
          : '还没有发布记录，也就没有可引用的发布态',
      },
    ],
    unavailable,
  };

  const parsed = ProjectContextSchema.safeParse(context);
  if (!parsed.success) {
    return {
      ok: false,
      reason: `上下文装配不符合契约：${parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('；')}`,
    };
  }
  return { ok: true, context: parsed.data, document };
}
