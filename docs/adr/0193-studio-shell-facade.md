# ADR-0193：§FE-41 `StudioShell.tsx` `.se-` 门面化——Studio 外壳首片，三态翻转不动

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-19（ADR-0169 StudioTopBar）· `apps/web/test/studio-shell-visual-style.test.ts` · `docs/evidence/fe-41-studio-shell-facade/evidence.md`

## 背景

`StudioShell.tsx` 是 Studio 创作台的根壳：外壳 frame（rail + 14 个图标 tab + left aside 25rem 面板容器 + main workspace + inspector）。
唯一的行为面是 `railOpen`/`inspectorOpen`/`inspectorFolded` 三个 boolean 翻转；load/flushSave×4 四条持久化线（含 flush beforeunload）。全裸 Tailwind → `.se-*` 门面族。
三个不暴露的折叠决定：①左侧浮层盖画布不挤窄；②xl 起 inspector 常驻 300px 时 shell `inspectorFolded=true` 把它折起；③移动端 inspector 是 h-52vh 底板、`max-xl:block`/`max-xl:hidden` 拍两侧互换。
这一切搬进 `.se-panel`/`.se-inspector...XL`/`.se-scrim` + `@media (max-width: 63.99rem)` / `(min-width: 64rem)` 两段 media 平移，等宽 1px，没新断点。

## 决定

1. **新增 `.se-*` 门面族**（globals.css，`.hd-` 之后）：`.se-root/.se-readOnly/.se-status/.se-frame/.se-rail/.se-tab/.se-tabActive/.se-viewBar/.se-viewSwitch/.se-viewBtn/.se-viewBtnActive/.se-zoomX/.se-demoChipBase/.se-demoChipWarn/.se-demoChipLive/.se-panel/.se-panel-visible/.se-panel-hidden/.se-scrim/.se-inspector/.se-inspectorShowMobile/.se-inspectorHideMobile/.se-inspectorShowXL/.se-inspectorHideXL/.se-shadow2xl/.se-inspectorToggle/.se-foldBtn/.se-unfoldBtn/.se-workArea/.se-workCol/.se-canvasWrap/.se-inspectorBody`。
   - scrim 用 RGBA rgba(0,0,0,.4) 遮罩（与 `bg-black/40` 同阶），不进段头 `#[0-9a-f]` 禁令。
   - 断点只出现两处 media：64rem 与 63.99rem；零 40/48rem（与 §FE-35 记账的 48rem 分流）。
2. **零行为恒等门**：改后与改前（git HEAD）EOL+空白归一后 redact 完全一致（`52806156…`）——cn 调用体整体归一、className 任意形态归一。
   Panel 容器 aria/controls/ref/id（`nexus-inspector`）与 ruler 滚动/load/flushSame 三件套都在数据钩子守恒。
3. **判据**（12/12 绿）：'use client' 保留 + studio.load/flushSave×4/beforeunload 三条进门 · 字面类全 se-* · 零裸 Tailwind · 类名闭环 · 零 hex · token 全声明 · 零新增颜色 token · @media 只有 63.99/64rem 两档 · focus-visible 锚 · **SHA256 守恒** · 钩子守恒。
4. **文案/aria-label/ref/data 钩子一字不动**；三处展开/折起按钮只换 className，不动 onClick/focus 还原。

## 取舍

- 不动 `railOpen` 初值（`useState(false)`，xl 起 effect 翻开）；
  不动 flushSave 的 "连同未保存的直接 sebelumunload 落盘" 语义；
  不动 `PropertiesPanel` 的滚轮/拖拽语义（fold/折叠与右侧 inspector 的逻辑全归 StudioShell）。
- 左栏 `.se-panel-visible/.se-panel-hidden` 用 display 块代替 visibility 隐藏——保留 `hidden` 不坏功能（PropertiesPanel 不在 hidden 状态下挂载），两侧语义目录里写死。

## 后果

`StudioShell` 加入门面矩阵。Studio 剩余：LayersPanel/DesignSystemPanel/AssetsPanel/WorldPanel/GamePanel/StoryboardPanel/TeamPanel/CharacterPanel/MemoryPanel/RetrievePanel/ContextPanel/AgentPanel/HistoryPanel/CanvasStage/CodePanel/PropertiesPanel/VariantsBoard/WorldGraphView/GameGraphView/HealthPanel/LayersPanel/CanvasStage/... 27+，按同一纪律继续。

## 附加记录（独立小提交善后）

- `apps/web/test/ai-client.test.ts` 的 NODE_ENV 只读断言改为 `env as Record<string, string|undefined>` 写入（别人提交的 c866cf32 补的 dev 模式缺省一落地就撞上 `tsc --noEmit` 的 readonly）。Author 声明保留；本片借机一并绿。
