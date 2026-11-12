# ADR-0197：§FE-45 `PropertiesPanel.tsx` `.pp-` 门面化——§6 属性面板，cn 三态显式化

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-44 · `apps/web/test/properties-panel-visual-style.test.ts` · `docs/evidence/fe-45-properties-panel-facade/evidence.md`

## 背景

`PropertiesPanel.tsx` 是 §6 的 inspector：选中元素的属性分区（尺寸/布局/文字/填充/描边/效果/响应式四档/状态补丁），字段可绑定 token。
原本 102 处裸原子（含 `accent-[…]`、`tracking-[.12em]`、`shadow-panel`），是本次门面化最大的一块（106 className）。零行为：class 常量名替换、
cn 三元拆分、focus/disabled 变体逐枚平移；写在脸上的文案/钩子/Studio 写入路径——一字不动。

## 决定

1. **新增 `.pp-*` 门面族**（globals.css，`.hp-` 段之后）：66 定义——
   grid2/2gap1/4、row1/1faint/2ink/2、col1/2、w16/w20Input/mt1Input13/wfullInput12、swatchBtn/Slot、chip12/11/12ink/11hover/Danger、smallChip(Plain/hover)、codeChip、menuItem12/Full、popMenu、rel、scrollCol、headBordered(Roomy)、emptyCol、dangerGhost/Outline、rowMt2、sectionTitle、ghostBtn/GhostBtnSm/GhostReady/GhostDangerReady/GhostIdle、segBtn/segWide/segOn/segOff/segOffQuiet、uploadLabel/busy、resizeNone、grow/dim/hidden、padL10、faint11/12/Top12/Mt2、ink12、micro、linkDanger、checkBrand、cover。
   - `popMenu` 的 shadow 由 `--shadow-panel`（→`@theme --nexus-shadow-md`）去糖为直接 `var(--nexus-shadow-md)`；
   - 字号 text-9 → 字面量 0.5625rem；px-[5px] → 0.3125rem；h-3.5/w-3.5 → 0.875rem；
   - **cn 三元统一映射**：`bg-brand text-accent-fg` → `.pp-segOn`（一枚），off 态按 hover 行为拆 `.pp-segOff`（hover fg-1）与 `.pp-segOffQuiet`（无 hover，hug/fill 键盘语境）；ghost 按 size 拆 `.pp-ghostBtn`(12px) / `.pp-ghostBtnSm`(11px) + Ready / DangerReady / Idle 三档。
2. **零行为恒等门**：redact（EOL+空白归一 + className 任意形态归一 + cn()整体归一 + `const cls = '…'` 共享类常量归一）后 SHA256=`6d2c2adacf…`，与 HEAD 字节一致。
3. **判据**（10/10 绿）：client 指令 + studio 依赖链（setProps/pasteStates/setResponsiveValue/clearResponsiveChannel/dropResponsiveRule/copyStates）进门 · 字面类全 pp-* · 零裸原子 · 类名闭环 · 段成规模（66 定义）· 零 hex（CSS 段；JS 里的色值字面量是用户数据）· token 全声明 · 零新增颜色 token · 零 transition/@media/@keyframes · **SHA256 守恒** · 钩子守恒（asset-upload/state-*/token-bind/responsive-*/breakpoint-*/prop="text"）。

## 取舍

- **共享 `const cls` 保留**（textarea 与 input 各自 `cn(cls, 'pp-resizeNone')` / `className={cls}`）——与原设计对齐，只换其值为 `.pp-wfullInput12`；
- `text-fg-3` 原生裸原子（label/input/number）一律不带 hover；`pp-linkDanger` 是唯一裸文本 hover→danger-ink 的位置，一款对齐；input `:disabled` 走 `.pp-wfullInput12:disabled { opacity:.4 }`；
- 不动 FIELD 有关的业务判定（read/write、MIXED Symbol 混合判定），不动 `key={nodes[0]!.id}` 的 React 语义。

## 后果

`PropertiesPanel` 加入门面矩阵。Studio 剩余 ≈19 面板（VariantsBoard/SketchPad/StoryboardPanel/WorldPanel…）按同一纪律继续。
