# ADR 0141 — 记忆回廊：一条只读、零写库的「刻痕回声」投影

- 状态：ACCEPTED（2026-11-14）
- 范围：世界子系统（`/world/<projectId>/memories`、`apps/web/src/app/world/[projectId]/memories/page.tsx`）
- 前置：v705.3 / ADR 0136 amendment（`lore.memory`，≤240 字，story/history 条目）、v706 / ADR 0137（字符 ↔ 纪元）

## 背景

`lore.memory` 是被刻进世界条目的一句"你在场时听到了什么"（≤240 字）。此前它出现在
chronicle 卡上，但没有任何页面把**全部**记忆连成一条可步行的走廊。用户要的是"细节里面有魔鬼、
包罗万象"的深度——单页投影足以兑现，不需要新表、新写路径或新权限模型。

## 决定

1. **纯投影页，零写库。** 读不到就说读不到：没有 `memory` 的条目不进走廊；走廊只读，不在 DB 旁加真实写路径。
2. **排序铁律**：纪元（有序）→ `lore.order` → `updatedAt` 升序。年表是回忆，不是新闻流；未标纪元排在最后。
3. **只有 story / history 才有意义刻着 memory**（zod 在世界面板已经只允许这两类输入），
   所以不设 kind 过滤器的"开关"假象——能进来的都已经过 zod 的手。
4. **进场动线**：Studio 顶栏「记忆回廊」链接与「世界编年」并列（`WorldGraphView.tsx`），
   不在导航里另开一层。
5. **标识明示**：`data-memories-*` 属性（root / era / kind / entry / quote / empty），
   便于后续 e2e 直接驱动；每条回声渲染为左缘色带 + 斜体引文，不随主题配色复制可识别的图标依赖。

## 验证（本机，disposable fixture 星图 MWG35NRI / f7ec6716）

- `tsc --noEmit` 0；`eslint` 每文件 0；`vitest chronicle.test.ts` 6/6。
- 直接 SQL 播种 4 条 `memory` 进 fixture 世界文档（一次性，未提交，未进仓），
  然后 Playwright 登录 `constellation+mwg35nri@nexus.test` → `GET /world/<id>/memories` →
  `[data-memories-entry]` 计数 = 4，四句引文（`data-memories-quote`）逐字匹配；截图确认为深色
  「回忆走廊」样式（纪元徽标 + 纪元内序号 + 日期 + 斜体长句 + 渐变色脊）。
- 中文编码全程被 `verify:record-encoding` 守着。

## 仍欠（诚实记录）

1. 走廊**没有**消费者级主题过滤或纪元目录树——v708 之后的留白；加它需要一次新的设计评审，不夹在本切片里。
2. 播种进 fixture 的 4 条 memory 是 fixture 的一次性数据，不在仓内，不保证在任何 clone 里出现。
3. `/world/<id>/memories` 与 constellation / chronicle 一样按 `projectVisibleTo` 归属判定、不可公开——
   本切片不改变发布模型（发布的是设计文档那一版，不是世界原文）。
