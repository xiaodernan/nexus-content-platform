#!/usr/bin/env node
/**
 * canon-review.mts — 用真模型给新正典文本做一次合规评审（2026-11-22）
 *
 * 写正典的纪律是「无新正典专名、只写既有设定内的细节、锚句逐字可考」。
 * 这三条以前只靠作者自觉；这个脚本把候选文本（回响或**正典章节**）连同一份**紧凑正典索引**
 * （章名/回响名，不带正文）与**全部既有锚句**喂给 gpt-6.2-sol，让它逐条挑：
 *   A. 疑似新专名（人名/地名/组织名，正典索引里没有的）
 *   B. 与既有设定冲突的陈述（纪元、潮印数、已发生的事）
 *   C. 锚句是否像"抄来的"（与既有锚句撞句）
 * 输出是**评审意见**，不是判决：采纳与否在人，模型不认识正典全文，它只认识这份索引。
 *
 * 用法：需要 .env 里的 NEXUS_OPENAI_API_KEY
 *   npx tsx --tsconfig apps/web/tsconfig.json scripts/canon-review.mts <正典.md 或 回响.md>
 *   NODE_USE_ENV_PROXY=1 + HTTPS_PROXY=… 让 Node 内置 fetch 走代理（否则网关按地域 403）
 * 章节比回响多两问：纪元线是否接上、是否与既有章节重复叙事（同一件事写两遍）。
 * 环境：NEXUS_AI_SERVICE_URL（默认 http://127.0.0.1:3200，走 ai-service 的 stategraph/chat）
 *     或 NEXUS_LLM_DIRECT=1 直连网关（默认 http 代理读 .env）。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
// 相对路径而不是 `@/world-bible/...`：这个脚本从仓库根目录跑（它按 cwd 找 docs/world-bible），
// 而根 tsconfig 没有 web 的 `@` 别名——用别名会 ERR_MODULE_NOT_FOUND，脚本直接跑不起来。
import { BIBLE_ANCHORS } from '../apps/web/src/world-bible/anchors.generated';
import { join } from 'node:path';

const ROOT = process.cwd();
const BIBLE_DIR = join(ROOT, 'docs/world-bible');
const ECHOES_DIR = join(BIBLE_DIR, 'echoes');
const target = process.argv[2];
if (!target) {
  console.error('用法：npx tsx scripts/echo-canon-review.mts <echo.md>');
  process.exit(2);
}
const echoPath = join(ROOT, target);
if (!existsSync(echoPath)) {
  console.error(`找不到 ${echoPath}`);
  process.exit(2);
}

/** 候选是回响还是正典章节——决定评审多问哪两问。 */
const kind: 'echo' | 'chapter' = target.replace(/\\/g, '/').includes('/echoes/') ? 'echo' : 'chapter';
const isChapter = kind === 'chapter';

/** 紧凑索引：章名 + 全部回响的编号与题名（不带正文，控制 token）。 */
function canonIndex(): string {
  const chapters = readdirSync(BIBLE_DIR)
    .filter((f) => /^\d{3}-.+\.md$/.test(f) && !f.endsWith('.en.md'))
    .sort()
    .map((f) => f.replace(/\.md$/, ''));
  const echoes = readdirSync(ECHOES_DIR)
    .filter((f) => /^E\d{2,3}-.+\.md$/.test(f) && !f.endsWith('.en.md'))
    .sort()
    .map((f) => f.replace(/\.md$/, ''));
  return [
    `正典章节（${chapters.length}）：`,
    ...chapters.map((c) => `- ${c}`),
    ``,
    `回响（${echoes.length}，编号即顺序）：`,
    ...echoes.map((e) => `- ${e}`),
  ].join('\n');
}

const zhBody = readFileSync(echoPath, 'utf8');

/** 全部既有锚句（zh，逐字）——C 项撞句检查的唯一依据；没有它，模型只能猜。 */
const anchorCount = BIBLE_ANCHORS.length;
const allAnchors = BIBLE_ANCHORS.map((a, i) => `${i + 1}. ${a.zh}`).join('\n');
const anchors = [...zhBody.matchAll(/^\*\*锚句\*\*[:：]\s*(.+)$/gm)].map((m) => m[1]!.trim());

const SYSTEM = `你是《低语诸王》世界大典的合规评审。纪律：正典文本不得引入索引之外的新专名（人名/地名/组织名），
只能写既有设定内的细节；不得与既有设定冲突；锚句必须逐字可考且不与既有锚句撞句。
你只收到一份紧凑索引（章名与回响题名），收不到正文——所以"疑似新专名"是疑似，不是定罪。`;

const USER = `待评审${isChapter ? '正典章节' : '回响'}（中文原文）：

${zhBody}

---

正典紧凑索引：

${canonIndex()}

---

既有锚句全文（${anchorCount} 条，逐字来自正典，用于 C 项撞句检查）：

${allAnchors}

---

请逐条回答（没有就说"无"，不要为了填满而编）：
A. 疑似新专名：列出索引里找不到的人名/地名/组织名，各一句理由。
B. 与既有设定冲突的陈述：列出与纪元/潮印数/已发生事件矛盾的句子，各一句理由。
C. 锚句风险：${anchors.length} 条锚句里，哪几条看起来像在改写既有锚句（撞句）？
D. 一句话总结：这份${isChapter ? '章节' : '回响'}能不能按现状进正典。${isChapter ? `
E. 纪元线：这一章的纪元接在哪一章之后？索引里接得上吗？
F. 重复叙事：有没有哪一章已经在写同一件事（同一场景/同一转折写两遍）？` : ''}`;

const key = process.env.NEXUS_OPENAI_API_KEY ?? process.env.AI_SERVICE_KEY ?? '';
const base = process.env.NEXUS_OPENAI_BASE_URL ?? 'https://api.aizzz.xyz/v1';
const model = process.env.NEXUS_MODEL_REASONING ?? 'gpt-6.2-sol';
const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy ?? process.env.HTTP_PROXY ?? '';
// Node 24：NODE_USE_ENV_PROXY=1 让内置 fetch 尊重 HTTPS_PROXY（本机 Clash Verge 7897；不走代理网关按地域 403）。
if (!key) {
  console.error('需要 NEXUS_OPENAI_API_KEY（本机 .env 里有；只读，不发往别处）');
  process.exit(2);
}

async function main(): Promise<void> {
  const resp = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      // 本仓库的网关只认裸 key（2026-11-22 实测：Bearer 前缀 401）
      authorization: key,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: USER },
      ],
      temperature: 0.2,
      max_tokens: 1200,
    }),
  });
  const text = await resp.text();
  if (!resp.ok) {
    console.error(`gateway ${resp.status}: ${text.slice(0, 400)}`);
    process.exit(1);
  }
  const body = JSON.parse(text) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  };
  const answer = body.choices?.[0]?.message?.content ?? '';
  const usage = body.usage ?? {};
  console.log(answer.trim());
  console.log('---');
  console.log(`model=${model} tokensIn=${usage.prompt_tokens ?? 0} cached=${usage.prompt_tokens_details?.cached_tokens ?? 0} tokensOut=${usage.completion_tokens ?? 0}`);
}

void main();
