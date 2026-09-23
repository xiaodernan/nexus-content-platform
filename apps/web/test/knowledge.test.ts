import { describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import {
  buildRetrievalFilter,
  CHUNK_MAX,
  chunkText,
  chunksFromCharacter,
  chunksFromMemory,
  chunksFromWorld,
  estimateTokens,
} from '../src/server/domain/knowledge';
import { knowledgeChunks } from '../src/server/db/schema';
import { createCharacter, createWorld } from '@nexus/world-model';

/**
 * §49 的切分与语料映射。这些是纯函数，所以先在这里把"确定性"钉死：
 * 同一份内容每次切出同样的块，索引才有可核对的意义。
 */

describe('chunkText', () => {
  it('空内容不产生块，也不产生空字符串块', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n\n  \n')).toEqual([]);
  });

  it('短段落合成一块，超过目标长度就分块', () => {
    expect(chunkText('第一段。\n\n第二段。')).toHaveLength(1);
    const long = '王'.repeat(CHUNK_MAX + 250);
    const parts = chunkText(long);
    expect(parts.length).toBe(2);
    expect(parts.join('')).toBe(long);
    expect(parts.every((p) => p.length <= CHUNK_MAX)).toBe(true);
  });

  it('是确定的：同样输入两次切分完全一致，且不重叠地覆盖原文', () => {
    const text = Array.from({ length: 12 }, (_, i) => `第 ${i} 段内容，够长以触发分块。${'字'.repeat(90)}`).join('\n\n');
    const a = chunkText(text);
    const b = chunkText(text);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(1);
    expect(a.join('\n\n').replace(/\s+/g, '')).toBe(text.replace(/\s+/g, ''));
  });
});

describe('语料映射', () => {
  it('世界文档：概述一块，每个有条正文的条目一块，来源类型跟着类走', () => {
    let world = createWorld('低语诸王', 'p-1');
    world = {
      ...world,
      summary: '一个日蚀不停的王国。',
      nodes: world.nodes.map((node) => (node.kind === 'lore' ? { ...node, body: '王城在第七次日蚀下投降。' } : node)),
    };
    const chunks = chunksFromWorld(world, 'world-uuid');
    expect(chunks.some((c) => c.sourceType === 'lore' && c.content.includes('日蚀下投降'))).toBe(true);
    expect(chunks.some((c) => c.sourceType === 'lore' && c.title.includes('概述'))).toBe(true);
    // 空正文的模板条目不该进索引：那会让检索结果里出现一排"还什么都没写"
    expect(chunks.filter((c) => c.content.trim().length === 0)).toEqual([]);
    expect(chunks.every((c) => c.worldId === 'world-uuid')).toBe(true);
    expect(chunks.every((c) => c.chunkIndex >= 0)).toBe(true);
  });

  it('角色档案：按小节切，标题带着角色名，空小节不产生块', () => {
    let character = createCharacter({ name: '守夜人', projectId: 'p-1', worldId: 'w-1' });
    character = {
      ...character,
      profile: {
        ...character.profile,
        personality: '话少，但记得每一条巡逻路。',
        goals: ['看到下一次日出'],
      },
    };
    const chunks = chunksFromCharacter(character.profile, 'chr-1', 'w-1');
    expect(chunks.every((c) => c.sourceType === 'character')).toBe(true);
    expect(chunks.some((c) => c.title === '守夜人 · 性格' && c.content.includes('巡逻路'))).toBe(true);
    expect(chunks.some((c) => c.title === '守夜人 · 目标')).toBe(true);
    // 外观 / 背景 / 恐惧 / 关系 / 声音 / 视觉标识都还是空的
    expect(chunks.map((c) => c.title)).not.toContain('守夜人 · 外观');
  });

  it('记忆：一条一块，标题写着是哪一类', () => {
    const chunks = chunksFromMemory({
      id: 'mem-1',
      scope: 'world',
      subjectId: 'w-1',
      content: '第七次日蚀之后再没有日出。',
      worldId: 'w-1',
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.title).toBe('记忆 · 世界');
    expect(chunks[0]!.sourceId).toBe('mem-1');
  });

  it('tokens 是估算值，并且明确写清这一点', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('')).toBe(1);
    expect(estimateTokens('x'.repeat(400))).toBe(100);
  });
});

/**
 * 检索条件生成的回归护栏。这里**不连库**，只用 drizzle 的 .toSQL() 看渲染结果——
 * 因为这类错的症状是「真库上才炸」，等集成测试跑起来才知道就太晚了。
 *
 * 背景：早前实现把词条拼成 `lower(content) like '%x%' or ...` 一个字符串塞进
 * sql 模板，drizzle 把它当**单个参数**绑定，生成 `or $6`，$6 是文本，
 * Postgres 报 "argument of OR must be type boolean, not type text"。
 * 下面第一条断言就是钉死这件事：参数里不允许出现 SQL 片段。
 */
describe('buildRetrievalFilter 的 SQL 生成', () => {
  // 惰性客户端：只用来渲染 SQL，不发起连接
  const db = drizzle(postgres('postgres://unused:unused@localhost:1/unused', { max: 1 }));
  const render = (query: string) =>
    db
      .select({ id: knowledgeChunks.id })
      .from(knowledgeChunks)
      .where(buildRetrievalFilter('00000000-0000-0000-0000-000000000000', query))
      .toSQL();

  it('每个词条都是独立绑定参数，绝不把 SQL 片段当参数传', () => {
    const { sql, params } = render('盐海 沉船');
    // 关键断言：参数里不能出现 like / or 这类 SQL 片段
    expect(params.filter((p) => typeof p === 'string' && /like|or\s/i.test(p))).toEqual([]);
    // 每个 like 都有自己的占位符
    expect(sql.match(/like \$\d+/g)?.length).toBe(3); // 整句 + 2 个词条
    expect(params).toContain('%盐海%');
    expect(params).toContain('%沉船%');
  });

  it('占位符数量与参数数量一致（drizzle 自洽性）', () => {
    const { sql, params } = render('the seventh eclipse');
    const placeholders = sql.match(/\$\d+/g) ?? [];
    expect(new Set(placeholders).size).toBe(params.length);
  });

  it('中文查询与英文查询都能生成合法条件', () => {
    for (const query of ['盐海', 'eclipse', '盐海 eclipse', '，']) {
      const { sql, params } = render(query);
      expect(sql).toContain('plainto_tsquery');
      expect(params.length).toBeGreaterThan(0);
      expect(params.some((p) => typeof p === 'string' && p.includes('like'))).toBe(false);
    }
  });

  it('项目隔离条件永远在场', () => {
    const { sql, params } = render('盐海');
    expect(sql).toContain('"project_id" = $1');
    expect(params[0]).toBe('00000000-0000-0000-0000-000000000000');
  });
});
