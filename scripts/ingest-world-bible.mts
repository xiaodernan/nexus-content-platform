#!/usr/bin/env node
/**
 * §49 /world-bible RAG bench：把《低语诸王大典》灌进语料库、走真 pgvector 混合检索路径。
 *
 * 跑法：NEXUS_DATABASE_URL=postgres://nexus:nexus_dev_only@localhost:55433/nexus npx tsx scripts/ingest-world-bible.mts
 *
 * 为什么这么干（"RAG 知识的有益方式"的落点）：
 *   - 大典已经写完，锚句中英对齐；但"写出来 ≠ 能被人用系统找到"；
 *   - 本脚本把四章正典正文（`docs/world-bible/*.md` 的 zh 体，en 译本同构但不重复索引）
 *     切块灌进一个专用项目语料，再用 5 个真实查询走真库 `retrieveProjectKnowledge`，
 *     给出可复现的证据：号称"正典"，得先能被人查到。
 *
 * 纪律：
 *   - 只建 throw-away 测试用户 + throw-away 项目（名 `eval-world-bible-<ts>`，id 打印出来
 *     便于用户自行软删除）；
 *   - 不动任何用户项目/生产库语料；
 *   - 报告零 provider 依赖（语料切块 + tsvector 全文检索是 deterministic，向量那半不在本脚本验）。
 */
import { sql as rawSql } from 'drizzle-orm';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createWorld, addWorldNode, type WorldKind } from '../packages/world-model/src';
import { createProject } from '../apps/web/src/server/domain/projects';
import { saveWorld } from '../apps/web/src/server/domain/worlds';
import { syncProjectKnowledge, retrieveProjectKnowledge } from '../apps/web/src/server/domain/knowledge';
import { getDb } from '../apps/web/src/server/db/client';
import { knowledgeChunks, users } from '../apps/web/src/server/db/schema';

if (!process.env.NEXUS_DATABASE_URL) {
  console.error('需要数据库：NEXUS_DATABASE_URL=postgres://nexus:nexus_dev_only@localhost:55433/nexus npx tsx scripts/ingest-world-bible.mts');
  process.exit(1);
}

const BIBLE_DIR = join(process.cwd(), 'docs', 'world-bible');
const KIND_RE = /^\|\s*(lore|history|geography|factions|characters|creatures|items|quests|story)\s*\|\s*(.+?)\s*\|/gm;

const chapters = readdirSync(BIBLE_DIR)
  .filter((f) => f.endsWith('.md') && !f.endsWith('.en.md'))
  .sort();
if (chapters.length === 0) {
  console.error('world-bible 目录没有中文章文件');
  process.exit(1);
}

function chapterTitle(zhFile: string): string {
  // 中文章首行：# 低语诸王 · 世界大典 第N章「标题」
  const first = readFileSync(join(BIBLE_DIR, zhFile), 'utf8').split('\n')[0] ?? '';
  const m = /「(.+?)」/.exec(first);
  return m ? m[1]! : zhFile.replace(/\.md$/, '');
}

function mappingRows(md: string): Array<{ kind: string; title: string }> {
  const out: Array<{ kind: string; title: string }> = [];
  const stripped = md.replace(/\r\n/g, '\n');
  for (const m of stripped.matchAll(KIND_RE)) {
    out.push({ kind: m[1]!, title: m[2]!.trim().slice(0, 120) });
  }
  return out;
}

const chapterMds = chapters.map((file) => ({
  file,
  title: chapterTitle(file),
  markdown: readFileSync(join(BIBLE_DIR, file), 'utf8').replace(/\r\n/g, '\n'),
}));
const totalSections = chapterMds.reduce((a, c) => a + (c.markdown.match(/^## /gm)?.length ?? 0), 0);
const totalAnchors = chapterMds.reduce((a, c) => a + (c.markdown.match(/^\*\*锚句\*\*/gm)?.length ?? 0), 0);
console.log(`read ${chapterMds.length} 章 · ${totalSections} 节 · ${totalAnchors} 锚句`);

// ---- 专用 throw-away 用户与项目 ----
const db = getDb();
const probe = await db.execute(rawSql`select 1 as ok`);
if (!probe) throw new Error('数据库不可用');

const stamp = Date.now();
const [user] = await db
  .insert(users)
  .values({ displayName: 'Bible Canon Bench', email: `bible-canon+${stamp}@nexus.test` })
  .returning({ id: users.id });
if (!user) throw new Error('建语料测试用户失败');
const { id } = await createProject(user.id, { name: `eval-world-bible-${stamp}`, kind: 'website' });

// ---- 世界文档：每章 1 个 story 全篇 + 映射表每行 1 个条目 ----
let world = createWorld('低语诸王 · 世界大典', id);
for (const chapter of chapterMds) {
  world = addWorldNode(world, {
    kind: 'story',
    title: `${chapter.title}·全篇`,
    body: chapter.markdown,
  });
  for (const row of mappingRows(chapter.markdown)) {
    world = addWorldNode(world, {
      kind: row.kind as WorldKind,
      title: row.title,
      body: `（《${chapter.title}》 · 详见该篇全篇条目；映射见章末世界影子表）`,
    });
  }
}
const saved = await saveWorld(id, user.id, {
  ...world,
  nodes: world.nodes,
  summary: '《低语诸王》世界大典机器可读正典——RAG 语料基底（eval）。',
});
if (!saved) throw new Error('saveWorld 失败');

// ---- 灌入语料 + 检索实测 ----
const synced = await syncProjectKnowledge(id);
console.log(`语料 chunks=${synced.chunks}（world ${world.nodes.length} 条目）`);

const probes: Array<{ query: string; needle: string }> = [
  { query: '潮沙盘', needle: '潮沙盘' },
  { query: '会册', needle: '会册' },
  { query: '第八盏灯', needle: '第八盏灯' },
  { query: '雾港灯人', needle: '雾港灯人' },
  { query: '第四十一次会议', needle: '第四十一次会议' },
];
const probeResults = [];
for (const p of probes) {
  const r = await retrieveProjectKnowledge(id, p.query, 5);
  const hit = r.items.some((item) => `${item.title}\n${item.snippet}`.includes(p.needle));
  const top = r.items[0];
  probeResults.push({ query: p.query, hits: r.items.length, kind: null, title: top?.title ?? '(空)', hit, vectorAvailable: r.vectorAvailable });
  console.log(`probe【${p.query}】→ ${r.items.length} 块 · ${hit ? '命中' : '未命中'} · top1=${top?.title ?? '(空)'} · vectorAvailable=${r.vectorAvailable}`);
}
const allHit = probeResults.every((p) => p.hit);
console.log(`probe ${probeResults.filter((p) => p.hit).length}/${probeResults.length} 命中`);

console.log(JSON.stringify({
  projectId: id,
  userId: user.id,
  chapters: chapters.length,
  sections: totalSections,
  anchors: totalAnchors,
  chunks: synced.chunks,
  probes: probeResults,
  allHit,
}, null, 2));
// 走到这一步 DB 连接池还开着——不给 exit 进程永远不退
process.exit(allHit ? 0 : 1);
