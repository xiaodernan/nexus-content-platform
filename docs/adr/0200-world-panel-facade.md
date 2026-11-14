# ADR-0200：§FE-48 `WorldPanel.tsx` `.wd-` 门面化——§44 World Builder

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-47 · `apps/web/test/world-panel-visual-style.test.ts` · `docs/evidence/fe-48-world-panel-facade/evidence.md`

## 背景

`WorldPanel.tsx` 是 §44 World Builder 的填写界面：把世界文档摊开成可编辑的九类；图视图（§45 `WorldGraphView`）读同一 store，两处不会各存一份世界。
AI 生成世界内容要真 provider——接之前只有**模板骨架**（九类各一条空条目、正文留空），往模板里塞预设世界观就是假生成（§159）；所以面板上只出九类编辑器+CRUD，不出"AI 生成世界"按钮。
世界编辑不进画布的 Command 撤销栈（§150 目前只覆盖设计文档），所以每次写库都是一个明确动作。

## 决定

1. **新增 `.wd-*` 门面族**（globals.css，`.ds-` 段之后）：54 定义——根/head/scrollP2/scrollPad/headBordered、布局（col2/colMt1/row1/row2/rowMt1/wrapCenter1/labelMb1/end）、
   字号（label/label11/faint11(+shrink)/danger11/body11/body11Mt1|2/body12/ink11Mt1 位、dangerMt2）、
   input 系列（numInput/numInput:disabled/inputSm/growInput/wfullInput13/areaResize/areaResizeMt）、
   辅助（fname11truncate/chipSelect/ghostBtn/ghostBtnShrink/card/accentBtn/dis50/delBtn/delBtnBig/monoFaintEnd/dangerText/selfStart/mt2|4/mb3）——零动效、零 hex、零 @media、零 transition。
   - 字面量：`border-radius: 3px`（px-[3px]）只出现在 num/grow/inputSm 的 focus 面；`font-size: 0.8125rem`（text-13）唯一一处。
2. **cn 三元统一映射**：save-state 徽标拆 `.wd-monoFaintEnd`(base，ml-auto font-mono text-11 fg-3) + `.wd-dangerText`(error→danger-ink)——对照旧 `'ml-auto font-mono text-11' + (error ? 'text-danger-ink' : 'text-fg-3')` 行为一致。
3. **零行为恒等门**：redact 后 page `ee3fadec…` 与 HEAD 字节一致。
4. **判据**（10/10 绿）：client + worldStore.ensure 进门 · 字面类全 wd-* · 零裸原子 · 类名闭环 · 段成规模 · 零 hex · token 全声明 · 零新增颜色 token · 零 transition/@media/@keyframes · **SHA256 守恒** · 钩子守恒（data-world-panel/state/pending）。

## 取舍

- 不动 `worldStore` 文件的 ensure 节奏；不动 `ensure` 依赖数组（ensure-then-reuse 模式）；不动九类表/clearWorld 调用（`updateWorldNode`/`addWorldNode`/`setWorldTerrain`/`setWorldNodeModelAsset` 等）。
- 不做截图：browser 不可用。

## 后果

`WorldPanel` 加入门面矩阵。Studio 余 18 面板继续。
