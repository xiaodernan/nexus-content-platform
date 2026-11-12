# ADR-0214：§FE-62 `AgentPanel.tsx` `.ag-` 门面化——§112/§29 Agent 面板

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-61 · `apps/web/test/agent-panel-visual-style.test.ts` · `docs/evidence/fe-62-agent-panel-facade/evidence.md`

## 背景

`AgentPanel.tsx` 是 §112/§25 的界面入口：「上架前检查」这份多步作业的计划、每步的状态与结论。
三条边界写在界面上：① 只读——这一轮不改设计/不发布/不生成像素；② DEMO 规划——计划来自确定性配方，不是模型（§160），而每一步的读数（页数、门禁分、语料块数）是真算的；③ 库是权威——实时事件用来让界面快一点跟上；刷新后读的是 `GET /api/projects/<id>/agent`；连接断了就写"以刷新后的数据为准"，不假装还在实时。
**本片首次把两个 `TONE` Map（`STATUS_TONE` / `REAL_TIME_TONE`）从 raw Tailwind 字符串改为 facade 命名**——`STATUS_TONE: pending: 'text-fg-3' → ap-faint` 等：Map 本身不参与 className 扫描，但它的值被拼进 className，**是故意保留的语义、不是逸没有被转换**——转换后 facade-safe，且 tone 同步写入判据（FE-45/51 同型）。

## 决定

1. **新增 `.ag-*` 门面族**（globals.css，`.cb-` 段之后）：23 定义——`accent2Ink(mapping tone)/colDense/col6/colCard/col3/slotCard/grow/growFaint/inputFull/dangerCallout/rowBaseline/rowEnd/wrapBaseline/flexWrap6/blockMt1/faintMt3/infoBox/warnRow/stepDot/mtHint/runBtn(ready/busy)/acceptBtn(ready/busy)/noteOk/noteFail`，+ 复用 `.sb-*`/`.wd-*`/`.cp-*`/`.ds-*`/`.hi-*`/`.cb-*`/`.ap-*`。
2. **两 Map tone 雕刻守恒**：`STATUS_TONE`/`REAL_TIME_TONE` 从 raw Tailwind（`text-fg-3` 等）改为 facade 命名（`ap-faint`/`ag-accent2Ink`/`hi-ink` 等）——**值语义与原 Tailwind 色一致**（accent-2→fg-1 之外的品级色做 tone——不展开、不改值）；hash 雕刻只把两个 Map 块整体归一 `@TONE` 参与守恒。
3. **零行为恒等门**（redact：EOL+空白归一、className 任意形态归一 @ + cn()整体归一 + 两 Map 雕刻为 `@TONE`）：page `2903b96c…` 与 HEAD redact 字节一致。
4. **判据**（10/10 绿）：'use client' + 跨 CSRF 路径进门 · tone Map 全 facade（8 个 value 声明）· 字面类全 ag-/复用族 · 零裸原子 · 类名闭环 · 段成规模 · 零 hex · token 全声明 · 零 transition/@media/@keyframes · **SHA256 守恒** · 钩子守恒（data-agent-* 21 个钩子全部守恒）。

## 取舍

- 不动 `REAL_TIME_TONE` 的值选择（不引入 `.ag-successText` 等新 token——`.ag-accent2Ink` 沿用 `accent-2-ink` 既有档）；
- 不动 `agent check` 文字的 metric 派发、不动 `read-error` 回执；
- 不做截图：browser 不可用。

## 后果

`AgentPanel` 加入门面矩阵。Studio 剩余 4 面板（ExportPanel 20 / GameCodeExport 18 / CanvasStage 6 / ViewerControls 4）。
