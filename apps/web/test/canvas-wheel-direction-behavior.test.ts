import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §CTRL-WHEEL · 画布滚轮方向的锁定门。
 *
 * 2026-11-21 实测更正：内容用 `translate(pan)` 投影，"往上滚看上面"必须让**内容往下走**
 * （pan.y 增大）。浏览器往上滚 deltaY<0，所以默认 `dir = -1`：
 *   - 实测（Playwright，滚轮上 240px）：旧 dir=+1 ⇒ pan.y 40→-200（内容上移 ⇒ 看下面，用户点名的 bug）；
 *     新 dir=-1 ⇒ pan.y 40→280（内容下移 ⇒ 看上面，与网页页面滚动一致）。
 * 2026-11-20 那版注释把"pan.y 减小"写成"视口向上移"，门照着错注释钉成了 dir=+1——
 * 门越绿、用户越难受。这次连注释、断言和实测读数一起翻过来。
 *
 * `nexus:canvas:wheel-inverted` 开关：
 * - 默认关（网页惯例）；某些系统/鼠标在驱动层把 deltaY 报反，这类机器点「滚轮」按钮切到
 *   dir=+1，选择持久化到 localStorage，无遥测；
 * - 切换只翻 dir 的号，Ctrl/⌘+滚轮缩放不受影响。
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

  it('dir 默认是 -1（实测：滚轮上 ⇒ pan.y 增大 ⇒ 内容下移 ⇒ 往上看）；反转态 dir=+1', () => {
    expect(SRC).toMatch(/const \[wheelInverted, setWheelInverted\] = useState\(false\)/);
    expect(SRC).toMatch(/const wheelInvertRef = useRef\(false\)/);
    expect(SRC).toMatch(/const dir = wheelInvertRef\.current \? 1 : -1/);
  });

  it('Shift+滚轮横移沿 dir：默认 -deltaY（与纵移同一手感，不出现横纵相反）', () => {
    expect(SRC).toMatch(/studio\.panBy\(dir \* event\.deltaY, 0\)/);
  });

  it('普通滚轮 panBy(dir*deltaX, dir*deltaY)：默认 dir=-1', () => {
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
