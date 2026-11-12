# ADR-0232：§FE-79 `SearchBox.tsx` 原子清零（叠加 `.se-*`）

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-78 · `apps/web/test/search-box-visual-style.test.ts` · `docs/evidence/fe-79-search-box-facade/evidence.md`

## 背景

§165 搜索框：建议来自真实命中（`/api/search/suggest` 复用同一份可见性判定）、历史只存这台设备（localStorage）、无 JS 仍是原生 GET 表单——三个诚实性语义都在。原子六处：根容器/暂停提示/建议标题/历史行/历史边注/清空按钮。

## 决定

1. 新增追加段（globals.css，`.se-hitGrid` 之后）：`se-boxRoot/se-pauseNote/se-suggestTitle/se-historyRow/se-hint11/se-clearBtn`；`truncate` → `overflow/ellipsis/nowrap`（Tailwind truncate 字节级等`）。
2. **零行为恒等门**（redact）：`dffdb64e…` 与 HEAD 字节一致。
3. **判据**（9/9 绿）：client + suggest/history/pause 三套机制进门 · `data-search-*` 全钩守恒 · 字面类全 se-* · 零裸 Tailwind · 类名闭环 · token 全声明 · 零 hex · 零新增颜色 token · **SHA256 守恒**。

## 取舍

- 不动防抖 250ms/AbortController/429 暂停倒计时；
- `role="combobox"` + aria 语义保留；`:hover` 仅在 `.se-clearBtn`（清空是唯一需要求助 affordance 的原子）；
- 不造 `.se-hint11` 为全局复用——未来 search 面再并入本段。

## 后果

搜索框文件级零裸原子。§165 双入口（page + box）全部门面化。
