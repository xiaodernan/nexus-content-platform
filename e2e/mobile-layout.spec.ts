import { expect, test, type Page } from '@playwright/test';

/**
 * §85 移动端那一格（ROADMAP「之后」队列：移动端布局体检 · 公开页优先）的第一遍**读数**。
 *
 * 为什么这一格还没被量过：`playwright.config.ts` 里只有一个 project——Desktop Chrome，
 * 26 个 e2e 文件全在这一档下跑（`isMobile` / `hasTouch` 在 e2e/ 里今天一次都没出现）。
 * axe 也量不到这一维：对比度、名字、tab 顺序在 1280 与 390 下是同一样 DOM。
 *
 * 而代码里已经写着会发生什么：公开页把设计稿按**发布快照算出来的绝对像素**铺进
 * `overflow-x-auto` 的容器（`apps/web/src/app/n/[handle]/[slug]/page.tsx` 的 `data-published-frame`），
 * 没有预览那条 `?zoom=` 的缩放路径（`/preview/<projectId>` 有）。手机视口比设计窄时，
 * 访客要横向平移才看得见右半边。**这句是代码推论，不是读数**——所以下面把它量成数：
 * 帧宽、可见比例、要平移多少 px。
 *
 * 载体用**真发布语料**而不是现做一份：`/sitemap.xml` 里那批 `/n/<handle>/<slug>` 是已经发出去的
 * 页，匿名点开即可，不占注册（10/小时）也不占建项目（20/小时）那两道限流；
 * 名册按整点间隔抽 5 张——sitemap 是库顺序，开头挤着同一批夹具，只抽前几条会量出一个假的分布。
 *
 * 纪律与第二、三片一致：**不断言阈值，先记读数**。四条门钉的都是"这一遍真的量到了东西"：
 * ① 仿真落地——页面自报的 `innerWidth` 等于请求的宽度（390 那栏若被桌面布局顶回去，整栏读数
 *    就没有意义；这一条防的是"以为量了手机，其实量的还是桌面"）；
 * ② 名册非空，且每张真的渲染出 `[data-published-root]`（404 页也"没有溢出"，那种干净不算读数）；
 * ③ 帧宽量得到（>0），否则"可见比例"是拿 0 除出来的；
 * ④ 点击目标那一遍真的有名册（≥1 个可见交互元素）——0 个目标不等于 0 个缺陷。
 *
 * 每张都跑**两栏**（390×844 手机仿真 / 1280×900 桌面对照），同一份 DOM 只有视口宽度这一个变量：
 * 两栏一样的项就不许说成移动端的问题（只看那些真的因宽度而变的数）。
 * 读数打印进报告并抄 docs/EVALUATION.md；抓到什么修什么，修完再谈把哪几项升成门。
 */

const SAMPLE = 5;

/** WCAG 2.5.8 的下限（24×24 CSS px）。这一遍只量，不拿它当门 */
const TARGET_MIN = 24;

const WIDTHS = [
  { label: '手机390', width: 390, height: 844, mobile: true },
  { label: '桌面1280', width: 1280, height: 900, mobile: false },
] as const;

interface Box {
  label: string;
  /** 宽出多少 px（溢出量），点击目标那一栏则是自身尺寸 */
  px: number;
  w: number;
  h: number;
  inline: boolean;
}

interface Reading {
  innerWidth: number;
  innerHeight: number;
  dpr: number;
  viewportMeta: string | null;
  docScrollWidth: number;
  docClientWidth: number;
  visualWidth: number | null;
  visualScale: number | null;
  frame: { width: number; height: number; left: number; right: number } | null;
  /** 内容比盒子宽、且自身可横向滚动 ⇒ 访客平移看得到 */
  pannable: Box[];
  /** 内容比盒子宽、又滚不动（overflow 裁掉）⇒ 那部分真的看不见 */
  clipped: Box[];
  targetTotal: number;
  smallTargets: Box[];
}

/**
 * 在页面里一次量完。所有函数都得写在这一段内部：`page.evaluate` 只把函数体序列化过去，
 * 引用文件作用域的 helper 会在浏览器里变成 undefined。
 */
async function measure(page: Page): Promise<Reading> {
  return page.evaluate((MIN: number) => {
    const labelOf = (el: Element): string => {
      const tag = el.tagName.toLowerCase();
      const data = Array.from(el.attributes).find((a) => a.name.startsWith('data-'));
      if (data) return `${tag}[${data.name}${data.value ? `="${data.value}"` : ''}]`;
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 14);
      return text ? `${tag}(${text})` : tag;
    };
    const isVisible = (el: Element): boolean => {
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || Number(s.opacity) === 0 || s.display === 'none') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    /** 溢出的块级元素：内联文本的 scrollWidth 本来就比行宽大，那是排版不是裁切 */
    const overflowing = (): Array<{ el: HTMLElement; over: number }> => {
      const out: Array<{ el: HTMLElement; over: number }> = [];
      for (const el of Array.from(document.querySelectorAll('body *'))) {
        if (!(el instanceof HTMLElement)) continue;
        if (el.clientWidth === 0) continue;
        if (getComputedStyle(el).display === 'inline') continue;
        const over = el.scrollWidth - el.clientWidth;
        if (over > 1) out.push({ el, over });
      }
      return out;
    };
    const toBox = (el: HTMLElement, over: number): Box => {
      const r = el.getBoundingClientRect();
      return { label: labelOf(el), px: over, w: Math.round(r.width), h: Math.round(r.height), inline: false };
    };
    const top = (list: Array<{ el: HTMLElement; over: number }>): Box[] =>
      list
        .sort((a, b) => b.over - a.over)
        .slice(0, 4)
        .map(({ el, over }) => toBox(el, over));

    // ADR-0074：有断点规则的页会同时铺四份投影，隐藏的几份 display:none（量出来是 0）。
    // 这里读**可见**的那一份：否则量到的是 mobile 那份，在 1280 栏里报一个假的 0 宽。
    const frames = Array.from(document.querySelectorAll('[data-published-frame]'));
    const frame =
      frames.find((el) => {
        const variant = el.closest('[data-published-variant]');
        return !variant || getComputedStyle(variant).display !== 'none';
      }) ??
      frames[0] ??
      null;
    const all = overflowing();
    const pannable = all.filter(({ el }) => ['auto', 'scroll'].includes(getComputedStyle(el).overflowX));
    const clipped = all.filter(({ el }) => ['hidden', 'clip'].includes(getComputedStyle(el).overflowX));
    const targets = Array.from(
      document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button]'),
    ).filter((el) => {
      // 发布帧里是**作品内容**（作者自己的按钮/链接），平台外壳不为它们的尺寸担保；
      // 与 Studio 的 `[data-canvas-frame]` 同一条口径（ADR-0073）。
      if (el.closest('[data-published-frame]')) return false;
      return isVisible(el);
    });
    const small = targets
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { el, w: Math.round(r.width), h: Math.round(r.height) };
      })
      .filter((t) => Math.min(t.w, t.h) < MIN);
    const vv = window.visualViewport;

    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      dpr: window.devicePixelRatio,
      viewportMeta: document.querySelector('meta[name=viewport]')?.getAttribute('content') ?? null,
      docScrollWidth: document.documentElement.scrollWidth,
      docClientWidth: document.documentElement.clientWidth,
      visualWidth: vv ? Math.round(vv.width) : null,
      visualScale: vv ? Number(vv.scale.toFixed(3)) : null,
      frame: frame
        ? (() => {
            const r = frame.getBoundingClientRect();
            return {
              width: Math.round(r.width),
              height: Math.round(r.height),
              left: Math.round(r.left),
              right: Math.round(r.right),
            };
          })()
        : null,
      pannable: top(pannable),
      clipped: top(clipped),
      targetTotal: targets.length,
      smallTargets: small.map((t) => {
        const r = t.el.getBoundingClientRect();
        return {
          label: labelOf(t.el),
          px: Math.round(Math.min(r.width, r.height)),
          w: Math.round(r.width),
          h: Math.round(r.height),
          inline: getComputedStyle(t.el).display === 'inline',
        };
      }),
    };
  }, TARGET_MIN);
}

/** 从 /sitemap.xml 里取公开作品页：不解析 XML，只按 loc 抽——多一个依赖不如多一行正则 */
async function publishedPaths(page: Page): Promise<string[]> {
  const res = await page.request.get('/sitemap.xml');
  expect(res.status(), '读不到 /sitemap.xml：这一遍的名册来自哪里？').toBe(200);
  const body = await res.text();
  return Array.from(body.matchAll(/<loc>[^<]*\/n\/[^<]+<\/loc>/g)).map((m) =>
    m[0]!.replace(/<\/?loc>/g, ''),
  );
}

function pickEven(paths: string[], n: number): string[] {
  if (paths.length <= n) return paths;
  const step = Math.floor(paths.length / n);
  return Array.from({ length: n }, (_, i) => paths[i * step]!);
}

function fmt(reading: Reading, column: (typeof WIDTHS)[number]): string {
  const visiblePct = reading.frame ? Math.round((Math.min(reading.docClientWidth, reading.frame.width) / reading.frame.width) * 100) : 0;
  const pan = reading.pannable.map((b) => `${b.label}+${b.px}px`).join(', ') || '无';
  const clip = reading.clipped.map((b) => `${b.label}+${b.px}px`).join(', ') || '无';
  const small = reading.smallTargets.map((b) => `${b.label} ${b.w}×${b.h}${b.inline ? '(行内)' : ''}`).join(', ') || '无';
  return (
    `  ${column.label}: 视口 ${reading.innerWidth}×${reading.innerHeight} dpr=${reading.dpr} 缩放=${reading.visualScale ?? 'n/a'} · ` +
    `文档 ${reading.docClientWidth} 可容 / ${reading.docScrollWidth} 需要（横向溢出 ${Math.max(0, reading.docScrollWidth - reading.docClientWidth)}px）· ` +
    `帧 ${reading.frame ? `${reading.frame.width}×${reading.frame.height}（首屏可见 ${visiblePct}%）` : '没量到'} · ` +
    `viewport="${reading.viewportMeta ?? '(没有)'}"\n` +
    `    可平移：${pan}\n` +
    `    滚不动的裁切：${clip}\n` +
    `    点击目标 ${reading.targetTotal} 个，其中 <${TARGET_MIN}px 的 ${reading.smallTargets.length} 个：${small}`
  );
}

test('§85 移动端体检：真发布语料在 390×844 下的布局读数（外壳 24px 已升成门）', async ({ browser }) => {
  test.setTimeout(600_000);

  const scout = await browser.newPage();
  await scout.goto('/');
  const paths = pickEven(await publishedPaths(scout), SAMPLE);
  await scout.close();
  expect(paths.length, '公开作品页名册是空的：这一遍没有载体').toBeGreaterThan(0);

  const report: string[] = [];
  const summary: Array<{ path: string; frame: number | null; panAt: number | null; clipAt: number | null; small: number }> = [];

  for (const href of paths) {
    const url = new URL(href);
    const path = url.pathname + decodeURIComponent(url.search);
    const rows: string[] = [`\n${path}`];
    let mobile: Reading | null = null;
    let desktop: Reading | null = null;

    for (const column of WIDTHS) {
      // 每栏都开新 context：手机那栏改了布局视口，同 context 里跑对照会互相顶
      const context = await browser.newContext({
        viewport: { width: column.width, height: column.height },
        isMobile: column.mobile,
        hasTouch: column.mobile,
        deviceScaleFactor: column.mobile ? 2 : 1,
      });
      const visitor = await context.newPage();
      const res = await visitor.goto(href);
      expect(
        res?.status() ?? 0,
        `${path} 在 ${column.label} 下没有 200（${res?.status()}）：这一栏的"干净"是 404 页给的，不算读数`,
      ).toBe(200);
      await visitor.waitForSelector('[data-published-root]', { timeout: 30_000 });
      const reading = await measure(visitor);
      // 门①：仿真必须真的落地。390 那栏若被顶回桌面宽度，整栏读数是假的
      expect(
        reading.innerWidth,
        `${path} · ${column.label}：请求视口 ${column.width}px，页面自报 ${reading.innerWidth}px ⇒ 这一栏没量到手机布局`,
      ).toBe(column.width);
      // 门③：帧宽必须量得到，否则"可见比例"是拿 0 除出来的
      expect(reading.frame?.width ?? 0, `${path} · ${column.label}：量不到 data-published-frame 的宽度`).toBeGreaterThan(0);
      // 门⑤：公开页**外壳**（动作栏等）的点击目标必须 ≥24×24（WCAG 2.5.8）；
      // 发布帧里的作品内容不计入（上一行注释）。
      expect(
        reading.smallTargets.map((b) => `${b.label} ${b.w}×${b.h}`),
        `${path} · ${column.label}：公开页外壳还有 <${TARGET_MIN}px 的点击目标`,
      ).toHaveLength(0);
      rows.push(fmt(reading, column));
      if (column.mobile) mobile = reading;
      else desktop = reading;
      await context.close();
    }

    // 两栏都必须在：对照这一列的全部意义是"同一份 DOM，只有宽度这一个变量"
    expect(mobile, `${path} 缺 390 那一栏`).not.toBeNull();
    expect(desktop, `${path} 缺 1280 对照那一栏`).not.toBeNull();
    const m = mobile as Reading;
    const d = desktop as Reading;
    // 门④：点击目标那一遍有名册——0 个目标 ≠ 0 个缺陷
    expect(
      m.targetTotal,
      `${path} 在 390 下一个可见交互元素都没扫到：点击目标那一栏的名册是空的`,
    ).toBeGreaterThan(0);

    rows.push(
      `  两栏对照：帧宽 ${d.frame?.width}→${m.frame?.width}px（同一份快照，宽度不由视口决定 ⇒ 移动端没有任何响应式投影）· ` +
        `首屏可见 ${d.frame ? Math.round((Math.min(d.docClientWidth, d.frame.width) / d.frame.width) * 100) : 0}%→${m.frame ? Math.round((Math.min(m.docClientWidth, m.frame.width) / m.frame.width) * 100) : 0}% · ` +
        `可平移 ${d.pannable.length}→${m.pannable.length} 处 · 裁切 ${d.clipped.length}→${m.clipped.length} 处 · ` +
        `小目标 ${d.smallTargets.length}→${m.smallTargets.length} 个`,
    );
    report.push(rows.join('\n'));
    summary.push({
      path,
      frame: m.frame?.width ?? null,
      panAt: m.pannable.reduce((max, b) => Math.max(max, b.px), 0),
      clipAt: m.clipped.reduce((max, b) => Math.max(max, b.px), 0),
      small: m.smallTargets.length,
    });
  }

  console.log(`\n===== §85 移动端体检（公开页 · ${paths.length} 张 × 2 栏）=====`);
  console.log(report.join('\n'));
  console.log('\n----- 汇总（390 那栏）-----');
  for (const s of summary) {
    console.log(`${s.path}  帧宽=${s.frame}  要平移=${s.panAt}px  裁切=${s.clipAt}px  <${TARGET_MIN}px 目标=${s.small}`);
  }
  const widths = summary.map((s) => s.frame).filter((w): w is number => w !== null);
  const panned = summary.filter((s) => (s.panAt ?? 0) > 0).length;
  const clipped = summary.filter((s) => (s.clipAt ?? 0) > 0).length;
  const smallTotal = summary.reduce((n, s) => n + s.small, 0);
  console.log(
    `读数：${widths.length} 张帧宽分布 ${widths.join('/')} · ${panned}/${summary.length} 张在 390 下要横向平移 · ` +
      `${clipped}/${summary.length} 张有"滚不动的裁切" · 小于 ${TARGET_MIN}×${TARGET_MIN} 的点击目标合计 ${smallTotal} 个\n`,
  );
});
