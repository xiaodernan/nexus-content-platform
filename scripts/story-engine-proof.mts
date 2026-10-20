/**
 * 省内存版的 story 链见证：不开 Chrome，用 Node 的 `vm` 直接跑产物 `engine.js` 里的 `NexusStory`。
 *
 * 为什么要有它：本机内存紧（16GB，多个 AI 工具进程 + Docker 占着），Chrome 常常起不来，
 * 于是"对话引擎的语义对不对"这件事就悬着。`NexusStory` 是**纯逻辑**（不碰 document / window），
 * 所以它可以在 vm 里跑——这一份验的是**转写本身**（选项跳转、成环标记、起点从投影来），
 * 页面渲染那一层留给真浏览器（`scripts/game-code-parity.mts` 的 STORY_* 那几条）。
 */
import vm from 'node:vm';
import { artifactChainSentence, generateGameCode, artifactPayload, type GameDocument } from '../packages/game-model/src/index';

const AT = '2026-01-01T00:00:00.000Z';

function build(name: string, kind: 'interactive-story' | 'visual-novel'): GameDocument {
  return {
    id: `game_${name}`,
    projectId: null,
    name,
    summary: '为省内存版见证摆的对话',
    kind,
    entities: [
      {
        id: 'd1',
        kind: 'dialogue',
        name: '开场',
        notes: '说明：开场',
        tags: [],
        stats: {},
        refs: [{ id: 'd1-ref-0', to: 'd2', role: '点头' }],
        updatedAt: AT,
      },
      {
        id: 'd2',
        kind: 'dialogue',
        name: '回应',
        notes: '说明：回应',
        tags: [],
        stats: {},
        refs: [{ id: 'd2-ref-0', to: 'd1', role: '回头' }],
        updatedAt: AT,
      },
      {
        id: 'e1',
        kind: 'enemy',
        name: '巡逻兵',
        notes: '说明：巡逻兵',
        tags: [],
        stats: { health: 3, damage: 1, speed: 120, detectionRange: 400, x: 300, y: 200 },
        refs: [],
        updatedAt: AT,
      },
    ],
    createdAt: AT,
    updatedAt: AT,
  } as GameDocument;
}

const doc = build('对话', 'interactive-story');
const output = generateGameCode(doc);
const plan = artifactPayload(doc);
if (plan.chain !== 'story') throw new Error(`这份载荷不是 story 那条链的（是 ${plan.chain}）`);

const engineFile = output.files.find((f) => f.path === 'engine.js');
if (!engineFile) throw new Error('产物里没有 engine.js');
if (!engineFile.contents.includes('var NexusStory = {')) throw new Error('产物里没有 NexusStory 那一段转写');

const sandbox: Record<string, unknown> = { Math, JSON, console };
vm.createContext(sandbox);
vm.runInContext(engineFile.contents, sandbox, { filename: 'engine.js' });

const NexusStory = (sandbox as { NexusStory?: { initialState: (p: unknown) => unknown; step: (p: unknown, s: unknown, c: string) => unknown; summary: (p: unknown, s: unknown) => string } }).NexusStory;
if (!NexusStory) throw new Error('引擎里没有 NexusStory');

const start = NexusStory.initialState(plan) as { beatId: string; visited: Record<string, number>; steps: number; loop: boolean; status: string };
const startBeat = plan.beats.find((b) => b.id === plan.startId);
if (!startBeat) throw new Error('投影里没有起点那一段');

const results: string[] = [];
const check = (name: string, ok: boolean, detail: string): void => {
  results.push(`${ok ? 'OK  ' : 'FAIL'} ${name} — ${detail}`);
};

// ① 起点从投影来（产物里不重算）
check('起点从投影来', start.beatId === plan.startId, `起点=${start.beatId}，投影的 startId=${plan.startId}`);

// ② 非对话的实体一个都不进这一份
check('别的实体不读', !JSON.stringify(plan).includes('巡逻兵'), `产物载荷里没有那个敌人的名字（投影 notes 里有 ${plan.notes.filter((n) => n.includes('非对话')).length} 条相关限度）`);

// ③ 选一个选项 → 跳到目标那一段
const firstChoice = startBeat.choices[0]!;
const afterChoice = NexusStory.step(plan, start, firstChoice.id) as { beatId: string; steps: number; visited: Record<string, number>; loop: boolean };
const targetBeat = plan.beats.find((b) => b.id === firstChoice.to)!;
check('选一个选项跳到目标段', afterChoice.beatId === targetBeat.id && afterChoice.steps === 1, `${startBeat.id} → ${afterChoice.beatId}（目标 ${targetBeat.id}），走了 ${afterChoice.steps} 步`);

// ④ 打不中的选项 → 状态不动（不给"点下去没反应"的假动作，也不假装跳了）
const afterMiss = NexusStory.step(plan, start, '根本没有这个选项') as { beatId: string; steps: number };
check('打不中的选项状态不动', afterMiss.beatId === start.beatId && afterMiss.steps === 0, `仍是 ${afterMiss.beatId}，步数 ${afterMiss.steps}`);

// ⑤ 走一圈回来 → 成环被标出来
const backChoice = targetBeat.choices[0]!;
const afterLoop = NexusStory.step(plan, afterChoice, backChoice.id) as { beatId: string; loop: boolean; events: { text: string }[] };
const summary = NexusStory.summary(plan, afterLoop);
check('成环被标出来', afterLoop.loop === true && summary.includes('成环'), `回到 ${afterLoop.beatId}，loop=${afterLoop.loop}，摘要里${summary.includes('成环') ? '有' : '没有'}「成环」`);

// ⑥ 摘要说清当前段落与步数
check('摘要说清当前段落', summary.includes(startBeat.name) || summary.includes(targetBeat.name), `摘要：${summary}`);


// ③④ 载荷与页面形状（这两条本来是浏览器那一层的，但它们量的都是**字节**，Node 侧能量）
const planJs = output.files.find((f) => f.path === 'plan.js');
const planJson = output.files.find((f) => f.path === 'plan.json');
if (!planJs || !planJson) throw new Error('产物里缺 plan.js / plan.json');
const pretty = JSON.stringify(plan, null, 2);
check(
  '产物计划逐字节等于 artifactPayload',
  planJs.contents.includes(`window.NEXUS_PLAN = ${pretty};`) && planJson.contents.trim() === pretty,
  `plan.js 与 plan.json 是同一次序列化的结果（逐字节等于主机侧 artifactPayload）`,
);
const html = output.files.find((f) => f.path === 'index.html')!.contents;
check(
  '对话那一页没有画布',
  !html.includes('id="arena"') && html.includes('<div id="story">'),
  `index.html 里没有 canvas（对话没有场地），有 #story 容器`,
);
const readme = output.files.find((f) => f.path === 'README.txt')!.contents;
check(
  'README 与页面念同一句链名',
  readme.includes(artifactChainSentence('story')) && html.includes(artifactChainSentence('story')),
  `README 与 index.html 都含「${artifactChainSentence('story').slice(0, 20)}…」`,
);

console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(`\n合计 ${results.length} 条，失败 ${failed.length} 条`);
process.exitCode = failed.length ? 1 : 0;
