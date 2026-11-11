import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * §A11Y-1 渐变墨字高对比度回退的**真浏览器那一寸**（脱离后端，纯 CSS 因果验证）。
 *
 * 为什么离线：本机后端网关常无干净窗口（根路径 `/` 与 `/discover` 会 502），而这条修复
 * 的正确性只取决于 CSS 规则本身在真 Chromium 的 `forced-colors: active` 下的行为——与后端
 * 数据无关。本 spec 用 `page.setContent` + 从**产物 globals.css 真实提取**的 forced 块做
 * A/B 对照，零后端、零夹具、确定性。
 *
 * **真浏览器证伪后的诚实假设**（`e2e/forced-colors-probe.mjs` 四组实测）：Chromium 在
 * forced-colors 下**内建保护**——会把 `color:transparent` 强制成系统前景色、把渐变
 * `background-image` 清成 none。所以"标题在 Chrome 高对比度下变空白字"并不成立，绝不夸大。
 * 真正可区分、且我的修复确实改变的量是 **`background-clip`**：
 *   - 无修复 + forced：`background-clip` 仍残留 `text`（color/bg 被浏览器兜住，但 clip 没回落）；
 *   - 有修复 + forced：`background-clip` 显式回落 `border-box`，且 color 为系统色、背景清空、文本可见。
 * 这道门测的就是这个跨 UA 加固：Chromium 已兜住 color/bg，但 `clip:text` 残留与其它 UA
 * （Firefox/Edge 自定义高对比度、forced-color-adjust 差异）不保证同等保护，显式回落才稳。
 *
 * 静态那一寸（8 类全覆盖/系统色/无效化裁剪/零 hex/零 token/注释配对）归
 * `apps/web/test/forced-colors-style.test.ts`。本片只验"真浏览器下修复真的改变了该改变的量"。
 */

const GLOBALS = join(process.cwd(), 'apps/web/src/app/globals.css');

/** 从产物 CSS 里按括号深度提取 `@media (forced-colors: active) { ... }` 整块（真字节，不重写）。 */
function extractForcedColorsBlock(css: string): string {
  const marker = '@media (forced-colors: active)';
  const start = css.indexOf(marker);
  if (start < 0) throw new Error('globals.css 找不到 forced-colors 块——修复没落地');
  const braceStart = css.indexOf('{', start);
  let depth = 0;
  let end = braceStart;
  for (; end < css.length; end++) {
    if (css[end] === '{') depth++;
    else if (css[end] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  return css.slice(start, end + 1);
}

const forcedBlock = extractForcedColorsBlock(readFileSync(GLOBALS, 'utf8'));

/** 复刻常规态渐变墨字的本质（透明字 + 裁剪背景），不含 token 依赖。 */
const baseline = `
  .ink {
    color: transparent;
    background: linear-gradient(120deg, #111 20%, #555 80%);
    -webkit-background-clip: text; background-clip: text;
    font: 700 28px sans-serif;
  }
`;

test('@smoke §A11Y-1 forced-colors 下渐变墨字从不可见回退为系统前景色', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });

  // ① 对照组：无回退规则。Chromium 已兜住 color/bg，但 background-clip 仍残留 text
  //    ——这就是修复要落回的真正差异，测它证明这道门非空（不测 color，那个被浏览器强制了）。
  await page.setContent(`<style>${baseline}</style><h1 class="ink">高对比度标题</h1>`);
  const before = await page.locator('.ink').evaluate((el) => {
    const s = getComputedStyle(el);
    return { color: s.color, backgroundClip: s.backgroundClip, visibility: s.visibility };
  });
  expect(before.color, 'Chromium 理应在 forced 态把 color 兜成系统前景色（假设变了要复查）').not.toBe('rgba(0, 0, 0, 0)');
  expect(before.backgroundClip, '无修复时 background-clip 应残留 text——这是修复要改变的量，门若非此则空').toBe('text');

  // ② 实验组：注入从产物真实提取的 forced 回退，把 .ink 也纳入它的选择器组
  const rule = forcedBlock.replace(/\.dv-title,\s*\.mk-title,\s*\.hp-heroTitle,\s*\.se-title,\s*\.pf-name,\s*\.pb-title,\s*\.pp-title,\s*\.ss-title/, '.ink');
  expect(rule, '产物 forced 块的选择器组形态变了，提取/改写不可靠——请同步本判据').toContain('.ink {');
  await page.setContent(`<style>${baseline}\n${rule}</style><h1 class="ink">高对比度标题</h1>`);

  const after = await page.locator('.ink').evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      color: s.color,
      backgroundClip: s.backgroundClip,
      visibility: s.visibility,
      backgroundImage: s.backgroundImage,
      text: el.textContent?.trim(),
      box: el.getBoundingClientRect(),
    };
  });
  // 修复的核心可见差异：background-clip 从（对照组的）text 显式回落 border-box
  expect(after.backgroundClip, 'forced 态 background-clip 没回落到 border-box，透明字裁剪仍在').toBe('border-box');
  // 其余是"仍然可读"的守卫（color 系统色、背景清空、文本与尺寸在）
  expect(after.color, '回退后标题不是系统前景色').toMatch(/^rgb\(/);
  expect(after.color, '回退后标题是透明字').not.toBe('rgba(0, 0, 0, 0)');
  expect(after.visibility).toBe('visible');
  expect(after.text, '标题文本丢了').toBe('高对比度标题');
  expect(after.box.width, '标题没有渲染尺寸').toBeGreaterThan(0);
  expect(after.backgroundImage, 'forced 态仍留着渐变背景').toBe('none');
});
