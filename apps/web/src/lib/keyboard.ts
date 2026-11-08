/**
 * §90 / WCAG 2.1.1：全局快捷键与"浏览器原生行为"的边界，只写这一份。
 *
 * 几处 window 级 keydown（Studio 画布、2D / RPG 两张游戏页、3D 世界）都在做同一件事：
 * 把按键**当成自己的输入**，顺手 `preventDefault`。一按到底会吞掉浏览器本来就有的两件事：
 * - 焦点在输入控件里时，键入的字符属于用户：在种子输入框里按 `w` 不该是"往前一步"，
 *   按 ↑ 该是数字 +1（`GamePlay` / `RpgPlay` 的 `KEY_MAP` 恰好把 ↑ 也当成走路）；
 * - 焦点在按钮/链接上时，Space 是**原生激活键**：吞掉它，按钮的键盘激活就失效（WCAG 2.1.1）。
 *
 * 判据放在这里而不是各写一份：本仓 2026-10-29 先在 Studio 画布上量到 Space 被劫走，
 * 修完才发现三张游戏页是同族缺陷——抄第二份判据就一定会漂（Studio 那份当时只判 `button`，
 * 漏了 `[role=…]` 控件族）。
 */

/**
 * 事件目标退化成的"能问两个问题"的形状。**不用 `instanceof HTMLElement`**：
 * 这条判据的单测跑在 node 里（`vitest.config.ts` 的 environment 是 node），
 * 那里没有 HTMLElement；判据本身只关心 tagName / contentEditable / closest 三件事。
 */
interface TargetLike {
  tagName?: unknown;
  isContentEditable?: unknown;
  closest?: (selector: string) => unknown;
}

function asTargetLike(target: EventTarget | null): TargetLike | null {
  if (!target || typeof target !== 'object') return null;
  const like = target as TargetLike;
  return typeof like.tagName === 'string' ? like : null;
}

const EDITABLE_TAGS = /^(INPUT|TEXTAREA|SELECT)$/;

/**
 * 焦点在可编辑控件上：全局快捷键**一律**放手（那里键入的每个字符都属于用户）。
 * `contentEditable` 用 `isContentEditable` 判（它会把可编辑容器内的后代也算进去），
 * 不用 `closest('[contenteditable]')`——后者只看属性，不看 `contenteditable="false"` 的例外。
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = asTargetLike(target);
  if (!el) return false;
  return el.isContentEditable === true || EDITABLE_TAGS.test(el.tagName as string);
}

/**
 * 控件族：`closest` 从焦点往上找，按钮里的 `<span>` 也算"在按钮上"。
 * 判据带 role 族，不只 `button`——本仓 Studio 画布那次量到的正是"只判 button 会漏"。
 */
const CONTROLS =
  'button, a[href], summary, [role="button"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"]';

/** 焦点在控件族上：Space 是原生激活键，不许被玩法/快捷键劫走 */
export function isControlTarget(target: EventTarget | null): boolean {
  const el = asTargetLike(target);
  if (!el?.closest) return false;
  return Boolean(el.closest(CONTROLS));
}
