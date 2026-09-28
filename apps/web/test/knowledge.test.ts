import { describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import {
  buildRetrievalFilter,
  CHUNK_MAX,
  chunkText,
  type Chunk,
  chunksFromCharacter,
  chunksFromGame,
  chunksFromMemory,
  chunksFromStoryboard,
  chunksFromWorld,
  estimateTokens,
} from '../src/server/domain/knowledge';
import { planStoryboard } from '@nexus/video-model';
import { createGame, fleshedOutCount, linkEntities, setStat, updateEntity } from '@nexus/game-model';
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

/**
 * §40 的分镜进 §49 的语料库。切块规则本身（一镜一块、来源句子单独一块）与
 * "notes 不进索引"都在这一格里钉住：notes 是投影对自己的解释，
 * 让它进语料等于让"查分镜"命中一排规则说明书。
 */
describe('chunksFromStoryboard：一镜一块，规则说明书不进语料', () => {
  const sb = planStoryboard('灯塔守夜人擦亮灯芯，雾从海面压过来，猫踩着缆绳跑');
  /** 行 id：库里那一行的主键。sourceId 用它，不用文档里那个可能是 `storyboard-1` 的 id */
  const ROW = 'row-uuid-4f2a';
  const chunks = chunksFromStoryboard(sb, ROW, null);

  it('镜头数决定块数，外加来源句子那一块', () => {
    expect(sb.shots.length).toBe(3);
    expect(chunks).toHaveLength(sb.shots.length + 1);
    const source = chunks.find((c) => c.sourceId === `${ROW}#source`);
    expect(source?.content).toBe(sb.source.prompt);
    expect(source?.title).toBe(`${sb.title} · 来源句子`);
  });

  it('sourceId 认的是库里的行，不是文档自己写的那个 id', () => {
    // `storyboard-1` 是模型给每个新项目那份分镜的默认 id，而 knowledge_chunks 的
    // 唯一约束是全局的 (source_type, source_id, chunk_index)：拿它当键，第二个项目就插不进去
    expect(sb.id).toBe('storyboard-1');
    expect(chunks.every((c) => c.sourceId.startsWith(`${ROW}#`))).toBe(true);
    expect(chunks.some((c) => c.sourceId.includes(sb.id))).toBe(false);
  });

  it('每一块的 sourceId 认得回那一镜，标题写着第几镜', () => {
    for (const [index, shot] of sb.shots.entries()) {
      const chunk = chunks.find((c) => c.sourceId === `${ROW}#shot-${shot.id}`);
      expect(chunk, `第 ${index + 1} 镜没有进索引`).toBeDefined();
      expect(chunk?.sourceType).toBe('storyboard');
      expect(chunk?.title).toBe(`${sb.title} · 第 ${index + 1} 镜`);
      expect(chunk?.content).toContain(shot.prompt);
      // 机位/时长也是分镜内容的一部分：装配方要能检索到"这一镜是航拍"
      expect(chunk?.content).toContain(`机位：${shot.camera}`);
      expect(chunk?.content).toContain(`时长：${shot.durationMs} 毫秒`);
    }
  });

  it('notes 里那句"本地确定性断句"确实存在，但它不在语料里', () => {
    // 前提先钉住：notes 没被改空，否则下面那条"不在索引里"是恒真
    expect(sb.notes.join(' ')).toContain('本地确定性断句');
    expect(chunks.some((c) => c.content.includes('本地确定性断句'))).toBe(false);
    expect(chunks.some((c) => c.content.includes('首镜宽景'))).toBe(false);
  });
});

/**
 * §54 的游戏文档进语料库。这一格的重点在"什么**不**进"：
 * `createGame` 给的是一份 11 类各一个空实体的骨架，骨架进索引等于让 AI 以为这个项目有内容（§159）。
 */
describe('chunksFromGame：填过的实体才进语料，模板骨架一块都不进', () => {
  /** 行 id：库里那一行的主键。sourceId 用它，不用文档自带的那个 `game_…` */
  const ROW = 'row-uuid-9c17';

  /** 一份填了内容的游戏：玩家改名、敌人写说明打标签填数值、敌人追杀玩家 */
  function fleshedGame() {
    let doc = createGame('黑雾港');
    doc = { ...doc, kind: 'interactive-story' as const, summary: '一座被雾封住的港口城，玩家替死人送信。' };
    const player = doc.entities.find((e) => e.kind === 'player')!;
    const enemy = doc.entities.find((e) => e.kind === 'enemy')!;
    doc = updateEntity(doc, player.id, { name: '守夜人' });
    doc = updateEntity(doc, enemy.id, {
      name: '苦痛主教',
      notes: '披着船帆的胖主教，只在钟声里移动。',
      tags: ['boss', '夜间'],
    });
    doc = setStat(doc, enemy.id, 'health', 400).document;
    doc = setStat(doc, enemy.id, 'damage', 12).document;
    doc = linkEntities(doc, enemy.id, player.id, '追杀').document;
    return { doc, player, enemy };
  }
  const ofKind = (chunks: Chunk[], entityId: string) =>
    chunks.find((c) => c.sourceId === `${ROW}#entity-${entityId}`);

  it('模板骨架：11 个空实体、零块语料', () => {
    const skeleton = createGame('还没开始设计');
    // 前提先钉住：骨架真的是"只有名字"，否则下面那条"零块"是恒真
    expect(skeleton.entities).toHaveLength(11);
    expect(
      skeleton.entities.every((e) => !e.notes.trim() && !Object.keys(e.stats).length && !e.tags.length && !e.refs.length),
    ).toBe(true);
    expect(skeleton.summary.trim()).toBe('');
    expect(chunksFromGame(skeleton, ROW, null)).toEqual([]);
  });

  it('填过的实体一块，概述一块；标题写着游戏名与是哪一类', () => {
    const { doc, enemy } = fleshedGame();
    const chunks = chunksFromGame(doc, ROW, null);
    expect(chunks).toHaveLength(2);
    const overview = chunks.find((c) => c.sourceId === `${ROW}#summary`);
    expect(overview?.content).toContain('玩家替死人送信');
    // 类型是这份设计的一部分（§51），它决定走哪条构建管线，所以也得查得到
    expect(overview?.content).toContain('游戏类型：互动故事');
    const boss = ofKind(chunks, enemy.id);
    expect(boss?.sourceType).toBe('game');
    expect(boss?.title).toBe('黑雾港 · 苦痛主教（敌人）');
    expect(boss?.content).toContain('敌人：苦痛主教');
    expect(boss?.content).toContain('披着船帆的胖主教');
    expect(boss?.content).toContain('标签：boss、夜间');
  });

  it('引用写的是目标实体的名字，不是那串内部 id', () => {
    const { doc, player, enemy } = fleshedGame();
    const boss = ofKind(chunksFromGame(doc, ROW, null), enemy.id);
    expect(boss?.content).toContain('追杀 → 守夜人');
    // 装配方读的是块文本：里面出现 ge_xxx 就是噪音，查也查不到
    expect(boss?.content).not.toContain(player.id);
    expect(boss?.content).not.toContain(enemy.id);
  });

  it('数值按 key 排序：同一份设计两次切分出逐字节相同的块', () => {
    // 两份内容相同、只是数值插入顺序相反的设计。除排序外别引入任何差异，
    // 否则这条断言红得没有意义
    const build = (order: ['health', 'damage'] | ['damage', 'health']) => {
      let doc = createGame('黑雾港');
      doc = { ...doc, summary: '一座被雾封住的港口城，玩家替死人送信。' };
      const enemy = doc.entities.find((e) => e.kind === 'enemy')!;
      doc = updateEntity(doc, enemy.id, {
        name: '苦痛主教',
        notes: '披着船帆的胖主教，只在钟声里移动。',
        tags: ['boss', '夜间'],
      });
      for (const key of order) doc = setStat(doc, enemy.id, key, key === 'health' ? 400 : 12).document;
      return { doc, enemy };
    };
    const a = build(['health', 'damage']);
    const b = build(['damage', 'health']);
    const chunkA = ofKind(chunksFromGame(a.doc, ROW, null), a.enemy.id);
    const chunkB = ofKind(chunksFromGame(b.doc, ROW, null), b.enemy.id);
    expect(chunkA?.content).toBe(chunkB?.content);
    expect(chunkA?.content).toContain('damage=12、health=400');
  });

  it('sourceId 认的是库里的行，不是文档自带的那个 id', () => {
    const { doc } = fleshedGame();
    const chunks = chunksFromGame(doc, ROW, null);
    // 文档 id 是 `game_<时间戳>`：跨项目复制一份设计就会带出同一个键，
    // 而 knowledge_chunks 的唯一约束是全局的 (source_type, source_id, chunk_index)
    expect(doc.id.startsWith('game_')).toBe(true);
    expect(chunks.every((c) => c.sourceId.startsWith(`${ROW}#`))).toBe(true);
    expect(chunks.some((c) => c.sourceId.includes(doc.id))).toBe(false);
  });

  it('只打了标签的实体也算有内容——进度条那个判据比这里严', () => {
    let doc = createGame('只有标签');
    const npc = doc.entities.find((e) => e.kind === 'npc')!;
    doc = updateEntity(doc, npc.id, { tags: ['守桥人'] });
    // 两条判据问的不是一个问题：fleshedOutCount 说"设计了吗"，这里问"有东西可查吗"
    expect(fleshedOutCount(doc)).toBe(0);
    const chunks = chunksFromGame(doc, ROW, null);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toContain('标签：守桥人');
  });
});
