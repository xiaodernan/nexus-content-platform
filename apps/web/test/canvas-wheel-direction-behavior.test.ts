import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §CTRL-WHEEL · 画布滚轮方向的锁定门（用户点名过两次「滚轮方向反了」——先把当前正确语义钉住）。
 *
 * 语义（与浏览器页面滚动一致，与 Figma 画布一致）：
 *   滚轮向**上** ⇒ deltaY < 0 ⇒ pan.y += -deltaY ⇒ 平移量增大 ⇒
 *   `translate(pan)` 内容整体下移 ⇒ 视口看到文档上方（「往上滑看上面」）。
 *   滚轮向**下** ⇒ deltaY > 0 ⇒ pan.y -= 100 ⇒ 内容上移 ⇒ 视口看下方。
 *
 * 这道门的存在理由：
 * - 全仓唯一 wheel 处理器就在 CanvasStage 这一行；
 * - 该行若被改成 `panBy(event.deltaY)`（不带负号）就是用户点名的情形，
 *   本测会红——提醒改动者「这事别凭直觉」；
 * - 它不评判产品决定，只钉死这两个语义：`-event.deltaY` 與 `-event.deltaX` 的减号；
 * - 若将来真的需要换向（用户手摸手再点名），由人改一次并**改门**。
 */
const CANVAS = join(process.cwd(), 'apps/web/src/studio/CanvasStage.tsx');
const src = readFileSync(CANVAS, 'utf8');

describe('§CTRL-WHEEL 滚轮契约（画布）', () => {
  it('wheel 仍然只绑定在 CanvasStage 一处（grep 全仓应为 0 处他行）', () => {
    // 这里只断言本文件确实包含那一处绑定（防 grep 因路径变更静默漏检）
    expect(src).toContain("surface.addEventListener('wheel'");
  });

  it('Ctrl/⌘+滚轮缩放使用 exp(-deltaY)：滚轮上 => deltaY<0 => exp(>0) 放大（视野放大）', () => {
    expect(src).toMatch(/zoomBy\(Math\.exp\(-event\.deltaY \* 0\.0015\)/);
  });

  it('Shift+滚轮横移是 -deltaY（水平方向不随手习惯错位）', () => {
    expect(src).toMatch(/studio\.panBy\(-event\.deltaY, 0\)/);
  });

  it('普通滚轮 panBy(-deltaX, -deltaY)：纵向带负号，内容跟随视口方向移动', () => {
    expect(src).toMatch(/studio\.panBy\(-event\.deltaX, -event\.deltaY\)/);
  });
});
