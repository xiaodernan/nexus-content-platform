# ADR-0237：§FE-84 `MarketplaceCreateForm.tsx` `.mfc-` 门面化——§127 上架表单

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-83 · `apps/web/test/marketplace-create-form-visual-style.test.ts` · `docs/evidence/fe-84-marketplace-create-form-facade/evidence.md`

## 背景

§127 上架表单：预览素材从所选项目的资产里挑（所有权路径）；没选项目也能上架「挂牌」（下载格会 no_source，店面同一句）。裸原子九类：卡片/标题/网格/label/select×4/input/submit/message。

## 决定

1. 新增 `.mfc-*` 门面族（globals.css，`.mk-hint12` 之后）：`mfc-card/mfc-grid/mfc-fullRow/mfc-label/mfc-select/mfc-selectSm/mfc-input/mfc-submit/mfc-message`；标题沿用 `.mk-h16`。
   - `sm:grid-cols-2`（Tailwind 断点）→ `grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr))`——无 @media、无断点 token，宽度自适应双列；`sm:col-span-2` → `.mfc-fullRow { grid-column: 1 / -1; }`（窄时本就是一列，等效）；
   - select 两个字号档保留（`mfc-select` 继承 / `mfc-selectSm` 12px）——零信息损失。
2. **零行为恒等门**（redact）：`051c4b9b…` 与 HEAD 字节一致。
3. **判据**（9/9 绿）：client + csrf/router 进门 · `data-marketplace-create-*` 全钩守恒 · 字面类全 mfc-/mk- · 零裸 Tailwind（含 `sm:` 变体全灭） · 类名闭环 · token 全声明 · 零 hex · 零新增颜色 token · **SHA256 守恒**。

## 取舍

- 不动 tags 分割（中英逗号）/价格 Math.max(0, …) 容错/`!title.trim()` gating；
- 不动 fields 的挂载顺序与 aria-label；
- 不新造 accent-1 token——已声明，直接锚。

## 后果

`MarketplaceCreateForm` 加入门面矩阵。§127/§128 双件（店面 + 上架表单）全部门面化。
