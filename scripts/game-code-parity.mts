import { createServer } from 'node:http';
import { chromium } from '@playwright/test';
import {
  CONTACT_COOLDOWN,
  EVENT_CAP,
  LEVEL_BONUS,
  MAX_FRAME_SECONDS,
  PLAYER_ATTACK_COOLDOWN,
  SIM_NO_PLAYER_OUTCOME,
  STORY_NO_BEATS_OUTCOME,
  XP_BASE,
  XP_STEP,
  artifactChainSentence,
  type ArtifactPlan,
  artifactPayload,
  compileGame,
  compileRpg,
  generateGameCode,
  initialState,
  initialRpgState,
  rpgStep,
  rpgSummary,
  simSummary,
  step,
  storyInitial,
  storyStep,
  storySummary,
  validateGame,
  xpToNext,
  type ArtifactChain,
  type GameCodeOutput,
  type GameDocument,
  type GameEntityKind,
  type GameKind,
  type GamePlan,
  type RpgState,
  type SimInput,
  type SimState,
  type StoryPlan,
  type StoryState,
} from '@nexus/game-model';

/**
 * §52 最后一格（Code）的**浏览器一致性见证**：产物里那份 `engine.js` 是平台规则模块的转写，
 * 这句话要么两边真跑出同一串状态，要么它就是假的。
 *
 * `packages/game-model/test/codegen.test.ts` 里那些常量比对是**静态闸**——它们只证明
 * "数字由同一处供给"（模板插的是 `sim.ts` / `rpg.ts` 的导出，不是重打一遍的字面量），
 * 不证明"同一份计划 + 同一段输入 = 同一串状态"。算术、分支顺序、事件文案、
 * `Math.round` 的位置、越界夹取、事件流裁剪，这些都只有把产物真的跑起来才量得到。
 *
 * 于是这一条按 §81 唯一允许的路径跑：**产物只在浏览器里执行**，主机只喂字节。
 * - 主机侧不 `eval`、不 `new Function`、不起子进程跑产物；
 * - 产物文件由 `generateGameCode` 现场生成，直接经 loopback HTTP 发给浏览器，
 *   Origin 与平台（3100）不同；页面自带 `connect-src 'none'`，脚本输出里逐条核对它没往别处发请求；
 * - 参照串是主机侧跑平台自己的代码（`sim.ts` 与 `rpg.ts`）得到的，不是产物。
 *
 * **三条链各跑一遍**（每加一条链就补一段；只测旧的那几条等于新链没测）：
 * - `topdown`：`battleDoc` 标 `2d`，产物里只有 `NexusSim`，参照是 `sim.ts`；
 * - `rpg`：`growthDoc` 与那份**除经验那一格外逐字节相同**（`SAME_GEOMETRY_ONLY_GROWTH`），
 *   产物里多一段 `NexusRpg`，参照是 `rpg.ts`。两份 trace 必须**不同**（`RPG_LAYER_NOT_DECORATIVE`）——
 *   同几何、同输入、只有成长层在中间，还跑出同一串状态，就说明那一段转写没参与运算。
 *   等级门那一支另外喂一份带 `requiredLevel` 的计划（`RPG_GATE_HELD`）：它每帧都触发，
 *   所以既钉住"扣住不发"的文案，也钉住 RPG 那一条自己的事件流上限。
 * - `story`：`storyDoc` 标 `interactive-story`，产物里是 `NexusStory`，参照是 `story.ts`。
 *   选择序列里走一圈成环，中间插两步**打不中**的（不存在的 id、别段的选择 id）：
 *   成环事件要长出来，打不中要原样返回同一个对象——两边的"没动"必须是同一种没动。
 *   另喂两份计划：收束（末段没有出边）与一条对话都没有（开不了场），各钉住一句文案。
 *
 * 用法：`npx tsx scripts/game-code-parity.mts`（不需要 dev server，也不需要数据库）。
 * 每条判决单独打一行 `verdict 名称: 细节`；任何一条不过就退非 0，且不把"没跑到"算成"跑过了"。
 */

const AT = '2026-01-01T00:00:00.000Z';

interface Spec {
  id: string;
  kind: GameEntityKind;
  name: string;
  stats?: Record<string, number>;
  refs?: { to: string; role: string }[];
}

function build(name: string, kind: GameKind, specs: Spec[]): GameDocument {
  const document: GameDocument = {
    id: `game_${name}`,
    projectId: null,
    name,
    summary: '为一致性见证摆的战场',
    kind,
    entities: specs.map((spec) => ({
      id: spec.id,
      kind: spec.kind,
      name: spec.name,
      notes: `说明：${spec.name}`,
      tags: ['parity'],
      stats: { ...spec.stats },
      refs: (spec.refs ?? []).map((ref, index) => ({ id: `${spec.id}-ref-${index}`, to: ref.to, role: ref.role })),
      updatedAt: AT,
    })),
    createdAt: AT,
    updatedAt: AT,
  };
  const issues = validateGame(document);
  if (issues.length) throw new Error(`底稿结构校验没过：${issues.map((i) => i.message).join('；')}`);
  return document;
}

/**
 * 场上东西刻意摆成一条线，并用坐标算出每段该走多少帧（不是猜的帧数）：
 * 追逐、接触伤害与冷却、挥击与击杀、拾取、机关首激活与再激活、边界夹取、超长帧夹取都要走到。
 * 不带任务：带任务会在中途进入 won 而停止推进，长跑那一段就成了空转。
 */
const battleSpecs: Spec[] = [
  { id: 'p1', kind: 'player', name: '主角', stats: { health: 60, speed: 200, x: 600, y: 380 } },
  { id: 'w1', kind: 'weapon', name: '短刃', stats: { damage: 2, range: 40 }, refs: [{ to: 'p1', role: '装备于' }] },
  { id: 'e1', kind: 'enemy', name: '巡逻兵', stats: { health: 3, damage: 1, speed: 120, detectionRange: 400, x: 520, y: 380 } },
  { id: 'i1', kind: 'item', name: '药包', stats: { stackSize: 1, x: 760, y: 380 } },
  { id: 't1', kind: 'trigger', name: '洞口', stats: { radius: 60, cooldown: 0, delay: 0, x: 900, y: 380 }, refs: [{ to: 'i1', role: '贴着' }] },
];

const battleDoc = build('战场', '2d', battleSpecs);

/** 与 `battleSpecs` 只差敌人那一格 `xpReward`：25 点够从 1 级升到 2 级（曲线是 `XP_BASE` 起步） */
const growthDoc = build('战场', 'rpg-prototype', [
  battleSpecs[0]!,
  battleSpecs[1]!,
  { ...battleSpecs[2]!, stats: { ...battleSpecs[2]!.stats, xpReward: XP_BASE + 5 } },
  battleSpecs[3]!,
  battleSpecs[4]!,
]);

/** 没有玩家的文档：`initialState` 那句拒绝与 `status=lost` 是转写里的 TEXT.noPlayer，要在活页面里读到它 */
const noPlayerDoc = build('空场', '2d', [
  { id: 'e1', kind: 'enemy', name: '巡逻兵', stats: { health: 3, damage: 1, speed: 120, detectionRange: 400, x: 300, y: 200 } },
]);

/**
 * 等级门那一份：只留玩家、武器、一个敌人和一条 `requiredLevel: 3` 的任务。
 * 击杀发 25 点经验只够升到 2 级，所以任务条件每帧满足、每帧都被门扣住——
 * 这一支不是"跑一次就完"的分支，它每帧都跑，事件流也因此一路顶到上限被裁剪。
 */
const gateDoc = build('等级门', 'rpg-prototype', [
  { id: 'p1', kind: 'player', name: '主角', stats: { health: 60, speed: 200, x: 600, y: 380 } },
  { id: 'w1', kind: 'weapon', name: '短刃', stats: { damage: 2, range: 40 }, refs: [{ to: 'p1', role: '装备于' }] },
  { id: 'e1', kind: 'enemy', name: '巡逻兵', stats: { health: 3, damage: 1, speed: 120, detectionRange: 400, x: 520, y: 380, xpReward: XP_BASE + 5 } },
  { id: 'q1', kind: 'quest', name: '三级才交差', stats: { requiredLevel: 3 }, refs: [{ to: 'e1', role: '要求打倒' }] },
]);

/**
 * 对话那一份：两段对话互指（甲→乙、乙→甲），另放一个敌人。
 *
 * 那个敌人正是「别的实体不读」的那条证据：对话管线只读 dialogue 实体，
 * 那个敌人不会出现在 plan.story 的任何一段里（而 2D 那条链会把它排成场上个体）。
 * 两段对话互指 → 走一圈就回到走过的地方 → 产物必须把「成环」标出来（模型允许成环，播放器负责标）。
 */
const storyDoc = build('对话', 'interactive-story', [
  { id: 'd1', kind: 'dialogue', name: '开场', refs: [{ to: 'd2', role: '点头' }] },
  { id: 'd2', kind: 'dialogue', name: '回应', refs: [{ to: 'd1', role: '回头' }] },
  { id: 'e1', kind: 'enemy', name: '巡逻兵', stats: { health: 3, damage: 1, speed: 120, detectionRange: 400, x: 300, y: 200 } },
]);

/**
 * 收束那一份：开场指向第二段，第二段没有出边。
 * `storyDoc` 是个环，走不到"这一段没有出边"那句；结束分支要另一份计划才跑得到。
 */
const endingStoryDoc = build('收束', 'interactive-story', [
  { id: 's1', kind: 'dialogue', name: '开场', refs: [{ to: 's2', role: '继续' }] },
  { id: 's2', kind: 'dialogue', name: '收束' },
]);

/** 一条对话都没有：`compileStory` 判它开不了场，产物读的是同一个 outcome 常量 */
const emptyStoryDoc = build('空故事', 'interactive-story', [
  { id: 'e1', kind: 'enemy', name: '巡逻兵', stats: { health: 3, damage: 1, speed: 120, detectionRange: 400, x: 300, y: 200 } },
]);

interface Frame {
  input: SimInput;
  dt: number;
}

/** 朝目标走到（并按帧数留一两帧余量），距离与速度都从同一份 plan 里读，不手写帧数 */
function walkFrames(plan: GamePlan, target: { x: number; y: number }, from: { x: number; y: number }, dt: number, extra: number): Frame[] {
  const stepPx = plan.player!.speed * dt;
  const distance = Math.hypot(target.x - from.x, target.y - from.y);
  const frames = Math.ceil(distance / stepPx) + extra;
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  return Array.from({ length: frames }, () => ({ input: { dx, dy, attack: false }, dt }));
}

/**  scripted 输入序列：Node 侧与浏览器侧喂的是同一个数组（同一个 JSON），所以差异只能来自引擎 */
function scriptFor(plan: GamePlan): Frame[] {
  const dt = 1 / 60;
  const enemy = plan.enemies[0]!;
  const item = plan.items[0]!;
  const trigger = plan.triggers[0]!;
  const start = { x: plan.player!.x, y: plan.player!.y };
  const seq: Frame[] = [];

  // 1) 冲向敌人：追逐 + 接触伤害 + 冷却
  seq.push(...walkFrames(plan, enemy, start, dt, 20));
  // 2) 站住挥击：挥击冷却、击杀、事件文案（走到位之后人就停在敌人身上）
  for (let i = 0; i < 90; i += 1) seq.push({ input: { dx: 0, dy: 0, attack: true }, dt });
  // 3) 走向物品：拾取（起点用敌人的位置——上一段确实停在那里）
  seq.push(...walkFrames(plan, item, enemy, dt, 6));
  // 4) 走上机关：首激活
  seq.push(...walkFrames(plan, trigger, item, dt, 4));
  // 5) 站在机关上长跑：再次踩到 → 事件流越过 EVENT_CAP 被裁剪（机关冷却至少 1 秒，所以按秒数摊帧）
  const longSeconds = EVENT_CAP + 12;
  for (let i = 0; i < Math.ceil(longSeconds / 0.1); i += 1) {
    seq.push({ input: { dx: 0, dy: 0, attack: false }, dt: 0.1 });
  }
  // 6) 顶到左边界：夹取（900 像素按 20 像素/帧要 45 帧到墙，剩下的帧都在墙上不动）
  for (let i = 0; i < 200; i += 1) seq.push({ input: { dx: -1, dy: 0, attack: false }, dt: 0.1 });
  // 7) 一帧超长 dt：定步长上限夹取（这一帧就是 maxFrameSeconds 那根插值线的活证据）
  seq.push({ input: { dx: 0, dy: 0, attack: false }, dt: 5 });
  return seq;
}

/** 等级门那一段只需要走到敌人面前并把对方打死：之后的每帧都在扣任务，不需要长跑 */
function gateScript(plan: GamePlan): Frame[] {
  const dt = 1 / 60;
  const enemy = plan.enemies[0]!;
  const seq = walkFrames(plan, enemy, { x: plan.player!.x, y: plan.player!.y }, dt, 10);
  for (let i = 0; i < 240; i += 1) seq.push({ input: { dx: 0, dy: 0, attack: true }, dt });
  return seq;
}

function runReference(plan: GamePlan, frames: Frame[]): SimState[] {
  let state = initialState(plan);
  const trace: SimState[] = [state];
  for (const frame of frames) {
    state = step(plan, state, frame.input, frame.dt);
    trace.push(state);
  }
  return trace;
}

/** 平台侧的 RPG 参照串：跑的是 `rpg.ts`，喂的是 `compileRpg` 那份计划（不是产物的 payload） */
function runRpgReference(document: GameDocument, frames: Frame[]): RpgState[] {
  const plan = compileRpg(document);
  let state = initialRpgState(plan);
  const trace: RpgState[] = [state];
  for (const frame of frames) {
    state = rpgStep(plan, state, frame.input, frame.dt);
    trace.push(state);
  }
  return trace;
}

/** 对话的一步：`moves` 是这一步**该不该**往前走；false 的两步是故意打不中的 */
interface StoryChoiceSpec {
  choiceId: string;
  moves: boolean;
}

/**
 * 对话那一段的 scripted 选择：起点 → 第二段 → 起点（成环）→ 两个打不中的 →
 * 起点 → 第二段 → 起点（再成两次环）。
 *
 * 第三步是不存在的 id，第四步是**第二段的选择 id 拿到起点去点**（id 在计划里、但不在当前段）——
 * 两种打不中都走"没动"那一支，而两种"没动"必须是同一种没动。
 */
function storyScript(plan: StoryPlan): StoryChoiceSpec[] {
  const start = plan.beats.find((beat) => beat.id === plan.startId);
  const forward = start?.choices[0];
  if (!start || !forward) throw new Error('对话底稿的起点没有选项：一致性见证无从跑起');
  const second = plan.beats.find((beat) => beat.id === forward.to);
  const back = second?.choices.find((choice) => choice.to === start.id) ?? second?.choices[0];
  if (!second || !back) throw new Error('对话底稿的第二段没有可走的选项：见证走不成一圈');
  return [
    { choiceId: forward.id, moves: true },
    { choiceId: back.id, moves: true },
    { choiceId: 'no-such-choice', moves: false },
    { choiceId: back.id, moves: false },
    { choiceId: forward.id, moves: true },
    { choiceId: back.id, moves: true },
  ];
}

/** 收束那一份：走到没有出边的那一段，再点一次原来的选择（当前段没有它，所以不动） */
function endingScript(plan: StoryPlan): StoryChoiceSpec[] {
  const start = plan.beats.find((beat) => beat.id === plan.startId);
  const forward = start?.choices[0];
  if (!start || !forward) throw new Error('收束底稿的起点没有选项：结束分支跑不到');
  return [
    { choiceId: forward.id, moves: true },
    { choiceId: forward.id, moves: false },
  ];
}

/** 平台侧的对话参照串：跑的是 `story.ts`，喂的是 `artifactPayload` 那份 story 计划 */
function runStoryReference(plan: StoryPlan, script: StoryChoiceSpec[]): StoryState[] {
  let state = storyInitial(plan);
  const trace: StoryState[] = [state];
  for (const spec of script) {
    state = storyStep(plan, state, spec.choiceId);
    trace.push(state);
  }
  return trace;
}

const verdicts: { name: string; ok: boolean; detail: string }[] = [];
function verdict(name: string, ok: boolean, detail: string): void {
  verdicts.push({ name, ok, detail });
  console.log(`verdict ${name}: ${ok ? 'OK' : 'FAIL'} — ${detail}`);
}

interface Leg {
  slug: string;
  chain: ArtifactChain;
  doc: GameDocument;
  output: GameCodeOutput;
}

const legs: Leg[] = [
  { slug: 'topdown', chain: 'topdown', doc: battleDoc, output: generateGameCode(battleDoc) },
  { slug: 'rpg', chain: 'rpg', doc: growthDoc, output: generateGameCode(growthDoc) },
  { slug: 'story', chain: 'story', doc: storyDoc, output: generateGameCode(storyDoc) },
];

/**
 * 取**那条链的**载荷。
 *
 * 产物载荷现在是一个判别联合（`{chain:'topdown'} & GamePlan` / `{chain:'rpg'} & ...` /
 * `{chain:'story'} & StoryPlan`）——三条链各一种形状，硬当成一种用就会拿到别的链的字段。
 * 所以这里既做**类型收窄**，也做**运行时的同一句断言**：拿到的不是那条链，就是这一格跑错了地方。
 */
function planOf<T extends ArtifactChain>(
  chain: T,
  plan: ArtifactPlan,
): Extract<ArtifactPlan, { chain: T }> {
  if (plan.chain !== chain) {
    throw new Error(`这份载荷不是 ${chain} 那条链的（实际是 ${plan.chain}）`);
  }
  return plan as Extract<ArtifactPlan, { chain: T }>;
}

const topPlan = planOf('topdown', artifactPayload(battleDoc));
const growthPlan = planOf('rpg', artifactPayload(growthDoc));
if (!topPlan.player) throw new Error('底稿没有玩家投影，见证无从跑起');
const frames = scriptFor(topPlan);
const reference = runReference(topPlan, frames);
const referenceJson = JSON.stringify(reference);
const rpgFramesJson = JSON.stringify(frames);

const gatePlan = planOf('rpg', artifactPayload(gateDoc));
const storyPlan = planOf('story', artifactPayload(storyDoc));
const endingStoryPlan = planOf('story', artifactPayload(endingStoryDoc));
const emptyStoryPlan = planOf('story', artifactPayload(emptyStoryDoc));
const gateFrames = gateScript(gatePlan);
const gateReference = runRpgReference(gateDoc, gateFrames);

const noPlayerPlan = compileGame(noPlayerDoc);
const noPlayerReference = JSON.stringify(initialState(noPlayerPlan));

// 两条链各自选对了没有：这是**选链**那一格的判决，行为一致性要在下面跑出来才算
verdict(
  'CHAIN_SELECTED_FROM_KIND',
  legs.every((leg) => leg.output.artifactChain === leg.chain && leg.output.kindNote === null),
  legs.map((leg) => `${leg.doc.kind}→${leg.output.artifactChain}（错位句 ${leg.output.kindNote === null ? '无' : '有'}）`).join('、'),
);
// 同几何、只有敌人那一格多了 xpReward：2D 投影去掉那一格必须逐字节相同，
// 于是下面两份 trace 的差别只可能来自成长层那一侧（不是"两份底稿本来就画得不一样"）
const stripXp = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(stripXp)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value as Record<string, unknown>)
            .filter(([key]) => key !== 'xpReward')
            .map(([key, inner]) => [key, stripXp(inner)]),
        )
      : value;
const topPlanJson = JSON.stringify(compileGame(battleDoc));
const growthPlanJson = JSON.stringify(compileGame(growthDoc));
const xpCells = growthPlanJson.split('"xpReward"').length - 1;
const sameBasePlan = xpCells === 1 && JSON.stringify(stripXp(JSON.parse(growthPlanJson))) === topPlanJson;
verdict(
  'SAME_GEOMETRY_ONLY_GROWTH',
  sameBasePlan && growthDoc.entities.length === battleDoc.entities.length,
  sameBasePlan
    ? `两份底稿的 2D 投影只差敌人 stats 里那 ${xpCells} 格 xpReward，其余逐字节相同：下面那句"trace 不同"只能归给成长层`
    : `两份底稿的 2D 投影本来就不一样（xpReward 那 ${xpCells} 格之外还有别的），"trace 不同"不能归给成长层`,
);

const byPath = new Map<string, { contents: string; mime: string }>();
for (const leg of legs) {
  for (const file of leg.output.files) byPath.set(`${leg.slug}/${file.path}`, { contents: file.contents, mime: file.mime });
}
const shellFiles = ['index.html', 'plan.js', 'engine.js', 'main.js', 'style.css'];
const missingShell = legs.flatMap((leg) => shellFiles.filter((path) => !byPath.has(`${leg.slug}/${path}`)));
verdict('ARTIFACT_FILES', missingShell.length === 0, `${legs.length} 条链 × ${shellFiles.length} 份页面引用的文件，缺 ${missingShell.length ? missingShell.join('、') : '无'}`);

const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]!).replace(/^\//, '');
  const file = byPath.get(path.endsWith('/') ? `${path}index.html` : path);
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`没这一份：${path}`);
    return;
  }
  res.writeHead(200, { 'content-type': file.mime });
  res.end(file.contents);
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = (server.address() as { port: number }).port;
const origin = `http://127.0.0.1:${port}`;
console.log(`产物由 loopback HTTP 供给：${origin}（与平台 3100 不同源，主机不执行产物）`);

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext();
const page = await context.newPage();
const rpgPage = await context.newPage();
/** 第三条链那一份页面；另有一份是「反向控制」用的（plan.js 会被换掉） */
const storyPage = await context.newPage();
const storyMutPage = await context.newPage();
const requests: string[] = [];
for (const target of [page, rpgPage, storyPage]) {
  target.on('request', (request) => requests.push(request.url()));
}
const consoleErrors: string[] = [];
for (const target of [page, rpgPage, storyPage]) {
  target.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
}
const pageErrors: string[] = [];
for (const target of [page, rpgPage, storyPage]) {
  target.on('pageerror', (error) => pageErrors.push(String(error)));
}

/** 产物里那两个引擎在页面里的形状：`summary` 两条链都是 `(plan, state)`，这是 §52 第二链之后唯一的签名 */
interface PageEngine {
  initialState: (p: unknown) => unknown;
  step: (p: unknown, s: unknown, i: unknown, dt: number) => unknown;
  summary: (p: unknown, s: unknown) => string;
}

/** 把整段 scripted 输入交给**产物自己的**引擎，一次 evaluate 跑完整条 trace（产物只在浏览器里执行） */
async function runInPage(target: typeof page, engine: string, planJson: unknown, script: Frame[]): Promise<{ traceJson: string; summary: string }> {
  return await target.evaluate(
    (data) => {
      const w = window as unknown as Record<string, PageEngine | undefined>;
      const api = w[data.engine];
      // 引擎不在不是"跑出不同结果"，是这一格根本没跑：让它响亮地死，别把"没跑到"报成"相等"
      if (!api) throw new Error(`产物页面里没有 ${data.engine} 这个引擎`);
      let state = api.initialState(data.planJson);
      const trace: unknown[] = [state];
      for (const frame of data.script) {
        state = api.step(data.planJson, state, frame.input, frame.dt);
        trace.push(state);
      }
      return { traceJson: JSON.stringify(trace), summary: api.summary(data.planJson, state) };
    },
    { engine, planJson, script },
  );
}

/** 对话引擎在页面里的形状：`step` 只吃一个选择 id（没有帧、没有 dt），签名与另外两条链不同 */
interface PageStory {
  initialState: (p: unknown) => unknown;
  step: (p: unknown, s: unknown, choiceId: string) => unknown;
  summary: (p: unknown, s: unknown) => string;
}

/**
 * 把整段选择交给**产物自己的**对话引擎，一次 evaluate 跑完整条 trace。
 *
 * 除状态串之外还收两样：末态摘要，以及"这一步是不是原样返回了同一个对象"。
 * 后者是模型层写下的契约（打不中就是没动，连对象也不换），产物转写必须同形——
 * JSON 一样但偷偷换了个新对象，依赖引用不变的页面代码就会与平台页分叉。
 */
async function runStoryInPage(
  target: typeof storyPage,
  planJson: unknown,
  script: StoryChoiceSpec[],
): Promise<{ traceJson: string; summary: string; sameObject: boolean[] }> {
  return await target.evaluate(
    (data) => {
      const w = window as unknown as { NexusStory?: PageStory };
      const api = w.NexusStory;
      if (!api) throw new Error('产物页面里没有 NexusStory 这个引擎');
      let state = api.initialState(data.planJson);
      const trace: unknown[] = [state];
      const sameObject: boolean[] = [];
      for (const spec of data.script) {
        const next = api.step(data.planJson, state, spec.choiceId);
        sameObject.push(next === state);
        state = next;
        trace.push(state);
      }
      return { traceJson: JSON.stringify(trace), summary: api.summary(data.planJson, state), sameObject };
    },
    { planJson, script },
  );
}

try {
  await page.goto(`${origin}/topdown/index.html`, { waitUntil: 'load' });

  const globals = await page.evaluate(() => ({
    hasSim: typeof (window as unknown as { NexusSim?: unknown }).NexusSim === 'object',
    hasRpg: typeof (window as unknown as { NexusRpg?: unknown }).NexusRpg === 'object',
    hasPlan: typeof (window as unknown as { NEXUS_PLAN?: unknown }).NEXUS_PLAN === 'object',
    rules: (window as unknown as { RULES?: Record<string, number> }).RULES ?? null,
    chainNote: document.querySelector('#chain-note')?.textContent ?? null,
    kindNote: document.querySelector('#kind-note')?.textContent ?? null,
    canvas: (() => {
      const c = document.querySelector('canvas');
      return c ? { width: c.width, height: c.height } : null;
    })(),
  }));
  verdict(
    'PAGE_LOADS',
    globals.hasSim && globals.hasPlan && !globals.hasRpg && pageErrors.length === 0,
    `NexusSim=${globals.hasSim} NexusRpg=${globals.hasRpg}（2D 那一份不该带）NEXUS_PLAN=${globals.hasPlan} pageerror=${pageErrors.length}${pageErrors.length ? `（${pageErrors[0]}）` : ''}`,
  );
  verdict(
    'ARENA_SIZED_FROM_PLAN',
    !!globals.canvas && globals.canvas.width === topPlan.arena.width && globals.canvas.height === topPlan.arena.height,
    `画布 ${globals.canvas?.width ?? '无'}×${globals.canvas?.height ?? '无'}，计划 ${topPlan.arena.width}×${topPlan.arena.height}`,
  );
  // 页面上那句链名与生成器供给的是同一串字节（界面与产物各拼一遍迟早分家）
  verdict(
    'CHAIN_NOTE_ON_PAGE',
    globals.chainNote === artifactChainSentence('topdown') && globals.kindNote === null,
    `页里 #chain-note=「${String(globals.chainNote).slice(0, 28)}…」#kind-note=${globals.kindNote === null ? '没有这一格' : '有'}`,
  );

  const expectedRules: Record<string, number> = {
    contactCooldown: CONTACT_COOLDOWN,
    playerAttackCooldown: PLAYER_ATTACK_COOLDOWN,
    maxFrameSeconds: MAX_FRAME_SECONDS,
    eventCap: EVENT_CAP,
  };
  const ruleDiff = Object.keys(expectedRules)
    .filter((key) => globals.rules?.[key] !== expectedRules[key])
    .map((key) => `${key}: 页里 ${String(globals.rules?.[key])} / 导出 ${String(expectedRules[key])}`);
  verdict(
    'RULES_LIVE',
    !!globals.rules && ruleDiff.length === 0,
    ruleDiff.length ? ruleDiff.join('；') : `页内 window.RULES 四项与 sim.ts 导出逐值相等（${Object.values(expectedRules).join('、')}）`,
  );

  const planEqual = await page.evaluate(
    (expected) => JSON.stringify((window as unknown as { NEXUS_PLAN: unknown }).NEXUS_PLAN) === expected,
    JSON.stringify(topPlan),
  );
  verdict('PLAN_IS_THE_SAME_PROJECTION', planEqual, '页里 window.NEXUS_PLAN 序列化后与主机侧 artifactPayload(doc) 逐字节相同');

  const played = await runInPage(page, 'NexusSim', topPlan, frames);
  const browserTrace = JSON.parse(played.traceJson) as SimState[];
  const lastBrowser = browserTrace[browserTrace.length - 1]!;

  let firstDiffAt = -1;
  const limit = Math.min(played.traceJson.length, referenceJson.length);
  for (let i = 0; i < limit; i += 1) {
    if (played.traceJson[i] !== referenceJson[i]) {
      firstDiffAt = i;
      break;
    }
  }
  verdict(
    'STATE_TRACE_PARITY',
    played.traceJson === referenceJson,
    played.traceJson === referenceJson
      ? `${frames.length} 帧、${reference.length} 个状态、${referenceJson.length} 字节逐字符相同`
      : `第 ${firstDiffAt} 字节起不同（浏览器 ${played.traceJson.length} 字节 / Node ${referenceJson.length} 字节）：…${played.traceJson.slice(Math.max(0, firstDiffAt - 60), firstDiffAt + 60)} ⟶ …${referenceJson.slice(Math.max(0, firstDiffAt - 60), firstDiffAt + 60)}`,
  );

  const summaryEqual = played.summary === simSummary(reference[reference.length - 1]!);
  verdict('SUMMARY_PARITY', summaryEqual, summaryEqual ? `末态摘要逐字相同：${played.summary}` : `页里「${played.summary}」≠ Node「${simSummary(reference[reference.length - 1]!)}」`);

  const counters = lastBrowser.counters;
  const branches: string[] = [];
  if (!counters.damageTaken) branches.push('接触伤害没有发生过');
  if (!counters.attacks) branches.push('挥击没有发生过');
  if (!counters.damageDealt) branches.push('伤害没有打到过敌人');
  if (!counters.pickups) branches.push('拾取没有发生过');
  if (counters.triggersFired < 2) branches.push(`机关只踩了 ${counters.triggersFired} 次，冷却与再激活分支没走到`);
  if (lastBrowser.events.length !== EVENT_CAP) branches.push(`事件流末长 ${lastBrowser.events.length}，没越过上限 ${EVENT_CAP}，裁剪分支没走到`);
  const enemyDown = lastBrowser.enemies.every((e) => !e.active);
  if (!enemyDown) branches.push('敌人没被打倒，击杀分支没走到');
  verdict('BRANCHES_EXERCISED', branches.length === 0, branches.length ? branches.join('；') : `伤害 ${counters.damageTaken} / 挥击 ${counters.attacks} / 输出 ${counters.damageDealt} / 拾取 ${counters.pickups} / 机关 ${counters.triggersFired}，事件流停在 ${lastBrowser.events.length} 条上限，敌人全倒`);

  // 末帧喂的是 dt=5 秒：两边都必须只前进 maxFrameSeconds。这一条读的是**跑出来的 t**，
  // 不是模板里的字面量——静态闸那条只证明数字插进去了，这条证明插进去的那个数在起作用。
  const lastStepAdvance = Math.round((lastBrowser.t - browserTrace[browserTrace.length - 2]!.t) * 1e6) / 1e6;
  const referenceAdvance = Math.round((reference[reference.length - 1]!.t - reference[reference.length - 2]!.t) * 1e6) / 1e6;
  verdict(
    'FRAME_CAP_LIVE',
    lastStepAdvance === MAX_FRAME_SECONDS && referenceAdvance === MAX_FRAME_SECONDS,
    `喂 dt=5 的末帧：产物前进 ${lastStepAdvance} 秒、平台引擎前进 ${referenceAdvance} 秒，都夹在上限 ${MAX_FRAME_SECONDS}`,
  );

  // 反向控制：同一页面、同一引擎，只把**第一帧**的输入改成"站着不动"——玩家就永远走不到敌人面前，
  // 后面每一帧都跟着分叉。若 trace 还是同一串，说明"相等"跟输入无关，这条见证就是空的。
  // （第一版改的是最后 50 帧，那一段本来就已经顶在墙上不动，两边都不变——那是控制臂自己的缺陷，不是引擎的。）
  const mutated: Frame[] = frames.map((frame, index) => (index === 0 ? { input: { dx: 0, dy: 0, attack: false }, dt: frame.dt } : frame));
  const browserMutatedJson = (await runInPage(page, 'NexusSim', topPlan, mutated)).traceJson;
  const referenceMutated = JSON.stringify(runReference(topPlan, mutated));
  const controlMoved = browserMutatedJson !== played.traceJson && referenceMutated !== referenceJson;
  const controlMatches = browserMutatedJson === referenceMutated;
  const mutatedStates = JSON.parse(browserMutatedJson) as SimState[];
  const firstMovedState = browserTrace.findIndex((s, i) => JSON.stringify(s) !== JSON.stringify(mutatedStates[i]));
  verdict(
    'CONTROL_MUTATED_INPUT',
    controlMoved && controlMatches,
    `改第一帧的输入：浏览器侧${controlMoved ? `确实变了（第一个分叉在第 ${firstMovedState} 个状态）` : '没变（等于见证不敏感）'}，Node 侧跑同一份改动${controlMatches ? '仍与产物逐字节相等' : '与产物不等'}`,
  );

  const blocked = await page.evaluate(() =>
    fetch('/plan.json')
      .then(() => 'allowed')
      .catch(() => 'blocked'),
  );
  verdict('CSP_CONNECT_NONE', blocked === 'blocked', `页面内 fetch 自己：${blocked}（CSP connect-src 'none'）`);

  // 没有玩家的那一份：初始态、"拒绝之后不再推进"、以及那句拒绝本身的文案，都要与平台引擎一致。
  // 计划由主机侧算好后喂进去（`compileGame` 是平台的投影，不是产物的一部分），
  // 引擎与那句 `TEXT.noPlayer` 是产物自己的。
  const noPlayerLive = await runInPage(page, 'NexusSim', noPlayerPlan, [{ input: { dx: 1, dy: 0, attack: false }, dt: 0.1 }]);
  const noPlayerStates = JSON.parse(noPlayerLive.traceJson) as SimState[];
  const noPlayerMatch = JSON.stringify(noPlayerStates[0]) === noPlayerReference;
  const noPlayerFrozen = JSON.stringify(noPlayerStates[1]) === noPlayerReference;
  verdict(
    'NO_PLAYER_REFUSAL',
    noPlayerMatch && noPlayerFrozen && noPlayerStates[0]!.outcome === SIM_NO_PLAYER_OUTCOME,
    `无玩家初始态${noPlayerMatch ? '与 Node 相同' : '与 Node 不同'}，step 之后${noPlayerFrozen ? '保持不动' : '仍在推进'}，outcome=「${String(noPlayerStates[0]!.outcome)}」`,
  );

  // ———— 第二条链：标了 RPG 原型的那一份产物 ————
  await rpgPage.goto(`${origin}/rpg/index.html`, { waitUntil: 'load' });
  const rpgGlobals = await rpgPage.evaluate(() => ({
    hasSim: typeof (window as unknown as { NexusSim?: unknown }).NexusSim === 'object',
    hasRpg: typeof (window as unknown as { NexusRpg?: unknown }).NexusRpg === 'object',
    chainNote: document.querySelector('#chain-note')?.textContent ?? null,
    kindNote: document.querySelector('#kind-note')?.textContent ?? null,
    growth: (window as unknown as { NEXUS_PLAN?: { growth?: unknown } }).NEXUS_PLAN?.growth ?? null,
  }));
  verdict(
    'RPG_PAGE_LOADS',
    rpgGlobals.hasSim && rpgGlobals.hasRpg && pageErrors.length === 0,
    `NexusSim=${rpgGlobals.hasSim} NexusRpg=${rpgGlobals.hasRpg}（这一型该带）#kind-note=${rpgGlobals.kindNote === null ? '没有这一格' : '有'} pageerror 累计 ${pageErrors.length}`,
  );
  verdict(
    'RPG_CHAIN_NOTE_ON_PAGE',
    rpgGlobals.chainNote === artifactChainSentence('rpg') && rpgGlobals.kindNote === null,
    `页里 #chain-note=「${String(rpgGlobals.chainNote).slice(0, 28)}…」，与生成器那句${rpgGlobals.chainNote === artifactChainSentence('rpg') ? '相同' : '不同'}`,
  );
  const rpgPlanEqual = await rpgPage.evaluate(
    (expected) => JSON.stringify((window as unknown as { NEXUS_PLAN: unknown }).NEXUS_PLAN) === expected,
    JSON.stringify(growthPlan),
  );
  verdict(
    'RPG_PLAN_CARRIES_GROWTH',
    rpgPlanEqual && rpgGlobals.growth !== null,
    `页里 NEXUS_PLAN 与 artifactPayload(${growthDoc.name}) 逐字节${rpgPlanEqual ? '相同' : '不同'}，其中 growth ${rpgGlobals.growth === null ? '不在' : '在'}（${growthPlan.growth.enemyXp.length} 个敌人发经验、曲线 ${growthPlan.growth.xpBase}+${growthPlan.growth.xpStep}）`,
  );

  const rpgPlayed = await runInPage(rpgPage, 'NexusRpg', growthPlan, JSON.parse(rpgFramesJson) as Frame[]);
  const rpgReferenceJson = JSON.stringify(runRpgReference(growthDoc, frames));
  let rpgFirstDiff = -1;
  const rpgLimit = Math.min(rpgPlayed.traceJson.length, rpgReferenceJson.length);
  for (let i = 0; i < rpgLimit; i += 1) {
    if (rpgPlayed.traceJson[i] !== rpgReferenceJson[i]) {
      rpgFirstDiff = i;
      break;
    }
  }
  verdict(
    'RPG_STATE_TRACE_PARITY',
    rpgPlayed.traceJson === rpgReferenceJson,
    rpgPlayed.traceJson === rpgReferenceJson
      ? `${frames.length} 帧成长 trace 与 rpg.ts 逐字符相同（${rpgReferenceJson.length} 字节）`
      : `第 ${rpgFirstDiff} 字节起不同（浏览器 ${rpgPlayed.traceJson.length} / Node ${rpgReferenceJson.length}）：…${rpgPlayed.traceJson.slice(Math.max(0, rpgFirstDiff - 60), rpgFirstDiff + 60)} ⟶ …${rpgReferenceJson.slice(Math.max(0, rpgFirstDiff - 60), rpgFirstDiff + 60)}`,
  );
  const rpgStates = JSON.parse(rpgPlayed.traceJson) as RpgState[];
  const lastRpg = rpgStates[rpgStates.length - 1]!;
  const rpgSummaryEqual = rpgPlayed.summary === rpgSummary(compileRpg(growthDoc), lastRpg);
  verdict(
    'RPG_SUMMARY_PARITY',
    rpgSummaryEqual,
    rpgSummaryEqual ? `末态摘要逐字相同：${rpgPlayed.summary}` : `页里「${rpgPlayed.summary}」≠ Node「${rpgSummary(compileRpg(growthDoc), lastRpg)}」`,
  );

  // 成长那一层必须真的跑到了：升到 2 级、事件流里出现过那一句、上限与伤害按 levelBonus 加过。
  // 那句要在**整条 trace** 里找：末态那份事件流停在 EVENT_CAP 条，升级那一条早就被后面的踩机关挤掉了
  // （上一版只读末态，于是"事件流被裁剪"这个正确行为把它自己判成了红）。
  const levelEvent = rpgStates.some((state) => state.base.events.some((event) => event.text.startsWith('升到 2 级')));
  const curveFromData = xpToNext(growthPlan.growth!, 2) === XP_BASE + XP_STEP;
  verdict(
    'RPG_LEVEL_UP_LIVE',
    lastRpg.level === 2 && lastRpg.levelUps === 1 && levelEvent && curveFromData,
    `末态等级 ${lastRpg.level}（升级 ${lastRpg.levelUps} 次）、残余经验 ${lastRpg.xp}、曲线第 2 级要 ${xpToNext(growthPlan.growth!, 2)} 点、每级生命上限 +${growthPlan.growth?.levelBonus.maxHealth}、事件流里${levelEvent ? '有' : '没有'}那句升级——曲线与加成读的是 plan.growth，源头是 rpg.ts 的导出（${XP_BASE}+${XP_STEP}、生命 +${LEVEL_BONUS.maxHealth}）`,
  );

  // 反向控制：同几何、同输入，2D 那份与 RPG 那份的**战斗本身**必须真的分叉（升级后的伤害进了 sim）。
  // 比分叉的必须是战斗那几只字段，不是整份状态：
  // - 第一版比整串 `RpgState`，2026-10-20 的变异臂把升级曲线换成一个够不着的数（一次都升不了级、
  //   成长层整层失效）时它照样绿——RPG 那份多带 `level` / `xp` 那几个键，形状不同就够了。
  // - 第二版剥掉那几个键只比 `base`，同一臂仍然绿：`base.events` 与 `base.questDone` 是成长层写的
  //   （"击杀 X 得 20 经验"这类句子），两边天然不同，量的还是"有没有成长那一段"，不是"成长改到了战斗"。
  // 所以这里只取伤害能碰到的那些：位置、生命、三类 actor、累计计数。
  const combatOf = (state: SimState) =>
    JSON.stringify({
      px: state.px,
      py: state.py,
      health: state.health,
      enemies: state.enemies,
      items: state.items,
      triggers: state.triggers,
      counters: state.counters,
    });
  const rpgCombat = rpgStates.map((state) => combatOf(state.base));
  const diverging = rpgCombat.filter((json, i) => json !== combatOf(browserTrace[i]!)).length;
  verdict(
    'RPG_LAYER_NOT_DECORATIVE',
    rpgCombat.length === browserTrace.length && diverging > 0,
    rpgCombat.length !== browserTrace.length
      ? `帧数就对不上：RPG ${rpgCombat.length} / 2D ${browserTrace.length}`
      : diverging > 0
        ? `只比战斗那几只字段（位置 / 生命 / 三类 actor / 累计计数）：${diverging} 帧与 2D 那份不同，成长确实改到了伤害；两边各 ${rpgPlayed.traceJson.length} / ${played.traceJson.length} 字节`
        : '战斗逐帧与 2D 那份相同：NexusRpg 只是多带了几个键与几句事件，伤害没被成长改过',
  );

  // 等级门：条件每帧满足、等级每帧不够，于是每帧都扣住，won 每帧被撤回，事件流一路顶到上限
  const gatePlayed = await runInPage(rpgPage, 'NexusRpg', gatePlan, gateFrames);
  const gateReferenceJson = JSON.stringify(gateReference);
  const gateStates = JSON.parse(gatePlayed.traceJson) as RpgState[];
  const lastGate = gateStates[gateStates.length - 1]!;
  const heldEvents = gateStates.flatMap((state) => state.base.events).filter((event) => event.text.includes('才能交'));
  verdict(
    'RPG_GATE_HELD',
    gatePlayed.traceJson === gateReferenceJson &&
      lastGate.base.questDone['q1'] === undefined &&
      lastGate.base.status === 'playing' &&
      heldEvents.length > 0 &&
      lastGate.base.events.length === EVENT_CAP,
    `等级门 trace 与 rpg.ts ${gatePlayed.traceJson === gateReferenceJson ? '逐字符相同' : '不同'}；末态等级 ${lastGate.level}（要 3 级）、任务完成标记 ${lastGate.base.questDone['q1'] === undefined ? '仍被扣住' : '已放出'}、状态 ${lastGate.base.status}、扣住事件 ${heldEvents.length} 条、事件流停在 ${lastGate.base.events.length} 条`,
  );


  // ———— 第三条链：对话管线那一份产物 ————
  await storyPage.goto(`${origin}/story/index.html`, { waitUntil: 'load' });
  const storyGlobals = await storyPage.evaluate(() => ({
    hasStory: typeof (window as unknown as { NexusStory?: unknown }).NexusStory === 'object',
    hasPlan: typeof (window as unknown as { NEXUS_PLAN?: unknown }).NEXUS_PLAN === 'object',
    chainNote: document.querySelector('#chain-note')?.textContent ?? null,
    kindNote: document.querySelector('#kind-note')?.textContent ?? null,
    hasCanvas: document.querySelector('canvas') !== null,
    body: document.querySelector('#story p')?.textContent ?? null,
    choices: [...document.querySelectorAll('#story [data-story-choice]')].map((b: Element) => ({
      id: b.getAttribute('data-story-choice'),
      label: b.textContent ?? '',
    })),
    hud: document.querySelector('#hud')?.textContent ?? null,
  }));
  verdict(
    'STORY_PAGE_LOADS',
    storyGlobals.hasStory && storyGlobals.hasPlan && pageErrors.length === 0,
    `NexusStory=${storyGlobals.hasStory} NEXUS_PLAN=${storyGlobals.hasPlan}（这一型该带）pageerror 累计 ${pageErrors.length}`,
  );
  verdict(
    'STORY_CHAIN_NOTE_ON_PAGE',
    storyGlobals.chainNote === artifactChainSentence('story') && storyGlobals.kindNote === null,
    `页里 #chain-note=「${String(storyGlobals.chainNote).slice(0, 28)}…」，与生成器那句${storyGlobals.chainNote === artifactChainSentence('story') ? '相同' : '不同'}`,
  );
  verdict(
    'STORY_DRAWS_NO_CANVAS',
    !storyGlobals.hasCanvas,
    `对话那一型${storyGlobals.hasCanvas ? '画了' : '没有'}画布（对话没有场地，画一块空画布只会让人以为坏了）`,
  );
  const storyPlanEqual = await storyPage.evaluate(
    (expected) => JSON.stringify((window as unknown as { NEXUS_PLAN: unknown }).NEXUS_PLAN) === expected,
    JSON.stringify(storyPlan),
  );
  verdict(
    'STORY_PLAN_MATCHES',
    storyPlanEqual,
    `页里 NEXUS_PLAN 与 artifactPayload(${storyDoc.name}) 逐字节${storyPlanEqual ? '相同' : '不同'}`,
  );

  // ———— 对话那一段的 scripted 见证：同一串选择，模型与产物两边逐字段比 ————
  const storyChoices = storyScript(storyPlan);
  const storyReference = runStoryReference(storyPlan, storyChoices);
  const storyReferenceJson = JSON.stringify(storyReference);
  const storyPlayed = await runStoryInPage(storyPage, storyPlan, storyChoices);
  let storyFirstDiff = -1;
  const storyLimit = Math.min(storyPlayed.traceJson.length, storyReferenceJson.length);
  for (let i = 0; i < storyLimit; i += 1) {
    if (storyPlayed.traceJson[i] !== storyReferenceJson[i]) {
      storyFirstDiff = i;
      break;
    }
  }
  verdict(
    'STORY_STATE_TRACE_PARITY',
    storyPlayed.traceJson === storyReferenceJson,
    storyPlayed.traceJson === storyReferenceJson
      ? `${storyChoices.length} 步（含 2 步打不中）、${storyReference.length} 个状态、${storyReferenceJson.length} 字节逐字符相同`
      : `第 ${storyFirstDiff} 字节起不同（浏览器 ${storyPlayed.traceJson.length} / Node ${storyReferenceJson.length}）：…${storyPlayed.traceJson.slice(Math.max(0, storyFirstDiff - 60), storyFirstDiff + 60)} ⟶ …${storyReferenceJson.slice(Math.max(0, storyFirstDiff - 60), storyFirstDiff + 60)}`,
  );

  const storyStates = JSON.parse(storyPlayed.traceJson) as StoryState[];
  const lastStory = storyStates[storyStates.length - 1]!;
  const storySummaryEqual = storyPlayed.summary === storySummary(storyPlan, lastStory);
  verdict(
    'STORY_SUMMARY_PARITY',
    storySummaryEqual,
    storySummaryEqual ? `末态摘要逐字相同：${storyPlayed.summary}` : `页里「${storyPlayed.summary}」≠ Node「${storySummary(storyPlan, lastStory)}」`,
  );

  // 打不中的两步：步数不动、返回同一个对象；走通的四步：步数 +1、换新对象。
  // 只比 JSON 看不到"偷偷换了个拷贝"——那正是转写最容易走样的地方。
  const movement = storyChoices.map((spec, index) => ({
    spec,
    advanced: storyStates[index + 1]!.steps === storyStates[index]!.steps + 1,
    same: storyPlayed.sameObject[index],
  }));
  const wrongMovement = movement.filter((entry) => entry.advanced !== entry.spec.moves);
  const wrongIdentity = movement.filter((entry) => entry.same !== !entry.spec.moves);
  verdict(
    'STORY_NOOP_IS_A_NOOP',
    wrongMovement.length === 0 && wrongIdentity.length === 0,
    wrongMovement.length === 0 && wrongIdentity.length === 0
      ? '打不中的 2 步（不存在的 id、别段的选择 id）步数与对象都没动；走通的 4 步各 +1 步并换新对象'
      : `${wrongMovement.map((entry) => `「${entry.spec.choiceId}」步数${entry.advanced ? '动了' : '没动'}`).join('、')}${wrongMovement.length && wrongIdentity.length ? '；' : ''}${wrongIdentity.map((entry) => `「${entry.spec.choiceId}」${entry.same ? '返回同一对象' : '换了新对象'}`).join('、')}`,
  );

  const revisits = Object.entries(lastStory.visited).filter(([, count]) => count > 1);
  // 事件流每一步都随状态带一份完整的旧事件，直接 flatMap 会把同一条数好几遍（3 条数成 8 条）。
  // 按 `t` 去重后才是真正发生过几次成环。
  const loopEvents = new Map<number, string>();
  for (const state of storyStates) {
    for (const event of state.events) if (event.text.includes('成环')) loopEvents.set(event.t, event.text);
  }
  const movedSteps = storyChoices.filter((spec) => spec.moves).length;
  verdict(
    'STORY_LOOP_EXERCISED',
    lastStory.loop && revisits.length > 0 && loopEvents.size > 0 && lastStory.steps === movedSteps,
    `末态「${storyPlan.beats.find((beat) => beat.id === lastStory.beatId)?.name ?? '（没有）'}」、走 ${lastStory.steps} 步（走通 ${movedSteps} 次）、重访 ${revisits.map(([id, count]) => `${id}×${count}`).join('、')}、成环事件 ${loopEvents.size} 条、面包屑 ${lastStory.trail.length} 段`,
  );

  const endingChoices = endingScript(endingStoryPlan);
  const endingReferenceJson = JSON.stringify(runStoryReference(endingStoryPlan, endingChoices));
  const endingPlayed = await runStoryInPage(storyPage, endingStoryPlan, endingChoices);
  const endingStates = JSON.parse(endingPlayed.traceJson) as StoryState[];
  const endingNodeSummary = storySummary(endingStoryPlan, endingStates[endingStates.length - 1]!);
  verdict(
    'STORY_ENDING_PARITY',
    endingPlayed.traceJson === endingReferenceJson && endingPlayed.summary === endingNodeSummary && endingPlayed.summary.includes('没有出边'),
    `收束 trace 与 story.ts ${endingPlayed.traceJson === endingReferenceJson ? '逐字符相同' : '不同'}；末态摘要${endingPlayed.summary === endingNodeSummary ? '相同' : '不同'}：${endingPlayed.summary}`,
  );

  const emptyChoices: StoryChoiceSpec[] = [{ choiceId: 'any', moves: false }];
  const emptyReferenceJson = JSON.stringify(runStoryReference(emptyStoryPlan, emptyChoices));
  const emptyPlayed = await runStoryInPage(storyPage, emptyStoryPlan, emptyChoices);
  const emptyStates = JSON.parse(emptyPlayed.traceJson) as StoryState[];
  verdict(
    'STORY_UNPLAYABLE_REFUSAL',
    emptyPlayed.traceJson === emptyReferenceJson &&
      emptyStates[0]!.status === 'ended' &&
      emptyStates[0]!.outcome === STORY_NO_BEATS_OUTCOME &&
      emptyPlayed.sameObject[0] === true,
    `一条对话都没有的计划：初始态与 story.ts ${emptyPlayed.traceJson === emptyReferenceJson ? '逐字符相同' : '不同'}，status=${emptyStates[0]!.status}，outcome=「${String(emptyStates[0]!.outcome)}」，点一下${emptyPlayed.sameObject[0] ? '原样返回同一个对象' : '**换了新对象**'}`,
  );

  // 反向控制：把第一步换成打不中的 id——两边都必须跟着变，且变完仍逐字节相同。
  // 若 trace 没变，说明"相等"跟选择无关，上面几格是空的。
  const mutatedStoryChoices = storyChoices.map((spec, index) => (index === 0 ? { choiceId: 'no-such-choice', moves: false } : spec));
  const mutatedStoryReferenceJson = JSON.stringify(runStoryReference(storyPlan, mutatedStoryChoices));
  const mutatedStoryPlayed = await runStoryInPage(storyPage, storyPlan, mutatedStoryChoices);
  verdict(
    'STORY_CONTROL_MUTATED_SCRIPT',
    mutatedStoryPlayed.traceJson !== storyPlayed.traceJson &&
      mutatedStoryPlayed.traceJson === mutatedStoryReferenceJson &&
      mutatedStoryReferenceJson !== storyReferenceJson,
    `把第一步换成打不中的 id：浏览器侧${mutatedStoryPlayed.traceJson !== storyPlayed.traceJson ? '确实变了' : '**没变**（见证不敏感）'}，Node 侧跑同一份改动${mutatedStoryPlayed.traceJson === mutatedStoryReferenceJson ? '仍与产物逐字节相同' : '与产物不等'}`,
  );

  // 选一个选项 → 正文换成目标那一段（这是「对话链真的在跑」的那一格）
  const startBeat = storyPlan.beats.find((b) => b.id === storyPlan.startId);
  const firstChoice = storyGlobals.choices[0];
  const targetBeat = storyPlan.beats.find((b) => b.id === startBeat?.choices[0]?.to);
  let advancedBody: string | null = null;
  if (firstChoice?.id) {
    await storyPage.click(`[data-story-choice="${firstChoice.id}"]`);
    advancedBody = await storyPage.evaluate(() => document.querySelector('#story p')?.textContent ?? null);
  }
  verdict(
    'STORY_CHOICE_ADVANCES',
    Boolean(firstChoice?.id) && advancedBody !== null && advancedBody !== storyGlobals.body && advancedBody === targetBeat?.text,
    `起手正文「${String(storyGlobals.body)}」→ 点「${String(firstChoice?.label)}」→ 正文「${String(advancedBody)}」${
      advancedBody === targetBeat?.text ? '（与投影里目标那一段的正文逐字相同）' : '（与投影对不上）'
    }`,
  );

  // 走一圈回来 → 成环被标出来（模型允许成环，播放器负责标，不是禁止）
  const backChoice = await storyPage.evaluate(() => {
    const b = document.querySelector('#story [data-story-choice]');
    return b ? b.getAttribute('data-story-choice') : null;
  });
  if (backChoice) await storyPage.click(`[data-story-choice="${backChoice}"]`);
  const storyHud = await storyPage.evaluate(() => document.querySelector('#hud')?.textContent ?? '');
  verdict(
    'STORY_LOOP_MARKED',
    storyHud.includes('成环'),
    `走一圈回来之后 HUD ${storyHud.includes('成环') ? '说了"成环"' : '**没有**说成环（模型里是允许成环的，播放器负责标出来）'}：${storyHud.split('\n')[0] ?? ''}`,
  );

  // 反向控制：把 plan.js 里那段正文改掉，页面显示必须跟着变——
  // 不变就说明正文是写死在产物代码里的，上面那几格全是在量一段装饰。
  const mutatedText = '说明：开场（被见证改过）';
  await storyMutPage.route('**/story/plan.js', async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace('说明：开场', mutatedText);
    await route.fulfill({ response, body });
  });
  await storyMutPage.goto(`${origin}/story/index.html`, { waitUntil: 'load' });
  const mutatedBody = await storyMutPage.evaluate(() => document.querySelector('#story p')?.textContent ?? null);
  verdict(
    'STORY_NOT_DECORATIVE',
    mutatedBody !== null && mutatedBody.includes(mutatedText),
    `把 plan.js 里那段正文换成「${mutatedText}」，页面显示${mutatedBody?.includes(mutatedText) ? '跟着变了' : '**没有**变（正文是写死的，上面那几格量的是装饰）'}`,
  );

  // 截图是证据不是判决：这一片被它咬过一次——2026-10-20 电池里的基线在 `page.screenshot`
  // 超时上抛穿，于是最后一条 NO_EGRESS 压根没跑到，而那一趟 23 条判决全绿。
  // NO_EGRESS 读的是请求清单，与像素无关，不该被渲染 I/O 拖走；落不成就在日志里点名。
  const shots: string[] = [];
  for (const [target, file] of [
    [page, 'screenshots/game-code-parity.png'],
    [rpgPage, 'screenshots/game-code-parity-rpg.png'],
    [storyPage, 'screenshots/game-code-parity-story.png'],
  ] as const) {
    try {
      await target.screenshot({ path: file, timeout: 120_000 });
      shots.push(file);
    } catch (error) {
      shots.push(`${file} 没落成（${String(error).split('\n')[0]}）`);
    }
  }
  const foreign = requests.filter((url) => !url.startsWith(origin));
  verdict('NO_EGRESS', foreign.length === 0, `${requests.length} 次请求（三条链各一份页面），离开产物源的 ${foreign.length} 次${foreign.length ? `：${foreign.join('、')}` : ''}`);
  console.log(`截图：${shots.join(' 与 ')}（console error ${consoleErrors.length} 条${consoleErrors.length ? `，第一条：${consoleErrors[0]}` : ''}）`);
} finally {
  await browser.close();
  server.close();
}

const failed = verdicts.filter((v) => !v.ok);
console.log(`\n合计 ${verdicts.length} 条判决，失败 ${failed.length} 条${failed.length ? `：${failed.map((f) => f.name).join('、')}` : ''}`);
process.exitCode = failed.length ? 1 : 0;
