import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { MAX_NODES_PER_DOCUMENT } from '../apps/web/src/server/validation';

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
/**
 * 每一组数都要带着"这是什么构建"的口径。§147 这一轮实测过两件事：
 * 同一台机器、同一脚本、同一档节点数，`next dev` 与生产构建的"属性写入 → 画布更新"差 5 倍
 * （1247.7ms 对 221.2ms，差的那截主要是 React DEV 的样式对象比对）；
 * 而同一份生产构建的两次调用之间，首帧量过 1904.9ms 与 540.2ms（3.5 倍）。
 * 不带口径的数没有比较价值——忘了带就让它在输出里自己说出来没带。
 */
const measuredUnder = process.env.PERF_LABEL
  ?? '未标口径（跑时带 PERF_LABEL=dev / prod-<commit>，否则这组数不能与别组比）';
const scales = (process.argv[3] ?? '100,1000')
  .split(',')
  .map((n) => Number.parseInt(n, 10))
  .filter((n) => Number.isFinite(n) && n > 0);
const RUNS = 3;
const OUT = fileURLToPath(new URL('../screenshots/', import.meta.url));
await mkdir(OUT, { recursive: true });

type Sample = { label: string; unit: string; runs: number[]; median: number; warm: number | null };
const samples: Sample[] = [];

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function record(label: string, unit: string, runs: number[]): void {
  // 丢掉第一次（预热），剩下的才是记进文档的数。
  // 但**丢掉的那一次要打印出来**：同一份生产构建的第一次跑与第二次跑差过 3.5 倍
  // （首帧 1904.9 vs 540.2），只报"去掉第一次的中位数"就等于把冷启动这件事藏起来。
  const kept = runs.slice(1);
  samples.push({
    label,
    unit,
    runs: kept.map((v) => Math.round(v * 10) / 10),
    median: Math.round(median(kept) * 10) / 10,
    warm: runs.length > 1 ? Math.round(runs[0]! * 10) / 10 : null,
  });
}

/** 页内探针：首帧 + 帧间隔采样，都在 addInitScript 里装好，免得量到脚本注入之后的那一段 */
const PROBE = `
  // startEpoch 是**绝对时间**：resource timing 的 startTime / responseEnd 都以 timeOrigin 为零点，
  // 而 firstNodeAt 以注入脚本这一刻为零点。混着减会得出负数的"之后 X ms"——第一版就是这么错的。
  window.__perf = { start: performance.now(), startEpoch: performance.timeOrigin + performance.now(), firstNodeAt: null, frames: [] };
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
   * 长任务采集：一次"改属性 → 画布重绘"如果慢，慢在哪个段要靠这个分。
   * 只记时长（>50ms 的那些），不记堆栈——脚本要的是"是不是一个把主线程占死的同步大块"。
   */
  window.__longTasks = [];
  try {
    new PerformanceObserver(function (list) {
      var entries = list.getEntries();
      for (var i = 0; i < entries.length; i++) window.__longTasks.push(Math.round(entries[i].duration));
    }).observe({ type: 'longtask', buffered: false });
  } catch (e) {
    window.__longTasks = null; // 量不到就说量不到，不假装是 0
  }

  /**
   * 长动画帧（LoAF）：为了回答"水合那一段花在哪一次脚本执行上"。
   * 资源计时答不了这个问题——它只有下载时间，没有执行时间，
   * 所以"HTML 到手 → 首帧"那一段以前只能整块报一个数。
   * Chrome 123+ 才有这一项，且只记 >=50ms 的帧；不支持就留 null，日志写"量不到"。
   * 每个监听器自己包 try/catch：上一版整段共用一个 try，longtask 不支持时
   * 后面那行 new PerformanceObserver 直接抛 ReferenceError，页面白屏、一个数也量不到。
   */
  window.__loaf = [];
  try {
    new PerformanceObserver(function (list) {
      var entries = list.getEntries();
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        var top = null;
        var scripts = e.scripts || [];
        for (var s = 0; s < scripts.length; s++) {
          if (!top || (scripts[s].duration || 0) > top.duration) {
            top = {
              duration: scripts[s].duration || 0,
              invoker: scripts[s].invoker || '(无名)',
              src: (scripts[s].sourceURL || '').split('/').pop() || '',
            };
          }
        }
        window.__loaf.push({ start: e.startTime, dur: Math.round(e.duration), blocking: Math.round(e.blockingDuration || 0), top: top });
      }
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch (e) {
    window.__loaf = null;
  }

  /**
   * 属性写入 → 画布重绘的延迟。整段放在页内字符串里：
   * 从 Node 侧 page.evaluate 传闭包会被打包器套上 __name 包装，页内没有那个符号。
   * 返回三个数而不是一个：总延迟、input 之后第一帧隔了多久（这段时间里主线程要是被占着，
   * 占它的就是 React 的同步提交）、以及期间出现的长任务时长。
   */
  window.__propLatency = function (nodeId) {
    return new Promise(function (resolve, reject) {
      var el = document.querySelector('[data-canvas-frame] [data-node-id="' + nodeId + '"]');
      var input = document.querySelector('[data-prop="typography.fontSize"]');
      if (!el) return reject(new Error('画布上没有那个节点'));
      if (!input) return reject(new Error('属性面板里没有字号输入框'));
      var before = getComputedStyle(el).fontSize;
      var started = 0;
      var firstFrame = 0;
      window.__longTasks.length = 0;
      // 顺手把 store 的分段计数清零：这一次写入到底跑了几次快照、各段多少毫秒，
      // 与总延迟放在一起看才知道那 1.2 秒在哪一段（计数在 studio/store.ts 的 buildSnapshot 里）
      if (globalThis.__studioPerf) {
        globalThis.__studioPerf = { snapshots: 0 };
      }
      input.addEventListener('input', function () {
        started = performance.now();
        requestAnimationFrame(function () { firstFrame = performance.now() - started; });
      }, { once: true });
      var timer = window.setInterval(function () {
        if (!started) return;
        if (getComputedStyle(el).fontSize !== before) {
          window.clearInterval(timer);
          var bucket = {};
          if (globalThis.__studioPerf) {
            var raw = globalThis.__studioPerf;
            for (var key in raw) bucket[key] = raw[key];
          }
          resolve({
            total: performance.now() - started,
            firstFrame: firstFrame,
            longTasks: window.__longTasks === null ? null : window.__longTasks.slice(-6),
            // null = 这份构建里没有分段计数（生产构建会剪掉那段），界面就写"量不到"
            phases: globalThis.__studioPerf ? bucket : null,
          });
        }
      }, 2);
      window.setTimeout(function () {
        window.clearInterval(timer);
        reject(new Error('10 秒内画布没有按新字号重绘'));
      }, 10000);
    });
  };
  // 选中响应的页面内起点：最早的那个 pointerdown 捕获（先于任何 React handler），
  // 终点是手柄出现在 DOM 里。两者相减去掉 Playwright 派发与轮询那一段，剩下的才是界面自己的账
  document.addEventListener('pointerdown', function () {
    performance.mark('nexus:sel:t0');
  }, { capture: true, passive: true });
`;

// 无头 Chrome 的 rAF 不锁 vsync（实测帧距能到 6ms），所以那个数不能当"帧率"读。
// PERF_HEADED=1 用有头模式量：这才是用户屏幕上真的会看到的那 16.7ms 预算。
const headed = (process.env.PERF_HEADED ?? '') === '1';
const browser = await chromium.launch({
  channel: 'chrome',
  headless: !headed,
  // 不带这个开关，Chrome 返回的 usedJSHeapSize 是被量化过的（几十 MB 一档），
  // 拿它报"峰值多少 MB"就是在报一个假的精确数。日志里那句说明也依赖这个前提。
  args: ['--enable-precise-memory-info'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(PROBE);
// §147 增量路的 A/B：**同一个构建**量两次（开/关）。
// 为什么不用构建期的 `NEXT_PUBLIC_NEXUS_INCREMENTAL_LAYOUT`：那是构建期内联的，
// 换一次值就得重新 build 一份 → 又变成"量两次不同的构建"（今天的教训：那种比较会被负载带偏）。
// 运行期覆盖（store 读 `globalThis.__NEXUS_INCREMENTAL_LAYOUT__`）让两轮共用同一份构建。
// `PERF_INCREMENTAL=0` 量全量那一档；不设（默认）量增量那一档。
const incrementalOn = (process.env.PERF_INCREMENTAL ?? '1') !== '0';
await context.addInitScript(`globalThis.__NEXUS_INCREMENTAL_LAYOUT__ = ${incrementalOn ? 'true' : 'false'};`);
const page = await context.newPage();

// 建一个起手项目（8 个节点），后面的规模档在它之上改文档
await page.goto(`${base}/`);
await page.fill('[data-project-name-input]', `性能基准 ${new Date().toISOString().slice(11, 19)}`);
await page.waitForFunction(() => !(document.querySelector('[data-create-project]') as HTMLButtonElement | null)?.disabled);
await Promise.all([page.waitForURL(/\/studio\/[^/]+$/, { timeout: 60_000 }), page.click('[data-create-project]')]);
await page.waitForSelector('[data-canvas-frame] [data-node-id]', { timeout: 60_000 });
const projectId = new URL(page.url()).pathname.split('/').pop()!;
await page.addInitScript(`window.__perfProjectId = ${JSON.stringify(projectId)};`);

/** addInitScript 注进来的全局；下面所有 page.evaluate 回调都靠它认项目 */
declare global {
  interface Window {
    __perfProjectId: string;
    __perf?: { firstNodeAt: number | null };
  }
}

/**
 * 文档在浏览器里用到的最小形状。压测脚本只动这几个字段，
 * 也不把 design-model 的类型 import 进 evaluate 回调（那边序列化后就没有类型了）。
 */
type DocNode = {
  id?: string;
  name?: string;
  parentId?: string;
  text?: string | null;
  children?: string[];
} & Record<string, unknown>;
type DocPage = {
  id: string;
  name: string;
  rootId: string;
  nodes: Record<string, DocNode>;
} & Record<string, unknown>;

async function pageState(): Promise<string> {
  return page.evaluate(() => {
    const perf = window.__perf;
    const timing = performance
      .getEntriesByType('resource')
      // 只有资源条目才有 initiatorType；这里的过滤条件本身就保证了它是资源条目
      .filter((e): e is PerformanceResourceTiming => e.name.includes('/api/projects'))
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

/**
 * 三个数各管一件事：文档里有多少节点（图层树的总行数，虚拟化之后仍然全量展开）、
 * 画布 DOM 真渲染了多少（视口裁剪 §147）、图层面板 DOM 渲染了多少（列表窗口化）。
 * 前两个以前混用一个证据（"图层树行数 ≈ 文档规模"），窗口化之后那个证据就失效了——
 * 所以总行数改从 `data-layer-total` 读，DOM 行数单独量。
 */
async function canvasNodeCounts(): Promise<{ dom: number; layers: number; layerTotal: number }> {
  return page.evaluate(() => ({
    dom: document.querySelectorAll('[data-canvas-frame] [data-node-id]').length,
    layers: document.querySelectorAll('[data-layer-id]').length,
    layerTotal: Number(document.querySelector('[data-layer-total]')?.getAttribute('data-layer-total') ?? -1),
  }));
}

async function reloadAndMeasureFirstNode(): Promise<number> {
  await page.goto(`${base}/studio/${projectId}`, { waitUntil: 'commit', timeout: 300_000 });
  try {
    await page.waitForFunction(() => (window as any).__perf?.firstNodeAt !== null, undefined, { timeout: 180_000 });
  } catch (error) {
    throw new Error(`等首帧超时：${await pageState()}（${error instanceof Error ? error.message : ''}）`, { cause: error });
  }
  const at = await page.evaluate(() => (window as any).__perf.firstNodeAt as number);
  const count = await page.locator('[data-canvas-frame] [data-node-id]').count();
  if (!Number.isFinite(at) || at <= 0) throw new Error(`首帧时间没量到：${await pageState()}（画布上有 ${count} 个节点）`);
  // 把首帧拆成"文档到手之前"与"之后"两段：一个 1.9 秒的总数不能指导任何优化，
  // 而"服务端读 + 传 4000 节点的文档占 1.6 秒"与"水合与求解占 1.6 秒"是两个完全不同的活。
  // 读的是浏览器自己的 resource timing——不往应用里加计数，量的就是用户实际拿到的那一份。
  const split = await page.evaluate(() => {
    // 收窄只能在谓词的返回值上做，所以先按名字筛、再在收窄之后读 initiatorType
    const entries = performance
      .getEntriesByType('resource')
      .filter((e): e is PerformanceResourceTiming => /\/api\/projects\//.test(e.name))
      .filter((e) => e.initiatorType === 'fetch');
    const doc = entries.sort((a, b) => b.responseEnd - a.responseEnd)[0];
    if (!doc) return null;
    return {
      // 换成与 firstNodeAt 同一个坐标系（绝对 epoch 毫秒）再相减
      docEndAt: performance.timeOrigin + doc.responseEnd,
      startAt: (window as any).__perf ? (window as any).__perf.startEpoch : null,
      firstNodeAt: (window as any).__perf ? (window as any).__perf.firstNodeAt : null,
      duration: doc.duration,
      bytes: doc.encodedBodySize,
      count: entries.length,
    };
  });
  if (split && split.startAt && split.firstNodeAt) {
    const firstNodeAbs = split.startAt + split.firstNodeAt;
    const after = firstNodeAbs - split.docEndAt;
    // 标签要说清量的是哪一次请求：**最慢的那一次** /api/projects/*，不是"文档那一次"。
    // 文档改由服务端随 HTML 带下来之后（7a94988），首屏可能压根没有文档接口了，
    // 这一行于是变成快照列表 / 发布状态 / 批注那几次里最慢的一个——
    // 首帧在它之前就结束，于是 `之后` 是负数：那不是算错，是"那次请求首屏根本不依赖"。
    console.log(
      `  首帧 ${Math.round(at)}ms｜最慢那次项目接口结束于 ${Math.round(split.docEndAt - split.startAt)}ms` +
        `（那一次 ${Math.round(split.duration)}ms${split.bytes ? `、${Math.round(split.bytes / 1024)} KB` : '、字节数浏览器不给'}）` +
        (after < 0
          ? `，首帧比它早 ${Math.round(-after)}ms（首屏不依赖这次请求）`
          : `，在那次请求结束后 ${Math.round(after)}ms 才画出来`) +
        `，共 ${split.count} 次项目接口`,
    );
  } else {
    console.log(`  首帧 ${Math.round(at)}ms（没读到项目接口的 resource timing，拆不了段——不编一个数）`);
  }
  // §147 第三片：把"HTML 到手 → 首帧"那一整块拆开。以前它只有一个总数，
  // 于是"该继续做服务端渲染，还是该减客户端水合"这个问题没有证据可答。
  const nav = await page.evaluate(() => {
    const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const perf = (window as any).__perf as { start: number; firstNodeAt: number | null } | undefined;
    if (!entry || !perf || perf.firstNodeAt === null) return null;
    // 与导航条目同一个坐标系（两者的零点都是 timeOrigin），才能直接相减
    const firstAbs = perf.start + perf.firstNodeAt;
    const scripts = performance
      .getEntriesByType('resource')
      .filter((r) => (r as PerformanceResourceTiming).initiatorType === 'script');
    const lastScriptEnd = scripts.reduce((m, r) => Math.max(m, (r as PerformanceResourceTiming).responseEnd), 0);
    const loaf = (window as any).__loaf as
      | null
      | { start: number; dur: number; blocking: number; top: { duration: number; invoker: string; src: string } | null }[];
    return {
      htmlEnd: entry.responseEnd,
      dcl: entry.domContentLoadedEventEnd,
      firstAbs,
      scriptCount: scripts.length,
      lastScriptEnd,
      loafOn: loaf !== null,
      loaf: (loaf ?? []).filter((f) => f.start <= firstAbs),
    };
  });
  if (!nav) {
    console.log('  首帧分段：量不到（没有导航计时条目，或首帧本身没量到）——不编一个拆分');
  } else {
    const r = (v: number) => Math.round(v);
    // 脚本"到手"不等于"跑完"：资源计时只记下载，执行那一段只能靠 LoAF 归因，所以要分开说
    const execGap = nav.lastScriptEnd > 0 ? nav.firstAbs - nav.lastScriptEnd : null;
    console.log(
      `  首帧分段：导航 0 → HTML 到手 ${r(nav.htmlEnd)}ms（服务端渲染含文档读取）→ DOM 就绪 ${r(nav.dcl)}ms` +
        ` → 最后一个脚本到手 ${nav.lastScriptEnd ? `${r(nav.lastScriptEnd)}ms` : '量不到'}` +
        `（共 ${nav.scriptCount} 个脚本资源，**执行时间不在资源计时里**）→ 第一个节点画出 ${r(nav.firstAbs)}ms`,
    );
    console.log(
      `  其中"脚本到手 → 首帧"还剩 ${execGap === null ? '量不到' : `${r(execGap)}ms`}——水合、首屏求解、首次绘制全在这一段`,
    );
    if (!nav.loafOn) {
      console.log('  这段里的长动画帧：量不到（这个浏览器不支持 long-animation-frame），不给归因');
    } else if (nav.loaf.length === 0) {
      console.log('  这段里的长动画帧：0 个（>=50ms 才算一个）——说明这一段的钱不在单个大块上');
    } else {
      const worst = [...nav.loaf].sort((a, b) => b.dur - a.dur).slice(0, 3);
      console.log(
        `  这段里的长动画帧 ${nav.loaf.length} 个，最慢的三个：` +
          worst
            .map(
              (f) =>
                `${f.dur}ms（阻塞 ${f.blocking}ms，` +
                (f.top ? `脚本 ${Math.round(f.top.duration)}ms ${f.top.invoker}${f.top.src ? ` @ ${f.top.src}` : ''}` : '无脚本归因') +
                '）',
            )
            .join(' · '),
      );
    }
  }
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
  // 峰值要在**写入发生的那一段时间里**采，而不是写完之后看一眼——所以采样从函数开头就起来，
  // 结尾统一取最大并关掉定时器（下面那段）。
  await page.evaluate(() => {
    const w = window as unknown as { __heap?: number[]; __heapTimer?: number };
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    w.__heap = w.__heap ?? [];
    if (memory && !w.__heapTimer) {
      w.__heapTimer = window.setInterval(() => w.__heap!.push(memory.usedJSHeapSize), 50);
    }
  });
  // 先回到默认视口：pan/zoom 测完之后目标节点可能已经被移出屏幕，点击会一直重试
  await page.goto(`${base}/studio/${projectId}`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
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
      (id: string) =>
        (window as any).__propLatency(id) as Promise<{
          total: number;
          firstFrame: number;
          longTasks: number[] | null;
          phases: Record<string, number> | null;
        }>,
      headline,
    );
    await page.fill('[data-prop="typography.fontSize"]', String(target));
    const split = await pending;
    runs.push(split.total);
    // 分布打在日志里：那 1.3 秒到底是不是"一个把主线程占死的同步大块"，看的就是这一行
    console.log(
      `  ${scope} 第 ${run + 1} 次：总 ${Math.round(split.total)}ms · ` +
        `input 之后到第一帧 ${Math.round(split.firstFrame)}ms · ` +
        `长任务 ${split.longTasks === null ? '量不到（浏览器不支持 longtask）' : split.longTasks.join('/') || '无'} · ` +
        (split.phases
          ? `快照 ${split.phases.snapshots ?? 0} 次（解算 ${split.phases.layoutSolves ?? 0} 次），` +
            `其中求解 ${Math.round(split.phases.layoutMs ?? 0)}ms / ` +
            `token ${Math.round(split.phases.tokensMs ?? 0)}ms / 资产 ${Math.round(split.phases.assetsMs ?? 0)}ms / ` +
            `整段 ${Math.round(split.phases.snapshotMs ?? 0)}ms`
          : '分段量不到（这份构建里没有计数）'),
    );
    // 撤回去，别把项目留在改过的状态上（也顺带证明撤销链路还活着）
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(150);
  }
  record(`属性写入 → 画布更新${scope}`, 'ms', runs);
  // §146/§147 写着的两个目标——"选中响应 <16ms"与"内存峰值"——**以前从来没量过**
  // （docs/TESTING.md 那行目标底下没有任何一处代码去量它）。这里补上：
  // 选中响应量的是"点一个节点 → 选择框与手柄画出来"，内存量的是 Chrome 的 JS 堆（近似值，见下）。
  try {
    const sel: number[] = [];
    const selInPage: number[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await page.click('[data-canvas-surface]');
      const clear = await page.locator('[data-resize-handle]').count();
      if (clear > 0) throw new Error(`点空白处没有取消选中（还有 ${clear} 个手柄），选中响应没法量`);
      // 上一版用合成事件，clientX/clientY 全是 0——画布的命中测试看的就是坐标，
      // 于是"点了个寂寞"，量不到不是巧合。这次用真实鼠标事件打到节点的包围盒中心。
      const box = await page.locator(`[data-canvas-frame] [data-node-id="${headline}"]`).boundingBox();
      if (!box) throw new Error('目标节点没有包围盒（不在视口里？），不能用真实点击去量');
      await page.evaluate(() => {
        (window as unknown as { __selT0: number }).__selT0 = performance.now();
        performance.clearMarks();
        performance.clearMeasures();
      });
      await page.mouse.click(Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2));
      sel.push(
        await page.evaluate(() => {
          return new Promise<number>((resolve, reject) => {
            const timer = window.setInterval(() => {
              if (document.querySelectorAll('[data-resize-handle]').length > 0) {
                window.clearInterval(timer);
                const w = window as unknown as { __selT0: number };
                resolve(performance.now() - w.__selT0);
              }
            }, 2);
            window.setTimeout(() => {
              window.clearInterval(timer);
              reject(new Error('3 秒内没有出现选择手柄'));
            }, 3000);
          });
        }),
      );
      // 页面内的同一段（输入事件 → 手柄出现），并拆成三段：派发与命中测试、界面自己的提交、
      // React 渲染与绘制。后两段的标记只在开发构建里打（store.ts 里 NODE_ENV 守卫）。
      // 两个坑都别再踩（本文件头部的同一段警告）：① page.evaluate 的回调不能写返回类型标注；
      // ② 回调**内部**不要再定义具名箭头函数——esbuild 给它们补的 __name 助手在页面里不存在
      //    （2026-10-10 实测：ReferenceError: __name is not defined，10000 档整段量不到）。
      //    所以下面全部内联成匿名函数表达式。
      const segments = (await page.evaluate(() => {
        const t0 = performance.getEntriesByName('nexus:sel:t0', 'mark').at(-1)?.startTime;
        if (t0 === undefined) return new Promise((r) => r({ total: NaN, dispatch: NaN, store: NaN, paint: NaN }));
        return new Promise((resolve) => {
          const timer = window.setInterval(() => {
            if (document.querySelectorAll('[data-resize-handle]').length > 0) {
              window.clearInterval(timer);
              const t1 = performance.now();
              const store0 = performance.getEntriesByName('nexus:sel:store', 'mark').at(-1)?.startTime;
              const commit = performance.getEntriesByName('nexus:sel:commit', 'mark').at(-1)?.startTime;
              resolve({
                total: t1 - t0,
                dispatch: store0 !== undefined ? store0 - t0 : NaN,
                store: store0 !== undefined && commit !== undefined ? commit - store0 : NaN,
                paint: commit !== undefined ? t1 - commit : NaN,
              });
            }
          }, 2);
          window.setTimeout(() => {
            window.clearInterval(timer);
            resolve({ total: NaN, dispatch: NaN, store: NaN, paint: NaN });
          }, 3000);
        });
      })) as { total: number; dispatch: number; store: number; paint: number };
      selInPage.push(segments.total);
      const seg = (v: number): string => (Number.isNaN(v) ? '量不到' : `${Math.round(v)}ms`);
      console.log(
        `  ${scope} 选中 第 ${attempt + 1} 次：驱动器全程 ${Math.round(sel.at(-1)!)}ms · ` +
          `页面内输入→手柄 ${seg(segments.total)}` +
          `（派发+命中 ${seg(segments.dispatch)} · 界面提交 ${seg(segments.store)} · 渲染+绘制 ${seg(segments.paint)}）`,
      );
    }
    record(`选中响应${scope}`, 'ms', sel);
    record(`选中响应（页面内）${scope}`, 'ms', selInPage);
  } catch (error) {
    // 量不到就说量不到与为什么，不拿一个编出来的数顶上（§159）
    console.log(`  选中响应${scope}：没量到 —— ${error instanceof Error ? error.message : String(error)}`);
  }
const heapPeak = await page.evaluate(() => {
  const w = window as unknown as { __heap?: number[]; __heapTimer?: number };
  const samples = w.__heap ?? [];
  w.__heap = samples;
  if (w.__heapTimer) window.clearInterval(w.__heapTimer);
  const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  if (!memory) return null;
  w.__heapTimer = window.setInterval(() => samples.push(memory.usedJSHeapSize), 50);
  return { started: samples.length };
});
if (heapPeak) {
  // 让峰值有机会出现：跑一次 pan 与一次属性写入的间隔里都在采样（上面的 50ms 轮询）
  await page.waitForTimeout(1_200);
}
const heap = await page.evaluate(() => {
  const w = window as unknown as { __heap?: number[]; __heapTimer?: number };
  if (w.__heapTimer) window.clearInterval(w.__heapTimer);
  const samples = w.__heap ?? [];
  w.__heap = [];
  return samples.length ? Math.max(...samples) : null;
});
console.log(
  heap
    ? `  JS 堆${scope}：**峰值** ${Math.round(heap / 1024 / 1024)} MB（50ms 轮询期间取最大值；` +
      `浏览器启动时加了 --enable-precise-memory-info，否则 usedJSHeapSize 会被量化到几十 MB 一档）`
    : `  JS 堆${scope}：量不到（这个浏览器不暴露 performance.memory）`,
);
  // PERF_PROFILE=1：再跑一次并抓 CPU 采样，把"那 1.2 秒在谁身上"按自时长列出来。
  // 为什么留在脚本里而不是临时写个一次性探针：分段计数（store 里的 __studioPerf）已经证明
  // 快照只占 20ms，剩下的要按函数归因才找得到——而这种归因每次优化完都要再看一眼。
  if (process.env.PERF_PROFILE === '1') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
    await page.click(`[data-node-id="${headline}"]`);
    await page.waitForSelector('[data-prop="typography.fontSize"]', { timeout: 30_000 });
    await cdp.send('Profiler.start');
    // 采样窗口必须**确实盖住一次慢写入**：上一版只 fill 完等 2.5 秒，采出来 90% 是 idle，
    // 那种图等于什么都没量。所以这里照测量那一轮的做法，先挂上 __propLatency 再 fill，
    // 并把它的总时长打出来——只有这个数与前面几轮同量级，下面的归因才算数。
    const pending = page.evaluate(
      (id: string) => (window as any).__propLatency(id) as Promise<{ total: number }>,
      headline,
    );
    await page.fill('[data-prop="typography.fontSize"]', '44');
    const profiledTotal = (await pending).total;
    await page.keyboard.press('Control+z');
    const stopped = await cdp.send('Profiler.stop');
    const nodes = (stopped.profile as unknown as { nodes: { id: number; hitCount?: number; callFrame: { functionName?: string; url?: string; lineNumber?: number } }[] }).nodes;
    const samples = nodes.reduce((sum, n) => sum + (n.hitCount ?? 0), 0);
    const ranked = nodes
      .filter((n) => (n.hitCount ?? 0) > 0)
      .map((n) => ({
        self: n.hitCount ?? 0,
        name: `${n.callFrame.functionName || '(anonymous)'} @ ${(n.callFrame.url || '').split('/').pop()}:${n.callFrame.lineNumber ?? 0}`,
      }))
      .sort((a, b) => b.self - a.self)
      .slice(0, 12);
    console.log(
      `  CPU 采样：这一次写入总 ${Math.round(profiledTotal)}ms，窗口内命中 ${samples} 个样本，自时长最多的几段：`,
    );
    for (const item of ranked) {
      console.log(`    ${((item.self / Math.max(1, samples)) * 100).toFixed(1)}%  ${item.name}`);
    }
    await cdp.detach();
    // 选中响应同款归因：先取消选中，再点同一个节点——窗口里就是一次完整的选择提交。
    // 起点复用 init 脚本里那个 pointerdown 捕获标记（nexus:sel:t0），终点是手柄出现在 DOM
    const cdp2 = await page.context().newCDPSession(page);
    await cdp2.send('Profiler.enable');
    await cdp2.send('Profiler.setSamplingInterval', { interval: 200 });
    await page.click('[data-canvas-surface]');
    await page.waitForFunction(() => document.querySelectorAll('[data-resize-handle]').length === 0);
    const selBox = await page.locator(`[data-canvas-frame] [data-node-id="${headline}"]`).boundingBox();
    if (!selBox) throw new Error('profile selection: 目标节点没有包围盒');
    await cdp2.send('Profiler.start');
    const selPending = page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const t0 = performance.getEntriesByName('nexus:sel:t0', 'mark').at(-1)?.startTime;
          const timer = window.setInterval(() => {
            if (document.querySelectorAll('[data-resize-handle]').length > 0) {
              window.clearInterval(timer);
              resolve(performance.now() - (t0 ?? performance.now()));
            }
          }, 1);
          window.setTimeout(() => {
            window.clearInterval(timer);
            resolve(NaN);
          }, 3000);
        }),
    );
    await page.mouse.click(Math.round(selBox.x + selBox.width / 2), Math.round(selBox.y + selBox.height / 2));
    const profiledSel = await selPending;
    const stoppedSel = await cdp2.send('Profiler.stop');
    const selNodes = (stoppedSel.profile as unknown as { nodes: { id: number; hitCount?: number; callFrame: { functionName?: string; url?: string; lineNumber?: number } }[] }).nodes;
    const selSamples = selNodes.reduce((sum, n) => sum + (n.hitCount ?? 0), 0);
    console.log(
      `  CPU 采样（选中响应）：这一次选择 ${Number.isNaN(profiledSel) ? '量不到' : `${Math.round(profiledSel)}ms`}，` +
        `窗口内命中 ${selSamples} 个样本，自时长最多的几段：`,
    );
    for (const item of selNodes
      .filter((n) => (n.hitCount ?? 0) > 0)
      .map((n) => ({
        self: n.hitCount ?? 0,
        name: `${n.callFrame.functionName || '(anonymous)'} @ ${(n.callFrame.url || '').split('/').pop()}:${n.callFrame.lineNumber ?? 0}`,
      }))
      .sort((a, b) => b.self - a.self)
      .slice(0, 12)) {
      console.log(`    ${((item.self / Math.max(1, selSamples)) * 100).toFixed(1)}%  ${item.name}`);
    }
    await cdp2.detach();
  }
  await page.screenshot({ path: `${OUT}perf-canvas.png` });
}

/**
 * 造一份 N 节点的文档并 PUT 上去：走的是浏览器自己的会话与 CSRF，不另起一套凭据。
 *
 * 关键一步是**先离开 Studio 页面**再改：Studio 里有自动保存，
 * 停在编辑器里从外部 PUT 一份更大的文档，会被它那份内存里的旧文档回写覆盖掉
 * （上一版就在这里栽了：服务端明明存了 1000 个节点，刷新后画布还是 8 个，
 * 于是记进 docs/PERFORMANCE.md 的"1000/4000 节点"数字量的其实一直是 8 个节点）。
 *
 * **§146 的 10000 这一档以前根本 PUT 不进去**：2026-09-27 实测单页 10000 节点被服务端挡下
 * （`HTTP 400 页面 Home 节点数超过上限 4000`，那时是 `MAX_NODES_PER_PAGE`）。那道门改成了按整份文档计
 * （`MAX_NODES_PER_DOCUMENT`，见 ADR-0015），所以这一档现在就是**一页 10000 个节点**——
 * 以前那种"摊成 3 页凑够总数"的数不能算这一档，它量的是别的东西。
 */
async function growDocument(nodes: number): Promise<{ total: number; active: number }> {
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(
    async (target: number) => {
      const match = document.cookie.match(/(?:^|;\s*)nexus_csrf=([a-f0-9]+)/);
      const projectId = window.__perfProjectId;
      const res = await fetch(`/api/projects/${projectId}`, { method: 'GET', cache: 'no-store' });
      if (!res.ok) return { ok: false, reason: `读取当前文档失败：HTTP ${res.status}` };
      const body = (await res.json()) as { document?: { pages: DocPage[]; activePageId: string } };
      const doc = body.document;
      if (!doc) return { ok: false, reason: '响应里没有 document 字段' };
      const page0 = doc.pages[0]!;
      // 必须挂在 page.rootId 下面。上一版取的是"节点表里的第一个"，那往往是某个文本节点，
      // 文本节点不排版子节点 → 4000 个节点根本没进 paintOrder，画布只画 8 个，
      // 于是量出来的"4000 节点首帧/延迟"其实还是 8 个节点的数（这个坑见 docs/PERFORMANCE.md）
      const root = page0.nodes[page0.rootId];
      // children 可能缺：缺就是这份文档本身坏了，直接停下来报告，不要静默补一个空数组继续跑
      if (!root?.children?.length) return { ok: false, reason: '页面根节点读不到，没法加节点' };
      // 造新节点的方式是**克隆一个已经合法的节点**再改身份字段，而不是手写一份字面量：
      // 上一版手写的节点缺 style.cornerRadius / layout.padding，
      // 那种文档会白屏（见 packages/design-model/test/malformed-node.test.ts），
      // 于是"压测到 1000 节点"其实一个都没渲染出来。
      const template =
        Object.values(page0.nodes).find((n) => n.id !== page0.rootId) ?? page0.nodes[page0.rootId];
      if (!template) return { ok: false, reason: '页面上找不到可克隆的节点' };

      // 这一大段没有拆成 helper 函数，是踩过才知道的：`page.evaluate` 只把回调的**源码**搬进浏览器，
      // 而 esbuild 给具名函数补的 `__name` 助手在页面里不存在
      // （第一次跑 10000 档就死在 `ReferenceError: __name is not defined`）。
      //
      // 全部节点放在**同一页**：§146 写的就是"10000 nodes"这一档，服务端现在按整份文档挡
      // （`MAX_NODES_PER_DOCUMENT`），拆页只会让这一档看起来像 4000 档。
      // 2026-09-27 之前这里是被单页上限（4000）拒的，那时脚本被迫摊成 3 页才量到 10002 个节点，
      // 那次的数据在 `docs/PERFORMANCE.md`；门改了之后必须重测，不能沿用。
      const pageNodes = page0.nodes;
      const rootChildren = root.children!;
      for (let i = Object.keys(pageNodes).length; i < target; i += 1) {
        const id = `perf_${i.toString(36)}`;
        pageNodes[id] = {
          ...structuredClone(template),
          id,
          name: `Perf ${i}`,
          parentId: root.id,
          children: [],
          text: typeof template.text === 'string' ? `压测文本 ${i}` : undefined,
        };
        rootChildren.push(id);
      }
      const put = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-csrf-token': match?.[1] ?? '' },
        body: JSON.stringify(doc),
      });
      if (!put.ok) return { ok: false, reason: `写入失败：HTTP ${put.status} ${(await put.text()).slice(0, 200)}` };
      return { ok: true, nodes: target, active: Object.keys(pageNodes).length, pages: doc.pages.length };
    },
    nodes,
  );
  if (!result.ok) throw new Error(result.reason);
  // 服务端说存了多少才算数：客户端自己加的数只是意图。求和要跨页，
  // 只看 pages[0] 的话，10000 这一档会读回 4000 然后误报"写入没生效"
  const check = await page.evaluate(async () => {
    const res = await fetch(`/api/projects/${window.__perfProjectId as string}`, { cache: 'no-store' });
    const body = (await res.json()) as { document?: { pages: DocPage[] } };
    const pages = body.document?.pages ?? [];
    return {
      total: pages.reduce((sum, p) => sum + Object.keys(p.nodes).length, 0),
      active: pages[0] ? Object.keys(pages[0].nodes).length : -1,
      pages: pages.length,
    };
  });
  if (check.total < nodes) {
    throw new Error(`写入没生效：想让文档到 ${nodes} 个节点，服务端读回来只有 ${check.total} 个（${check.pages} 页，活动页 ${check.active}）`);
  }
  console.log(
    `  文档：${check.total} 个节点 / ${check.pages} 页（整份文档上限 ${MAX_NODES_PER_DOCUMENT}，见 ADR-0015）`,
  );
  return { total: check.total, active: check.active };
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
  let active: number;
  try {
    ({ total: built, active } = await growDocument(scale));
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
  // 自检：文档真的变大了吗？总行数读的是图层树**展开出来的那一份**（虚拟化之后 DOM 行数不再等于它），
  // 所以这里核的是 `data-layer-total`；画布与列表各自的 DOM 行数则单独量、单独核对有没有裁。
  // 这两条核的都是**活动页**那一页（图层树与画布只画活动页）；"整份文档到没到目标节点数"
  // 由 growDocument 里的服务端读回负责，两条证据各管一段，不互相顶替。
  const counts = await canvasNodeCounts();
  const badge = await page.locator('[data-canvas-virtualized]').count();
  console.log(
    `  ${built} 节点这一档（活动页 ${active}）：图层树展开 ${counts.layerTotal} 行 / DOM ${counts.layers} 行、画布 DOM ${counts.dom} 个、视口裁剪 ${badge ? '开着' : '没开'}`,
  );
  if (counts.layerTotal < active * 0.9) {
    throw new Error(
      `压测没生效：活动页有 ${active} 个节点，图层树只展开得出 ${counts.layerTotal} 行。` +
        `这时量出来的任何数都不能当成"${built} 节点的性能"。`,
    );
  }
  if (counts.layerTotal < 0) {
    throw new Error('读不到 `data-layer-total`：图层面板的窗口化标记没了，上面的行数证据不成立');
  }
  // §147 的另一半：列表也要窗口化。大文档下还铺满 DOM，就是这一版改动没生效
  if (active > 400 && counts.layers > counts.layerTotal * 0.5) {
    throw new Error(
      `活动页 ${active} 个节点，图层面板却往 DOM 里铺了 ${counts.layers} 行（展开总数 ${counts.layerTotal}）：` +
        `列表窗口化没生效，首帧慢的就该算它一份`,
    );
  }
  if (loadFailure) console.log(`  提示：这一档还有"没测到"的项，写进文档时不能只挑量到的那几个数。`);
  if (active > 400 && badge === 0) {
    throw new Error(`活动页 ${active} 个节点却没过视口裁剪（DOM ${counts.dom}）：§147 那条改动没生效`);
  }
  if (active <= 400 && counts.dom < active * 0.9) {
    throw new Error(`小文档不该被裁：${active} 个节点，画布只渲染了 ${counts.dom} 个`);
  }
  record(`画布 DOM 节点数（${built} 节点文档）`, '个', [counts.dom, counts.dom, counts.dom]);

  await page.goto(`${base}/studio/${projectId}`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
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
console.log(`  测量口径：${measuredUnder}`);
console.log(`  增量重解：${incrementalOn ? '开（这一轮走增量路）' : '关（这一轮走全量）'}——A/B 用**同一个构建**量的`);
console.log('  协议：第一次是冷启动（JIT / 磁盘缓存 / 服务端首渲染都没收敛），只打印不进中位数；' +
  '跨会话比较要用同一口径、同一构建，且至少两遍取第二遍之后的那两次。');
for (const s of samples) {
  console.log(
    `${s.label.padEnd(28)} ${String(s.median).padStart(8)} ${s.unit}   各次: ${s.runs.join(' / ')}` +
      (s.warm === null ? '' : `   预热那次(已丢): ${s.warm}`),
  );
}
console.log(`\n项目 ${projectId} 留在库里（含压测节点），要清理就删这个项目。`);
