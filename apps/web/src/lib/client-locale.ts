/**
 * §API-i18n（2026-11-15 公开试玩面 wave）：**客户端**组件的 locale 读侧。
 *
 * 为什么不走 `getLocale()`：它是服务端专用（`cookies()`），在客户端组件里跑会抛
 * 「函数只能在服务器组件/Route Handlers 里执行」。
 * 客户端的权威信号只能是文档上的 `<html lang>`——RSC 布局在渲染时按 cookie 设了
 * `lang="zh-CN"` / `lang="en"`（见 app/layout.tsx），且每次切换由
 * `/api/locale` 落 cookie + 整页刷新，所以这个标记不会撒谎。
 *
 * 读法：`typeof document === 'undefined'`（SSR 阶段：这页静态输出里 html lang 已是终值）
 * 时回落 zh，与服务端缺省一致；浏览器里每次挂载直接读文档上的 lang，**一次性同步**，无闪烁。
 */
export type ClientLocale = 'zh' | 'en';

export function clientLocale(): ClientLocale {
  if (typeof document === 'undefined') return 'zh';
  return document.documentElement.lang === 'en' ? 'en' : 'zh';
}
