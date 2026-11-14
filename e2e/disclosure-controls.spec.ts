import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * §A11Y-2 disclosure 契约的**真浏览器那一寸**（脱离后端，纯 DOM 因果，确定性 A/B）。
 *
 * 为什么离线：本机后端网关常无干净窗口（根路径 `/` 与 `/discover` 会 502），而本片修复的
 * 正确性只取决于「aria-controls 指向的 id 在展开态 DOM 里真实存在」这条浏览器语义——与后端
 * 数据无关。用 `page.setContent` 做 A/B，零后端、零夹具，专用无-webServer config（同 A11Y-1）。
 *
 * **诚实边界（不作假）**：注入的最小 DOM 是**复刻**的（真组件渲染要 Next dev + 后端，本机
 * 502 无干净窗口），但**每一对 aria/id token 都从真组件源码读出来**（见 idTokensFrom），
 * 不是凭空捏的；本片验的是 Chromium 原生 ARIA reflection
 * （`Element.ariaControlsElements`，缺则退回 `getElementById`）对「真实 id vs 悬空 typo vs
 * 收起态无引用」三种状态的可区分因果——把静态门守的「字符串同 token」在真 DOM 里坐实：
 *   - 正向：aria-controls 指向存在 id ⇒ 浏览器解析到那个面板元素（长度 1）；
 *   - 对照（A/B 的 B）：指向 typo id ⇒ 解析为空（证明门非空、能区分悬空引用）；
 *   - 收起态：无 aria-controls + 面板未挂载 ⇒ 无悬空引用（对应条件式 `{open ? id : undefined}`）。
 * 不宣称「真组件在真页面逐一点开过」——那属真库/真浏览器集成，列仍欠、不编。
 *
 * 静态那一寸（全库动态发现 / 指向真实 id / 豁免清单 / 验电）归
 * `apps/web/test/disclosure-controls.test.ts`。本片只验真浏览器下修复确实对应真实 DOM 状态。
 */

const ROOT = process.cwd();
const COMPONENTS = [
  'apps/web/src/marketplace/MarketplaceItemRow.tsx', // 条件式字符串字面量 id
  'apps/web/src/world3d/WorldWalk.tsx',              // 静态字面量 id
  'apps/web/src/studio/StoryboardPanel.tsx',         // 静态字面量 id
  'apps/web/src/studio/HistoryPanel.tsx',            // 模板插值 id
];

/**
 * 从真组件源码提取面板 id 的**静态前缀/字面量**：
 * ① `id="foo"` 字面量；② `id={`foo-${x}`}` 模板取插值前前缀；③ `const fooPanelId = `foo-${x}``
 * 变量定义同样取模板前缀（MarketplaceItemRow 的 id 走变量分发）。
 * 只取静态来源，插值的 `${...}` 段在构造 DOM 时补一个固定测试后缀即可，不影响"指向存在 id"的因果。
 */
function idTokensFrom(src: string): string[] {
  const out = new Set<string>();
  for (const m of src.matchAll(/(?<![\w-])id\s*=\s*"([^"]+)"/g)) out.add(m[1]!);
  for (const m of src.matchAll(/(?<![\w-])id\s*=\s*\{`([^`]*)`\}/g)) {
    const prefix = m[1]!.split('${')[0]!;
    if (prefix) out.add(prefix);
  }
  for (const m of src.matchAll(/const\s+\w*[Pp]anel[Ii]d\s*=\s*`([^`]*)`/g)) {
    const prefix = m[1]!.split('${')[0]!;
    if (prefix) out.add(prefix);
  }
  return [...out];
}

const tokens = COMPONENTS.flatMap((rel) =>
  idTokensFrom(readFileSync(join(ROOT, rel), 'utf8')).map((t) => ({ rel, token: t })),
);

/** 在真 Chromium 里读触发键的 aria-controls 解析结果：原生 reflection，缺则退回 getElementById。 */
async function resolve(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const btn = document.getElementById('trigger') as HTMLElement & { ariaControlsElements?: Element[] };
    const raw = btn.getAttribute('aria-controls');
    const reflected = btn.ariaControlsElements ? Array.from(btn.ariaControlsElements) : null;
    const hit = raw ? document.getElementById(raw) : null;
    const fallback: Element[] = hit ? [hit] : [];
    const resolved: Element[] = reflected ?? fallback;
    return {
      raw,
      api: reflected ? 'ariaControlsElements' : 'getElementById',
      count: resolved.length,
      pointsToPanel: resolved.length === 1 && (resolved[0] as HTMLElement).dataset.panel === '1',
    };
  });
}

test('@smoke §A11Y-2 真 Chromium：aria-controls 指向存在 id 才解析到面板，悬空/收起态解析为空', async ({ page }) => {
  expect(tokens.length, '从真组件源码一个面板 id token 都没提取到——提取逻辑或组件写法变了').toBeGreaterThanOrEqual(6);

  for (const { rel, token } of tokens) {
    const id = `${token}TEST`; // 模板前缀补固定测试后缀，等价于 `foo-${x}` 的某个运行值
    // ① 正向：展开态——aria-expanded=true + aria-controls 指向存在 id + 面板已挂载
    await page.setContent(
      `<button id="trigger" aria-expanded="true" aria-controls="${id}">展开</button><div id="${id}" data-panel="1">面板</div>`,
    );
    const open = await resolve(page);
    expect(open.raw, `${rel}: aria-controls 值丢了`).toBe(id);
    expect(open.count, `${rel}: aria-controls 指向存在 id，却没解析到元素（用的 ${open.api}）`).toBe(1);
    expect(open.pointsToPanel, `${rel}: 解析到的不是那个面板（用的 ${open.api}）`).toBe(true);

    // ② 对照臂：悬空 typo——aria-controls 指向不存在的 id，必须解析为空（证明门非空、能区分假关系）
    await page.setContent(
      `<button id="trigger" aria-expanded="true" aria-controls="${id}TYPO">展开</button><div id="${id}" data-panel="1">面板</div>`,
    );
    const dangling = await resolve(page);
    expect(dangling.count, `${rel}: 悬空 aria-controls 竟解析到了元素——这道门区分不出假关系`).toBe(0);

    // ③ 收起态：无 aria-controls + 面板未挂载——不该留悬空引用
    await page.setContent(`<button id="trigger" aria-expanded="false">收起</button>`);
    const closed = await resolve(page);
    expect(closed.raw, `${rel}: 收起态仍有 aria-controls 悬空引用`).toBeNull();
    expect(closed.count, `${rel}: 收起态不该解析到任何元素`).toBe(0);
  }
});
