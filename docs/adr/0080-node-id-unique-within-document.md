# 0080 — 节点 id 在一份文档内全局唯一（跨页也算重号），由写入刀与结构门两处守

## 背景

模型层的形状是"每页一张按 id 建表的 `nodes` map"（`packages/design-model/src/types.ts` 的 `Page`），
所以**单页内**节点 id 天然唯一。库层的形状是 `design_nodes` 主键 `(page_id, id)`
（`apps/web/src/server/db/schema.ts:283`）——**跨页重号数据库不拦**。
两边都放行，于是"同一份文档里两颗同名节点分别挂在两页上"是一种合法但没人认领的状态。

它不合法的代价在**读路径**：按 id 找节点的那几处写的是 `pages.find(p => p.nodes[id])`——
第一个命中就算真值：`packages/design-model/src/components.ts` 的 `syncInstanceOps` 用它找实例所在页
与主组件所在页，`packages/design-model/src/patch.ts` 的 `instantiate` 用它找源页。
重号时读到哪一页，取决于 `document.pages` 的顺序。§16 说设计模型是唯一真值；
同名两颗就是两个真值——真值开始按调用顺序漂移。这不是渲染细节。

写入这一侧原本只有一半：`instantiate` 的壳子查整份文档（第三十四片），同一族的 `insert`
只查当前页（`page.nodes[op.node.id]`），而结构门 `validateDocument` 的 `duplicate-id`
只管页面 id、完全不看节点 id（第三十四片 ⑥ / 第三十五片仍欠 ④ 记的就是这两格）。

## 选项

1. **只承认单页唯一**，把所有按 id 找节点的读路径改成 `(pageId, nodeId)` 复合键。
   改动面覆盖渲染、历史、AI 上下文、选中集与补丁系统本身，而且 AI 发的报文里 op 只点名 `nodeId`
   （§150），要跟着改成"点名到哪一页"——词汇表与既有存量文档一起动。
2. **文档内全局唯一**：写入那一刀查宽到整份文档，结构门新增一条 error 级 `duplicate-id`。
   id 的含义回到"这份文档里这颗节点的地址"，读路径一个字不用改。
3. **库侧再加一道**：按 `(project_id, id)` 建唯一索引或触发器。
   今天的存量和读路径都不需要它，而且 `snapshots.document` 是整份 JSONB，索引管不到那一侧。
4. **只报 warning**：不挡保存，靠面板提示。

## 决定

选 2。

- `packages/design-model/src/patch.ts` 的 `insert`：撞 id 从 `page.nodes[...]` 改成
  `cow.document.pages.some(p => p.nodes[op.node.id] !== undefined)`，仍在写下一个字之前判完，
  被挡下走 `skipped`（`duplicate node id <id>`），页面上不留半个节点。
- `packages/design-model/src/validate.ts`：`validateDocument` 按 `nodeId → pageId[]` 归堆，
  堆里 ≥2 报 **error** 级 `duplicate-id`，正文点名"哪一颗、在哪几页上各有一份"。
  结构门是四道写门共用的那一个（`apps/web/src/server/validation.ts` 的 `parseDocument` 只把 error 当拒绝，
  被整份 PUT / 快照 / 导入 / 公开 API 共用；PATCH 那条在 `projects.ts:817` 打完工也过同一个门），
  所以两条写路径的口径不会分叉。

**范围是"一份文档"，不是"整个库"**：同名 id 在两个不同项目里各有一份是合法的
（同一个演示种子播五个项目，实测 98 颗 id 就是这么来的）。量存量时必须带上项目口径，
否则会把"没重号"读成"重号 98 处"。

## 后果

- 对外行为变更，且是**收紧**：原本能过的 `insert` 现在得一条 `skipped`，整批 409。
  所以先量了存量再改（2026-11-03，真库 `nexus-postgres` 55433）：
  `design_nodes` 8537 行 / `pages` 578 行里，同一项目跨页重号 **0**；
  761 份带节点的快照里，同一份快照跨页重号 **0**。这一刀不改变任何既有文档。
- error 而不是 warning（选项 4 被否）：warning 在保存门上等于放行，放行的结果是坏数据继续被各处
  任选一份当真值——§159 说的"不静默修数据"正是拦这一类。
- 两处守不是冗余：`insert` 那一刀管当场新增，但它的可见性取决于调用方有没有读 `skipped`；
  结构门管**门装上之前的存量**，以及新增以外的来路（快照恢复、导入、整份 PUT）。
- 仍然没有库侧约束（选项 3 未采纳）：绕过应用层直接写 `design_nodes` 的路径能造出跨页重号。
  今天没有这种路径，真被撞一次再加索引，同时得给快照那一侧想办法。
- 如果哪天真有存量重号，该给的是**改名并保住引用**的迁移，不是放行；迁移现在没有。
- `duplicate-id` 这个 code 现在同时表达"页面重号"与"节点重号"，靠正文区分；
  界面要分开显示就得拆 code。

## 验证

- 见证 4 条：`packages/design-model/test/patch-commands.test.ts`（id 只在另一页上也不许在这一页再插，
  并先钉"这一页确实没有"）、`packages/design-model/test/serialize-validate.test.ts`
  （跨页重号 → error 且报出那颗与两页 / 两页各一颗正常节点不报重号）、
  `apps/web/test/validation.test.ts`（同一形状过 `parseDocument` 必须被拒）。
- 臂（逐字读数见 `docs/ROADMAP.md` §13 第三十六片）：`G1` 退回只查当前页 → 模型侧那一条红；
  `G2` 摘掉跨页扫描 → 模型与保存门两条同时红，且 web 侧红在"门真的放行了"；
  `G3` 降级成 warning → web 侧仍红在同一句，模型侧红在 severity。
  G2/G3 打在保存门上同一个红说明：**要么报出来、要么是 error 级**，没有第三种活路。
