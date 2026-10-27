import { and, eq, like, sql as rawSql } from 'drizzle-orm';
import {
  analyzeHealth,
  applyPatch,
  codeToPageOps,
  createDocument,
  createNode,
  createPage,
  generatePageComponent,
  type DesignDocument,
  type DesignPatch,
} from '../packages/design-model/src';
import { addWorldNode, createWorld } from '../packages/world-model/src';
import { AiResponseSchema, type AiRequest } from '../packages/schemas/src';
import { mockProvider } from '../apps/web/src/server/ai/mock';
import { createProject } from '../apps/web/src/server/domain/projects';
import { saveWorld } from '../apps/web/src/server/domain/worlds';
import { createProjectCharacter, updateCharacterProfile } from '../apps/web/src/server/domain/characters';
import { addMemory } from '../apps/web/src/server/domain/memories';
import { retrieveProjectKnowledge, syncProjectKnowledge } from '../apps/web/src/server/domain/knowledge';
import { getDb } from '../apps/web/src/server/db/client';
import { knowledgeChunks, projects, users } from '../apps/web/src/server/db/schema';
import { synthesizeDemoImage } from '../apps/web/src/server/domain/image-synth';
import { decodePngPixels, extractVisualDna } from '../apps/web/src/server/domain/visualDna';
import { hueOfHex } from '../apps/web/src/server/domain/image-studio';
import { compareVisuals } from '../apps/web/src/server/domain/visualBenchmark';
import {
  hitAtK,
  mean,
  missingPatchReferences,
  rankOfId,
  reciprocalRank,
} from '../apps/web/src/server/domain/evaluation';

/**
 * §85 Evaluation 第一切片：确定性评估基线。
 *
 * 跑法：`NEXUS_DATABASE_URL=postgres://nexus:nexus_dev_only@localhost:55100/nexus npx tsx scripts/eval-baseline.mts`
 *
 * 九个评测维度里，这里只测**本机不靠模型就能测**的，并且每一项都跑生产真路径：
 * - RAG accuracy：fixture 语料走真库索引（syncProjectKnowledge）与真检索（retrieveProjectKnowledge），
 *   读 recall@5 / MRR；向量的那一半没有 embedding provider，如实 notMeasured。
 * - Design accuracy / Hallucination 代理：DEMO 规则 provider 的补丁 ① 能通过响应契约 ② 引用的
 *   id 全部存在于它看到的文档里（捏造引用 = 幻觉）③ applyPatch 零 skipped。
 * - Code correctness：补丁后的文档 codegen → code-parse 往返零补丁零 issues（§165 的机器）。
 * - Visual quality（确定性半边）：① §86 自比颜色分恒为 1；② §38 锚点链——变体像素里
 *   锚点色相的质量必须高于反事实锚点（+0.5）的变体，谁改坏"锚点→像素"那条链这条就翻红
 *   （锚点也在身份哈希里，调色板/布局的相似度受哈希运气支配，不配当不变式）。
 * - Accessibility：analyzeHealth 对注入的四类违规（对比度/alt/按钮可访问名称/点击目标）的检出率。
 *
 * 不断言任何阈值，只报告读数；但**结构不变式**（往返必须干净、引用必须完整、检出必须 4/4、
 * 变体颜色分必须高于无关图）失败时以非零码退出——那是回归，不是"数字难看"。
 * Performance 维度不在这里复测，指向 docs/PERFORMANCE.md。
 */

if (!process.env.NEXUS_DATABASE_URL) {
  console.error('需要显式指定数据库：NEXUS_DATABASE_URL=postgres://nexus:nexus_dev_only@localhost:55100/nexus npx tsx scripts/eval-baseline.mts');
  process.exit(1);
}

const failures: string[] = [];
const check = (name: string, ok: boolean, detail: string): void => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
  if (!ok) failures.push(name);
};

// ---------------------------------------------------------------- RAG accuracy

interface RagCase {
  query: string;
  needle: string;
  kind: string;
  /** 负对照：语料里就不该有这块，rank 必须是 0 */
  negative?: boolean;
}

const RAG_CASES: RagCase[] = [
  { query: '日蚀', needle: '第七次日蚀', kind: 'lore(中)' },
  { query: 'seventh eclipse', needle: 'seventh eclipse', kind: 'lore(英·全文)' },
  { query: '盐海 沉船', needle: '沉船的路标', kind: 'geography(多词)' },
  { query: '雾港 灯人', needle: '三百盏灯', kind: 'lore(多词)' },
  { query: '巡逻路', needle: '不存在的那条', kind: 'character' },
  { query: '打翻的镜子', needle: '打翻的镜子', kind: 'memory' },
  { query: '会说话的月亮桥', needle: '会说话的月亮桥', kind: '负对照', negative: true },
];

async function evalRag(userId: string): Promise<void> {
  console.log('\n== RAG accuracy（词面检索 · 真库真索引） ==');
  const { id } = await createProject(userId, { name: `eval-rag-${Date.now()}`, kind: 'website' });

  const world = createWorld('低语诸王', id);
  // createWorld 每个 kind 只给一条：模板的 lore 填日蚀编年史，
  // 雾港灯人是 addWorldNode 追加的第二条 lore（正文各带唯一锚句）
  const lore = world.nodes.find((n) => n.kind === 'lore')!;
  const geo = world.nodes.find((n) => n.kind === 'geography')!;
  const withSecondLore = addWorldNode(world, {
    kind: 'lore',
    title: '雾港灯人',
    body: '雾港的灯人每晚点亮三百盏灯，等一支从不回航的船队。',
  });
  const seeded = withSecondLore.nodes.map((node) => {
    if (node.id === lore.id) {
      return { ...node, title: '日蚀编年史', body: '王城在第七次日蚀下投降。The city fell during the seventh eclipse.' };
    }
    if (node.id === geo.id) {
      return { ...node, title: '盐海', body: '盐海没有鱼，只有沉船的路标。' };
    }
    return node;
  });
  const saved = await saveWorld(id, userId, { ...world, nodes: seeded, summary: '一个日蚀不停的王国。' });
  if (!saved.ok) throw new Error(`saveWorld: ${saved.reason}`);

  const created = await createProjectCharacter(id, userId, { name: '守夜人' });
  if (!created.ok) throw new Error(`createProjectCharacter: ${created.reason}`);
  const updated = await updateCharacterProfile(created.character.id, id, {
    ...created.character.profile,
    name: '守夜人',
    personality: '她记得每一条巡逻路，包括不存在的那条。',
  });
  if (!updated.ok) throw new Error(`updateCharacterProfile: ${updated.reason}`);

  const memory = await addMemory({
    ownerId: userId,
    projectId: id,
    scope: 'world',
    subjectId: saved.document.id,
    content: '盐海其实是一片打翻的镜子。',
  });
  if (!memory.ok) throw new Error('addMemory 失败');

  const synced = await syncProjectKnowledge(id);
  const db = getDb();
  const stats = await retrieveProjectKnowledge(id, '盐海');

  console.log(`  语料 ${synced.chunks} 块（world ${seeded.length} 条目 + 角色 + 记忆），检索 limit=${stats.items.length ? 8 : 8}`);

  // 锚句唯一性是这份评测的地基：语料里必须恰好一块含锚句（负对照恰好 0 块）
  for (const c of RAG_CASES) {
    const hits = await db
      .select({ id: knowledgeChunks.id })
      .from(knowledgeChunks)
      .where(and(eq(knowledgeChunks.projectId, id), like(knowledgeChunks.content, `%${c.needle}%`)));
    const want = c.negative ? 0 : 1;
    if (hits.length !== want) {
      failures.push(`锚句唯一性: ${c.needle}`);
      console.log(`  FAIL  锚句「${c.needle}」在语料中出现 ${hits.length} 次，预期 ${want} —— 本 case 作废记 0 分`);
    }
  }

  const ranks: number[] = [];
  for (const c of RAG_CASES) {
    const result = await retrieveProjectKnowledge(id, c.query, 8);
    const expectedId = c.negative
      ? ''
      : (await db
          .select({ id: knowledgeChunks.id })
          .from(knowledgeChunks)
          .where(and(eq(knowledgeChunks.projectId, id), like(knowledgeChunks.content, `%${c.needle}%`)))
        )[0]?.id ?? '';
    const rank = expectedId ? rankOfId(expectedId, result.items.map((i) => i.id)) : 0;
    ranks.push(rank);
    console.log(`  [${c.kind}] 「${c.query}」→ rank ${rank || '—'}（top1: ${result.items[0]?.title ?? '空'}）`);
  }
  const positive = RAG_CASES.map((c, i) => ({ c, rank: ranks[i]! })).filter((x) => !x.c.negative);
  const recall5 = mean(positive.map((x) => (hitAtK(x.rank, 5) ? 1 : 0)));
  const mrr = mean(RAG_CASES.map((_, i) => reciprocalRank(ranks[i]!)));
  const negativeRank = ranks[RAG_CASES.findIndex((c) => c.negative)]!;
  console.log(`  recall@5 = ${(recall5 * 100).toFixed(0)}%（正例 ${positive.length} 条）· MRR = ${mrr.toFixed(3)}（含负对照）`);
  check('RAG 负对照：不存在的锚句不返回任何块', negativeRank === 0, `rank=${negativeRank}`);
  check('RAG recall@5 全中（6/6 正例进前 5）', recall5 === 1, `recall@5=${recall5}`);
  console.log('  notMeasured: 向量检索/模型重排——embedding provider 未接入（#110）');
}

// --------------------------------------------- Design accuracy + 幻觉代理 + 往返

function fixtureDocument(): DesignDocument {
  const document = createDocument('评测样板', 'website');
  const page = createPage('Home');
  document.pages = [page];
  document.activePageId = page.id;
  const banner = createNode({
    type: 'container',
    name: '首屏横幅',
    parentId: page.rootId,
    size: { width: 960, height: 320 },
  });
  const bannerText = createNode({
    type: 'text',
    name: '主标题',
    parentId: banner.id,
    text: '把想法变成作品',
  });
  const footer = createNode({
    type: 'container',
    name: '页脚',
    parentId: page.rootId,
    size: { width: 960, height: 64 },
  });
  const footerText = createNode({
    type: 'text',
    name: '页脚文案',
    parentId: footer.id,
    text: '© 评测样板',
  });
  page.nodes[banner.id] = banner;
  page.nodes[bannerText.id] = bannerText;
  page.nodes[footer.id] = footer;
  page.nodes[footerText.id] = footerText;
  page.nodes[page.rootId]!.children = [banner.id, footer.id];
  banner.children = [bannerText.id];
  footer.children = [footerText.id];
  return document;
}

function aiRequest(prompt: string, document: DesignDocument, selection: string[]): AiRequest {
  return {
    requestId: `eval-${Date.now()}`,
    intent: 'design-edit',
    prompt,
    modelClass: 'balanced',
    variants: 1,
    references: [],
    approvalPolicy: [],
    dryRun: false,
    context: {
      projectId: 'eval',
      pageId: document.activePageId,
      selection,
      designSystemDigest: {
        tokens: document.tokens.map((t) => ({ key: t.key, type: t.type, value: t.value })),
        components: [],
      },
      recentChanges: [],
      document: document as unknown as Record<string, unknown>,
    },
  };
}

function roundtrip(document: DesignDocument): { ops: number; issues: number } {
  const page = document.pages[0]!;
  const code = generatePageComponent(page, { cssVarPrefix: 'nx' }, 'Home').contents;
  const parsed = codeToPageOps(code, page, { cssVarPrefix: 'nx', tokens: document.tokens });
  return { ops: parsed.ops.length, issues: parsed.issues.length };
}

async function evalDesignAccuracy(): Promise<void> {
  console.log('\n== Design accuracy / Hallucination 代理 / Code 往返（DEMO 规则 provider） ==');
  let document = fixtureDocument();
  const bannerId = document.pages[0]!.nodes;
  const banner = Object.values(bannerId).find((n) => n.name === '首屏横幅')!;
  const footer = Object.values(bannerId).find((n) => n.name === '页脚')!;

  const prompts: Array<{ prompt: string; selection: string[] }> = [
    { prompt: '把首屏加高 50%', selection: [banner.id] },
    { prompt: 'make it cinematic', selection: [] },
    { prompt: '优化移动端布局', selection: [] },
    { prompt: '删除页脚这一块', selection: [footer.id] },
    { prompt: '加一个定价区块', selection: [] },
    { prompt: '检查这份设计的无障碍问题', selection: [] },
  ];

  let totalPatches = 0;
  let appliedClean = 0;
  let opSkips = 0;
  let refViolations = 0;
  let contractViolations = 0;
  let roundtrips = 0;
  let cleanRoundtrips = 0;

  for (const { prompt, selection } of prompts) {
    const response = await mockProvider.run(aiRequest(prompt, document, selection));
    if (!AiResponseSchema.safeParse(response).success) contractViolations += 1;
    // wire 契约里的补丁是 payload 形状（node 是宽松 Record）；DEMO 这边的 node 其实都是
    // createNode 的真节点。应用侧桥接同 api-tokens.ts:408 的先例，边界 cast 一次。
    const patches = response.patches as unknown as DesignPatch[];

    const missing = missingPatchReferences(patches, document);
    refViolations += missing.length;
    if (missing.length) {
      console.log(`  FAIL  「${prompt}」捏造引用: ${missing.join(', ')}`);
    }

    let touched = false;
    for (const patch of patches) {
      totalPatches += 1;
      try {
        const result = applyPatch(document, patch);
        opSkips += result.skipped.length;
        for (const skip of result.skipped) {
          console.log(`  FAIL  「${prompt}」op#${skip.index} 被 skip: ${skip.reason}`);
        }
        if (result.skipped.length === 0) appliedClean += 1;
        document = result.document;
        touched = true;
      } catch (error) {
        opSkips += 1;
        console.log(`  FAIL  「${prompt}」applyPatch 抛出: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (touched) {
      roundtrips += 1;
      const r = roundtrip(document);
      if (r.ops === 0 && r.issues === 0) cleanRoundtrips += 1;
      else console.log(`  FAIL  「${prompt}」后往返不干净: ops=${r.ops} issues=${r.issues}`);
    }
    console.log(`  「${prompt}」→ ${patches.length} 个补丁 · ${response.labels.join('，')}`);
  }

  console.log(`  补丁 ${appliedClean}/${totalPatches} 零 skip · 引用违规 ${refViolations} · 契约违规 ${contractViolations} · 往返干净 ${cleanRoundtrips}/${roundtrips}`);
  check('补丁引用完整性（无捏造 id = 无幻觉引用）', refViolations === 0, `violations=${refViolations}`);
  check('补丁应用零 skip', opSkips === 0 && appliedClean === totalPatches, `${appliedClean}/${totalPatches}, skips=${opSkips}`);
  check('响应契约全部通过', contractViolations === 0, `violations=${contractViolations}`);
  check('补丁后 codegen→parse 往返干净', cleanRoundtrips === roundtrips && roundtrips > 0, `${cleanRoundtrips}/${roundtrips}`);
  console.log('  notMeasured: 真实 LLM provider 的同批指标（provider 未接入）；Tool selection / Agent task completion 需真 agent 循环');
}

// ------------------------------------------------------- Visual（确定性半边）

function evalVisual(): void {
  console.log('\n== Visual quality（确定性半边 · §86 指标 × DEMO 合成链） ==');
  const base = { prompt: '黄昏的灯塔', width: 256, height: 256, seed: 0 };
  const ref = synthesizeDemoImage(base);
  if (!ref.ok) throw new Error(`合成参考图失败: ${ref.issues.join('；')}`);

  const dna = extractVisualDna(ref.bytes, { assetId: 'eval-reference' });
  if (!dna.ok) throw new Error(`参考图量不出 DNA: ${dna.reason}`);
  const dominant = dna.stats.palette[0]?.color;
  if (!dominant) throw new Error('参考图没有主色');
  const anchor = hueOfHex(dominant);

  const variant = synthesizeDemoImage({ ...base, hueAnchor: anchor });
  if (!variant.ok) throw new Error(`合成变体失败: ${variant.issues.join('；')}`);
  const unrelated = synthesizeDemoImage({ prompt: '深夜的城市天际线', width: 256, height: 256, seed: 0 });
  if (!unrelated.ok) throw new Error('合成无关图失败');

  const same = compareVisuals(ref.bytes, ref.bytes);
  if (!same.ok) throw new Error(same.reason);
  const v = compareVisuals(ref.bytes, variant.bytes);
  const u = compareVisuals(ref.bytes, unrelated.bytes);
  if (!v.ok || !u.ok) throw new Error('比较失败');

  console.log(`  自比颜色分 = ${same.result.metrics.color.score}（必须 1）`);
  console.log(`  变体（hueAnchor=${anchor.toFixed(3)} ← 主色 ${dominant}）颜色分 = ${v.result.metrics.color.score.toFixed(3)} · 布局分 = ${v.result.metrics.layout.score.toFixed(3)}`);
  console.log(`  无关图颜色分 = ${u.result.metrics.color.score.toFixed(3)} · 布局分 = ${u.result.metrics.layout.score.toFixed(3)}`);
  check('自比颜色分恒为 1', same.result.metrics.color.score === 1, `${same.result.metrics.color.score}`);

  // §38 锚点链的真实承诺：锚点钉的是底色渐变的色相。锚点也在身份哈希里 ⇒ 整个随机流都变，
  // 变体**不是**"同一张图的换色"（renderPixels 曾那么注释，被这里逐像素证伪过）——
  // 布局/调色板的相似度因而受哈希运气支配，不配当不变式。能从像素里读死的是这一条：
  // 锚点色相上的像素质量必须高于把锚点反着放（+0.5）的同款变体。这条断了，"变体跟参考走"就只剩参数存在。
  const counter = synthesizeDemoImage({ ...base, hueAnchor: (anchor + 0.5) % 1 });
  if (!counter.ok) throw new Error(`合成反事实变体失败: ${counter.issues.join('；')}`);
  const hueMassNear = (bytes: Uint8Array, target: number, window = 0.09): number => {
    const decoded = decodePngPixels(bytes);
    if (typeof decoded === 'string') throw new Error(decoded);
    let mass = 0;
    let total = 0;
    for (let i = 0; i < decoded.rgba.length; i += 4) {
      if (decoded.rgba[i + 3]! < 128) continue;
      total += 1;
      const h = hueOfRgb(decoded.rgba[i]!, decoded.rgba[i + 1]!, decoded.rgba[i + 2]!);
      const d = Math.abs(h - target);
      if (Math.min(d, 1 - d) <= window) mass += 1;
    }
    return total ? mass / total : 0;
  };
  const variantMass = hueMassNear(variant.bytes, anchor);
  const counterMass = hueMassNear(counter.bytes, anchor);
  console.log(`  锚点色相 ±0.09 的像素质量：变体 = ${(variantMass * 100).toFixed(1)}% · 反事实锚点（+0.5） = ${(counterMass * 100).toFixed(1)}%`);
  check('锚点色相落进像素（变体 > 反事实锚点的变体）', variantMass > counterMass, `${(variantMass * 100).toFixed(1)}% vs ${(counterMass * 100).toFixed(1)}%`);
  console.log('  notMeasured: typography / componentCorrectness（需要视觉 provider）；真实生成图的美学质量（同上）');
}

/** 与 image-studio 的 hueOfHex 同一口径的 RGB→色相（0..1）；灰阶返回 0 */
function hueOfRgb(r: number, g: number, b: number): number {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const span = max - min;
  if (span === 0) return 0;
  let h: number;
  if (max === rn) h = ((gn - bn) / span) % 6;
  else if (max === gn) h = (bn - rn) / span + 2;
  else h = (rn - gn) / span + 4;
  return (h / 6 + 1) % 1;
}

// ------------------------------------------------- Accessibility 检出率

function evalAccessibility(): void {
  console.log('\n== Accessibility（健康门禁对注入违规的检出率） ==');
  const clean = createDocument('无障碍基线', 'website');
  const cleanCheck = analyzeHealth(clean).checks.find((c) => c.id === 'accessibility')!;
  check('干净基线 a11y 满分且零发现', cleanCheck.score === 100 && cleanCheck.findings.length === 0, `score=${cleanCheck.score}`);

  const document = createDocument('无障碍注入', 'website');
  const page = document.pages[0]!;
  // 根节点默认 {color.background} 在 activeMode=null 时解析成深色 #0b0d12——
  // 浅灰字在深底上对比度反而高。注入用例要可控的已知底色：根节点换成不透明白。
  page.nodes[page.rootId]!.style.fills = [{ kind: 'solid', color: '#ffffff' }];
  const make = (type: 'text' | 'image' | 'button', name: string, extra: Partial<Parameters<typeof createNode>[0]> = {}) => {
    const node = createNode({ type, name, parentId: page.rootId, ...extra });
    page.nodes[node.id] = node;
    page.nodes[page.rootId]!.children.push(node.id);
    return node;
  };
  const faint = make('text', '淡色文本', { text: 'barely visible' });
  faint.style.fills = [{ kind: 'solid', color: '#eeeeee' }];
  const noAlt = make('image', '无替代文本图片');
  // createNode 会给 button 填默认文案 "Button"：先清空，才构成"无障碍名称为空"
  const nameless = make('button', '无名按钮', { text: '' });
  const tiny = make('button', '过小按钮', { text: 'Go', size: { width: 20, height: 20 } });

  const report = analyzeHealth(document);
  const check_ = report.checks.find((c) => c.id === 'accessibility')!;
  const expected: Array<{ code: string; nodeId: string }> = [
    { code: 'low-contrast', nodeId: faint.id },
    { code: 'missing-alt', nodeId: noAlt.id },
    { code: 'no-text-on-button', nodeId: nameless.id },
    { code: 'tap-target-small', nodeId: tiny.id },
  ];
  let detected = 0;
  for (const e of expected) {
    const hit = check_.findings.some((f) => f.code === e.code && f.nodeId === e.nodeId);
    if (hit) detected += 1;
    else console.log(`  FAIL  未检出 ${e.code}（node=${e.nodeId}）`);
  }
  console.log(`  注入 4 类违规（对比度/alt/按钮名/点击目标）→ 检出 ${detected}/4 · a11y 分 ${check_.score}`);
  check('Accessibility 违规检出 4/4 且定位到节点', detected === 4, `${detected}/4`);
  console.log('  notMeasured: 渲染后页面的 axe/键盘可达性（需要真浏览器评测；设计模型这层只测静态规则）');
}

// ------------------------------------------------------------------ main

async function main(): Promise<void> {
  const db = getDb();
  const probe = await db.execute(rawSql`select 1 as ok`);
  if (!probe) throw new Error('数据库不可用');

  const [user] = await db
    .insert(users)
    .values({ displayName: 'Eval Runner', email: `eval-baseline+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  if (!user) throw new Error('建评测用户失败');

  try {
    await evalRag(user.id);
    await evalDesignAccuracy();
    evalVisual();
    evalAccessibility();

    console.log('\n== Performance ==');
    console.log('  不在此复测：规模基准与热点路径的真数见 docs/PERFORMANCE.md（§146/§147 的测量协议）。');

    console.log('\n== notMeasured（如实列出，不装作测过） ==');
    console.log('  Hallucination 的 LLM 裁判、Tool selection、Agent task completion、RAG 向量半、');
    console.log('  typography / componentCorrectness、渲染后页面的无障碍——全部等 provider 或真浏览器评测。');

    console.log('\n==================== 结果 ====================');
    if (failures.length) {
      console.error(`FAIL：${failures.length} 项结构不变式被打破：\n  - ${failures.join('\n  - ')}`);
      process.exitCode = 1;
    } else {
      console.log('全部结构不变式 PASS。读数抄进 docs/EVALUATION.md。');
    }
  } finally {
    await db.delete(projects).where(eq(projects.ownerId, user.id));
    await db.delete(users).where(eq(users.id, user.id));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
