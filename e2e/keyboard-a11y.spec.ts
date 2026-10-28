import { expect, test, type Page } from '@playwright/test';
import { createProjectNamed, registerMember } from './support/auth-session';

/**
 * §85 第三片：**只用键盘的人能不能走完这一页**——第二片 notMeasured 清单里
 * 「键盘可达性（人工走查）」那一格。axe 量的是 DOM 的形状（有没有名字、对比度够不够），
 * 它量不到 tab 顺序、焦点可见性、以及"点了会翻页的东西能不能被 Enter 按响"。
 *
 * 载体用 §167 那份两页互动稿（首页一个 `click → navigate` 节点），因为它是平台上
 * 唯一"必须按一下才走得通"的公开页——热点一旦不再是键盘可聚焦的（退化成 `div + onClick`、
 * 或被人加了 `tabindex="-1"`），鼠标那条链照旧通（§167 的用例仍绿），只有这里会红。
 *
 * 纪律与前几片一致：**不断言阈值，先记读数**；许红的只有结构不变式，六道（与代码顺序一致，
 * 首个红会遮住后面的门，所以把"点名到缺陷"的那道放在最前）：
 * 「非空转」分母与页内命中都 > 0；「热点在册」这一片要证的控件必须还在分母里；
 * 「无陷阱」同一元素连粘三次即判死；「覆盖」分母里每个控件真的被碰到——抓的是
 * "DOM 说它可聚焦、Tab 却到不了"（inert 子树、被别的层盖住、focus 被 JS 挪走），而
 * `tabindex="-1"`／`disabled`／`aria-hidden` 会把自己**从分母里蒸发**，这一门抓不到，
 * 所以排除项照实打印成读数，热点由「热点在册」那道专门门盯着；
 * 「顺序」tab 顺序逐字等于 DOM 顺序（正 tabindex、portal 到末尾都算错位）；
 * 「焦点可见」每个页内停留点都看得见焦点（UA 默认环或 Tailwind ring，透明色 outline 不算）。
 * 「焦点可见」原本是**读数**：首跑量到页内 9 个控件全有指示，唯一没指示的是 Next 的开发工具
 * portal（页外，不是我们的界面）——页内当前为 0，就升成门：以后加 `outline-none` 又没配 ring 就红。
 * 六道门都过了变异臂（正 tabindex／热点 tabindex=-1／摘掉 ring），还原后 md5 逐字节复核；
 * 读数一律打印进报告抄 docs/EVALUATION.md。
 */

const RUN = Date.now().toString(36);

/** 页内可聚焦元素的判据：原生可聚焦 + 没被 tabindex=-1 藏掉 + 没 disabled + 看得见。 */
const FOCUSABLE = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  '[contenteditable="true"]',
  '[tabindex]',
].join(',');

interface Stop {
  /** 稳定身份：优先 data-* 徽标，其次 tag + 可及名 */
  key: string;
  tag: string;
  data: string;
  name: string;
  insideRoot: boolean;
  outlineStyle: string;
  outlineWidth: string;
  outlineColor: string;
  boxShadow: string;
}

/**
 * 焦点到底"看得见"没有。两种真指示：浏览器 UA 默认环（`outline-style: auto`）与
 * Tailwind 的 ring（走 box-shadow）。**透明色的 outline 不算**——`outline-none` 在
 * Tailwind 里落成 solid + 0 宽 / transparent，样式表上看着有、屏幕上没有。
 */
function painted(s: Stop): { outline: boolean; shadow: boolean } {
  const alpha = s.outlineColor.match(/rgba\(\s*[\d.\s,]+\s*\)/)?.[0];
  const transparent = s.outlineColor === 'transparent' || (alpha !== undefined && /,\s*0\s*\)/.test(alpha));
  return {
    outline: s.outlineStyle !== 'none' && s.outlineStyle !== 'hidden' && s.outlineWidth !== '0px' && !transparent,
    shadow: s.boxShadow !== '' && s.boxShadow !== 'none',
  };
}

function focusIndicator(s: Stop): boolean {
  const p = painted(s);
  return p.outline || p.shadow;
}

function indicatorKind(s: Stop): string {
  const p = painted(s);
  const parts: string[] = [];
  if (p.outline) parts.push(`outline(${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor})`);
  if (p.shadow) parts.push('box-shadow');
  return parts.join(' + ') || '无指示';
}

async function describeActive(page: Page): Promise<Stop | null> {
  return await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body || el === document.documentElement) return null;
    const cs = getComputedStyle(el);
    const data = Array.from(el.attributes)
      .filter((a) => a.name.startsWith('data-'))
      .map((a) => `${a.name}=${a.value}`)
      .join(' ');
    const name =
      el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 24);
    return {
      key: data ? `${el.tagName.toLowerCase()}[${data}]` : `${el.tagName.toLowerCase()}#${name}`,
      tag: el.tagName.toLowerCase(),
      data,
      name,
      insideRoot: !!el.closest('[data-published-root]'),
      outlineStyle: cs.outlineStyle,
      outlineWidth: cs.outlineWidth,
      outlineColor: cs.outlineColor,
      boxShadow: cs.boxShadow,
    };
  });
}

/** 页面上"本该能被键盘碰到"的控件清单——分母来自 DOM 形状，不来自走查读数。 */
async function focusablePopulation(page: Page): Promise<{ included: string[]; excluded: string[] }> {
  return await page.evaluate((selector: string) => {
    const keyOf = (el: HTMLElement): string => {
      const data = Array.from(el.attributes)
        .filter((a) => a.name.startsWith('data-'))
        .map((a) => `${a.name}=${a.value}`)
        .join(' ');
      const name = el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 24);
      return data ? `${el.tagName.toLowerCase()}[${data}]` : `${el.tagName.toLowerCase()}#${name}`;
    };
    const root = document.querySelector('[data-published-root]');
    if (!root) throw new Error('公开页没渲染出来，这一片没有分母');
    const included: string[] = [];
    const excluded: string[] = [];
    for (const el of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
      // 排除项**照实记名**，不当看不见：一个控件被改成 tabindex=-1 / disabled 会从分母里
      // 悄悄蒸发，覆盖门就抓不到它——只有这条读数能让下次复核的人看出"少了一个"
      const reason =
        el.getAttribute('tabindex') === '-1'
          ? 'tabindex=-1'
          : (el as HTMLButtonElement).disabled
            ? 'disabled'
            : el.getAttribute('aria-hidden') === 'true'
              ? 'aria-hidden'
              : !el.isConnected || el.getClientRects().length === 0
                ? '不在布局里'
                : null;
      if (reason) excluded.push(`${keyOf(el)}（${reason}）`);
      else included.push(keyOf(el));
    }
    return { included, excluded };
  }, FOCUSABLE);
}

/** 与 §167 同一条纪律：先离开 Studio 再写文档（store 里那份旧稿会在卸载时盖回来）。 */
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
    name: '终点页',
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

test('§85 键盘可达性：Tab 走完公开页、Enter 按响互动热点（WCAG 2.1.1）', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await registerMember(page, `kbd+${RUN}@nexus.test`, 'e2e-secret-123');
  const projectId = await createProjectNamed(page, `键盘走查${RUN}`);
  const endPageId = await setInteractiveDocument(page, projectId);

  await page.goto(`/studio/${projectId}`);
  await page.click('[data-publish-open]');
  await expect(page.locator('[data-publish-submit]')).toBeVisible();
  await page.click('[data-publish-choice="public"]');
  await page.click('[data-publish-submit]');
  await expect(page.locator('[data-publish-url]')).toBeVisible({ timeout: 30_000 });
  const path = (await page.locator('[data-publish-url]').getAttribute('href'))!;

  // 匿名访客，且盖掉 webdriver：这一片要的是"真人只用键盘走一遍"，被记成爬虫就不算走通
  const context = await browser.newContext();
  await context.addInitScript(() => {
    Object.defineProperty(Object.getPrototypeOf(navigator), 'webdriver', { get: () => undefined });
  });
  const visitor = await context.newPage();
  await visitor.goto(new URL(path, page.url()).href);
  await expect(visitor.locator('[data-published-root]')).toBeVisible({ timeout: 30_000 });
  await expect(visitor.locator('[data-interactive-hotspot]')).toHaveCount(1);
  // 披露与测量同源：这段是访客看得见的唯一一句"怎么走"，只写鼠标就等于把键盘用户排除在功能之外。
  // 措辞钉在这条腿上——它正是量出"键盘也走得通"的那次测量，别的话没人复核。
  const note = visitor.locator('[data-interactive-note]');
  await expect(note).toBeVisible({ timeout: 30_000 });
  await expect(note, '页面上那句说明没告诉键盘用户怎么走').toContainText('Tab');
  await expect(note, '页面上那句说明没告诉键盘用户按哪个键翻页').toContainText('Enter');

  const { included: population, excluded } = await focusablePopulation(visitor);
  expect(population.length, '公开页里一个可聚焦控件都没有 ⇒ 走查无从证伪，这一片是空的').toBeGreaterThan(0);

  // 门「热点在册」：这一片要证的控件必须**留在分母里**。key 从分母里捞，不在测试这边重拼——
  // 热点身上有两个 data-*，拼错一个字符就永远"走不到"。
  // 为什么单独提前一道：变异臂量出来，热点被改成 tabindex=-1 时它先从分母蒸发，
  // 浏览器随即给投影出的根节点框补一个 tab 停留点，门「顺序」先红——红是真红，但报的不是这个缺陷。
  // 判据要**点名**：先钉住热点还在不在，才轮到顺序与覆盖。
  const hotspotKey = population.find((k) => k.includes('data-interactive-hotspot='));
  expect(hotspotKey, `分母里没有互动热点（分母：${population.join(' | ')}；排除项：${excluded.join(' | ') || '无'}）⇒ 这一片失去了它要证的控件`).toBeTruthy();

  // 走查：按 Tab，每步记下焦点落在哪。上限 = 分母的两圈再加几次缓冲（陷阱/页外停留都算进来）
  const limit = population.length * 2 + 8;
  const stops: Stop[] = [];
  const missedAt = new Set<string>();
  for (let press = 1; press <= limit; press += 1) {
    await visitor.keyboard.press('Tab');
    const stop = await describeActive(visitor);
    if (!stop) {
      missedAt.add(`press#${press}`);
      continue;
    }
    stops.push(stop);
    const distinct = new Set(stops.map((s) => s.key));
    // 一整圈走回到第一个停留点即收工：再按下去只是重复同一圈
    if (distinct.size >= 2 && stop.key === stops[0]!.key) break;
  }

  const reached = new Set(stops.filter((s) => s.insideRoot).map((s) => s.key));
  const outside = new Set(stops.filter((s) => !s.insideRoot).map((s) => s.key));
  const neverVisibleFocus = stops.filter((s) => !focusIndicator(s));

  // 门「无陷阱」：同一个元素连粘三次 ⇒ 走不出去
  let stuckKey = '';
  let stuckRun = 0;
  for (const s of stops) {
    stuckRun = s.key === stuckKey ? stuckRun + 1 : 1;
    stuckKey = s.key;
    if (stuckRun >= 3) break;
  }
  expect(stuckRun, `键盘陷阱：焦点连粘在 ${stuckKey} 走不动`).toBeLessThan(3);

  console.log(`\n== §85 键盘可达性读数（公开作品页 · 两页互动稿 · 只用键盘） ==`);
  console.log(`  分母（DOM 里可聚焦的控件）${population.length} 个 · 走查按了 ${stops.length} 步 · 公开页内命中 ${reached.size} 个`);
  console.log(`  页内命中清单：${[...reached].join(' | ') || '（无）'}`);
  if (outside.size) console.log(`  页外停留（浏览器/开发工具等，不计入覆盖）：${[...outside].join(' | ')}`);
  console.log(`  排除项（改了 tabindex=-1 / disabled / aria-hidden / 不在布局里，覆盖门抓不到，只能靠这条读数）：${excluded.join(' | ') || '（无）'}`);
  console.log(`  焦点指示：认不出指示的停留点 ${neverVisibleFocus.length} 个`);
  for (const s of stops.filter((x) => x.insideRoot)) console.log(`    - ${s.key}：${indicatorKind(s)}`);
  for (const s of neverVisibleFocus.slice(0, 8)) console.log(`    - ${s.key}（outline=${s.outlineStyle} shadow=${s.boxShadow}）`);
  if (missedAt.size) console.log(`  按完 Tab 焦点回到 body 的步数：${[...missedAt].join(' | ')}`);

  // 门「非空转」：走查真的走进了公开页
  expect(reached.size, `Tab 一步都没走进公开页（按了 ${stops.length} 步，命中 0 个）`).toBeGreaterThan(0);
  // 门「覆盖」：分母里每个控件都被碰到。少一个就是"鼠标能点、键盘碰不到"——正是这一片要抓的形状
  expect(
    population.filter((k) => !reached.has(k)),
    `这些可聚焦控件没被 Tab 走到：` +
      population.filter((k) => !reached.has(k)).join(' | ') +
      `（走查命中：${[...reached].join(' | ')}；按外停留：${[...outside].join(' | ') || '无'}）`,
  ).toEqual([]);
  // 门「顺序」：tab 顺序就是 DOM 顺序。冒出一个正 tabindex、或把控件挪到 DOM 末尾用 portal 浮出来，
  // 都会在这里现形——键盘用户没有眼睛可扫，顺序错了就等于读不到
  const cycleEnd = stops.findIndex((s, i) => i > 0 && s.key === stops[0]!.key);
  const firstCycle = stops
    .slice(0, cycleEnd < 0 ? stops.length : cycleEnd)
    .filter((s) => s.insideRoot)
    .map((s) => s.key);
  expect(firstCycle, 'tab 顺序与 DOM 顺序不一致（页内命中顺序要逐字等于分母顺序）').toEqual(population);
  // 门「焦点可见」：每个页内停留点都看得见焦点。首跑的读数里唯一没指示的是 Next 的开发工具 portal（页外），
  // 我们自己的 9 个控件全有——所以这一门现在钉得住：谁加了 outline-none 又没配 ring，这里就红
  const blind = stops.filter((s) => s.insideRoot && !focusIndicator(s));
  expect(blind.map((s) => s.key), `这些页内控件焦点看不见（outline 与 box-shadow 都是 none）：`).toEqual([]);

  // 门「热点可达」：不仅要在册，还要真被 Tab 走到（上面那条 Tab 循环把焦点停在**第一个**控件，
  // 所以这里继续按到热点为止——判据是"当前焦点是不是热点"，不是"按了几步"，后者会随界面加一个控件就漂）
  // 走查收工时焦点停在**第一个**控件（走回一圈的判据），所以这里继续按到热点为止：
  // 判据是"当前焦点是不是热点"，不是"按了几步"——后者会随界面加一个控件就漂
  let onHotspot = false;
  for (let press = 0; press < population.length + 2; press += 1) {
    await visitor.keyboard.press('Tab');
    const now = await describeActive(visitor);
    if (now && now.key === hotspotKey) {
      onHotspot = true;
      break;
    }
  }
  expect(onHotspot, `Tab 走不到互动热点 ${hotspotKey} ⇒ 只用键盘的人走不通这一版`).toBe(true);

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
