import { expect, type Page } from '@playwright/test';

/**
 * §85 第三片的走查本体，第七片把它从"公开作品页专用"里抽出来，好让同一套门量其余界面。
 *
 * 为什么值得抽：抽之前这些判据只有公开页那一张贴得上去——`insideRoot` 钉死在
 * `[data-published-root]`，分母也只在它里面取，于是 Studio 上"面板里的按钮 Tab 到不到"
 * 这一类问题**结构上不可能被发现**（同一件事在 a11y-internal 那片已经发生过一回：
 * axe 扫不到的面就不许说它过）。
 *
 * 纪律没动：不断言阈值，只钉结构不变式，读数一律打印。七道门与抽之前逐字同判据——
 * 「非空转」分母与页内命中都 > 0；「点名在册」`require` 里的控件必须还在分母里；
 * 「无陷阱」同一元素连粘三次即判死；「覆盖」分母里每个控件真被 Tab 碰到；
 * 「顺序」页内命中顺序逐字等于 DOM 顺序；「焦点可见」每个页内停留点都看得见焦点；
 * 「停留点有归属」页内每个 Tab 停留点要么在分母里、要么是浏览器的隐式停留点（见下）。
 *
 * 一处公开的排除：`exclude`（默认 Next 的开发工具 portal）。它挂在 body 末尾、活在 shadow
 * root 里，DOM 查询取不到它、Tab 却能停上去——不排掉它，「焦点可见」会把浏览器工具的读数
 * 算成我们界面的缺陷。抽之前它是靠 `insideRoot` 挡的，现在写明。
 *
 * 第二类"不在分母里却真的被 Tab 停上去"的：**Chrome 给可滚动容器加的隐式 tab 停留点**
 *（2026-10-29 在公开作品页量到：投影外层那个可滚动 `div` 落在视口选项与主题切换键之间）。
 * 它不是缺陷，也不是本文件的控件族——所以单列成一类读数打印；顺序门拿它比 DOM 顺序会红在
 * 一件不存在的事上。若焦点落在既不在分母、又不可滚动的元素上，那是真的意外（比如控件在水合中
 * 被换成不可聚焦的形状），仍然判红。
 */

/** 页面上"本该能被键盘碰到"的控件判据：原生可聚焦 + 没被 tabindex=-1 藏掉 + 没 disabled + 看得见。 */
export const FOCUSABLE = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  '[contenteditable="true"]',
  '[tabindex]',
].join(',');

export interface Stop {
  /** 稳定身份：优先 data-* 徽标，其次 tag + 可及名；末尾 `@n` 是它在页面可聚焦序列里的位置 */
  key: string;
  tag: string;
  data: string;
  name: string;
  insideRoot: boolean;
  /** 在显式可聚焦分母里的位置；`-1` = 不在分母里（浏览器隐式停留点，见文件头那条） */
  pos: number;
  /** 浏览器会不会因为它可滚动而给它一个隐式 tab 停留点 */
  scrollable: boolean;
  outlineStyle: string;
  outlineWidth: string;
  outlineColor: string;
  boxShadow: string;
}

export interface WalkOptions {
  /** 打印用的界面名 */
  label: string;
  /** 走查的范围：只有落在这个选择器里的控件才算"页内" */
  root: string;
  /** 不算我们界面的容器（默认：Next 开发工具 portal） */
  exclude?: string;
  /** 这一片要证的控件：点名要求它们留在分母里，抽之前只有公开页有这条 */
  require?: string[];
}

export interface WalkReport {
  options: WalkOptions;
  population: string[];
  excluded: string[];
  stops: Stop[];
  reached: string[];
  outside: string[];
  blind: string[];
  missed: string[];
}

function keySelector(options: WalkOptions): { root: string; exclude: string } {
  return { root: options.root, exclude: options.exclude ?? 'nextjs-portal' };
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

export function focusIndicator(s: Stop): boolean {
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

export async function describeActive(page: Page, options: WalkOptions): Promise<Stop | null> {
  const { root, exclude } = keySelector(options);
  return await page.evaluate(
    ({ root, exclude, selector }) => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body || el === document.documentElement) return null;
      const cs = getComputedStyle(el);
      const data = Array.from(el.attributes)
        .filter((a) => a.name.startsWith('data-'))
        .map((a) => `${a.name}=${a.value}`)
        .join(' ');
      const name =
        el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 24);
      // 位置进身份：Studio 首跑量到 69 个可聚焦槽位只有 52 个不同的 key（同一排图标按钮
      // 文字相同、同一列行操作 data 值相同）。不带位置，"两份里只有一份 Tab 得到"这种缺陷
      // 在覆盖门上会被另一份顶掉——门分不清，就等于门在放过它。
      const scope = document.querySelector(root);
      const pos = scope ? Array.from(scope.querySelectorAll(selector)).indexOf(el) : -1;
      // Chrome 的隐式停留点判据：滚动方向上有溢出、且该方向是可滚动的
      const style = getComputedStyle(el);
      const scrollable =
        (/auto|scroll|overlay/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1) ||
        (/auto|scroll|overlay/.test(style.overflowX) && el.scrollWidth > el.clientWidth + 1);
      return {
        key: `${data ? `${el.tagName.toLowerCase()}[${data}]` : `${el.tagName.toLowerCase()}#${name}`}@${pos}`,
        tag: el.tagName.toLowerCase(),
        data,
        name,
        insideRoot: !!el.closest(root) && !el.closest(exclude),
        pos,
        scrollable,
        outlineStyle: cs.outlineStyle,
        outlineWidth: cs.outlineWidth,
        outlineColor: cs.outlineColor,
        boxShadow: cs.boxShadow,
      };
    },
    { root, exclude, selector: FOCUSABLE },
  );
}

/** 页面上"本该能被键盘碰到"的控件清单——分母来自 DOM 形状，不来自走查读数。 */
export async function focusablePopulation(
  page: Page,
  options: WalkOptions,
): Promise<{ included: string[]; excluded: string[] }> {
  const { root, exclude } = keySelector(options);
  return await page.evaluate(
    (arg: { label: string; root: string; exclude: string; selector: string }) => {
      const keyOf = (el: HTMLElement): string => {
        const data = Array.from(el.attributes)
          .filter((a) => a.name.startsWith('data-'))
          .map((a) => `${a.name}=${a.value}`)
          .join(' ');
        const name = el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 24);
        return data ? `${el.tagName.toLowerCase()}[${data}]` : `${el.tagName.toLowerCase()}#${name}`;
      };
      const scope = document.querySelector(arg.root);
      if (!scope) throw new Error(`${arg.label}：页内找不到 ${arg.root}，这一片没有分母`);
      const included: string[] = [];
      const excluded: string[] = [];
      const all = Array.from(scope.querySelectorAll<HTMLElement>(arg.selector));
      // 排除项**照实记名**，不当看不见：一个控件被改成 tabindex=-1 / disabled 会从分母里
      // 悄悄蒸发，覆盖门就抓不到它——只有这条读数能让下次复核的人看出"少了一个"
      all.forEach((el, pos) => {
        // 判据与 `describeActive` 同源：同一个元素在那边算出的 key 必须在这里一模一样，
        // 否则「覆盖」会拿两套不同的身份比大小。
        const reason =
          el.closest(arg.exclude)
            ? '开发工具 portal'
            : el.getAttribute('tabindex') === '-1'
              ? 'tabindex=-1'
              : (el as HTMLButtonElement).disabled
                ? 'disabled'
                : el.getAttribute('aria-hidden') === 'true'
                  ? 'aria-hidden'
                  : !el.isConnected || el.getClientRects().length === 0
                    ? '不在布局里'
                    : null;
        const key = `${keyOf(el)}@${pos}`;
        if (reason) excluded.push(`${key}（${reason}）`);
        else included.push(key);
      });
      return { included, excluded };
    },
    { label: options.label, root, exclude, selector: FOCUSABLE },
  );
}

/**
 * 只用键盘走一遍这一页，跑七道结构门，把读数打印回来。
 * 调用方先导航并等到界面真渲染出来——水合与登录的麻烦不属于走查本身。
 */
export async function keyboardWalk(page: Page, options: WalkOptions): Promise<WalkReport> {
  // 分母要先**稳定**再取样：面板水合后陆续挂载的话，中途读到的分母比走查实际走到的少，
  // 「覆盖」就会把"还没挂上"报成"键盘走不到"。连续两次读数一致才算稳定。
  let population = (await focusablePopulation(page, options)).included;
  let excluded: string[] = [];
  for (let settle = 1; settle <= 12; settle += 1) {
    await page.waitForTimeout(250);
    const next = await focusablePopulation(page, options);
    if (next.included.join('|') === population.join('|')) {
      excluded = next.excluded;
      break;
    }
    population = next.included;
    excluded = next.excluded;
    if (settle === 12) throw new Error(`${options.label}：分母在 3 秒里一直变，走查没有稳定的判据可钉`);
  }
  expect(population.length, `${options.label}：一个可聚焦控件都没有 ⇒ 走查无从证伪，这一片是空的`).toBeGreaterThan(0);

  // 门「点名在册」：这一片要证的控件必须**留在分母里**。key 从分母里捞，不在测试这边重拼——
  // 拼错一个字符就永远"走不到"。为什么单独提前一道：热点被改成 tabindex=-1 时它先从分母蒸发，
  // 浏览器随即给相邻节点补一个 tab 停留点，门「顺序」先红——红是真红，但报的不是这个缺陷。
  for (const want of options.require ?? []) {
    expect(
      population.find((k) => k.includes(want)),
      `分母里没有 ${want}（分母：${population.join(' | ')}；排除项：${excluded.join(' | ') || '无'}）⇒ 这一片失去了它要证的控件`,
    ).toBeTruthy();
  }

  // 起点必须回到文档开头：门「顺序」拿页内命中顺序去比 DOM 顺序，而焦点若在走查开始前就落在
  // 页面中段（登录后自动聚焦、上一次交互留下的焦点），第一圈读出来的是**轮转过的**顺序——
  // 「覆盖」照过，「顺序」却会红成"顺序不一致"，看着像产品错位，其实是走查自己没归零。
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());

  // 走查：按 Tab，每步记下焦点落在哪。上限 = 分母的两圈再加几次缓冲（陷阱/页外停留都算进来）
  const limit = population.length * 2 + 8;
  const stops: Stop[] = [];
  const missedAt = new Set<string>();
  for (let press = 1; press <= limit; press += 1) {
    await page.keyboard.press('Tab');
    const stop = await describeActive(page, options);
    if (!stop) {
      missedAt.add(`press#${press}`);
      continue;
    }
    stops.push(stop);
    const distinct = new Set(stops.map((s) => s.key));
    // 一整圈走回到第一个停留点即收工：再按下去只是重复同一圈
    if (distinct.size >= 2 && stop.key === stops[0]!.key) break;
  }

  const reached = [...new Set(stops.filter((s) => s.insideRoot && s.pos >= 0).map((s) => s.key))];
  const outside = [...new Set(stops.filter((s) => !s.insideRoot).map((s) => s.key))];
  // 浏览器隐式给的停留点（可滚动容器）：不在分母里，不算命中也不算缺陷，单列打印
  const implicitStops = [...new Set(stops.filter((s) => s.insideRoot && s.pos < 0 && s.scrollable).map((s) => s.key))];
  // 既不在分母、又不可滚动的页内停留点：那不是浏览器的行为，是真的意外
  const unexpectedStops = [
    ...new Set(stops.filter((s) => s.insideRoot && s.pos < 0 && !s.scrollable).map((s) => s.key)),
  ];
  const blind = stops.filter((s) => s.insideRoot && !focusIndicator(s)).map((s) => s.key);

  console.log(`\n== §85 键盘可达性读数（${options.label} · 只用键盘） ==`);
  console.log(`  分母（DOM 里可聚焦的控件）${population.length} 个 · 走查按了 ${stops.length} 步 · 页内命中 ${reached.length} 个`);
  console.log(`  页内命中清单：${reached.join(' | ') || '（无）'}`);
  if (outside.length) console.log(`  页外停留（浏览器/开发工具等，不计入覆盖）：${outside.join(' | ')}`);
  if (implicitStops.length) {
    console.log(`  浏览器隐式停留点（可滚动容器，不在分母/不计入覆盖，顺序门不比它）：${implicitStops.join(' | ')}`);
  }
  console.log(`  排除项（改了 tabindex=-1 / disabled / aria-hidden / 不在布局里，覆盖门抓不到，只能靠这条读数）：${excluded.join(' | ') || '（无）'}`);
  console.log(`  焦点指示：认不出指示的停留点 ${blind.length} 个`);
  for (const s of stops.filter((x) => x.insideRoot)) {
    console.log(`    - ${s.key}：${indicatorKind(s)}`);
  }
  if (missedAt.size) console.log(`  按完 Tab 焦点回到 body 的步数：${[...missedAt].join(' | ')}`);

  // 门「无陷阱」：同一个元素连粘三次 ⇒ 走不出去
  let stuckKey = '';
  let stuckRun = 0;
  for (const s of stops) {
    stuckRun = s.key === stuckKey ? stuckRun + 1 : 1;
    stuckKey = s.key;
    if (stuckRun >= 3) break;
  }
  expect(stuckRun, `${options.label}：键盘陷阱，焦点连粘在 ${stuckKey} 走不动`).toBeLessThan(3);

  // 门「非空转」：走查真的走进了这一页
  expect(reached.length, `${options.label}：Tab 一步都没走进页内（按了 ${stops.length} 步，命中 0 个）`).toBeGreaterThan(0);

  // 门「停留点有归属」：页内被 Tab 停到的每个东西，要么在分母里，要么是浏览器给可滚动容器的
  // 隐式停留点。第三条路（既不在分母、也不可滚动）说明焦点落到了本文件不认识的东西上，
  // 那会悄悄绕过覆盖门——按 §159 的说法，不认识就不许说它过。
  expect(
    unexpectedStops,
    `${options.label}：焦点落在了既不在分母、又不可滚动的页内元素上：${unexpectedStops.join(' | ')}` +
      `（分母：${population.join(' | ')}）`,
  ).toEqual([]);

  // 门「覆盖」：分母里每个控件都被碰到。少一个就是"鼠标能点、键盘碰不到"
  expect(
    population.filter((k) => !reached.includes(k)),
    `${options.label}：这些可聚焦控件没被 Tab 走到：` +
      population.filter((k) => !reached.includes(k)).join(' | ') +
      `（走查命中：${reached.join(' | ')}；按外停留：${outside.join(' | ') || '无'}）`,
  ).toEqual([]);

  // 门「顺序」：tab 顺序就是 DOM 顺序。冒出一个正 tabindex、或把控件挪到 DOM 末尾用 portal 浮出来，
  // 都会在这里现形——键盘用户没有眼睛可扫，顺序错了就等于读不到。
  // 只比**分母里**的停留点：隐式可滚动容器的位置不受本文件的控件顺序管（它由浏览器插入）。
  const cycleEnd = stops.findIndex((s, i) => i > 0 && s.key === stops[0]!.key);
  const firstCycle = stops
    .slice(0, cycleEnd < 0 ? stops.length : cycleEnd)
    .filter((s) => s.insideRoot && s.pos >= 0)
    .map((s) => s.key);
  expect(firstCycle, `${options.label}：tab 顺序与 DOM 顺序不一致（页内命中顺序要逐字等于分母顺序）`).toEqual(population);

  // 门「焦点可见」：每个页内停留点都看得见焦点。第三片首跑时唯一没指示的是 Next 开发工具 portal
  //（页外），页内为 0 ⇒ 这一门钉得住：谁加了 outline-none 又没配 ring，这里就红
  expect(blind, `${options.label}：这些页内控件焦点看不见（outline 与 box-shadow 都是 none）`).toEqual([]);

  return { options, population, excluded, stops, reached, outside, blind, missed: [...missedAt] };
}

/**
 * 继续按 Tab 直到焦点落在点名的控件上，返回走没走到。
 * 判据是"当前焦点是不是它"，不是"按了几步"——后者会随界面多一个控件就漂。
 */
export async function tabTo(page: Page, options: WalkOptions, key: string, maxSteps: number): Promise<boolean> {
  for (let press = 0; press < maxSteps; press += 1) {
    await page.keyboard.press('Tab');
    const now = await describeActive(page, options);
    if (now && now.key === key) return true;
  }
  return false;
}
