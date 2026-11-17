import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §CTRL-WHEEL · 画布滚轮方向的锁定门（用户点名过「滚轮方向反了」——先把语义钉死，再给设备翻转的机器一条合法出路）。
 *
 * 语义（默认，与浏览器页面滚动一致）：
 *   滚轮向**上** ⇒ deltaY < 0 ⇒ pan.y += -deltaY ⇒ 平移量增大 ⇒
 *   `translate(pan)` 内容整体下移 ⇒ 视口看到文档上方（「往上滑看上面」）。
 *   滚轮向**下** ⇒ deltaY > 0 ⇒ pan.y -= 100 ⇒ 内容上移 ⇒ 视口看下方。
 *
 * 新增 `nexus:canvas:wheel-inverted` 开关（2026-11-17）：
 * - 默认关（= 网页惯例）；Windows 自然滚动开关 / 某些鼠标的反向滚轮会在驱动层把 deltaY 的号翻掉，
 *   这类机器上「往上滑看上面」只能靠把脏值翻回来，所以画布右上角有一个明确的「滚轮」切换按钮；
 * - 选择持久化在 localStorage（`nexus:canvas:wheel-inverted` = `'1'`/`'0'`），无任何遥测；
 * - 切换只翻 `dir` 的号，Ctrl/⌘+滚轮缩放不受 dir 影响（缩放方向不随手感走）。
 *
 * 这道门的存在理由：
 * - 全仓唯一 wheel 处理器就在 CanvasStage 这一行；
 * - 该行的默认分支必须是「dir = -1」（网页惯例），任何人改成 `+1` 就是点名以外的 UX 变更，本测会红；
 * - localStorage 键名钉死，防止有人悄悄另起一份存储。
 */
const CANVAS = join(process.cwd(), 'apps/web/src/studio/CanvasStage.tsx');
const SRC = readFileSync(CANVAS, 'utf8');

describe('§CTRL-WHEEL 滚轮契约（画布）', () => {
  it('wheel 仍然只绑定在 CanvasStage 一处（grep 全仓应为 0 处他行）', () => {
    expect(SRC).toContain("surface.addEventListener('wheel'");
  });

  it('Ctrl/⌘+滚轮缩放使用 exp(-deltaY)：滚轮上 => deltaY<0 => exp(>0) 放大（视野放大）', () => {
    expect(SRC).toMatch(/zoomBy\(Math\.exp\(-event\.deltaY \* 0\.0015\)/);
  });

  it('dir 默认值是 -1（网页惯例：往上滚看上面）', () => {
    expect(SRC).toMatch(/const \[wheelInverted, setWheelInverted\] = useState\(false\)/);
    expect(SRC).toMatch(/const wheelInvertRef = useRef\(false\)/);
    expect(SRC).toMatch(/const dir = wheelInvertRef\.current \? 1 : -1/);
  });

  it('Shift+滚轮横移沿 dir：默认是 -deltaY（水平方向不随手习惯错位）', () => {
    expect(SRC).toMatch(/studio\.panBy\(dir \* event\.deltaY, 0\)/);
  });

  it('普通滚轮 panBy(dir*deltaX, dir*deltaY)：默认 dir=-1，即 panBy(-deltaX, -deltaY)', () => {
    expect(SRC).toMatch(/studio\.panBy\(dir \* event\.deltaX, dir \* event\.deltaY\)/);
  });

  it('方向选择持久化到 localStorage（nexus:canvas:wheel-inverted），无遥测', () => {
    expect(SRC).toContain("'nexus:canvas:wheel-inverted'");
    expect(SRC).toContain('window.localStorage.setItem');
    expect(SRC).not.toContain('fetch(');
  });

  it('画布右上角有明确的「滚轮」切换按钮（data-wheel-direction，aria-pressed 反映状态）', () => {
    expect(SRC).toContain('data-wheel-direction');
    expect(SRC).toMatch(/aria-pressed=\{wheelInverted\}/);
  });
});
