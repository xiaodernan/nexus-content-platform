# ADR-0231：§FE-78 全平台搜索 `search/page.tsx` 原子清零（叠加 `.se-*`）

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-77 · `apps/web/test/search-page-visual-style.test.ts` · `docs/evidence/fe-78-search-page-facade/evidence.md`

## 背景

§165 全平台搜索页——原子四处：根容器、建议说明边注、results 容器、hits 网格。既有 `.se-*` 门面（§FE-16 系）只覆盖了命中卡/组/方法/scope 等；根与边角没盖。

## 决定

1. 新增追加段（globals.css，`.dv-gapList` 之后）：`se-pageRoot/se-suggestNote/se-results/se-hitGrid`。
   - **`.se-root` 被 StudioShell 占用**（`height:100vh; overflow:hidden`，那是 Studio 工作台那一世）——本页容器命名 `.se-pageRoot`，不碰它，也不搬动它。StudioShell 侧零影响。
2. **零行为恒等门**（redact）：`7422b9c0…` 与 HEAD 字节一致。
3. **判据**（9/9 绿）：searchPlatform/SEARCH_* 进门 · `data-search-*` 全钩守恒 · 字面类全 se-* · 零裸 Tailwind · 类名闭环（`used.has('se-root') === false` 钉死那条坑）· token 全声明 · 零 hex · 零新增颜色 token · **SHA256 守恒**。

## 取舍

- `se-suggestNote` 的 `-12px` 边距是 Tailwind `-mt-3` 的字节级等（挂在 SearchBox 之下，不进 gap 流）；
- `se-hitGrid` 显式 `padding: 0; list-style: none`——等效 preflight 归零，不暗示新语义；
- 不动 SearchBox（下一片 FE-79）。

## 后果

搜索页文件级零裸原子。§165 surface 加入矩阵。
