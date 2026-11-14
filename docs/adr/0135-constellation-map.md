# ADR 0135 — 「人物关系星图」：/world/<id>/constellation（v704）

- 状态：ACCEPTED（2026-11-14）
- 范围：`lib/constellation.ts`（纯布局）+ `components/ConstellationPanel.tsx`（交互 SVG 面板）+
  `app/world/[projectId]/constellation/page.tsx`（服务端数据 + 鉴权门）+ WorldGraphView 入口

## 背景

用户原话："最终产品的要求是做出一个极其庞大的世界…… 史诗般的叙事…… 里面却又在细节里有魔鬼。"
这个仓里角色（§46）与世界（§44）早就是两个 first-class 模块，但它们之间**没有一张"谁拴着谁"的画**——
角色命运只在文档里平铺。星图把"人物是宇宙"这件事变成可见的一等公民。

## 决定

1. **星图是投影，不是第二份真值**：角色档案（`characters.profile`）和世界文档（worlds 表）
   是唯一来源；星图不写库、不改档、不本地排序。
2. **确定性摆位**：黄金角螺旋（golden-angle phyllotaxis），按
   `degree↓ → name↑` 排序后依次摆开；同一批输入永远得到同一张图；不引入物理模拟、零随机。
3. **边只画可解析的关系**：角色↔角色 → 一条边（双向关系合并、双 label；`a|b` 有序 id，
   排序稳定）。角色↔世界条目 → 外环"世界锚点"暗星（◈）。两端都解析不出 → **不画**，
   堆进 `unresolved`，footer 如实写"N 条未解析未上图"——不为了好看凑星。
4. **palette 一致性**：节点颜色取档案 `visualIdentity.palette[0]`（hex 合法性单测钉住），
   缺省回落品牌渐变；次色画成虚线内环；节点大小只按**度数**（关系多 = 更亮的恒星），
   不按正文长度/类别编"主角等级"。
5. **交互全在 SVG 内**：节点 role="button" + tabIndex + Enter/Space 选中、aria-pressed；
   双向关系合并渲染；角色之间可点击跳转选中（面板里的 target label 直接可点）；
   世界文档读不出 ⇒ 锚点缺席、footer 仍如实报数；角色为 0 ⇒ 明文空态 + CTA。
6. **鉴权同 §140**：只有项目可见者能看（作者/成员），world 发布链路不受影响。

## 验证（本机，端到端）

- `constellation.test.ts`：7 用例（确定性摆位 / 双向合并 / 锚点解析 / unresolved /
  度数排序 / palette 过滤 / 空关系）；对 constellation.ts 与 ConstellationPanel.tsx 直查
  eslint 0；tsc 0。
- **真实播种端到端**（playwright + 新夹具账号 + 走真 API）：创建项目 f7ec6716…
  → PUT world（苍雪盟约 · factions + 北境 · geography）→ 5 个角色建档
  （守夜人 / 苍雪主席 / 棱师 / 白鸦 / 雾孩子）→ 全 PATCH 200 →
  打开 /world/<id>/constellation：5 节点、7 条双向合并边、2 个世界锚点，
  选中"守夜人"后详情面板正确展示 identity / palette / 欲望·恐惧 / VOICE / 关系列表（可跳转）。
  截图两张（空态 → 选中态），console 0 报错。
- Studio "世界图" 面板新增「人物星图」入口按钮（data-enter-constellation）。

## 仍欠（诚实记录）

1. 星图是静态布局：缩放/平移目前没有（viewBox 自适应只到 viewport 切换）；不会为了好看加力导向。
2. 未解析目标目前只在面板脚注/详情里说——没有"一键跳去建这个角色/词条"的快捷键。
3. 世界文档缺失时锚点全无（页面照常工作）——按设计，不补救、不假装。
4. 仍只有作者能进：星图没有发布通道；以后要对外，需要 §56/§57 的发布快照通道评审。
