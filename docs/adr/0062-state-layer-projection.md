# ADR-0062：状态层是模型的差量，投影到只读页面时靠样式表越过内联样式

## 背景

§124 的 `states`（hover / active / focus / disabled / loading / error / success）从设计模型
第一天就在 `DesignNode` 上，但一直没人投影它：画布、预览、发布页读的是 `nodeStyle(node)`，
状态补丁被静默丢掉。§16 要求画布、代码、预览、发布是同一份模型的投影——四处里只有生成代码
（`codegen.ts`）会写 `hover:bg-…`，其余三处与它不一致，这正是 §159 说的"看着像功能、
实际不改变任何行为"。

2026-10-24 分四片补齐：① codegen 发射变体类；② code-parse 往返；③ 预览/发布可见；④ 见证与文档。
本 ADR 记录后三片共同的设计决定。

## 选项

1. **在页面里用 JavaScript 跟踪指针/焦点，再改内联样式**：预览与发布页现在都是服务端渲染的，
   不执行 JS 也能看。为状态引入客户端状态机，等于给每个投影各写一份交互语义，
   而且无 JS 访客看到的是另一种页面。
2. **把基础样式从内联搬到类名，状态用伪类覆盖**：伪类天然不需要 JS。但画布靠内联样式做
   `moved` / `resized` 这类逐帧预览，把基础样式改成类名是一次更大、更容易漂移的重构。
3. **每个状态节点产出一段只读样式表**：用同一个 `nodeStyle` 分别算基础态与状态态，
   对 `CSSProperties` 求差，差量写成 `[data-node-id="…"]:hover { … !important }`。
   基础样式仍是内联，状态规则用 `!important` 越过它。

## 决定

**选 3**，并配四条约束：

- **状态名与变体名只有一份**：`packages/design-model/src/states.ts` 是 `NODE_STATES` 和
  `STATE_VARIANT` 的唯一来源，codegen 与 code-parse 都从这里读。生成与解析各抄一份表，
  迟早会出现"生成写 `data-[state=loading]:`、解析只认 `data-state=loading`"的半通状态。
- **状态补丁是整通道替换**：`withState` 对一个通道（fills / strokes / effects / opacity）
  做整体覆盖，不做逐项合并。因此"删掉基础态里有、状态态里没有的通道"必须显式发射重置
  （`bg-none` / `bg-transparent` / `border-0` / `border-[transparent]` / `shadow-none` /
  `blur-none` / `backdrop-blur-none` / `text-inherit`），渲染侧对应 `CSS_RESET`。
  少了重置，hover 会保留上一层的视觉，而这恰恰是作者明确说要换掉的东西。
- **`!important` 只覆盖差量**：规则里只出现 `nodeStyle(基础态)` 与 `nodeStyle(状态态)`
  真正不同的属性。它不是在跟作者的选择器打架，而是在跟同元素的内联样式打架——
  不写 `!important`，服务端渲染出来的 `style="background-color: …"` 永远赢。
- **画布不加状态规则**：画布是编辑面，hover 若改变外观会与选择、拖拽、手柄互相干扰；
  作者要看状态就打开预览。只读投影（预览、发布）才兑现状态，这也让"两处预览一致"有明确边界。

## 后果

- §19 的往返不变：`parse(generate(page))` 仍要求 0 ops / 0 unmapped；源代码里没有的
  状态会被丢掉（`states: {}`），有状态但解不出字段的分组保留模型原值并如实报 unmapped。
- 没有状态节点时 `stateStyleSheetFor` 返回空串，页面不产出 `<style>` 标签（反向对照用例钉住）。
- 预览与发布各自多一次 `nodeStyle` 计算/状态节点；8 节点起手页无感。将来节点数上来，
  这段和页面排版同一量级，可按页缓存。
- 浏览器见证：`e2e/studio.spec.ts` 的「§124 状态层在预览与发布页真的生效」走完整回路
  （代码视图加 `hover:bg-[#123456]` → 回写模型 → 重载后仍在 → 预览页移上指针读计算色 →
  移开读回基础色 → 发布后访客页再读一遍），两个页面各有一个反向读数。
- **未兑现的口径要说清**：`loading` / `error` / `success` 的变体是 `data-state="…"`，
  预览与发布页没有运行时驱动去设置这个属性，所以三种状态只在导出的代码里有语义；
  只读页面上真正可见的是 hover / active / focus 这类浏览器伪类。
  `disabled:` 同理只对真实 `disabled` 元素生效，生成的 JSX 目前是 `div`——
  作者把它接到自己的按钮上时才兑现。
- 入口仍只有代码视图与 AI 补丁：~~Properties 面板还没有状态编辑器，这是下一片的事。~~
  **2026-10-27 核对后改口径**：Properties 面板已有状态编辑器（`PropertiesPanel.tsx` 的
  `<StateEditor>`，2026-10-24 落地，2026-10-25 补上 `data-state-copy` 复制与批量粘贴）；
  仍欠的是 `loading` / `error` / `success` 的运行时驱动，见上一条。
