/**
 * §CP-1 触发胶囊**出现在哪些页面**。
 *
 * ## 为什么不是"全站都挂"
 *
 * 胶囊是 `position: fixed` 的浮层，左下角。绝大多数页面那块是空白，挂上去等于白送一个入口。
 * 但画布类页面（Studio / 游戏 / 3D 世界 / 预览）左下角是**工具位**：缩放、状态条、视图控件
 * 都在那儿，一个浮层压上去就是挡住真实操作。右下角已经有主题按钮（`.tt-fab`），
 * 没有第二个角可以让。
 *
 * ## 那这些页面还能用面板吗
 *
 * 能。**热键照旧**（⌘K / Ctrl+K 在 `input.ts` 里判，和路由无关），少掉的只是"看得见的提示"。
 * 代价如实记：第一次进 Studio 的人不会知道有面板——但 Studio 自己有 CommandBar 承担同一职责，
 * 那不是空白页。
 *
 * 判据做成纯函数是为了能钉住"前缀匹配不能误伤"：`/studio` 该隐藏，`/studio-notes` 不该
 * （它不是画布）。所以比的是**路径段边界**，不是裸 `startsWith`。
 */

/** 画布 / 全幅沉浸页：胶囊不挂（热键仍可用）。 */
const CHIP_HIDDEN_PREFIXES = ['/studio', '/game', '/world', '/preview'] as const;

/**
 * 该不该显示触发胶囊。
 *
 * @param pathname `usePathname()` 的值；空串（SSR 兜底/异常）按"显示"处理——
 *   少挂一次是少一个入口，多挂一次最坏只是挡住像素。
 */
export function shouldShowChip(pathname: string | null | undefined): boolean {
  if (!pathname) return true;
  return !CHIP_HIDDEN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
