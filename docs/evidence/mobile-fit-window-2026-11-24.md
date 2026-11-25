# 公开作品页「适应窗口」真浏览器证据（2026-11-24）

## 背景
第十三片移动端审计量到：公开作品页在 390 视口下首屏只见 **27%**、要平移 **1082px**
（`docs/EVALUATION.md`）。Studio 画布有「适应窗口」按钮（`CanvasStage.fitToWindow`），
公开阅读页此前没有。本轮从「只量」推进到「修一格」。

## 实现
- `apps/web/src/lib/...` 无；纯函数在 `apps/web/src/studio/viewer-params.ts` 的 `fitZoom`：
  按视口宽取 `ZOOM_STEPS` 里 ≥ 比例的最小档（1440→390 ⇒ 0.5），落点必是界面真有的档；
  视口比设计宽时不缩（≤1，放大交给浏览器双指）；坏输入回 1。
- `FitWindowLink.tsx`（客户端，唯一读 `window.innerWidth` 的控件）：SSR 初值 1、
  挂载后量视口写 state；点击用与其余档位完全相同的 `viewerHref` 写 URL，
  分享/收藏链接与手动点 0.5× 一致（没有第二条渲染路径）。
- `ViewerControls` 接线，中英各一句 + 教学 title。

## E2E（真发布语料，零 provider）
- 打开 `/n/u83627493/build-ok`（设计宽 1440），390×844 视口。
- hydration 后 `[data-viewer-fit-window]` 的 `data-viewer-fit-zoom` = **0.5**。
- 点击后 URL = `...?zoom=0.5`，`[data-viewer-controls]` 的 `data-viewer-zoom` = **0.5**。
- 零 pageerror。

## 中途抓到并修的 bug
第一版在 SSR 阶段直接读 `window.innerWidth`（服务端 undefined ⇒ fit 恒为 1），
E2E 量到 `designWidth=1440` 却 `fitZoom=1`；改成 state + useEffect 后复测为 0.5。

## 验证
`fit-window` + `viewer-params` 19/19；`viewer-controls` / `preview` 视觉门；
`verify:fe-gates` 157 文件 / 1433 条全绿；`tsc` 0；全程零模型调用。
