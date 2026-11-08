import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { createProjectNamed, registerMember } from './support/auth-session';
import { keyboardWalk, tabTo, type WalkOptions } from './support/keyboard-walk';

/**
 * §85 · 浅色主题下的键盘走查——2026-10-29 主题入口的两个欠账之一
 * （"键盘走查的浅色没有单独量（light 下 tab 顺序与暗色逐字同源，未证）"）。
 *
 * 载体与暗色第三片逐字同一套（§167 两页互动稿，`click → navigate` 那颗热点），
 * 差别只有两处：
 * ① 访客 `browser.newContext({ colorScheme: 'light' })` 且 init script 把
 *   `data-nexus-theme` 钉成 `light`——投影在 public 页里是 token 驱动渲染，
 *   设的是读数对象，不是"给测量找个借口"；
 * ② 多一道**焦点指示色值对比度**门：热点上的焦点环（Tailwind ring，走 box-shadow）
 *   必须压得亮 hotspot 的有效底色，WCAG 2.4.11/2.4.13 的 3:1。暗色那条只钉"有指示"
 *   看得见，这里把"看得见"换成"看得见且够亮"。Tab 顺序/覆盖/无陷阱/停留点有归属
 *   六道门在两张主题上都跑（结构不变式），读数各自打印。
 *
 * 前提（同浅色五张/九张/公开页那一片）：浅色必须真落到**body 的 bg-0/fg-1** 上，
 * 否则下面量到的是暗色——不是读数。期望值从 tokens.css 现读现算，单一真值留在 token 层。
 */

const RUN = Date.now().toString(36);
const TOKENS = 'apps/web/src/styles/tokens.css';

/** 从主题块里读 token 的字面值 → 浏览器给的 `rgb(...)` */
function rgbFrom(selector: string, name: string): string {
  const css = readFileSync(TOKENS, 'utf8');
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`${TOKENS} 里找不到 ${selector}，这一片没有前提`);
  const literal = css.slice(start).match(new RegExp(`--nexus-color-${name}:\\s*#([0-9a-fA-F]{6})`))?.[1];
  if (!literal) throw new Error(`${TOKENS} 的 ${selector} 里读不到 --nexus-color-${name}`);
  const n = Number.parseInt(literal, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}
const LIGHT_BG = rgbFrom("[data-nexus-theme='light']", 'bg-0');
const LIGHT_FG = rgbFrom("[data-nexus-theme='light']", 'fg-1');

/** WCAG 相对亮度 → 对比度（与 style-tokens.test.ts / a11y-light.spec.ts 同一把尺子） */
function contrast(css1: string, css2: string): number {
  const asRgb = (css: string): [number, number, number] => {
    if (css.startsWith('#')) {
      const hex = css.slice(1);
      const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
      const n = Number.parseInt(full, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const m = css.match(/\d+/g);
    if (!m || m.length < 3) throw new Error(`无法从 ${css} 读出三个 rgb 分量`);
    return [Number(m[0]), Number(m[1]), Number(m[2])];
  };
  const lum = (css: string): number => {
    const [r, g, b] = asRgb(css);
    const ch = (v: number): number => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
  };
  const a = lum(css1);
  const b = lum(css2);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** 与暗色第三片同一条纪律：先离开 Studio 再写文档（store 里那份旧稿会在卸载时盖回来） */
async function setInteractiveDocument(page: Page, projectId: string): Promise<string> {
  await page.goto('/');
  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === 'nexus_csrf')?.value ?? '';
  const current = await page.request.get(`/api/projects/${projectId}`);
  expect(current.status(), `读取项目失败：${await current.text()}`).toBe(200);
  interface RawNode {
    id: string;
    children?: string[];
    [key: string]: unknown;
  }
  const doc = (
    (await current.json()) as { document: { pages: { id: string; name: string; rootId: string; nodes: Record<string, RawNode> }[] } }
  ).document;
  const home = doc.pages[0]!;
  const endId = `page-end-${RUN}`;
  const endRootId = `root-end-${RUN}`;
  const end = {
    ...structuredClone(home),
    id: endId,
    name: '终点',
    rootId: endRootId,
    nodes: { [endRootId]: { ...structuredClone(home.nodes[home.rootId]!), id: endRootId, name: '终点', children: [] } },
  };
  doc.pages.push(end);
  const nodeId = Object.keys(home.nodes).find((id) => id !== home.rootId);
  if (!nodeId) throw new Error('默认首页里找不到可以挂交互的节点');
  home.nodes[nodeId]!.interactions = [{ id: `i-${RUN}`, trigger: 'click', action: 'navigate', target: endId }];
  const put = await page.request.put(`/api/projects/${projectId}`, { headers: { 'x-csrf-token': csrf }, data: doc });
  expect(put.status(), `写入互动稿失败：${await put.text()}`).toBe(200);
  return endId;
}

/** 公开页这一张：页内 = 作者投影出来的那棵子树 */
const PUBLISHED: WalkOptions = {
  label: '公开作品页 · 两页互动稿（浅色）',
  root: '[data-published-root]',
};

test('§85 键盘可达性 · 浅色：Tab 走完、Enter 按响热点、焦点环 ≥ 3:1', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await registerMember(page, `kbd-light+${RUN}@nexus.test`, 'e2e-secret-123');
  const projectId = await createProjectNamed(page, `键盘浅色走查${RUN}`);
  const endPageId = await setInteractiveDocument(page, projectId);

  await page.goto(`/studio/${projectId}`);
  await page.click('[data-publish-open]');
  await expect(page.locator('[data-publish-submit]')).toBeVisible();
  await page.click('[data-publish-choice="public"]');
  await page.click('[data-publish-submit]');
  await expect(page.locator('[data-publish-url]')).toBeVisible({ timeout: 30_000 });
  const path = (await page.locator('[data-publish-url]').getAttribute('href'))!;

  const context = await browser.newContext({ colorScheme: 'light' });
  await context.addInitScript(() => {
    document.documentElement.setAttribute('data-nexus-theme', 'light');
    Object.defineProperty(Object.getPrototypeOf(navigator), 'webdriver', { get: () => undefined });
  });
  const visitor = await context.newPage();
  await visitor.goto(new URL(path, page.url()).href);
  await expect(visitor.locator('[data-published-root]')).toBeVisible({ timeout: 30_000 });
  await expect(visitor.locator('[data-interactive-hotspot]')).toHaveCount(1);

  // 门「前提成立」：浅色令牌落到了**body 的像素**上，否则整条腿量到的是暗色
  const premise = await visitor.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-nexus-theme'),
    bg: getComputedStyle(document.body).backgroundColor,
    color: getComputedStyle(document.body).color,
  }));
  expect(
    premise.attr === 'light' && premise.bg === LIGHT_BG && premise.color === LIGHT_FG,
    `浅色没落到页面上（attr=${premise.attr} body 底色=${premise.bg} 期望 ${LIGHT_BG} · 文字=${premise.color} 期望 ${LIGHT_FG}）⇒ 这一遍不是浅色的读数`,
  ).toBe(true);

  const walk = await keyboardWalk(visitor, { ...PUBLISHED, require: ['data-interactive-hotspot='] });
  const hotspotKey = walk.population.find((k) => k.includes('data-interactive-hotspot='))!;

  const onHotspot = await tabTo(visitor, PUBLISHED, hotspotKey, walk.population.length + 2);
  expect(onHotspot, `Tab 走不到互动热点 ${hotspotKey} —— 只用键盘的人走不通这一版`).toBe(true);

  // 门「焦点指示 ≥ 3:1」：热点停留点的环（Tailwind ring/box-shadow 或 UA outline auto）
  // 必须压得亮它的有效底色（WCAG 2.4.11/2.4.13）。暗色第三片只钉“有指示”，这里钉“够亮”。
  const hotspot = visitor.locator('[data-interactive-hotspot]').first();
  const style = await hotspot.evaluate((el: HTMLElement) => {
    const cs = getComputedStyle(el);
    const background = (e: Element): string => {
      for (let n: Element | null = e; n; n = n.parentElement) {
        const c = getComputedStyle(n).backgroundColor;
        if (c && c !== 'transparent' && !/rgba\([^)]*,\s*0\s*\)/.test(c)) return c;
      }
      return getComputedStyle(document.body).backgroundColor;
    };
    // box-shadow 是逗号分层的（括号内的逗号不分），逐层判型：
    // 命中"w x y spread"这种环形（零偏移 + 扩散 ≥1px）优先；
    // 都没命中就取最后一层（Tailwind ring 排最后）；都解析不出颜色就 null——红而不说谎
    const splitLayers = (raw: string): string[] => {
      const parts: string[] = [];
      let depth = 0;
      let cur = '';
      for (const ch of raw) {
        if (ch === '(') depth += 1;
        else if (ch === ')') depth = Math.max(0, depth - 1);
        if (ch === ',' && depth === 0) {
          parts.push(cur.trim());
          cur = '';
        } else cur += ch;
      }
      if (cur.trim()) parts.push(cur.trim());
      return parts.filter(Boolean);
    };
    const colorOf = (layer: string): string | null => {
      const m = layer.match(/rgba?\(\s*\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?\s*(?:[,/]\s*[\d.]+%?\s*)?\)/) ??
        layer.match(/#[0-9a-f]{3,8}\b/i);
      return m ? m[0] : null;
    };
    const pick = (raw: string): { css: string | null; note: string; kind: string } => {
      const layers = splitLayers(raw);
      if (!layers.length) return { css: null, note: '无层可解析', kind: 'none' };
      // 完整计算盒阴影层的层长度：先挑"0 0 0 <spread>px"这一类=focus ring 的形状
      // 手写环层判定：剥掉数字单位 token 求和——像 "rgba(0,0,0,0) 0px 0px 0px 0px" 的空影子 spread=0 不配
      const isRingLayer = (l: string): boolean => {
        const parsed = l.match(/-?\d+(?:\.\d+)?px/g)?.map((n) => Number.parseFloat(n));
        if (!parsed || parsed.length !== 4) return false;
        const [offsetX, offsetY, , spread] = parsed as [number, number, number, number];
        return offsetX === 0 && offsetY === 0 && spread >= 1;
      };
      const ringLike = layers.find(isRingLayer);
      const last = layers[layers.length - 1]!;
      const chosen = ringLike ?? last;
      const css = colorOf(chosen);
      return { css, note: `层数 ${layers.length} · 选"${chosen.slice(0, 48)}" · 全部层：${layers.map((l, i) => `${i}:${l}`).join(' || ')}`, kind: chosen };
    };
    return {
      boxShadow: cs.boxShadow,
      outlineStyle: cs.outlineStyle,
      outlineWidth: cs.outlineWidth,
      outlineColor: cs.outlineColor,
      effBg: background(el),
      shadow: pick(cs.boxShadow),
      outline: pick(cs.outlineColor),
      sel: el.tagName.toLowerCase(),
    };
  });
  const ringCss = style.shadow.css ?? style.outline.css;
  console.log(`  热点 ${style.sel}：focus 指示来源=${style.shadow.css ? 'box-shadow' : 'outline'}`);
  console.log(`  原始 box-shadow（${style.shadow.note}）：${style.boxShadow}`);
  const ringRgb = (() => {
    // 两个语法：rgba(r, g, b, a) / rgb(r g b / a) —— Tailwind 输出可能是后者
    const s = ringCss!.trim();
    const comma = s.match(/^rgba?\(\s*(\d+[.\d]*)\s*,\s*(\d+[.\d]*)\s*,\s*(\d+[.\d]*)\s*(?:,\s*(0|[01]?\.?\d+))?\s*\)$/);
    const space = s.match(/^rgba?\(\s*(\d+[.\d]*)\s+(\d+[.\d]*)\s+(\d+[.\d]*)(?:\s*\/\s*(0|[01]?\.?\d+|[\d.]+%))?\s*\)$/);
    const m = comma ?? space;
    if (!m) return ringCss!;
    const [r, g, b, rawA] = [Number(m[1]), Number(m[2]), Number(m[3]), m[4]];
    if (rawA === undefined) return `rgb(${r}, ${g}, ${b})`;
    const a = rawA.endsWith('%') ? Number(rawA.slice(0, -1)) / 100 : Number(rawA);
    const bgm = style.effBg.match(/\d+(?:\.\d+)?/g)!.map(Number) as [number, number, number];
    const mix = (x: number, y: number) => Math.round(x * a + y * (1 - a));
    return `rgb(${mix(r, bgm[0])}, ${mix(g, bgm[1])}, ${mix(b, bgm[2])})`;
  })();
  const ratio = contrast(ringRgb, style.effBg);
  console.log(`  焦点指示色值 ${ringCss} 合成后 ${ringRgb} 压 ${style.effBg} = ${ratio.toFixed(2)}:1（≥3:1 WCAG 2.4.11/2.4.13）`);
  expect(
    ringCss,
    `热点上没有可解析的焦点指示颜色（box-shadow=${style.boxShadow} · outline=${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}）`,
  ).toBeTruthy();
  expect(ratio, `焦点指示压不亮有效底色：${ringRgb} 压 ${style.effBg} = ${ratio.toFixed(2)}:1 < 3:1`).toBeGreaterThanOrEqual(3);

  const reported = visitor.waitForResponse((res) => /\/api\/published\/work-complete$/.test(new URL(res.url()).pathname), {
    timeout: 30_000,
  });
  await visitor.keyboard.press('Enter');
  await expect(visitor).toHaveURL(new RegExp(`\\?page=${endPageId}$`), { timeout: 30_000 });
  await expect(visitor.locator('[data-interactive-end]')).toBeVisible({ timeout: 30_000 });
  const response = await reported;
  expect(response.status(), `键盘走到的那一声上报失败了：${await response.text()}`).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, recorded: true });
});
