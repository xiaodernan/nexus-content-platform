# §A11Y-3 · /admin 导航升维——磨砂胶囊长航格（2026-11-12）

## 改的是什么

`apps/web/src/components/AdminNav.tsx`：十个 `/admin/*` 页面共用的 `<nav>`。
此前是 2026-10-30 第二十五片收敛的极简版——11px 文字链接、`min-h-6`（24px WCAG 2.5.8 下限）、无容器、
每条带下划线。

本片只换皮相、不换任何东西别的：

| 维度 | 之前 | 之后 |
|---|---|---|
| 容器 | 无 | 半透磨砂胶囊（`border-subtle` + `bg-2/70` + `backdrop-blur` + `shadow-sm`），`rounded-full` |
| 当前页 | 会加粗的文字 + `aria-current` | accent-2→info 青蓝渐变实底 + `accent-fg` 墨字（两主题 ≥10.9:1）+ 6px 同墨圆点 `aria-hidden` |
| 非当前页 | `accent-2-ink` 下划线链接 | `fg-2` 无下划线，hover 才亮 `bg-3` 底 + `fg-1` 文字 |
| 聚焦环 | 无 | `focus-visible:ring-2 ring-[var(--nexus-color-accent-2-ink)]`（未命中 AA 的情况下不存在） |
| 下限 | `min-h-6`=24px | `min-h-7`=28px，比 24px 下限更积极 |
| 语义 | `aria-label="管理台"`、`aria-current="page"`、`data-admin-link` | **全部原样保留**；只加 `aria-hidden` 的装饰圆点 |
| 动效 | 无 | `transition-colors` 用 `--nexus-motion-fast`（reduce-motion 下自动归零） |

## 证据是什么，不是什么

- `preview.html` + `preview.css` 是**设计取证**，不是 apps/web 的编译产物：CSS 数值逐字对应
  `apps/web/src/styles/tokens.css`，markup 对应 `AdminNav.tsx` 渲染形态；截图只证明设计形态、
  双主题对比、forced-colors 退化路径——**不证明生产构建渲染的像素**。
- 截图：`dark.png` / `light.png`（1280×250 截窗 1024×250）/ `forced-colors.png`
  （`forcedColors: 'active'` 真 Chrome 媒体查询——组件在砍掉渐变/backdrop 后仍靠
  `Highlight/ButtonFace` 说得清"当前在观测这一格"）。
- 组件本身的生成正确性由此担保：`tsc -p apps/web` exit 0；`eslint AdminNav.tsx --max-warnings=0` exit 0；
  `vitest run apps/web/test/style-tokens.test.ts` 24/24；`min-h-7`/`accent-2-ink`/`ring-*` 均为既有 token 与
  既有用法（InteractiveSurface 同款 `focus-visible:ring-[var(--nexus-color-accent-2-ink)]`）。

## 诚实边界

- 本轮**没起真 dev server、没打生产构建**（本机 1-2 GB 余量、并行会话在跑）：截图是设计取证，不是真实页面的截图。
  真侧确认由下一次干净窗口 + `e2e/a11y-internal.spec.ts` 一类套件承担。
- 导航内未加任何新交互（没有分组、没有折叠、没有 icon 图标库引入——引库/改信息架构是另一片）。
- 浅色/forced-colors/focus 环三项已在真 headless Chrome 渲染出来看过，形态如实见图；
  Edge/Firefox 未实测。
- `prefers-reduced-motion` 的效果是 `--nexus-motion-fast` 归零后的瞬时切换（tokens.css 已钉死），未单独截图。
