# ADR-0216：§FE-64 `GameCodeExport.tsx` `.ge-` 门面化——§60 Game Code 导出面板

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-63 · `apps/web/test/game-code-export-visual-style.test.ts` · `docs/evidence/fe-64-game-code-export-facade/evidence.md`

## 背景

`GameCodeExport.tsx` 是 §60 游戏代码导出面板：用户真 provider 才生成代码（§160）；导出三种可下载物（single tarball / multi-package / diff-only）；saveBlob 走 `.so-raw` 直存页面。
本片只换皮：fetch / saveBlob / 引擎 adapter 派发全部一字不动。

## 决定

1. **新增 `.ge-*` 门面族**（globals.css，`.pb-popPanel360` 段之后）：7 定义——`warnBanner/listFaint/listFaintMt2/listDanger/wrapMt2/faintMt2ink`（+ 复用 `.wd-*`/`.sb-*`/`.rp-*`/`.ap-*`）。
2. **yellow amber 替换策略**：`border-amber-400/30`/`bg-amber-500/10`/`text-amber-100` → `.ge-warnBanner`（全部 `color-mix(warn X, transparent)`，success/warn 等 token 全双主题 AA）；不引入 amber token。
3. **零行为恒等门**（redact）：page `508e49c2…` 与 HEAD 字节一致。
4. **判据**（9/9 绿）：client + saveBlob 进门 · 字面类全 ge-/复用族 · 零裸原子 · 类名闭环 · 零 hex · token 全声明 · 零 transition/@media/@keyframes · **SHA256 守恒** · 钩子守恒（`data-game-code` 系）。

## 取舍

- 不动 SUBMIT 页面上的三个 download 分派（single/multi/diff-only zip）；不动 saveBlob 的签名；
- `.ge-listFaint*` 采用 Tailwind 约定的 `list-disc outside` 标准语义（与 `ul list-disc pl-4` 等价）；
- 不做截图：browser 不可用。

## 后果

`GameCodeExport` 加入门面矩阵。Studio 剩余 2 面板（CanvasStage 6 / ViewerControls 4）。
