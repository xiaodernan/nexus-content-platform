import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { characters, games, knowledgeChunks, memories, storyboards, worlds } from '../db/schema';
import type { CharacterProfile, WorldDocument } from '@nexus/world-model';
import { WORLD_KIND_LABELS, type WorldKind } from '@nexus/world-model';
import type { Storyboard } from '@nexus/video-model';
import { GAME_ENTITY_LABELS, GAME_KIND_LABELS, type GameDocument } from '@nexus/game-model';

/**
 * §49 RAG 的语料与检索。这一层只做**不需要模型**的那一半：
 *
 * - 切分与入库：世界条目（§44）、角色档案（§46）、四类记忆（§48）、分镜镜头（§40）、
 *   游戏实体（§54）→ `knowledge_chunks`；
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
  | 'game';

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
 * 重建这个项目的全部语料。删掉本项目的所有 chunk 再按当前文档重切——
 * 比"增量对齐"多花一点写代价，但不会出现"改了却还检索到旧内容"这种最难查的谎。
 */
export async function syncProjectKnowledge(projectId: string): Promise<{ chunks: number }> {
  const db = getDb();
  // 语料按项目取。「我的偏好」类记忆 project_id 是 null，因此不进任何项目的语料库：
  // §49 的语料清单是 Lore/Characters/History/Locations/Items/Quests/Documents——
  // 用户偏好不在其中，把它混进来会让"这个世界的检索结果"掺进跨项目的私人设定。
  const [worldRows, characterRows, memoryRows, storyboardRows, gameRows] = await Promise.all([
    db.select().from(worlds).where(eq(worlds.projectId, projectId)),
    db.select().from(characters).where(eq(characters.projectId, projectId)),
    db.select().from(memories).where(eq(memories.projectId, projectId)),
    db.select().from(storyboards).where(eq(storyboards.projectId, projectId)),
    db.select().from(games).where(eq(games.projectId, projectId)),
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

  await db.delete(knowledgeChunks).where(eq(knowledgeChunks.projectId, projectId));
  if (chunks.length) {
    await db.insert(knowledgeChunks).values(
      chunks.map((chunk) => ({
        projectId,
        worldId: chunk.worldId,
        sourceType: chunk.sourceType,
        sourceId: chunk.sourceId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        tokens: estimateTokens(chunk.content),
        meta: { title: chunk.title, syncedAt: new Date().toISOString() },
      })),
    );
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
