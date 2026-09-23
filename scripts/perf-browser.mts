import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

/**
 * §146/§147 的浏览器端指标：首帧、pan/zoom 帧率、属性写入到画布更新的延迟。
 *
 * 以前这里"没有测量脚本，因此不写任何数字"（docs/PERFORMANCE.md 最后一条）。
 * 所以这个脚本的唯一目的就是把那三个数**真的量出来**：
 * - 只测用户看得见的东西（画布上真的出现节点、样式真的变了），不读内部状态；
 * - 每一档都跑 3 次取中位数，第一次算预热（JIT 没热的数没有参考价值）；
 * - 规模档要造大文档，造不出来就如实报"这一档没测到"，不退回小文档的数字冒充。
 *
 * 用法：`npx tsx scripts/perf-browser.mts [baseUrl] [节点数,...]`（默认 http://localhost:3100 与 1000）
 * 需要 web dev server 与 postgres 在跑（`npm run dev` / `npm run infra:up`）。
 */

const base = process.argv[2] ?? 'http://localhost:3100';
const scales = (process.argv[3] ?? '1000')
  .split(',')
  .map((n) => Number.parseInt(n, 10))
  .filter((n) => Number.isFinite(n) && n > 0);
const RUNS = 3;
const OUT = fileURLToPath(new URL('../screenshots/', import.meta.url));
await mkdir(OUT, { recursive: true });

type Sample = { label: string; unit: string; runs: number[]; median: number };
const samples: Sample[] = [];

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function record(label: string, unit: string, runs: number[]): void {
  // 丢掉第一次（预热），剩下的才是记进文档的数
  const kept = runs.slice(1);
  samples.push({ label, unit, runs: kept.map((v) => Math.round(v * 10) / 10), median: Math.round(median(kept) * 10) / 10 });
}

/** 页内探针：首帧 + 帧间隔采样，都在 addInitScript 里装好，免得量到脚本注入之后的那一段 */
const PROBE = `
  window.__perf = { start: performance.now(), firstNodeAt: null, frames: [] };
  const watch = () => {
    if (window.__perf.firstNodeAt === null && document.querySelector('[data-canvas-frame] [data-node-id]')) {
      window.__perf.firstNodeAt = performance.now() - window.__perf.start;
    }
    requestAnimationFrame(watch);
  };
  watch();
  let last = performance.now();
  const sample = (now) => {
    window.__perf.frames.push(now - last);
    last = now;
    requestAnimationFrame(sample);
  };
  requestAnimationFrame((t) => { last = t; sample(t); });

  /**
   * 属性写入 → 画布重绘的延迟。整段放在页内字符串里：
   * 从 Node 侧 page.evaluate 传闭包会被打包器套上 __name 包装，页内没有那个符号。
   */
  window.__propLatency = function (nodeId) {
    return new Promise(function (resolve, reject) {
      var el = document.querySelector('[data-canvas-frame] [data-node-id="' + nodeId + '"]');
      var input = document.querySelector('[data-prop="typography.fontSize"]');
      if (!el) return reject(new Error('画布上没有那个节点'));
      if (!input) return reject(new Error('属性面板里没有字号输入框'));
      var before = getComputedStyle(el).fontSize;
      var started = 0;
      input.addEventListener('input', function () { started = performance.now(); }, { once: true });
      var timer = window.setInterval(function () {
        if (!started) return;
        if (getComputedStyle(el).fontSize !== before) {
          window.clearInterval(timer);
          resolve(performance.now() - started);
        }
      }, 2);
      window.setTimeout(function () {
        window.clearInterval(timer);
        reject(new Error('10 秒内画布没有按新字号重绘'));
      }, 10000);
    });
  };
`;

// 无头 Chrome 的 rAF 不锁 vsync（实测帧距能到 6ms），所以那个数不能当"帧率"读。
// PERF_HEADED=1 用有头模式量：这才是用户屏幕上真的会看到的那 16.7ms 预算。
const headed = (process.env.PERF_HEADED ?? '') === '1';
const browser = await chromium.launch({ channel: 'chrome', headless: !headed });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(PROBE);
const page = await context.newPage();

// 建一个起手项目（8 个节点），后面的规模档在它之上改文档
await page.goto(`${base}/`);
await page.fill('[data-project-name-input]', `性能基准 ${new Date().toISOString().slice(11, 19)}`);
await page.waitForFunction(() => !(document.querySelector('[data-create-project]') as HTMLButtonElement | null)?.disabled);
await Promise.all([page.waitForURL(/\/studio\/[^/]+$/, { timeout: 60_000 }), page.click('[data-create-project]')]);
await page.waitForSelector('[data-canvas-frame] [data-node-id]', { timeout: 60_000 });
const projectId = new URL(page.url()).pathname.split('/').pop()!;
await page.addInitScript(`window.__perfProjectId = ${JSON.stringify(projectId)};`);

async function pageState(): Promise<string> {
  return page.evaluate(() => {
    const perf = (window as any).__perf;
    const timing = performance
      .getEntriesByType('resource')
      .filter((e) => e.name.includes('/api/projects'))
      .map((e) => `${e.initiatorType}:${Math.round(e.duration)}ms`)
      .slice(-3);
    return [
      `url=${location.pathname}`,
      `canvasFrame=${document.querySelectorAll('[data-canvas-frame]').length}`,
      `nodes=${document.querySelectorAll('[data-canvas-frame] [data-node-id]').length}`,
      `firstNodeAt=${perf ? perf.firstNodeAt : 'no-probe'}`,
      `api=${timing.join(',') || 'none'}`,
      `saveState=${document.querySelector('[data-save-state]')?.textContent ?? '-'}`,
    ].join(' ');
  });
}

/** 文档里有多少节点、画布 DOM 里真渲染了多少：这两个数不一样才说明有裁剪或漏渲染 */
async function canvasNodeCounts(): Promise<{ dom: number; layers: number }> {
  return page.evaluate(() => ({
    dom: document.querySelectorAll('[data-canvas-frame] [data-node-id]').length,
    layers: document.querySelectorAll('[data-layer-id]').length,
  }));
}

async function reloadAndMeasureFirstNode(): Promise<number> {
  await page.goto(`${base}/studio/${projectId}`, { waitUntil: 'commit' });
  try {
    await page.waitForFunction(() => (window as any).__perf?.firstNodeAt !== null, undefined, { timeout: 180_000 });
  } catch (error) {
    throw new Error(`等首帧超时：${await pageState()}（${error instanceof Error ? error.message : ''}）`);
  }
  const at = await page.evaluate(() => (window as any).__perf.firstNodeAt as number);
  const count = await page.locator('[data-canvas-frame] [data-node-id]').count();
  if (!Number.isFinite(at) || at <= 0) throw new Error(`首帧时间没量到：${await pageState()}（画布上有 ${count} 个节点）`);
  return at;
}

async function frameRate(label: string, drive: () => Promise<void>): Promise<void> {
  const runs: number[] = [];
  for (let run = 0; run < RUNS; run += 1) {
    await page.evaluate(() => ((window as any).__perf.frames = []));
    await drive();
    const frames = await page.evaluate(() => (window as any).__perf.frames as number[]);
    // 头两帧是采样器自己的启动开销，丢掉
    const intervals = frames.slice(2);
    if (intervals.length < 5) throw new Error(`${label}：只采到 ${intervals.length} 帧，样本不足，不能编一个数`);
    const sorted = [...intervals].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)]!;
    const dropped = intervals.filter((v) => v > 33.3).length;
    runs.push(median(intervals));
    console.log(`  ${label} 第 ${run + 1} 次：中位帧距 ${median(intervals).toFixed(1)}ms，p95 ${p95.toFixed(1)}ms，>33ms 的帧 ${dropped}/${intervals.length}`);
  }
  record(`${label}（中位帧距）`, 'ms', runs);
}

async function propToCanvasLatency(scope: string): Promise<void> {
  const runs: number[] = [];
  // 先回到默认视口：pan/zoom 测完之后目标节点可能已经被移出屏幕，点击会一直重试
  await page.goto(`${base}/studio/${projectId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-canvas-frame] [data-node-id]', { timeout: 60_000 });
  await page.click('[data-view="canvas"]');
  const headline = await page.evaluate(() => {
    const hit = [...document.querySelectorAll('[data-canvas-frame] [data-node-type="text"]')].find((el) =>
      el.textContent?.includes('从一句话到一个可发布的产品'),
    );
    return hit?.getAttribute('data-node-id') ?? null;
  });
  if (!headline) throw new Error('找不到标题节点，无法测属性写入延迟');

  for (let run = 0; run < RUNS; run += 1) {
    await page.click(`[data-node-id="${headline}"]`);
    await page.waitForSelector('[data-prop="typography.fontSize"]', { timeout: 30_000 });
    const target = run % 2 === 0 ? 48 : 52;
    const pending = page.evaluate(
      (id: string) => (window as any).__propLatency(id) as Promise<number>,
      headline,
    );
    await page.fill('[data-prop="typography.fontSize"]', String(target));
    runs.push(await pending);
    // 撤回去，别把项目留在改过的状态上（也顺带证明撤销链路还活着）
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(150);
  }
  record(`属性写入 → 画布更新${scope}`, 'ms', runs);
  await page.screenshot({ path: `${OUT}perf-canvas.png` });
}

/**
 * 造一份 N 节点的文档并 PUT 上去：走的是浏览器自己的会话与 CSRF，不另起一套凭据。
 *
 * 关键一步是**先离开 Studio 页面**再改：Studio 里有自动保存，
 * 停在编辑器里从外部 PUT 一份更大的文档，会被它那份内存里的旧文档回写覆盖掉
 * （上一版就在这里栽了：服务端明明存了 1000 个节点，刷新后画布还是 8 个，
 * 于是记进 docs/PERFORMANCE.md 的"1000/4000 节点"数字量的其实一直是 8 个节点）。
 */
async function growDocument(nodes: number): Promise<number> {
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(
    async (target) => {
      const match = document.cookie.match(/(?:^|;\s*)nexus_csrf=([a-f0-9]+)/);
      const projectId = window.__perfProjectId as string;
      const res = await fetch(`/api/projects/${projectId}`, { method: 'GET', cache: 'no-store' });
      if (!res.ok) return { ok: false, reason: `读取当前文档失败：HTTP ${res.status}` };
      const body = (await res.json()) as { document?: { pages: Array<{ nodes: Record<string, unknown> }> } };
      const doc = body.document;
      if (!doc) return { ok: false, reason: '响应里没有 document 字段' };
      const page0 = doc.pages[0]!;
      // 必须挂在 page.rootId 下面。上一版取的是"节点表里的第一个"，那往往是某个文本节点，
      // 文本节点不排版子节点 → 4000 个节点根本没进 paintOrder，画布只画 8 个，
      // 于是量出来的"4000 节点首帧/延迟"其实还是 8 个节点的数（这个坑见 docs/PERFORMANCE.md）
      const root = page0.nodes[page0.rootId] as { children: string[] } & Record<string, unknown>;
      if (!root) return { ok: false, reason: '页面根节点读不到，没法加节点' };
      const have = Object.keys(page0.nodes).length;
      // 造新节点的方式是**克隆一个已经合法的节点**再改身份字段，而不是手写一份字面量：
      // 上一版手写的节点缺 style.cornerRadius / layout.padding，
      // 那种文档会白屏（见 packages/design-model/test/malformed-node.test.ts），
      // 于是"压测到 1000 节点"其实一个都没渲染出来。
      const template =
        Object.values(page0.nodes).find((n) => n.id !== page0.rootId) ?? page0.nodes[page0.rootId];
      if (!template) return { ok: false, reason: '页面上找不到可克隆的节点' };
      let added = 0;
      for (let i = have; i < target; i += 1) {
        const id = `perf_${i.toString(36)}`;
        page0.nodes[id] = {
          ...structuredClone(template),
          id,
          name: `Perf ${i}`,
          parentId: root.id,
          children: [],
          text: typeof template.text === 'string' ? `压测文本 ${i}` : undefined,
        };
        root.children.push(id);
        added += 1;
      }
      const put = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-csrf-token': match?.[1] ?? '' },
        body: JSON.stringify(doc),
      });
      if (!put.ok) return { ok: false, reason: `写入失败：HTTP ${put.status} ${(await put.text()).slice(0, 200)}` };
      return { ok: true, nodes: have + added };
    },
    nodes,
  );
  if (!result.ok) throw new Error(result.reason);
  // 服务端说存了多少才算数：客户端自己加的数只是意图
  const check = await page.evaluate(async () => {
    const res = await fetch(`/api/projects/${window.__perfProjectId as string}`, { cache: 'no-store' });
    const body = (await res.json()) as { document?: { pages: Array<{ rootId: string; nodes: Record<string, unknown> }> } };
    const page0 = body.document?.pages[0];
    return page0 ? Object.keys(page0.nodes).length : -1;
  });
  if (check < nodes) throw new Error(`写入没生效：想让文档到 ${nodes} 个节点，服务端读回来只有 ${check} 个`);
  return check;
}

const firstNodeRuns: number[] = [];
for (let run = 0; run < RUNS; run += 1) firstNodeRuns.push(await reloadAndMeasureFirstNode());
record('首帧（起手项目 8 节点）', 'ms', firstNodeRuns);

await page.goto(`${base}/studio/${projectId}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-canvas-frame] [data-node-id]', { timeout: 60_000 });
await page.mouse.move(700, 450);

await frameRate('pan 平移', async () => {
  for (let i = 0; i < 40; i += 1) {
    await page.mouse.wheel(0, 24);
    await page.waitForTimeout(16);
  }
});

await frameRate('zoom 缩放', async () => {
  await page.keyboard.down('Control');
  for (let i = 0; i < 30; i += 1) {
    await page.mouse.wheel(0, i % 2 ? -40 : 40);
    await page.waitForTimeout(16);
  }
  await page.keyboard.up('Control');
});

await propToCanvasLatency('（起手 8 节点）');

for (const scale of scales) {
  let built = 0;
  try {
    built = await growDocument(scale);
  } catch (error) {
    console.log(`规模档 ${scale}：造文档失败 —— ${error instanceof Error ? error.message : String(error)}（这一档没有任何数字）`);
    continue;
  }
  const runs: number[] = [];
  let loadFailure = '';
  for (let run = 0; run < RUNS; run += 1) {
    try {
      runs.push(await reloadAndMeasureFirstNode());
    } catch (error) {
      // 这一档可能根本加载不完（4000 节点就是这样：画布已经只画 18 个，页面仍然出不来）。
      // 那要作为"没测到 + 为什么"记下来，而不是让整个脚本抛掉前面所有档的数字
      loadFailure = error instanceof Error ? error.message : String(error);
      console.log(`  ${built} 节点这一档首帧没量到：${loadFailure}`);
      break;
    }
  }
  if (runs.length >= 2) record(`首帧（${built} 节点）`, 'ms', runs);
  // 自检：文档真的变大了吗？图层树读的是整份文档、不受视口裁剪影响，所以拿它当"文档侧"的证据；
  // 画布 DOM 那一侧则要看有没有按视口裁剪（§147），两种情况分别核对，不能一概要求"DOM ≈ 文档"。
  const counts = await canvasNodeCounts();
  const badge = await page.locator('[data-canvas-virtualized]').count();
  console.log(
    `  ${built} 节点这一档：图层树 ${counts.layers} 行、画布 DOM ${counts.dom} 个、视口裁剪 ${badge ? '开着' : '没开'}`,
  );
  if (counts.layers < built * 0.9) {
    throw new Error(
      `压测没生效：想让文档到 ${built} 个节点，图层树只列得出 ${counts.layers} 行。` +
        `这时量出来的任何数都不能当成"${built} 节点的性能"。`,
    );
  }
  if (loadFailure) console.log(`  提示：这一档还有"没测到"的项，写进文档时不能只挑量到的那几个数。`);
  if (built > 400 && badge === 0) {
    throw new Error(`文档 ${built} 个节点却没过视口裁剪（DOM ${counts.dom}）：§147 那条改动没生效`);
  }
  if (built <= 400 && counts.dom < built * 0.9) {
    throw new Error(`小文档不该被裁：${built} 个节点，画布只渲染了 ${counts.dom} 个`);
  }
  record(`画布 DOM 节点数（${built} 节点文档）`, '个', [counts.dom, counts.dom, counts.dom]);

  await page.goto(`${base}/studio/${projectId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-canvas-frame] [data-node-id]', { timeout: 120_000 });
  await page.mouse.move(700, 450);
  await frameRate(`pan 平移（${built} 节点）`, async () => {
    for (let i = 0; i < 40; i += 1) {
      await page.mouse.wheel(0, 24);
      await page.waitForTimeout(16);
    }
  });
  await propToCanvasLatency(`（${built} 节点）`).catch((error) => {
    console.log(`  属性写入延迟（${built} 节点）没测成：${error instanceof Error ? error.message : String(error)}`);
  });
}

await browser.close();

console.log('\n浏览器端指标（每档 3 次，去掉第一次预热后取中位数）：');
for (const s of samples) {
  console.log(`${s.label.padEnd(28)} ${String(s.median).padStart(8)} ${s.unit}   各次: ${s.runs.join(' / ')}`);
}
console.log(`\n项目 ${projectId} 留在库里（含压测节点），要清理就删这个项目。`);
