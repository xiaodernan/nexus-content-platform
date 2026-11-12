# ADR-0238：§FE-85 `ThemeToggle.tsx` `.tt-` 门面化——§120 主题 FAB

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-84 · `apps/web/test/theme-toggle-visual-style.test.ts` · `docs/evidence/fe-85-theme-toggle-facade/evidence.md`

## 背景

§120 主题 FAB：一个按钮，暗↔浅。`data-theme-toggle-ready` 是 e2e 水合屏障——只有 useEffect 跑过才置 1；localStorage 写失败（隐私模式）静默——本页仍生效。fixed/z-40/backdrop-blur 是必要 chrome。

## 决定

1. 新增 `.tt-fab`（globals.css，`.mfc-message` 之后）：固定定位（right/bottom: space-3）、36px 正圆、`color-mix(bg-2 90%, transparent)` 底、`backdrop-filter: blur(8px)`（含 -webkit 前缀）、`var(--nexus-shadow-sm)`、`:hover` 提升 ink、`:focus-visible` accent-2-ink outline-2（offset 2px）。
2. **零行为恒等门**（redact）：`985713fd…` 与 HEAD 字节一致。
3. **判据**（8/8 绿）：client + THEME_STORAGE_KEY/isTheme 进门 · 两个 data-hook 守恒（toggle/ready） · 字面类全 tt-* · 零裸 Tailwind（含 backdrop-blur/bg-bg-2\/90） · 类名闭环 · token 全声明 · 零 hex · 零新增颜色 token · **SHA256 守恒**。

## 取舍

- z-index 40 固定常数（无 token；与既有 FAB 层约定一致）；
- 正圆用 `9999px`（Tailwind `rounded-full` 字节级等）；
- 不加 `transition`——FAB 的颜色态变化本就零过渡语义；
- backdrop-blur ≥88% 用户可读（AA 由 bg-2 90% 混合保证）。

## 后果

`ThemeToggle` 加入门面矩阵。全站 FAB 只剩它一个，且已门面化。
