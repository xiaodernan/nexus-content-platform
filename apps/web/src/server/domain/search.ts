import { and, asc, desc, eq, ilike, isNull, notInArray, or, sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import { getDb } from '../db/client';
import { hiddenAuthorIds } from './blocks';
import {
  assets,
  characters,
  components,
  designNodes,
  games,
  knowledgeChunks,
  pages,
  projects,
  publishedProjects,
  storyboards,
  users,
  worlds,
  snapshots,
} from '../db/schema';

/**
 * §165 全平台搜索。九类目标各一组：projects / users / worlds / games /
 * characters / designs（页面与画布元素名）/ components / assets / storyboards（分镜）。
 *
 * **匹配方式**：trigram 子串（`ILIKE %q%`，索引见迁移 0008）。中文没有空格分词，
 * `to_tsvector` 的 default / simple 配置都切不出"王城"这种词，所以不硬套全文检索；
 * 子串匹配对中英文一视同仁，代价是没有相关度打分——组内按更新时间排，这点不装。
 *
 * **可见性才是这里的主要工作**，不是查询语法：搜出一条打不开的结果比搜不到更糟。
 * - 项目：你自己的（未删除）**或**有 public 且未被人工拒绝的发布版本；
 * - 用户：有 handle、未注销、不是未认领的 guest——否则 `/u/<handle>` 是空页；
 * - 其余七类都挂在项目里，而 `/studio`、`/world` 与角色/资产路由只认所有权，
 *   所以它们**只搜你自己的项目**。别人的世界条目即使匹配也不列出：
 *   那些内容没有发布链路（§56/§57 发布的是设计文档那一版），列出来就是给访客一个 404。
 *
 * 没搜的部分写在 `SEARCH_NOT_COVERED` 里、界面直接显示，不假装覆盖全平台内容。
 */

export const SEARCH_GROUP_KEYS = [
  'projects',
  'users',
  'worlds',
  'games',
  'characters',
  'designs',
  'components',
  'assets',
  'storyboards',
] as const;

export type SearchGroupKey = (typeof SEARCH_GROUP_KEYS)[number];

export const SEARCH_GROUP_LABELS: Record<SearchGroupKey, string> = {
  projects: '项目',
  users: '用户',
  worlds: '世界',
  games: '游戏',
  characters: '角色',
  designs: '设计稿',
  components: '组件',
  assets: '资产',
  storyboards: '分镜',
};

/** 界面照抄这份清单：搜索没覆盖到的东西要说得出为什么没覆盖 */
export const SEARCH_NOT_COVERED = [
  '世界与游戏条目的正文——存在文档 jsonb 里，子串匹配会连键名一起命中（搜 player 命中每一份模板骨架）',
  '画布节点里的文字内容——同上；按内容找东西请走项目内检索（§49）与上下文装配（§66-71）',
  '资产的文件内容——只搜文件名',
  '相关度只分六档：标题与查询完全一样 > 标题以查询开头 > 标题里有 > 只在简介/摘要/正文里有 > 只在文档正文里有 > 只在语料库里；不看词频、不看词在标题里的位置、不看点击与热度，同分时按更新时间新→旧排',
  '分镜的画面描述走 §49 语料库：那批内容进库之前存下的旧分镜，其描述要等一次保存或点「重建索引」才可搜；分镜标题不依赖语料库，一直可搜',
  '文档正文那一档（snapshots.search_text）只覆盖**快照写下的那一刻**的正文：改了正文但没存快照之前，搜的还是旧正文',
];

/**
 * 排序口径的原话（页面照抄这一句，别自己另编一套说法）。
 *
 * 为什么写在页面上：一个藏起来的序会被读成「平台公认最相关」，
 * 写出来它才只是「我们这套六档排出来的」（与 trending 同一句纪律）。
 *
 * 六档次序：标题与搜索词完全一样 > 标题以搜索词开头 > 标题里有搜索词 > 只在简介/摘要/正文里有 > 只在文档正文里有 > 只在语料库里；
 * 不看词频、不看词在标题里的位置、不看点击与热度，同分时按更新时间新→旧排。
 */
export const SEARCH_ORDER_METHOD =
  '组内按相关度排：标题与搜索词完全一样 > 标题以搜索词开头 > 标题里有搜索词 > 只在简介/摘要/正文里有 > 只在文档正文里有 > 只在语料库里；同分时按更新时间新→旧。';

export interface SearchHit {
  id: string;
  title: string;
  detail: string | null;
  href: string;
}

export interface SearchGroup {
  key: SearchGroupKey;
  label: string;
  hits: SearchHit[];
  /** 这一组被每组上限截断了：界面说"还有更多"，不去数全表谎报总数 */
  capped: boolean;
}

export interface SearchResults {
  q: string;
  /** 少于两个字符不发查询：一个汉字能命中半个平台 */
  tooShort: boolean;
  groups: SearchGroup[];
  signedIn: boolean;
  perGroup: number;
}

/** LIKE 的转义：用户打的 `%` `_` 与 `\` 是字符，不是通配符 */
function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function likeTerm(q: string): string {
  return `%${escapeLike(q)}%`;
}

/**
 * 相关度分（§165 那一格「没有相关度排序」的补上）。
 *
 * 六档，**只看匹配落在哪儿**，不看词频、不看位置、不看点击：
 * 标题与查询完全一样 > 标题以查询开头 > 标题里有查询 > 只在简介/摘要/正文里有 > 只在文档正文里有 > 只在语料库里。
 * （代码里是 6/5/4/3/2/1 六个刻度，刻度本身不对外，只对外那六档的说法。）
 *
 * 为什么不做得更花：那些花招（TF-IDF、向量距离）要么要 provider，要么要一套语料统计；
 * 而这个平台今天最要紧的是**说得清**——一个能被复述出来的六档，比一个藏起来的分有用。
 * 分数算在 SQL 里（`case` + `greatest`），所以**候选集本身就是按相关度排出来的**，
 * 不是先按时间截断再在剩下几条里排（那样「最相关的那条」可能压根没被取到）。
 *
 * 同一档里仍然按更新时间新→旧排（今天的行为保留为**同分时的次序**）。
 *
 * **刻度必须严格递减**：六档说成六档，就得真的有六级分值。
 * 早先这里用 4/3/2/1 四个刻度、详情与正文并列为 1 分——那就不是四档而是三档，
 * 「只在简介里有」与「只在正文里有」会并列，而页面写的是四档（§159：说法与事实要对上）。
 * 现在六档分别是 6/5/4/3/2/1，**每降一档就少一分**，同分只发生在同一档内部。
 *
 * `body` 是可选的「正文命中」布尔表达式（第 5 档：snapshots.search_text；
 * 第 6 档：knowledge_chunks.content）。它由调用方用**关联子查询**算出来，
 * 而不是把 snapshots / knowledge_chunks join 进主查询——那会把结果行按快照数与块数**翻倍**，
 * 一个 10 快照的项目同一个设计稿会出 10 行（§159：搜出来的东西要真能打开、也不能重复十遍）。
 */
function relevanceScore(
  title: SQLWrapper,
  details: SQLWrapper[],
  q: string,
  body?: SQLWrapper,
): SQL<number> {
  const raw = q.toLowerCase();
  const needle = escapeLike(q).toLowerCase();
  const t = sql`lower(${title})`;
  // 标题三档：完全一样(6) > 以查询开头(5) > 标题里有(4)
  const titlePart = sql<number>`case
    when ${t} = ${raw} then 6
    when ${t} like ${needle} || '%' then 5
    when ${t} like '%' || ${needle} || '%' then 4
    else 0 end`;
  // 详情一档（第 4 档）：简介 / 摘要 / 正文列里有(3)
  const detailParts = details.map((column) => {
    const c = sql`lower(${column})`;
    return sql<number>`case when ${c} like '%' || ${needle} || '%' then 3 else 0 end`;
  });
  // 正文一档（第 5 档）：文档正文 / 语料库里有(2)
  const parts: SQL<number>[] = [titlePart, ...detailParts];
  if (body) parts.push(sql<number>`case when ${body} then 2 else 0 end`);
  if (parts.length === 1) return titlePart;
  return sql<number>`greatest(${sql.join(parts, sql`, `)})`;
}

export function normalizeQuery(raw: string | string[] | undefined): string {
  const first = Array.isArray(raw) ? raw[0] : raw;
  return (first ?? '').trim().slice(0, 80);
}

const MIN_QUERY = 2;

type OwnedRow = { id: string; name: string; projectId: string };
type SummarisedRow = OwnedRow & { summary: string | null };
type DescribedRow = OwnedRow & { description: string | null };
type NodeRow = { id: string; name: string; pageId: string; pageName: string; projectId: string };
type StoryboardRow = OwnedRow & { detail: string };

/** 六类内容组的命中行：未登录时一律为空（那些路由只认所有权） */
type ContentRows = {
  worlds: SummarisedRow[];
  games: SummarisedRow[];
  characters: OwnedRow[];
  pages: OwnedRow[];
  nodes: NodeRow[];
  components: DescribedRow[];
  assets: (OwnedRow & { kind: string })[];
  storyboards: StoryboardRow[];
};

const NO_CONTENT: ContentRows = {
  worlds: [],
  games: [],
  characters: [],
  pages: [],
  nodes: [],
  components: [],
  assets: [],
  storyboards: [],
};

async function contentRows(viewerId: string, q: string, term: string, take: number): Promise<ContentRows> {
  const db = getDb();
  const owned = and(eq(projects.ownerId, viewerId), isNull(projects.deletedAt));
  const [
    worlds_,
    games_,
    characters_,
    pages_,
    nodes_,
    components_,
    assets_,
    storyboardTitles_,
    storyboardShots_,
  ] = await Promise.all([
    db
      .select({ id: worlds.id, name: worlds.name, summary: worlds.summary, projectId: projects.id })
      .from(worlds)
      .innerJoin(projects, eq(projects.id, worlds.projectId))
      .where(
        and(
          owned,
          or(
            ilike(worlds.name, term),
            ilike(worlds.summary, term),
            // 第 6 档：这个世界条目组的正文（§49 语料库）里有这个词
            sql`exists (select 1 from ${knowledgeChunks} k where k.project_id = ${projects.id} and k.source_type in ('lore','history','geography','factions','characters','creatures','items','quests','story') and k.content ilike ${term})`,
          ),
        ),
      )
      .orderBy(
        desc(
          relevanceScore(
            worlds.name,
            [worlds.summary],
            q,
            sql`exists (select 1 from ${knowledgeChunks} k where k.project_id = ${projects.id} and k.source_type in ('lore','history','geography','factions','characters','creatures','items','quests','story') and k.content ilike ${term})`,
          ),
        ),
        desc(worlds.updatedAt),
      )
      .limit(take),
    db
      .select({ id: games.id, name: games.name, summary: games.summary, projectId: projects.id })
      .from(games)
      .innerJoin(projects, eq(projects.id, games.projectId))
      .where(
        and(
          owned,
          or(
            ilike(games.name, term),
            ilike(games.summary, term),
            // 第 6 档：这个游戏的条目正文（§49 语料库）里有这个词
            sql`exists (select 1 from ${knowledgeChunks} k where k.project_id = ${projects.id} and k.source_type = 'game' and k.content ilike ${term})`,
          ),
        ),
      )
      .orderBy(
        desc(
          relevanceScore(
            games.name,
            [games.summary],
            q,
            sql`exists (select 1 from ${knowledgeChunks} k where k.project_id = ${projects.id} and k.source_type = 'game' and k.content ilike ${term})`,
          ),
        ),
        desc(games.updatedAt),
      )
      .limit(take),
    db
      .select({ id: characters.id, name: characters.name, projectId: projects.id })
      .from(characters)
      .innerJoin(projects, eq(projects.id, characters.projectId))
      .where(and(owned, ilike(characters.name, term)))
      .orderBy(desc(relevanceScore(characters.name, [], q)), desc(characters.updatedAt))
      .limit(take),
    db
      .select({ id: pages.id, name: pages.name, projectId: pages.projectId })
      .from(pages)
      .innerJoin(projects, eq(projects.id, pages.projectId))
      .where(and(owned, ilike(pages.name, term)))
      .orderBy(desc(relevanceScore(pages.name, [], q)), desc(projects.updatedAt))
      .limit(take),
    db
      .select({
        id: designNodes.id,
        name: designNodes.name,
        pageId: designNodes.pageId,
        pageName: pages.name,
        projectId: pages.projectId,
      })
      .from(designNodes)
      .innerJoin(pages, eq(pages.id, designNodes.pageId))
      .innerJoin(projects, eq(projects.id, pages.projectId))
      .where(
        and(
          owned,
          or(
            ilike(designNodes.name, term),
            // 第 5 档：这个项目的快照正文里有这个词（关联子查询，不是 join）
            sql`exists (select 1 from ${snapshots} s where s.project_id = ${projects.id} and s.search_text ilike ${term})`,
          ),
        ),
      )
      .orderBy(
        desc(
          relevanceScore(
            designNodes.name,
            [],
            q,
            sql`exists (select 1 from ${snapshots} s where s.project_id = ${projects.id} and s.search_text ilike ${term})`,
          ),
        ),
        desc(designNodes.updatedAt),
      )
      .limit(take),
    db
      .select({
        id: components.id,
        name: components.name,
        description: components.description,
        projectId: components.projectId,
      })
      .from(components)
      .innerJoin(projects, eq(projects.id, components.projectId))
      .where(and(owned, or(ilike(components.name, term), ilike(components.description, term))))
      .orderBy(desc(relevanceScore(components.name, [components.description], q)), desc(components.updatedAt))
      .limit(take),
    db
      .select({ id: assets.id, name: assets.name, kind: assets.kind, projectId: projects.id })
      .from(assets)
      .innerJoin(projects, eq(projects.id, assets.projectId))
      .where(and(owned, ilike(assets.name, term)))
      .orderBy(desc(relevanceScore(assets.name, [], q)), desc(assets.createdAt))
      .limit(take),
    // 分镜那一组有两个来源。① 标题直接查 `storyboards` 表：这条不依赖语料库，
    // 永远可搜——语料库是后来加的，那之前存下的分镜没有块。
    db
      .select({ id: storyboards.id, name: storyboards.title, projectId: projects.id })
      .from(storyboards)
      .innerJoin(projects, eq(projects.id, storyboards.projectId))
      .where(and(owned, ilike(storyboards.title, term)))
      .orderBy(desc(relevanceScore(storyboards.title, [], q)), desc(storyboards.updatedAt))
      .limit(take),
    // ② 画面描述查 §49 的语料块：那份文本本来就是为检索切的（`notes` 那条断句规则不在块里，
    // 所以搜"分镜"不会命中规则说明书）。join 回 `storyboards` 而不是直接用 chunk.projectId，
    // 是为了让一条孤儿块（分镜已删、块还没重建）变不成一个点开就 404 的结果。
    db
      .select({
        id: storyboards.id,
        name: storyboards.title,
        projectId: projects.id,
        detail: sql<string>`coalesce(${knowledgeChunks.meta} ->> 'title', '分镜镜头')`,
      })
      .from(knowledgeChunks)
      // 分镜的块认的是 `${行id}#shot-…` / `${行id}#source`（§49 那一片的 sourceId 形状），
      // 不是裸的行 id——等值 join 一条都匹配不上，而这条路会安静地搜不到任何画面描述。
      .innerJoin(storyboards, sql`${knowledgeChunks.sourceId} like ${storyboards.id}::text || '#%'`)
      .innerJoin(projects, eq(projects.id, storyboards.projectId))
      .where(and(eq(knowledgeChunks.sourceType, 'storyboard'), owned, ilike(knowledgeChunks.content, term)))
      .orderBy(
        desc(relevanceScore(storyboards.title, [knowledgeChunks.content], q)),
        asc(knowledgeChunks.sourceId),
        asc(knowledgeChunks.chunkIndex),
      )
      .limit(take),
  ]);

  const storyboardHits = new Map<string, StoryboardRow>();
  for (const row of storyboardTitles_) {
    storyboardHits.set(row.id, { ...row, detail: '分镜标题' });
  }
  for (const row of storyboardShots_) {
    if (!storyboardHits.has(row.id)) storyboardHits.set(row.id, row);
  }

  return {
    worlds: worlds_,
    games: games_,
    characters: characters_,
    pages: pages_,
    nodes: nodes_,
    components: components_,
    assets: assets_,
    storyboards: [...storyboardHits.values()],
  };
}

export async function searchPlatform(
  raw: string | string[] | undefined,
  viewerId: string | null,
  perGroup = 8,
): Promise<SearchResults> {
  const q = normalizeQuery(raw);
  const limit = Math.min(Math.max(Math.trunc(perGroup), 1), 25);
  const shell = { q, signedIn: Boolean(viewerId), perGroup: limit };
  const blank = SEARCH_GROUP_KEYS.map((key) => ({ key, label: SEARCH_GROUP_LABELS[key], hits: [], capped: false }));
  if (q.length < MIN_QUERY) return { ...shell, tooShort: true, groups: blank };

  const term = likeTerm(q);
  const db = getDb();
  // 每组多取一条：只为了知道"还有更多"，不数全表
  const take = limit + 1;
  // §132：我屏蔽或拉黑过的人不再冒进结果里。搜不到自己选择不看的东西，
  // 和搜不到不存在的东西，对使用者来说是同一件好事——但名单只按查看者算，不改公共记录
  const hidden = await hiddenAuthorIds(viewerId);

  // —— 项目：公开在跑的那些 + 你自己的（自己的那条链接指向编辑器，公开的指向发布页）——
  const publicOnes = await db
    .select({ id: projects.id, name: projects.name, description: projects.description, path: publishedProjects.path })
    .from(publishedProjects)
    .innerJoin(projects, eq(projects.id, publishedProjects.projectId))
    .where(
      and(
        eq(publishedProjects.visibility, 'public'),
        sql`${publishedProjects.moderation} <> 'rejected'`,
        isNull(projects.deletedAt),
        or(ilike(projects.name, term), ilike(projects.description, term)),
        hidden.length ? notInArray(projects.ownerId, hidden) : undefined,
      ),
    )
    .orderBy(desc(relevanceScore(projects.name, [projects.description], q)), desc(projects.updatedAt))
    .limit(take);
  const myOnes = viewerId
    ? await db
        .select({ id: projects.id, name: projects.name, description: projects.description })
        .from(projects)
        .where(
          and(
            eq(projects.ownerId, viewerId),
            isNull(projects.deletedAt),
            or(ilike(projects.name, term), ilike(projects.description, term)),
          ),
        )
        .orderBy(desc(relevanceScore(projects.name, [projects.description], q)), desc(projects.updatedAt))
        .limit(take)
    : [];
  const projectHits = new Map<string, SearchHit>();
  for (const r of publicOnes) projectHits.set(r.id, { id: r.id, title: r.name, detail: r.description, href: r.path });
  for (const r of myOnes) projectHits.set(r.id, { id: r.id, title: r.name, detail: r.description, href: `/studio/${r.id}` });

  // —— 用户：只列有公开主页的那些 ——
  const userOnes = await db
    .select({ id: users.id, handle: users.handle, displayName: users.displayName, bio: users.bio })
    .from(users)
    .where(
      and(
        isNull(users.deletedAt),
        eq(users.guest, false),
        sql`${users.handle} is not null`,
        or(ilike(users.displayName, term), ilike(users.handle, term)),
        hidden.length ? notInArray(users.id, hidden) : undefined,
      ),
    )
    .orderBy(desc(relevanceScore(users.displayName, [users.handle], q)), asc(users.handle))
    .limit(take);

  const content = viewerId ? await contentRows(viewerId, q, term, take) : NO_CONTENT;
  const studio = (projectId: string) => `/studio/${projectId}`;

  const groups: Record<SearchGroupKey, SearchGroup> = {
    projects: {
      key: 'projects',
      label: SEARCH_GROUP_LABELS.projects,
      hits: [...projectHits.values()].slice(0, limit),
      capped: projectHits.size > limit,
    },
    users: {
      key: 'users',
      label: SEARCH_GROUP_LABELS.users,
      hits: userOnes.slice(0, limit).map((r) => ({
        id: r.id,
        title: r.displayName,
        detail: r.bio ?? `/u/${r.handle}`,
        href: `/u/${r.handle}`,
      })),
      capped: userOnes.length > limit,
    },
    worlds: {
      key: 'worlds',
      label: SEARCH_GROUP_LABELS.worlds,
      hits: content.worlds.slice(0, limit).map((r) => ({ id: r.id, title: r.name, detail: r.summary, href: `/world/${r.projectId}` })),
      capped: content.worlds.length > limit,
    },
    games: {
      key: 'games',
      label: SEARCH_GROUP_LABELS.games,
      hits: content.games.slice(0, limit).map((r) => ({ id: r.id, title: r.name, detail: r.summary, href: studio(r.projectId) })),
      capped: content.games.length > limit,
    },
    characters: {
      key: 'characters',
      label: SEARCH_GROUP_LABELS.characters,
      hits: content.characters.slice(0, limit).map((r) => ({ id: r.id, title: r.name, detail: null, href: studio(r.projectId) })),
      capped: content.characters.length > limit,
    },
    designs: {
      key: 'designs',
      label: SEARCH_GROUP_LABELS.designs,
      hits: [
        ...content.pages.map((r) => ({ id: `page:${r.id}`, title: r.name, detail: '页面', href: studio(r.projectId) })),
        ...content.nodes.map((r) => ({
          id: `node:${r.pageId}:${r.id}`,
          title: r.name,
          detail: `画布元素 · 页面「${r.pageName}」`,
          href: studio(r.projectId),
        })),
      ].slice(0, limit),
      capped: content.pages.length + content.nodes.length > limit,
    },
    components: {
      key: 'components',
      label: SEARCH_GROUP_LABELS.components,
      hits: content.components
        .slice(0, limit)
        .map((r) => ({ id: r.id, title: r.name, detail: r.description, href: studio(r.projectId) })),
      capped: content.components.length > limit,
    },
    assets: {
      key: 'assets',
      label: SEARCH_GROUP_LABELS.assets,
      hits: content.assets.slice(0, limit).map((r) => ({ id: r.id, title: r.name, detail: r.kind, href: studio(r.projectId) })),
      capped: content.assets.length > limit,
    },
    storyboards: {
      key: 'storyboards',
      label: SEARCH_GROUP_LABELS.storyboards,
      hits: content.storyboards
        .slice(0, limit)
        .map((r) => ({ id: r.id, title: r.name, detail: r.detail, href: studio(r.projectId) })),
      capped: content.storyboards.length > limit,
    },
  };

  return { ...shell, tooShort: false, groups: SEARCH_GROUP_KEYS.map((key) => groups[key]) };
}
