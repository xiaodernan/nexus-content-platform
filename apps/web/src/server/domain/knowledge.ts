import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { characters, knowledgeChunks, memories, worlds } from '../db/schema';
import type { CharacterProfile, WorldDocument } from '@nexus/world-model';
import { WORLD_KIND_LABELS, type WorldKind } from '@nexus/world-model';

/**
 * §49 RAG 的语料与检索。这一层只做**不需要模型**的那一半：
 *
 * - 切分与入库：世界条目（§44）、角色档案（§46）、四类记忆（§48）→ `knowledge_chunks`；
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
  | 'memory';

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
  const [worldRows, characterRows, memoryRows] = await Promise.all([
    db.select().from(worlds).where(eq(worlds.projectId, projectId)),
    db.select().from(characters).where(eq(characters.projectId, projectId)),
    db.select().from(memories).where(eq(memories.projectId, projectId)),
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
