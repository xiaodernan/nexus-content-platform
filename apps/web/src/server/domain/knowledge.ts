import { and, asc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { characters, games, knowledgeChunks, memories, storyboards, worlds } from '../db/schema';
import type { CharacterProfile, WorldDocument } from '@nexus/world-model';
import { WORLD_KIND_LABELS, type WorldKind } from '@nexus/world-model';
import type { Storyboard } from '@nexus/video-model';
import { GAME_ENTITY_LABELS, GAME_KIND_LABELS, type GameDocument } from '@nexus/game-model';
import { walk, type DesignDocument } from '@nexus/design-model';

/**
 * §49 RAG 的语料与检索。这一层只做**不需要模型**的那一半：
 *
 * - 切分与入库：世界条目（§44）、角色档案（§46）、四类记忆（§48）、分镜镜头（§40）、
 *   游戏实体（§54）、设计文档正文（§16）→ `knowledge_chunks`；
 * - 混合检索：PostgreSQL 全文（`tsvector`，'simple' 配置）+ 子串命中 + 词覆盖度，
 *   三者做一个**能解释**的确定性融合，结果里带着各项分量返回。
 *
 * 另一半刻意不做，也不假装做了：`embedding` 列在没有 provider 时保持 null，
 * 返回里 `vectorAvailable: false`。§49 写的 "Reranking" 要真模型才谈得上，
 * 这里给的是规则重排（分数 + 时间），不是模型重排。
 *
 * 为什么留子串命中：'simple' 配置的 tsvector 不按词切中文——一整句中文是一个 token，
 * 于是全文检索对中文语料几乎不命中。只报 tsvector 分数会让中文用户以为索引坏了。
 */

export const CHUNK_TARGET = 700;
export const CHUNK_MAX = 1200;

export type KnowledgeSourceType =
  | 'lore'
  | 'history'
  | 'geography'
  | 'factions'
  | 'characters'
  | 'creatures'
  | 'items'
  | 'quests'
  | 'story'
  | 'character'
  | 'memory'
  | 'storyboard'
  | 'game'
  | 'design';

const WORLD_KIND_SOURCE: Record<WorldKind, KnowledgeSourceType> = {
  lore: 'lore',
  history: 'history',
  geography: 'geography',
  factions: 'factions',
  characters: 'characters',
  creatures: 'creatures',
  items: 'items',
  quests: 'quests',
  story: 'story',
};

export const SOURCE_LABELS: Record<KnowledgeSourceType, string> = {
  lore: '传说',
  history: '历史',
  geography: '地理',
  factions: '势力',
  characters: '世界角色条目',
  creatures: '生物',
  items: '物品',
  quests: '任务',
  story: '故事',
  character: '角色档案',
  memory: '记忆',
  storyboard: '分镜',
  game: '游戏',
  design: '设计文档',
};

export interface Chunk {
  sourceType: KnowledgeSourceType;
  sourceId: string;
  chunkIndex: number;
  content: string;
  title: string;
  worldId: string | null;
}

/**
 * 确定性分段：先按空行切段落，段落攒到目标长度就收尾；单段超长才硬切。
 * 不重叠、不随机——同一份内容每次切出同样的块，索引才有"重建一次看差异"的意义。
 */
export function chunkText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  const paragraphs = normalized.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let buffer = '';
  const flush = () => {
    if (buffer.trim()) out.push(buffer.trim());
    buffer = '';
  };
  for (const paragraph of paragraphs) {
    if (!buffer.length) {
      if (paragraph.length <= CHUNK_MAX) {
        buffer = paragraph;
        if (buffer.length >= CHUNK_TARGET) flush();
      } else {
        flush();
        for (let i = 0; i < paragraph.length; i += CHUNK_MAX) out.push(paragraph.slice(i, i + CHUNK_MAX).trim());
      }
      continue;
    }
    if (buffer.length + paragraph.length + 2 <= CHUNK_TARGET) {
      buffer = `${buffer}\n\n${paragraph}`;
    } else {
      flush();
      buffer = paragraph.length <= CHUNK_MAX ? paragraph : '';
      if (paragraph.length > CHUNK_MAX) {
        for (let i = 0; i < paragraph.length; i += CHUNK_MAX) out.push(paragraph.slice(i, i + CHUNK_MAX).trim());
      }
    }
  }
  flush();
  return out;
}

/** 粗估 token 数（约 4 字符一 token，中文偏保守）。列名就叫 tokens，值必须说明是估算 */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4));
}

function sourceOfWorldNode(kind: WorldKind): KnowledgeSourceType {
  return WORLD_KIND_SOURCE[kind] ?? 'lore';
}

export function chunksFromWorld(document: WorldDocument, worldId: string): Chunk[] {
  const out: Chunk[] = [];
  const push = (sourceType: KnowledgeSourceType, sourceId: string, title: string, body: string) => {
    chunkText(body).forEach((content, chunkIndex) => {
      out.push({ sourceType, sourceId, chunkIndex, content, title, worldId });
    });
  };
  push('lore', `${document.id}#summary`, `${document.name} · 概述`, document.summary);
  for (const node of document.nodes) {
    const label = WORLD_KIND_LABELS[node.kind] ?? node.kind;
    push(sourceOfWorldNode(node.kind), node.id, `${label} · ${node.title}`, node.body);
  }
  return out;
}

export function chunksFromCharacter(profile: CharacterProfile, characterId: string, worldId: string | null): Chunk[] {
  const out: Chunk[] = [];
  const sections: [string, string][] = [
    ['外观', profile.appearance],
    // §39 那几栏也得进索引：不然"穿靛蓝斗篷的那个角色"查不到，
    // 档案里存了却检索不中，等于只对界面可见、对 AI 不存在
    ['身份', profile.identity],
    ['穿着', profile.clothing],
    ['画风', profile.style],
    ['特征', profile.traits.join('、')],
    ['性格', profile.personality],
    ['背景故事', profile.backstory],
    ['目标', profile.goals.join('\n')],
    ['恐惧', profile.fears.join('\n')],
    [
      '关系',
      profile.relationships.map((r) => `${r.kind || '关系'} → ${r.target}${r.note ? `（${r.note}）` : ''}`).join('\n'),
    ],
    ['声音', [profile.voice.register, profile.voice.pace, profile.voice.catchphrases.join('、')]
      .filter(Boolean)
      .join('\n')],
    ['视觉标识', [profile.visualIdentity.silhouette, profile.visualIdentity.motifs.join('、'), profile.visualIdentity.palette.join(' ')]
      .filter(Boolean)
      .join('\n')],
  ];
  for (const [label, body] of sections) {
    // 空小节不进索引：检索结果里出现一排"外观：（空）"比查不到更糟
    if (!body.trim()) continue;
    chunkText(`${label}：\n${body}`).forEach((content, chunkIndex) => {
      out.push({
        sourceType: 'character',
        sourceId: `${characterId}#${label}`,
        chunkIndex,
        content,
        title: `${profile.name || '（没有名字）'} · ${label}`,
        worldId,
      });
    });
  }
  return out;
}

/**
 * §40 的分镜进语料库：一镜一块，块里带着机位/转场/时长与来源句子。
 *
 * `notes`（"这一版来自本地确定性断句""首镜宽景尾镜特写"）**刻意不进**——那是投影对自己的解释，
 * 不是故事内容。让它进索引，检索"分镜"就会命中一排规则说明书，比查不到更容易误导装配方。
 *
 * sourceId 用**行 id**（`storyboardId`）而不是文档里那个 id：客户端切完一版分镜手里拿的是
 * 模型给的 `storyboard-1`，每个项目都可能是这一串，而 `knowledge_chunks` 的唯一约束
 * 是全局的 `(source_type, source_id, chunk_index)`——用文档 id 会让第二个项目插不进去。
 */
export function chunksFromStoryboard(document: Storyboard, storyboardId: string, worldId: string | null): Chunk[] {
  const out: Chunk[] = [];
  const title = document.title || '（没有标题）';
  const push = (label: string, sourceId: string, body: string) => {
    chunkText(body).forEach((content, chunkIndex) => {
      out.push({ sourceType: 'storyboard', sourceId, chunkIndex, content, title: `${title} · ${label}`, worldId });
    });
  };
  push('来源句子', `${storyboardId}#source`, document.source.prompt);
  document.shots.forEach((shot, index) => {
    const label = `第 ${index + 1} 镜`;
    push(
      label,
      `${storyboardId}#shot-${shot.id}`,
      [
        shot.prompt,
        `机位：${shot.camera}`,
        `转场：${shot.transition}`,
        `时长：${shot.durationMs} 毫秒`,
        shot.characterId ? `角色：${shot.characterId}` : '',
        shot.referenceAssetId ? `参考图：${shot.referenceAssetId}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  });
  return out;
}

/**
 * §54 的游戏文档进语料库：一个**填过的**实体一块，外加摘要那块。
 *
 * **模板骨架一块都不进**：`createGame` 给的是 11 类各一个空实体（名字就是类名，说明与数值留空）。
 * 那种东西进了索引，查"游戏设计"就命中 11 条"玩家 / 敌人 / 武器…"的空壳，而空壳表达的恰恰是
 * "还没设计"——把它当语料等于让 AI 以为这个项目有内容（§159）。
 * 判据是"这块有没有可检索的文字"（说明/标签/数值/引用任一非空），刻意比进度条用的
 * `fleshedOutCount`（只看说明与数值）宽：一个只打了标签或只连了引用的实体，仍然有东西可查。
 *
 * 两处刻意的写法：
 * - 引用渲染成**目标实体的名字**而不是 id：「装备于 → 守夜人」是查得到的一句话，
 *   「装备于 → ge_mb3k9x」不是（引用两头都在同一份文档里，所以这里能就地解析）。
 * - 数值按 key 排序再拼：对象键的顺序来自客户端，不是来自内容，不排序的话同一份设计
 *   两次切分可能得到不同的块，"重建索引看差异"就没有意义了。
 */
export function chunksFromGame(document: GameDocument, gameId: string, worldId: string | null): Chunk[] {
  const out: Chunk[] = [];
  const name = document.name || '（没有名字）';
  const kindLabel = GAME_KIND_LABELS[document.kind] ?? document.kind;
  const byId = new Map(document.entities.map((e) => [e.id, e]));
  const push = (label: string, sourceId: string, body: string) => {
    chunkText(body).forEach((content, chunkIndex) => {
      out.push({ sourceType: 'game', sourceId, chunkIndex, content, title: `${name} · ${label}`, worldId });
    });
  };
  // 摘要空着就不产生「概述」块：单独一行"游戏类型：2D"不是可检索的内容，只是建档痕迹
  if (document.summary.trim()) {
    push('概述', `${gameId}#summary`, `摘要：\n${document.summary}\n\n游戏类型：${kindLabel}`);
  }
  for (const entity of document.entities) {
    const entityKind = GAME_ENTITY_LABELS[entity.kind] ?? entity.kind;
    const stats = Object.keys(entity.stats)
      .sort()
      .map((key) => `${key}=${entity.stats[key]}`)
      .join('、');
    const refs = entity.refs.map((r) => `${r.role || '引用'} → ${byId.get(r.to)?.name ?? r.to}`).join('\n');
    const body = [
      entity.notes,
      entity.tags.length ? `标签：${entity.tags.join('、')}` : '',
      stats ? `数值：${stats}` : '',
      refs ? `引用：\n${refs}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    if (!body.trim()) continue;
    push(
      `${entity.name || entityKind}（${entityKind}）`,
      `${gameId}#entity-${entity.id}`,
      [`${entityKind}：${entity.name}`, body].join('\n\n'),
    );
  }
  return out;
}

/**
 * §49 清单里最后一格「Documents」：设计文档（§16）的正文进语料库。
 *
 * 一份设计里能被检索的只有**文字**：节点的 `text`。形状、颜色、token 引用是§70 索引的活
 * （它列目录不抄内容，omissions 里明写了"语义检索与相关性排序"不归它），代码块是 §69 的活。
 * 所以这里只吃 `text`，一块 = 一个页面：
 * - 一个文字节点通常只有十几个字，逐节点切块会让 4000 节点的项目产出上千条碎语料，
 *   面板里滚不完，检索时也读不出"这句话在哪页、上下还有什么"；
 * - 按页聚合成一块，行与行仍然带着**节点名**，AI 拿到块能指着名字改对节点。
 *
 * 三条刻意不做的事：
 * - **纯布局/样式节点不产生内容**：一个页面全是空 frame，就没有可检索的文字，
 *   和 §54 那条"空骨架一块都不进"是同一句话（§159：别把建档痕迹当内容）。
 * - **不写 page.meta 的描述与路由**：`pages` 表没有这两列（`writeDocument` 只落 name/尺寸/背景），
 *   把它们切进语料等于索引一份库里没有的东西——下一次从库里重读就变了，块却是查得到的谎话。
 * - **走不到的节点仍然进块**：`designNodes` 存的是 `Object.values(page.nodes)` 全量，
 *   从页面根 BFS 不到的文字真的在文档里，单列一段标出来，不静默丢。
 */
export function chunksFromDesign(document: DesignDocument, projectId: string): Chunk[] {
  const out: Chunk[] = [];
  const docName = document.name || '（没有名字）';
  for (const page of document.pages) {
    const lines: string[] = [];
    const reached = new Set<string>();
    walk(page, (node) => {
      reached.add(node.id);
      const text = typeof node.text === 'string' ? node.text.trim() : '';
      if (text) lines.push(`${node.name || node.type}：${text}`);
    });
    const orphan = Object.values(page.nodes)
      .filter((node) => !reached.has(node.id))
      .map((node) => {
        const text = typeof node.text === 'string' ? node.text.trim() : '';
        return text ? `${node.name || node.type}：${text}（不在页面树里）` : '';
      })
      .filter(Boolean);
    if (!lines.length && !orphan.length) continue;
    const body = [
      `设计文档：${docName}`,
      `页面：${page.name || '（没有名字）'}`,
      '',
      lines.join('\n'),
      orphan.length ? `\n没有接进页面树的节点：\n${orphan.join('\n')}` : '',
    ].join('\n');
    chunkText(body).forEach((content, chunkIndex) => {
      out.push({
        sourceType: 'design',
        sourceId: `${projectId}#page-${page.id}`,
        chunkIndex,
        content,
        title: `${docName} · ${page.name || '（没有名字）'}`,
        worldId: null,
      });
    });
  }
  return out;
}

/**
 * 设计文档自己的同步路径：只换这个项目的 `design` 块，别碰世界/角色/记忆/分镜/游戏那些。
 *
 * 为什么不**只有**这条路：`syncProjectKnowledge(projectId, { includeDesign: true })`
 * 也会重切设计正文，但那是显式「重建索引」按钮与补历史项目索引的代价；设计的写入频率是
 * **每次自动保存**（Studio 里动一下就 PUT），让每次挪一个像素都付一遍全库重切的账是 §147 的纪律。
 * 这条路径因此只碰 `design` 那一类，删除范围正好等于它的重写范围。
 *
 * `document` 由调用方给（PUT 请求里那份就是刚提交的真值），这里不再读库：
 * 读回来要经过 `loadDocument` 那份整档重建，等于把省掉的那一遍加回去。
 */
export async function syncDesignKnowledge(
  projectId: string,
  document: DesignDocument,
): Promise<{ chunks: number }> {
  const db = getDb();
  const chunks = chunksFromDesign(document, projectId);
  await db
    .delete(knowledgeChunks)
    .where(
      and(
        eq(knowledgeChunks.projectId, projectId),
        eq(knowledgeChunks.sourceType, 'design'),
      ),
    );
  for (const part of chunkRows(chunks, projectId)) {
    await db.insert(knowledgeChunks).values(part);
  }
  return { chunks: chunks.length };
}

/** 单条 INSERT 也有参数上限（`writeDocument` 那边量过是 65,535），块行 8 个字段，切到 500 一块插 */
const KNOWLEDGE_INSERT_CHUNK = 500;

function chunkRows(
  chunks: Chunk[],
  projectId: string,
): Array<typeof knowledgeChunks.$inferInsert>[] {
  const rows: Array<typeof knowledgeChunks.$inferInsert> = chunks.map((chunk) => ({
    projectId,
    worldId: chunk.worldId,
    sourceType: chunk.sourceType,
    sourceId: chunk.sourceId,
    chunkIndex: chunk.chunkIndex,
    content: chunk.content,
    tokens: estimateTokens(chunk.content),
    meta: { title: chunk.title, syncedAt: new Date().toISOString() },
  }));
  const out: Array<typeof knowledgeChunks.$inferInsert>[] = [];
  for (let i = 0; i < rows.length; i += KNOWLEDGE_INSERT_CHUNK) out.push(rows.slice(i, i + KNOWLEDGE_INSERT_CHUNK));
  return out;
}

const MEMORY_SCOPE_SOURCE: Record<string, string> = {
  session: '本次会话',
  character: '角色',
  world: '世界',
  user: '我的偏好',
};

export function chunksFromMemory(input: {
  id: string;
  scope: string;
  subjectId: string;
  content: string;
  worldId: string | null;
}): Chunk[] {
  const label = MEMORY_SCOPE_SOURCE[input.scope] ?? input.scope;
  return chunkText(input.content).map((content, chunkIndex) => ({
    sourceType: 'memory' as KnowledgeSourceType,
    sourceId: `${input.id}`,
    chunkIndex,
    content,
    title: `记忆 · ${label}`,
    worldId: input.worldId,
  }));
}

/**
 * 重建这个项目的语料。删掉本项目的 chunk 再按当前文档重切——比"增量对齐"多花一点写代价，
 * 但不会出现"改了却还检索到旧内容"这种最难查的谎。
 *
 * `includeDesign` 是给界面上那颗「重建索引」按钮的（§49 清单最后一格 Documents）：
 * 只有它需要重读整份设计文档，把**这批内容进库之前建好的项目**的设计正文补进索引。
 * 其余写入方（世界/角色/记忆/分镜/游戏各自存一次）默认不带——那不是省一点 CPU 的问题，
 * 而是删除范围必须等于重写范围：不带这个参数时 `design` 那一类根本不被重切，
 * 所以它也不能被删（下面的 `ne`），否则一次世界保存就把设计正文删没了，
 * 而它只有下一次编辑设计才会回来——正是这一片要消灭的那种"查不到了"。
 */
export async function syncProjectKnowledge(
  projectId: string,
  options: { includeDesign?: boolean } = {},
): Promise<{ chunks: number }> {
  const db = getDb();
  // 语料按项目取。「我的偏好」类记忆 project_id 是 null，因此不进任何项目的语料库：
  // §49 的语料清单是 Lore/Characters/History/Locations/Items/Quests/Documents——
  // 用户偏好不在其中，把它混进来会让"这个世界的检索结果"掺进跨项目的私人设定。
  const [worldRows, characterRows, memoryRows, storyboardRows, gameRows, designDocument] = await Promise.all([
    db.select().from(worlds).where(eq(worlds.projectId, projectId)),
    db.select().from(characters).where(eq(characters.projectId, projectId)),
    db.select().from(memories).where(eq(memories.projectId, projectId)),
    db.select().from(storyboards).where(eq(storyboards.projectId, projectId)),
    db.select().from(games).where(eq(games.projectId, projectId)),
    // 只有显式重建才付这一遍整档读取（页面 + 节点 + token + 组件的全部行）。
    // 动态 import 绕开 knowledge ↔ projects 的模块循环：两个方向都只在函数体内用它。
    options.includeDesign
      ? import('./projects').then((m) => m.loadDocument(projectId))
      : Promise.resolve(null),
  ]);

  // 一条项目最多一份世界（v1）；记忆挂在它下面，查一次就够
  const worldId = worldRows[0]?.id ?? null;
  const chunks: Chunk[] = [];
  for (const row of worldRows) {
    const parsed = safeWorld(row.document);
    if (parsed) chunks.push(...chunksFromWorld(parsed, row.id));
  }
  for (const row of characterRows) {
    const parsed = safeProfile(row.profile);
    if (parsed) chunks.push(...chunksFromCharacter(parsed, row.id, row.worldId));
  }
  for (const row of memoryRows) {
    chunks.push(
      ...chunksFromMemory({
        id: row.id,
        scope: row.scope,
        subjectId: row.subjectId,
        content: row.content,
        worldId,
      }),
    );
  }

  for (const row of storyboardRows) {
    const parsed = safeStoryboard(row.document);
    if (parsed) chunks.push(...chunksFromStoryboard(parsed, row.id, worldId));
  }
  for (const row of gameRows) {
    const parsed = safeGame(row.document);
    if (parsed) chunks.push(...chunksFromGame(parsed, row.id, worldId));
  }

  if (designDocument) chunks.push(...chunksFromDesign(designDocument, projectId));

  await db
    .delete(knowledgeChunks)
    .where(
      options.includeDesign
        ? eq(knowledgeChunks.projectId, projectId)
        : and(
            eq(knowledgeChunks.projectId, projectId),
            // 见函数头：不带 `includeDesign` 时这一类不重切，所以也不能删
            ne(knowledgeChunks.sourceType, 'design'),
          ),
    );
  for (const part of chunkRows(chunks, projectId)) {
    await db.insert(knowledgeChunks).values(part);
  }
  return { chunks: chunks.length };
}

function safeWorld(value: unknown): WorldDocument | null {
  try {
    const doc = value as WorldDocument;
    return doc && Array.isArray(doc.nodes) ? doc : null;
  } catch {
    return null;
  }
}

function safeProfile(value: unknown): CharacterProfile | null {
  const profile = value as CharacterProfile | null;
  return profile && typeof profile === 'object' && Array.isArray(profile.goals) ? profile : null;
}

/** 读不出来的那一份不毁掉整个索引：与 safeWorld / safeProfile 同一口径，跳过并在统计里少一块 */
function safeStoryboard(value: unknown): Storyboard | null {
  const doc = value as Storyboard | null;
  return doc && typeof doc === 'object' && Array.isArray(doc.shots) && Array.isArray(doc.notes) ? doc : null;
}

/** 同上：一份读不出来的游戏文档只是少几块语料，不该毁掉整个项目的索引 */
function safeGame(value: unknown): GameDocument | null {
  const doc = value as GameDocument | null;
  return doc && typeof doc === 'object' && Array.isArray(doc.entities) && typeof doc.summary === 'string'
    ? doc
    : null;
}

export interface RetrievedChunk {
  id: string;
  sourceType: KnowledgeSourceType;
  sourceId: string;
  chunkIndex: number;
  title: string;
  snippet: string;
  score: number;
  /** 命中是怎么来的：fulltext = tsvector；substring = 子串包含。两者可以同时出现 */
  matchedBy: ('fulltext' | 'substring')[];
  parts: { fulltext: number; substring: number; coverage: number };
}

export interface RetrieveResult {
  items: RetrievedChunk[];
  /** 没有 provider 就没有向量检索：这里如实返回 false，界面据此说明检索能力的边界 */
  vectorAvailable: boolean;
  reranker: 'deterministic-fusion';
  query: string;
  totalChunks: number;
}

/** 融合权重：全文分数 + 子串命中 + 词覆盖度。都是可解释的加数，没有黑盒 */
const SUBSTRING_WEIGHT = 0.6;
const COVERAGE_WEIGHT = 0.25;

function terms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s,，。；;、]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * 检索的候选集条件。抽成纯函数是为了能在**不连库**的情况下断言生成的 SQL：
 * 这类"把 SQL 片段当成参数绑定"的错只有在真库上跑才会炸，抽出来就能用
 * `.toSQL()` 提前钉住（见 `apps/web/test/knowledge.test.ts`）。
 *
 * 每个条件都必须是**独立的绑定参数**：早前这里把词条拼成一个字符串再塞进
 * 模板，drizzle 会把它当单个参数绑定，生成的 SQL 是 `or $6`，而 $6 是文本——
 * Postgres 直接报 "argument of OR must be type boolean, not type text"。
 * 拼接字符串还等于把用户输入当 SQL，所以这里逐条生成条件再 or 起来。
 */
export function buildRetrievalFilter(projectId: string, query: string) {
  const needles = terms(query);
  const pattern = `%${query.toLowerCase()}%`;
  return and(
    eq(knowledgeChunks.projectId, projectId),
    or(
      sql`${knowledgeChunks.tsv} @@ plainto_tsquery('simple', ${query})`,
      sql`lower(${knowledgeChunks.content}) like ${pattern}`,
      ...needles.map((needle) => sql`lower(${knowledgeChunks.content}) like ${`%${needle}%`}`),
    ),
  );
}

export async function retrieveProjectKnowledge(
  projectId: string,
  rawQuery: string,
  limit = 8,
): Promise<RetrieveResult> {
  const query = rawQuery.trim();
  const db = getDb();
  const counted = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(knowledgeChunks)
    .where(eq(knowledgeChunks.projectId, projectId));
  const empty: RetrieveResult = {
    items: [],
    vectorAvailable: false,
    reranker: 'deterministic-fusion',
    query,
    totalChunks: Number(counted[0]?.count ?? 0),
  };
  if (!query) return empty;

  const needles = terms(query);
  const rows = await db
    .select({
      id: knowledgeChunks.id,
      sourceType: knowledgeChunks.sourceType,
      sourceId: knowledgeChunks.sourceId,
      chunkIndex: knowledgeChunks.chunkIndex,
      content: knowledgeChunks.content,
      meta: knowledgeChunks.meta,
      createdAt: knowledgeChunks.createdAt,
      fulltext: sql<number>`case when ${knowledgeChunks.tsv} @@ plainto_tsquery('simple', ${query})
        then ts_rank(${knowledgeChunks.tsv}, plainto_tsquery('simple', ${query})) else 0 end`,
    })
    .from(knowledgeChunks)
    .where(buildRetrievalFilter(projectId, query))
    .limit(200);

  const scored = rows.map((row) => {
    const haystack = row.content.toLowerCase();
    const substringHit = haystack.includes(query.toLowerCase()) || needles.some((n) => haystack.includes(n));
    const covered = needles.length
      ? needles.filter((n) => haystack.includes(n)).length / needles.length
      : 0;
    const fulltext = Number(row.fulltext ?? 0);
    const parts = {
      fulltext,
      substring: substringHit ? SUBSTRING_WEIGHT : 0,
      coverage: covered * COVERAGE_WEIGHT,
    };
    const matchedBy: ('fulltext' | 'substring')[] = [];
    if (fulltext > 0) matchedBy.push('fulltext');
    if (substringHit) matchedBy.push('substring');
    const title = (row.meta as { title?: string } | null)?.title ?? row.sourceId;
    return {
      id: row.id,
      sourceType: row.sourceType as KnowledgeSourceType,
      sourceId: row.sourceId,
      chunkIndex: row.chunkIndex,
      title,
      snippet: snippetAround(row.content, needles[0] ?? query),
      score: Number((parts.fulltext + parts.substring + parts.coverage).toFixed(4)),
      matchedBy,
      parts,
      createdAt: row.createdAt,
    };
  });

  // 融合分数优先，同分按新近——没有模型重排，就把排序规则写成一句话能说完的东西
  scored.sort((a, b) => b.score - a.score || b.createdAt.getTime() - a.createdAt.getTime());
  const cap = Math.max(1, Math.min(limit, 50));
  return {
    ...empty,
    items: scored.slice(0, cap).map((item) => ({
      id: item.id,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      chunkIndex: item.chunkIndex,
      title: item.title,
      snippet: item.snippet,
      score: item.score,
      matchedBy: item.matchedBy,
      parts: item.parts,
    })),
  };
}

function snippetAround(content: string, needle: string): string {
  const at = needle ? content.toLowerCase().indexOf(needle.toLowerCase()) : -1;
  if (at < 0) return content.slice(0, 220);
  const start = Math.max(0, at - 80);
  const end = Math.min(content.length, at + 160);
  return `${start > 0 ? '…' : ''}${content.slice(start, end)}${end < content.length ? '…' : ''}`;
}

/**
 * 取回一整块语料（§49 的摘录是命中附近的窗口，不是整块正文）。
 *
 * 为什么要单独开这条：上下文与检索面板发的都是 snippet，Agent 真要继续往下改，
 * 需要的是那一块的完整正文与它在来源里的位置。这里只按 (项目, 来源类别, sourceId) 取，
 * 顺序固定（chunkIndex 升序），于是同一个引用每次拿到的都是同一串文本。
 */
export async function readKnowledgeBlock(
  projectId: string,
  sourceType: KnowledgeSourceType,
  sourceId: string,
  maxChunks = 8,
): Promise<{ blocks: { chunkIndex: number; content: string; tokens: number; title: string }[] }> {
  const db = getDb();
  const rows = await db
    .select({
      chunkIndex: knowledgeChunks.chunkIndex,
      content: knowledgeChunks.content,
      tokens: knowledgeChunks.tokens,
      meta: knowledgeChunks.meta,
    })
    .from(knowledgeChunks)
    .where(
      and(
        eq(knowledgeChunks.projectId, projectId),
        eq(knowledgeChunks.sourceType, sourceType),
        eq(knowledgeChunks.sourceId, sourceId),
      ),
    )
    .orderBy(asc(knowledgeChunks.chunkIndex))
    .limit(maxChunks);
  return {
    blocks: rows.map((row) => ({
      chunkIndex: row.chunkIndex,
      content: row.content,
      tokens: row.tokens ?? 0,
      title: typeof (row.meta as { title?: unknown } | null)?.title === 'string'
        ? ((row.meta as { title?: string }).title as string)
        : '',
    })),
  };
}

/** 面板上的总览：各类语料各有多少块，索引是不是空的 */
export async function knowledgeStats(projectId: string): Promise<{
  total: number;
  bySource: Record<string, number>;
  vectorized: number;
}> {
  const db = getDb();
  const rows = await db
    .select({
      sourceType: knowledgeChunks.sourceType,
      count: sql<number>`count(*)::int`,
      vectors: sql<number>`count(${knowledgeChunks.embedding})::int`,
    })
    .from(knowledgeChunks)
    .where(eq(knowledgeChunks.projectId, projectId))
    .groupBy(knowledgeChunks.sourceType);
  const bySource: Record<string, number> = {};
  let total = 0;
  let vectorized = 0;
  for (const row of rows) {
    bySource[row.sourceType] = Number(row.count);
    total += Number(row.count);
    vectorized += Number(row.vectors);
  }
  return { total, bySource, vectorized };
}

/** 删项目时 drizzle 的级联已经处理了 chunk；这里留给同步路径按来源清理 */
export async function deleteChunksBySource(
  projectId: string,
  sourceType: KnowledgeSourceType,
  sourceIds: string[],
): Promise<void> {
  if (!sourceIds.length) return;
  const db = getDb();
  await db
    .delete(knowledgeChunks)
    .where(
      and(
        eq(knowledgeChunks.projectId, projectId),
        eq(knowledgeChunks.sourceType, sourceType),
        inArray(knowledgeChunks.sourceId, sourceIds),
      ),
    );
}
