/**
 * §CP-1 命令面板的**输入语义**：哪一下按键该把面板叫出来、上下键怎么绕。
 * 与 `score.ts` 分开的理由只有一条：那边是"排什么"，这边是"什么时候弹"，
 * 两件事的判据给不同的读者看（前者是产品排序，后者是键盘/可访问性）。
 *
 * 纯函数，不碰 DOM：事件对象只被读五个布尔字段与 `key`，单测在 node 里直接构造。
 */

import { isEditableTarget } from '@/lib/keyboard';

/** 与 GitHub / Linear / VS Code 一致的触发键。 */
export const PALETTE_KEY = 'k';

export interface HotkeyLike {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  target?: EventTarget | null;
}

/**
 * 该不该把面板叫出来。
 *
 * 三条判据，每条都有一个具体的理由：
 *
 * 1. **⌘K（metaKey）永远开**：macOS 上文本控件里没有 ⌘K 的原生含义，
 *    而"我在写东西时想跳走"恰恰是命令面板最常见的用法。
 * 2. **纯 Ctrl+K 在可编辑控件里放手**：Emacs 键位（macOS 的文本框、以及不少 Linux 输入框）
 *    把 Ctrl+K 定义成"删到行尾"。抢掉它等于在用户正在打字时删他的字——
 *    这是 `lib/keyboard.ts` 那条纪律的同一件事（焦点在输入控件里，键入属于用户）。
 * 3. **带 Alt 的一律不认**：Alt+K 在多数桌面环境是窗口/输入法级快捷键，不该被网页吞掉。
 *
 * 判定顺序刻意把 `altKey` 放最前面：先付一次最便宜的否决，再去做 `toLowerCase`。
 */
export function isPaletteHotkey(event: HotkeyLike): boolean {
  if (event.altKey) return false;
  if (typeof event.key !== 'string' || event.key.toLowerCase() !== PALETTE_KEY) return false;
  if (event.metaKey) return true;
  if (!event.ctrlKey) return false;
  return !isEditableTarget(event.target ?? null);
}

/**
 * 上下键移动高亮。**两端回绕**（到底再按下回到第一条）：命令面板是"一眼能看完的短列表"，
 * 回绕比停住更快；同时 `length === 0` 时返回 -1，让调用方有一个"没得选"的明确状态，
 * 而不是拿 0 去索引空数组。
 */
export function moveActive(current: number, delta: number, length: number): number {
  if (length <= 0) return -1;
  if (current < 0) return delta > 0 ? 0 : length - 1;
  const next = (current + delta) % length;
  return next < 0 ? next + length : next;
}

/** 结果集变化后把高亮夹回合法范围（回到 -1 = 没有选中项）。 */
export function clampActive(current: number, length: number): number {
  if (length <= 0) return -1;
  if (current < 0) return -1;
  return current >= length ? length - 1 : current;
}
