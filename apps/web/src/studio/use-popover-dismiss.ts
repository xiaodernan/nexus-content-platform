import { useEffect, useRef } from 'react';

/**
 * §85：顶栏弹层的键盘与指针收口——Escape 收回、点外部收回、收起后焦点回触发键。
 *
 * 发布弹层与导出弹层是同一个形状（顶栏一颗触发键 + 一个绝对定位的面板），两处收口共用这一份，
 * 免得一条腿只修在其中一个上。三条判据：
 *
 * - **Escape 必须在捕获阶段截住**：画布也听 `window` 的 Escape（清空选区）。两个监听都在
 *   window 上，注册顺序决定谁先跑——弹层后挂，冒泡阶段轮不到它先说话，于是"关弹层"会变成
 *   "顺手把作者选中的元素也丢了"。捕获阶段先处理并 `stopPropagation`，这一下只归弹层。
 * - **点外部收起**只认 `pointerdown` 且排除弹层根节点（连触发键一起）：用 `click` 的话，
 *   按下与抬起之间跨过边界的那次点击会把弹层关在抬起之前，看起来像"点了一下没反应"。
 * - 收起后焦点回到触发键：键盘用户不该被留在 document.body 上，否则下一次 Tab 从页首开始。
 *
 * `setOpen` 直接收 `useState` 的那个 setter：它的身份是稳定的，所以这个 effect 只在开合时重挂，
 * 不会每次渲染都摘下再挂上监听（那样按下与抬起之间换过监听，正是上面第二条要防的形状）。
 */
export function usePopoverDismiss(open: boolean, setOpen: (open: boolean) => void) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, setOpen]);

  return { rootRef, triggerRef };
}
