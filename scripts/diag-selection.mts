import { chromium } from '@playwright/test';

/**
 * §147 选中响应的**分解诊断**：perf-browser 只给"点节点 → 手柄出现"一个总数，
 * 慢了也不知道慢在哪一段。一次点击是一个同步任务（事件 → store commit → React 渲染
 * → DOM），外部轮询拆不开它，所以分段读的是页面里已有的两本账：
 *
 *   store 段 = __studioPerf.snapshotMs 的差值（buildSnapshot 的累计耗时）
 *   React 段 = __studioPerf.reactMs 的差值（StudioShell 里 Profiler onRender 记的）
 *   其余     = 总数 − store − React（命中测试、事件分发、浏览器自身）
 *
 * 口径与 perf-browser 相同：同一浏览器、真实鼠标点击、点击前装探针、点空白处先取消选中。
 * 用法：npx tsx scripts/diag-selection.mts [baseUrl] [projectId]
 * 不给 projectId 就现场建一个起手项目（8 节点，对应"起手 8 节点"那档）。
 */

const base = process.argv[2] ?? 'http://localhost:3100';
const projectIdArg = process.argv[3];
const RUNS = 6;

type Diag = {
  taskMs: number;
  storeMs: number;
  reactMs: number;
  commits: number;
  handleMs: number | null;
  reactBy: Record<string, number>;
};

const headed = (process.env.PERF_HEADED ?? '') === '1';
const browser = await chromium.launch({ channel: 'chrome', headless: !headed });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => {
  const w = window as unknown as { __longTasks?: number[] | null };
  w.__longTasks = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.__longTasks!.push(Math.round(e.duration));
    }).observe({ type: 'longtask', buffered: false });
  } catch {
    w.__longTasks = null; // 量不到就说量不到，不假装是 0
  }
});
const page = await context.newPage();

let projectId = projectIdArg;
// 无论要不要现场建项目，都先访问首页：中间件在这里签发 nexus_session，
// 少了这一步 /studio/[id] 的 requireUser 会直接 404（guest 会话是浏览器第一次访问时给的）
await page.goto(`${base}/`);
if (!projectId) {
  await page.fill('[data-project-name-input]', `选中诊断 ${new Date().toISOString().slice(11, 19)}`);
  await page.waitForFunction(() => !(document.querySelector('[data-create-project]') as HTMLButtonElement | null)?.disabled);
  await Promise.all([page.waitForURL(/\/studio\/[^/]+$/, { timeout: 60_000 }), page.click('[data-create-project]')]);
  projectId = new URL(page.url()).pathname.split('/').pop()!;
}
await page.goto(`${base}/studio/${projectId}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-canvas-frame] [data-node-id]', { timeout: 60_000 });

const headline = await page.evaluate(() => {
  const hit = [...document.querySelectorAll('[data-canvas-frame] [data-node-type="text"]')].find((el) =>
    el.textContent?.includes('从一句话到一个可发布的产品'),
  );
  return hit?.getAttribute('data-node-id') ?? null;
});
if (!headline) throw new Error('找不到标题节点，没法诊断选中响应');

// 预热一次（JIT 没热的数没有参考价值，与 perf-browser 同规矩）
await page.click(`[data-node-id="${headline}"]`);
await page.waitForSelector('[data-resize-handle]', { timeout: 30_000 });
await page.keyboard.press('Escape');
await page.waitForFunction(() => document.querySelectorAll('[data-resize-handle]').length === 0, { timeout: 5000 });

const results: Diag[] = [];
for (let run = 0; run < RUNS; run += 1) {
  // 先取消选中：已选中的节点再点不会触发 select（也就没有 commit），量不到东西
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelectorAll('[data-resize-handle]').length === 0, { timeout: 5000 });
  const long0 = await page.evaluate(() => (window as unknown as { __longTasks?: number[] | null }).__longTasks?.length ?? 0);

  // 探针必须在点击**之前**装好：点击之后再 evaluate，CDP 往返会混进读数里
  await page.evaluate(() => {
    const bucket = (globalThis as unknown as { __studioPerf?: Record<string, number> }).__studioPerf ?? {};
    const d = {
      s0: bucket.snapshots ?? 0,
      m0: bucket.snapshotMs ?? 0,
      r0: bucket.reactMs ?? 0,
      t0: performance.now(),
      done: false,
      handleAt: null as number | null,
    };
    (window as unknown as { __diag?: typeof d }).__diag = d;
    const timer = window.setInterval(() => {
      if (document.querySelectorAll('[data-resize-handle]').length > 0) {
        d.handleAt = performance.now() - d.t0;
        d.done = true;
        window.clearInterval(timer);
      } else if (performance.now() - d.t0 > 3000) {
        d.done = true;
        window.clearInterval(timer);
      }
    }, 2);
  });

  const box = await page.locator(`[data-canvas-frame] [data-node-id="${headline}"]`).boundingBox();
  if (!box) throw new Error('目标节点没有包围盒（不在视口里？）');
  await page.mouse.click(Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2));

  const diag = await page.evaluate(
    () =>
      new Promise<Diag>((resolve, reject) => {
        const timer = window.setInterval(() => {
          const d = (window as unknown as { __diag?: { done: boolean; handleAt: number | null; t0: number; s0: number; m0: number; r0: number } }).__diag;
          if (d?.done) {
            window.clearInterval(timer);
            const bucket = (globalThis as unknown as { __studioPerf?: Record<string, unknown> }).__studioPerf ?? {};
            const by = (bucket.reactBy as Record<string, number>) ?? {};
            // 这两本账是页面里挂到 globalThis 上的裸对象，值都是 unknown：
            // 直接做减法会被 tsc 挡下（`unknown` 不能参与算术），所以先收窄再算
            const num = (value: unknown): number => (typeof value === 'number' ? value : 0);
            resolve({
              taskMs: d.handleAt ?? performance.now() - d.t0,
              handleMs: d.handleAt,
              storeMs: num(bucket.snapshotMs) - d.m0,
              reactMs: num(bucket.reactMs) - d.r0,
              commits: num(bucket.snapshots) - d.s0,
              reactBy: by,
            });
          }
        }, 2);
        window.setTimeout(() => {
          window.clearInterval(timer);
          reject(new Error('3 秒内没有出现选择手柄'));
        }, 3500);
      }),
  );
  results.push(diag);
  // 长任务观察器在任务结束后才回调，读早了会漏，等一拍再读
  await page.waitForTimeout(60);
  const longs = await page.evaluate(
    (from: number) => ((window as unknown as { __longTasks?: number[] | null }).__longTasks ?? []).slice(from),
    long0,
  );
  const byStr = Object.entries(diag.reactBy).map(([k, v]) => `${k}=${v.toFixed(1)}`).join(' ');
  console.log(
    `  第 ${run + 1} 次：总 ${diag.taskMs.toFixed(1)}ms · store ${diag.storeMs.toFixed(1)}ms · ` +
      `React ${diag.reactMs.toFixed(1)}ms (${byStr}) · 其余 ${Math.max(0, diag.taskMs - diag.storeMs - diag.reactMs).toFixed(1)}ms · ` +
      `${diag.commits} 次 commit · 长任务 ${longs.join('/') || '无'}`,
  );
}

// 丢第一次预热，报剩下几次的中位数（与 perf-browser 同规矩）
const kept = results.slice(1);
const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};
const pick = (f: (d: Diag) => number): number => Math.round(median(kept.map(f)) * 10) / 10;
console.log(`\n项目 ${projectId} · 去掉预热后 ${kept.length} 次的中位数：`);
console.log(`  总（点 → 手柄出现）   ${pick((d) => d.taskMs)} ms`);
console.log(`  store（buildSnapshot） ${pick((d) => d.storeMs)} ms`);
console.log(`  React（Profiler 段）   ${pick((d) => d.reactMs)} ms`);
const byKeys = Object.keys(kept[0]?.reactBy ?? {});
for (const k of byKeys) {
  console.log(`    ${k.padEnd(10)} ${pick((d) => d.reactBy[k] ?? 0)} ms`);
}
console.log(`  其余（命中/事件/浏览器） ${pick((d) => Math.max(0, d.taskMs - d.storeMs - d.reactMs))} ms`);
console.log(`  每次 commit 次数        ${kept.map((d) => d.commits).join(' / ')}`);

await browser.close();
