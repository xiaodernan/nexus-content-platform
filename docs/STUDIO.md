# STUDIO — NEXUS Studio 规格

Studio 是项目核心（§3）：AI Design + Code + Creation IDE。
参考 Claude Design 的闭环（conversation / canvas / direct canvas editing / comments / design systems /
import screenshots / codebase context / design ↔ code），但**不复刻其 UI**。

## 布局（§4）

```
┌─────────────────────────────────────────────────────────┐
│ NEXUS │ Project │ File │ Preview │ Share │ Publish      │
├────────────┬──────────────────────────────┬─────────────┤
│  Pages     │                              │  Properties │
│  Layers    │                              │  ─ Design   │
│  Components│          CANVAS              │  ─ Layout   │
│  Assets    │                              │  ─ Type     │
│  Variables │                              │  ─ Color    │
│  DesignSys │                              │  ─ Effects  │
│  AI Agents │                              │  ─ Spacing  │
│  Code      │                              │  ─ Responsive│
│  History   │                              │  ─ Animation│
├────────────┴──────────────────────────────┴─────────────┤
│ AI COMMAND BAR / CHAT / AGENT ACTIVITY                  │
└─────────────────────────────────────────────────────────┘
```

窄屏（<1280px）：左面板折叠为图标栏，右面板变为底部抽屉；AI 命令栏始终可达。

## 左面板（§5）

Pages · Layers · Components · Assets · Variables · Design System · AI Agents · Code · History
- 同一时刻只展开一个面板主体，图标栏常驻
- Layers 树支持：重命名、显隐、锁定、拖拽改父级、多选、搜索、按类型过滤
- Assets 列 `document.assets`（清单本身在模型里，§16）：缩略图走鉴权路由、显示体积与引用计数；
  删除 = 一个 `removeAsset` 事务，跨所有页面剥引用且可撤销——但服务端字节撤不回来，回执明说这条非对称（§159）
- Assets 卡片上的「提取视觉语言」把这张参考图变成 `document.visualDna`（§30/§174，详见「参考输入」一节）；
  只有图片卡片可点，非位图与解不了的编码都会拿到读得懂的原因而不是假结论
- World 面板（§44）读的是**世界文档**（`@nexus/world-model`，存在 `worlds.document`），
  与画布那份设计文档是两份真值：九类条目可增删改，失焦即写库。
  没接真 provider 之前只有「创建世界骨架（模板）」——九类各一条空条目，正文留空；
  AI 生成世界内容属于假生成，这里不做（§159）。世界编辑不进画布的 Ctrl+Z 栈，面板脚注明说
- History 列出 snapshot / branch / AI 事务，可 View / Compare / Restore / Duplicate / Branch（§27）
- Health 页签是 §178 那七行的常驻读数：改一下文档就重算，点某行展开它的真实发现与"这项检查了什么"
  （Publish 弹层里是同一个组件、同一个函数，见「项目健康」一节）

## 右面板（§6）

选中元素后分区：Design · Layout · Typography · Color · Effects · Spacing · Responsive · Animation ·
Accessibility · Interactions · Code · AI
- 多选时显示交集属性，写入时广播到全部选中节点
- 未选中时显示**页面/画布**属性 + Design System 概览
- 每个可编辑字段旁边有 token 绑定按钮（链式图标）：绑定后属性值改为 token 引用（§12）
- `AI` 分区：针对当前选区的快捷指令（"更电影感" / "对比更强" / "修间距"）—— 等价于 §110 的 @DesignAgent 局部修改

## 底部 AI 命令栏（§7）

单行输入 + 模式切换（Fast / Balanced / Reasoning，§154）+ @ 引用（组件/页面/资产/代码文件，§66）+
上下文芯片（当前选区、当前页、当前 viewport）。
输入示例必须全部可用：
"Make this feel more cinematic." / "Make the hero 30% taller." / "Change visual style to dark fantasy." /
"Make mobile layout better." / "Add a parallax animation." / "Convert this into a responsive landing page." /
"Generate a matching dashboard." / "Turn this design into React." / "Refactor the code." /
"Find accessibility issues." / "Make this production ready."

回车 → Agent Plan（§25）可见 → 执行 → Activity Feed 流式（§26）→ 结果以**一次事务**落地 → AI Diff 摘要（§151）。
Ctrl+Z 完整回滚该事务（§148-149）。

## Canvas（§8）

必备：infinite canvas · zoom（滚轮/Ctrl+滚轮/快捷键/百分比）· pan（空格拖拽/中键）· selection ·
multi-select（框选/Shift 点选）· drag · resize（8 手柄 + 等比）· rotate · align · distribute ·
grouping · nesting · guides（智能参考线 + 标尺）· snapping（吸附到邻居/网格/自身 8pt 基线）· grid ·
responsive preview（viewport 切换：Mobile 375 / Tablet 768 / Desktop 1280 / Wide 1536，§14）。

渲染分层：`scene`（节点矩形）+ `overlay`（选择框/手柄/参考线，独立层，不触发节点重绘）。
DOM 渲染器 + 视口外节点不挂载；>1000 节点切虚拟化（§146-147）。

## 直接操作与真值（§16）

```
pointer → hit-test → Command(update design node) → canvas re-render → code representation 更新
```
设计模型是唯一真值。渲染是投影，代码是投影，预览是投影。任何"先改 DOM 再同步回模型"的写法禁止。

## 文本编辑

双击进入行内编辑（contentEditable 仅作为输入面，退出时把结果写回 node.text，不回写结构）。
富文本样式：整段 level + span runs（bold/italic/color/link），存于 typography。

## 组件与实例（§13）

Component（主节点）→ Instance（引用 + overrides 表）→ Variant（属性组合）→ Slot（可插入区域）。
编辑主组件时所有实例跟随；实例上的改动记录为 override，可单独或整体 Reset。

## 注释（§111）

Canvas 上点击元素 → 写评论，锚定到 nodeId + 坐标。评论可 @Agent，Agent 自动定位到该节点并只修改该区域。

## Code View（§19）

- 展示从设计模型派生的 React + TS + Tailwind（§18）
- 可直接编辑；保存走：code → parser → design model → canvas
- 无法安全映射的片段保留为 **code-only region**（灰显 + 明确徽标），不被设计编辑破坏
- 文件树 + 面包屑 + 与 Layers 双向定位（点代码行 → 选中节点，反之高亮）

## Preview / Play（§55）

顶栏 Preview 切三态：Design（可编辑画布）· Preview（只读运行）· Play（Runtime 交互，游戏/故事/3D 时）。
Preview 在隔离 iframe 中运行（见 SECURITY.md），不共享主站 origin。

## 项目健康（§178）与 Quality Gate（§179）

七行读数：Build · Tests · Accessibility · Performance · Visual QA · AI QA · Security。
两处显示、一份算法：左栏「健康」实时按当前文档算（`HealthRail`），Publish 弹层里同一份 `HealthPanel`；
服务端 `runPublishGate` 调的也是同一个 `analyzeHealth`（`packages/design-model/src/health.ts`），
所以"屏幕上 76 分"和"服务器上挡住发布"不可能是两套数（§16）。

分数怎么来的（不是拍脑袋）：
- 每行把 `validateDocument` + `lintDesign` + 静态预算规则的真实发现归到自己名下，
  `100 - Σ扣分`，error 扣 25 / warning 扣 6 / info 扣 1；
- 门槛线集中在 `HEALTH_THRESHOLDS`：Accessibility 80 · Performance 70 · Visual QA 60；
  Build 与 Security 没有分数线——有一条 error 级发现即挡；
- 每条发现都能展开看（`basis` 说明这项到底检查了什么），单行最多列 40 条，
  剩下的计数成 `omitted` 并写明"另有 N 条未列出（计分已计入）"，截的是显示不是问题。

诚实边界（§159）：Tests 与 AI QA 至今没有任何本地可算的信号，状态是第三种——
`not-run`，显示"未评估"、`score = null`、`gating = false`，UI 用 `—` 而不是 ✓。
"没有发现"和"没检查过"是两件事，把前者当后者就是假绿。
性能行同理：`basis` 明写这是静态预算（节点数/树深/位图字节/缺尺寸图片），不是 LCP/CLS 实测。

门禁只管往外公开的方向：切成 `private` 是下架动作，即使门禁没过也允许，
否则一份坏页面会收不回来；这时报告仍然如实带出全部失败项，面板上写一句为什么放行。

对比度这条是本轮唯一"改设计而不是改阈值"的地方：`measureContrast` 先解析 token 引用、
沿祖先链合成真实背景（按钮取 `typography.color` 而不是自己的填充），算不出来就返回 null 不报。
修好之后暴露出内置起手页与四套概念语言自己就不达标（白字压 `#7c5cff` 只有 4.35:1 等），
按 WCAG 重算了色板，而不是把 80 分线往下调。

## 版本 / 分支 / 多方案（§27-29）

- 重大修改自动 Snapshot；分支：main / design-v1 / experimental
- "Try 3 different visual directions" → 自动生成分支 A/B/C，画布上并排比较（缩略 + 关键 token 差异）
- "Combine A's layout with C's visual style" → 新设计 = A 结构 + C 视觉语言

## 参考输入（§30-31）

上传截图/照片/moodboard → 提取 Visual DNA（layout / color / typography / spacing / hierarchy / motion）
→ 转为设计指令而非复制。输入 URL → fetch/analyze/screenshot/structure extraction → 受启发的结构重建，
不得复制受版权保护的内容。

当前落地（任务 #22）：资产库面板图片卡片上的「提取视觉语言」→ `POST /api/projects/:id/visual-dna` →
服务端**本地像素统计**（只解 8 bit 非隔行 PNG：亮度/对比/饱和/冷暖/留白/边缘密度 + 主色板与角色）→
结果落成 `document.visualDna`，走的是一条 `setVisualDna` 事务，所以可撤销；分析层不写业务库（§149/§150）。
Design System 面板顶部展示它并标出 `source.method`（本地像素统计 / 视觉模型 / 概念语言三者可分辨，不互相冒充）。
像素测不出来的字段一律留空并写进 `source.notes`：排版、圆角、动效位图统计给不出，§173 那种
"Cinematic / Soft glass / Slow motion" 形容词要真视觉模型才谈得上（随真实 provider 授权补齐）。
不支持的编码（16 bit / 隔行 / 非 PNG 的 JPEG 与 WebP）以及整张透明的图，返回一句中文原因，不返回半截 DNA；
带 alpha 的 PNG 支持，只是 alpha<128 的像素一律跳过，不污染背景判断。
§174「所有 AI 生成内容遵循它」已是可验证事实而非口号：DEMO MODE 的换色规则读文档 DNA 而非内置色板，
e2e 用参考图的 `#14b8a6` 压过内置 cinematic `#05060a` 做回归。**URL 参考输入仍未实现**，别当作已有能力。
