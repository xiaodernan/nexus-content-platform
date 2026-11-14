# ADR-0201：§FE-49 `GamePanel.tsx` `.gp-` + `.wd-*` 复用——§54 Game Design System

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-48 · `apps/web/test/game-panel-visual-style.test.ts` · `docs/evidence/fe-49-game-panel-facade/evidence.md`

## 背景

`GamePanel.tsx` 是 §54 Game Design System 的填写界面：11 类实体、每类的开放数值、实体之间的有向引用。
与 §44 WorldPanel 同一面板族谱——同一 RAIL rail 头、同一命名 STATE_TEXT、同一条 `<canvas>` 选中→侧栏 inspector 的链路。
§52 Game Agent 给的是确定性配方草稿（`@/lib/agent-game-draft`，DEMO 规划不是模型）——本面板只提供**模板骨架**：11 类各一条空实体，说明与数值一律留空（§159 不许假生成）。
游戏编辑不进画布的 Command 撤销栈（§150 目前只覆盖设计文档），所以每次写库对应一个明确动作。

## 决定

1. **共享 `.wd-*` 核**（复用语义完全相同的原子：rootCol/scrollPad/scrollP2/headBordered/row1/row2/rowMt1/wrapCenter1/labelMb1/label/col2/growInput/areaResize/wfullInput13/accentBtn/selfStart/mt2/dis50/monoFaintEnd/dangerText/end/mb3/dangerMt2/danger11/faint11/fname11truncate/card/ghostBtn/chipSelect 等）——零行为、零行为面只是 className 值对应替换。
2. **`.gp-*` / `.wd-*` 补位**（globals.css，`.wd-` 段之后，紧邻接 §FE-48 段尾）：仅记录 §54 专有原子——`wd-ghostBtnSm(3px)/wd-delBtnSm/wd-xshrink/wd-growInputPh/wd-growBasis/wd-growInputB2/wd-rowMt2faint/wd-nameTrunc/gp-mt1/gp-col1/gp-w80Input/gp-w16Mode/gp-mode72/gp-hrMt/gp-row1ink/gp-tag/gp-monoFaintMt1/gp-warnMt2/gp-faintMt1`——共 19 定义。零动效、零 hex、零 @media；basis-28→7rem、w-20→5rem、w-[72px]→4.5rem、w-16→4rem 全部 rem 量化。
3. **零行为恒等门**（redact）：page `ad814925…` 与 HEAD 字节一致。
4. **判据**（11/11 绿）：client + gameStore.ensure/edit 进门 · 字面类全 wd-*/gp-* · 零裸原子 · **定义来自 .wd- 段 or .gp- 段**（classes 定义校验放开为 wd/gp 并集）· 段成规模 · 零 hex · token 全声明 · 零 transition/@media/@keyframes · **SHA256 守恒** · 钩子守恒（data-game-panel/state/pending）。

## 取舍

- 不动 `GAME_KIND_STATUS`/AGENT 按钮分支（它们在另一个 AgentPanel 里）；不动 `linkEntities`/`removeRef`/hg/IMAGE_REFERENCE 派生；不新增 `.wd-*` 别名族（复用 vs fork 取复用）。
- 不做截图：browser 不可用。

## 后果

`GamePanel` 加入门面矩阵（wd 族谱扩展到 §54）。Studio 余 16 面板继续。
