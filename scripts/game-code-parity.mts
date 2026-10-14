import { createServer } from 'node:http';
import { chromium } from '@playwright/test';
import {
  CONTACT_COOLDOWN,
  EVENT_CAP,
  MAX_FRAME_SECONDS,
  PLAYER_ATTACK_COOLDOWN,
  SIM_NO_PLAYER_OUTCOME,
  compileGame,
  generateGameCode,
  initialState,
  simSummary,
  step,
  validateGame,
  type GameDocument,
  type GameEntityKind,
  type GamePlan,
  type SimInput,
  type SimState,
} from '@nexus/game-model';

/**
 * §52 最后一格（Code）的**浏览器一致性见证**：产物里那份 `engine.js` 是 `sim.ts` 的转写，
 * 这句话要么两边真跑出同一串状态，要么它就是假的。
 *
 * `packages/game-model/test/codegen.test.ts` 里那条常量比对是**静态闸**——它只证明
 * "数字由同一处供给"（模板插的是 `sim.ts` 的导出，不是重打一遍的字面量），
 * 不证明"同一份计划 + 同一段输入 = 同一串状态"。算术、分支顺序、事件文案、
 * `Math.round` 的位置、越界夹取、事件流裁剪，这些都只有把产物真的跑起来才量得到。
 *
 * 于是这一条按 §81 唯一允许的路径跑：**产物只在浏览器里执行**，主机只喂字节。
 * - 主机侧不 `eval`、不 `new Function`、不起子进程跑产物；
 * - 七份产物文件由 `generateGameCode` 现场生成，直接经 loopback HTTP 发给浏览器，
 *   Origin 与平台（3100）不同；页面自带 `connect-src 'none'`，脚本输出里逐条核对它没往别处发请求；
 * - 参照串是主机侧跑 `sim.ts`（平台自己的代码，不是产物）得到的。
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

function build(name: string, specs: Spec[]): GameDocument {
  const document: GameDocument = {
    id: `game_${name}`,
    projectId: null,
    name,
    summary: '为一致性见证摆的战场',
    kind: 'rpg-prototype',
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
const battleDoc = build('战场', [
  { id: 'p1', kind: 'player', name: '主角', stats: { health: 60, speed: 200, x: 600, y: 380 } },
  { id: 'w1', kind: 'weapon', name: '短刃', stats: { damage: 2, range: 40 }, refs: [{ to: 'p1', role: '装备于' }] },
  { id: 'e1', kind: 'enemy', name: '巡逻兵', stats: { health: 3, damage: 1, speed: 120, detectionRange: 400, x: 520, y: 380 } },
  { id: 'i1', kind: 'item', name: '药包', stats: { stackSize: 1, x: 760, y: 380 } },
  { id: 't1', kind: 'trigger', name: '洞口', stats: { radius: 60, cooldown: 0, delay: 0, x: 900, y: 380 }, refs: [{ to: 'i1', role: '贴着' }] },
]);

/** 没有玩家的文档：`initialState` 那句拒绝与 `status=lost` 是转写里的 TEXT.noPlayer，要在活页面里读到它 */
const noPlayerDoc = build('空场', [
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

function runReference(plan: GamePlan, frames: Frame[]): SimState[] {
  let state = initialState(plan);
  const trace: SimState[] = [state];
  for (const frame of frames) {
    state = step(plan, state, frame.input, frame.dt);
    trace.push(state);
  }
  return trace;
}

const verdicts: { name: string; ok: boolean; detail: string }[] = [];
function verdict(name: string, ok: boolean, detail: string): void {
  verdicts.push({ name, ok, detail });
  console.log(`verdict ${name}: ${ok ? 'OK' : 'FAIL'} — ${detail}`);
}

const plan = compileGame(battleDoc);
if (!plan.player) throw new Error('底稿没有玩家投影，见证无从跑起');
const frames = scriptFor(plan);
const reference = runReference(plan, frames);
const referenceJson = JSON.stringify(reference);

const battleOutput = generateGameCode(battleDoc);
const noPlayerPlan = compileGame(noPlayerDoc);
const noPlayerReference = JSON.stringify(initialState(noPlayerPlan));

const byPath = new Map(battleOutput.files.map((f) => [f.path, f]));
const shellFiles = ['index.html', 'plan.js', 'engine.js', 'main.js', 'style.css'];
const missingShell = shellFiles.filter((p) => !byPath.has(p));
verdict('ARTIFACT_FILES', missingShell.length === 0, `${battleOutput.files.length} 个文件，页面引用缺 ${missingShell.length ? missingShell.join('、') : '无'}`);

const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]!).replace(/^\//, '') || 'index.html';
  const file = byPath.get(path);
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
const requests: string[] = [];
page.on('request', (request) => requests.push(request.url()));
const consoleErrors: string[] = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
const pageErrors: string[] = [];
page.on('pageerror', (error) => pageErrors.push(String(error)));

try {
  await page.goto(`${origin}/index.html`, { waitUntil: 'load' });

  const globals = await page.evaluate(() => ({
    hasSim: typeof (window as unknown as { NexusSim?: unknown }).NexusSim === 'object',
    hasPlan: typeof (window as unknown as { NEXUS_PLAN?: unknown }).NEXUS_PLAN === 'object',
    rules: (window as unknown as { RULES?: Record<string, number> }).RULES ?? null,
    canvas: (() => {
      const c = document.querySelector('canvas');
      return c ? { width: c.width, height: c.height } : null;
    })(),
  }));
  verdict(
    'PAGE_LOADS',
    globals.hasSim && globals.hasPlan && pageErrors.length === 0,
    `NexusSim=${globals.hasSim} NEXUS_PLAN=${globals.hasPlan} pageerror=${pageErrors.length}${pageErrors.length ? `（${pageErrors[0]}）` : ''}`,
  );
  verdict(
    'ARENA_SIZED_FROM_PLAN',
    !!globals.canvas && globals.canvas.width === plan.arena.width && globals.canvas.height === plan.arena.height,
    `画布 ${globals.canvas?.width ?? '无'}×${globals.canvas?.height ?? '无'}，计划 ${plan.arena.width}×${plan.arena.height}`,
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
    JSON.stringify(plan),
  );
  verdict('PLAN_IS_THE_SAME_PROJECTION', planEqual, '页里 window.NEXUS_PLAN 序列化后与主机侧 compileGame(doc) 逐字节相同');

  interface RunResult {
    traceJson: string;
    summary: string;
  }
  /** 把整段 scripted 输入交给产物自己的引擎，一次 evaluate 跑完整条 trace（产物只在浏览器里执行） */
  async function runInPage(arg: Frame[], planJson: unknown): Promise<RunResult> {
    return await page.evaluate((data) => {
      const w = window as unknown as {
        NexusSim: {
          initialState: (p: unknown) => unknown;
          step: (p: unknown, s: unknown, i: unknown, dt: number) => unknown;
          summary: (s: unknown) => string;
        };
      };
      const plan = data.planJson;
      let state = w.NexusSim.initialState(plan);
      const trace: unknown[] = [state];
      for (const frame of data.arg) {
        state = w.NexusSim.step(plan, state, frame.input, frame.dt);
        trace.push(state);
      }
      return { traceJson: JSON.stringify(trace), summary: w.NexusSim.summary(state) };
    }, { arg, planJson });
  }

  const played = await runInPage(frames, plan);
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
  const browserMutatedJson = (await runInPage(mutated, plan)).traceJson;
  const referenceMutated = JSON.stringify(runReference(plan, mutated));
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

  const foreign = requests.filter((url) => !url.startsWith(origin));
  verdict('NO_EGRESS', foreign.length === 0, `${requests.length} 次请求，离开产物源的 ${foreign.length} 次${foreign.length ? `：${foreign.join('、')}` : ''}`);

  // 没有玩家的那一份：初始态、"拒绝之后不再推进"、以及那句拒绝本身的文案，都要与平台引擎一致。
  // 计划由主机侧算好后喂进去（`compileGame` 是平台的投影，不是产物的一部分），
  // 引擎与那句 `TEXT.noPlayer` 是产物自己的。
  const noPlayerLive = await runInPage([{ input: { dx: 1, dy: 0, attack: false }, dt: 0.1 }], noPlayerPlan);
  const noPlayerStates = JSON.parse(noPlayerLive.traceJson) as SimState[];
  const noPlayerMatch = JSON.stringify(noPlayerStates[0]) === noPlayerReference;
  const noPlayerFrozen = JSON.stringify(noPlayerStates[1]) === noPlayerReference;
  verdict(
    'NO_PLAYER_REFUSAL',
    noPlayerMatch && noPlayerFrozen && noPlayerStates[0]!.outcome === SIM_NO_PLAYER_OUTCOME,
    `无玩家初始态${noPlayerMatch ? '与 Node 相同' : '与 Node 不同'}，step 之后${noPlayerFrozen ? '保持不动' : '仍在推进'}，outcome=「${String(noPlayerStates[0]!.outcome)}」`,
  );

  await page.screenshot({ path: 'screenshots/game-code-parity.png' });
  console.log(`截图：screenshots/game-code-parity.png（console error ${consoleErrors.length} 条）`);
} finally {
  await browser.close();
  server.close();
}

const failed = verdicts.filter((v) => !v.ok);
console.log(`\n合计 ${verdicts.length} 条判决，失败 ${failed.length} 条${failed.length ? `：${failed.map((f) => f.name).join('、')}` : ''}`);
process.exitCode = failed.length ? 1 : 0;
