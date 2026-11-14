# ADR-0224：§FE-71 `app/layout.tsx` `.rx-` 门面化——根布局

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-70 · `apps/web/test/root-layout-visual-style.test.ts` · `docs/evidence/fe-71-root-layout-facade/evidence.md`

## 背景

`app/layout.tsx` 是全站根布局：唯一 `<html lang="zh-CN" data-nexus-theme="dark">` + `<body>`，挂 ThemeScript（同步内联）与 ThemeToggle，themeColor 随 `prefers-color-scheme` 分支。旧写法 `className="min-h-screen bg-bg-0 text-fg-1 antialiased"` 四个裸原子。

## 决定

1. 新增 `.rx-body` 门面类（globals.css）：`min-height: 100vh`、`bg-0`、`fg-1`、`-webkit-font-smoothing: antialiased` + `-moz-osx-font-smoothing: grayscale`（与 Tailwind `antialiased` 字节级等）。
2. **零行为恒等门**：`368e57a5…` 与 HEAD 字节一致。
3. **判据**（7/7 绿）：ThemeScript 同步内联进 body · 字面类全 rx-* · 零裸 Tailwind · 零 hex · token 全声明 · 零新增颜色 token · **SHA256 守恒**。

## 取舍

- `min-h-screen` → `min-height: 100vh`（Tailwind 的 min-h-screen 在 v3 即 100vh；不引 viewport units 之外的东西）；
- `flame-colors` 不变：themeColor 仍是 hex — 它是 `viewport` 元数据，不归 className redact 门辖；
- 不补 `overscroll-behavior`、不动 `data-nexus-theme`、不动 `suppressHydrationWarning`。

## 后果

根布局加入门面矩阵——整站第一屏的背景与字色从此走 token 门面一条路。
