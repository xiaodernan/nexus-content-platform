# ADR-0206：§FE-54 `PublishPanel.tsx` `.pb-` 门面化——§57 Publish 发布面板

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-53 · `apps/web/test/publish-panel-visual-style.test.ts` · `docs/evidence/fe-54-publish-panel-facade/evidence.md`

## 背景

`PublishPanel.tsx` 是 §57 Publish 的界面：选 Public / Unlisted / Private，然后如实报告 §179 的门禁（`analyzeHealth`，Studio 实时看的那份和服务器挡发布用的是同一个函数）。
§163：面板还订着项目频道，把发布链路上推来的 `build.status` / `preview.status` 画成两行——两行只在**真的收到过事件**时出现。
本片只换皮；发面 dispatch / popover-dismiss / HealthWatch — 一字不动。

## 决定

1. **新增 `.pb-*` 门面族**（globals.css，`.ap-` 段之后）：26 定义——`pb-faint11m2/dangerMb2/faintMb3/faintBlock/ink1/rel/mt3px/ghostBig/closeBtn/publishBtn(+Live/Idle)/popPanel/block/blockBordered/col/listMt1/monoMt2/pickRow/mirrorLink`，+ 复用 `.sb-*`/`.wd-*`/`.ap-*`/`.hi-*`：主要含义：
   `.pb-publishBtn` 是两个状态的基本单元：**`.pb-publishLive`**（有 `publication.visibility != 'private'`，`brand` 底）/**`.pb-publishIdle`**（`border-strong` 透明底，`hover: bg-2`）；
   `.pb-popPanel` 是唯一带 @media 的类：`@media (max-width: 520px)` 与 Tailwind `max-[520px]:` 逐字节对应（重现 `2xl:` 播到 `position: fixed; left/right: 12px; top: 52px; width: auto`）。
2. **零行为恒等门**（redact）：page `5ad07380…` 与 HEAD 字节一致。
3. **判据**（10/10 绿）：client + PANEL_ID + popover-dismiss 进门 · 字面类全 pb-*/复用族 · 零裸原子 · 类名闭环 · 段成规模 · 零 hex · token 全声明 · 零新增颜色 token · 零 transition/@keyframes · **唯一 @media = 520px 一档** · **SHA256 守恒** · 钩子守恒（data-publish-open/aria-controls/publication.visibility）。

## 取舍

- 唯一带 @media 的类保留（对应 Tailwind arbitrary `max-[520px]`，字节对齐）；
- `.pb-ghostBig`（borderless）vs `.pb-closeBtn`（x 按钮）：同族不同位（closeBtn 有固定宽 1.5rem，适于短关闭按钮）；
- `data-publish-open` 面板 id = `nexus-publish-panel`（变态 DIS\(PANEL_ID\) 公共引用）。
- 不做截图：browser 不可用。

## 后果

`PublishPanel` 加入门面矩阵。Studio 余 ≈12 面板继续（WorldGraphView/RetrievePanel/MemoryPanel 仍最大）。
