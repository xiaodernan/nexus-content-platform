# 评测基线（§85）

```bash
NEXUS_DATABASE_URL=postgres://nexus:nexus_dev_only@localhost:55100/nexus \
  npx tsx --tsconfig apps/web/tsconfig.json scripts/eval-baseline.mts
```

九个评测维度里，这里只测**本机不靠模型就能测**的，并且每一项都跑生产真路径：
RAG 走真库索引与真检索，设计精度走真 provider（当前是 DEMO 规则 provider）与真
`applyPatch`，往返走真 codegen→parse，无障碍走真健康门禁。

不断言任何阈值——数字记在这里，回归靠人眼比对（同 `docs/PERFORMANCE.md` 的纪律）。
但**结构不变式**失败时脚本以非零码退出，因为那是回归而不是"数字难看"：

- RAG 负对照必须返回空（不存在的锚句不许被"检索"出来）
- RAG recall@5 必须 6/6 全中
- 补丁引用完整性（捏造 id = 幻觉）必须为 0
- 补丁应用必须零 skip；响应必须过 zod 契约
- codegen→parse 往返必须零补丁零 issues
- 自比颜色分必须恒为 1；锚点色相必须真的落进像素
- a11y 干净基线必须满分，注入的 4 类违规必须 4/4 检出且定位到节点

## 2026-10-28 首跑读数

### RAG accuracy（词面检索 · 真库真索引）

语料 6 块（world 10 条目 + 角色 + 记忆），检索 limit=8：

| 查询 | 期望锚句 | kind | rank |
|---|---|---|---|
| 日蚀 | 第七次日蚀 | lore(中) | 2 |
| seventh eclipse | seventh eclipse | lore(英·全文) | 1 |
| 盐海 沉船 | 沉船的路标 | geography(多词) | 1 |
| 雾港 灯人 | 三百盏灯 | lore(多词) | 1 |
| 巡逻路 | 不存在的那条 | character | 1 |
| 打翻的镜子 | 打翻的镜子 | memory | 1 |
| 会说话的月亮桥 | （语料里就没有） | 负对照 | 空 ✓ |

**recall@5 = 100%（6/6）· MRR = 0.786（含负对照）**。负对照返回 0 块——
词面检索不会把没索引过的东西编出来。
notMeasured：向量检索 / 模型重排（embedding provider 未接入，#110）。

### Design accuracy / Hallucination 代理 / Code 往返（DEMO 规则 provider）

6 条 prompt（加高/风格化/移动端/删除/加区块/体检）逐条走真 provider→真 applyPatch：

| 指标 | 读数 |
|---|---|
| 补丁应用 | 5/5 零 skip |
| 引用完整性（捏造 id = 幻觉） | **0 违规** |
| zod 响应契约 | 0 违规 |
| codegen→parse 往返 | **5/5 干净**（0 补丁 0 issues） |

引用完整性的定义有一条关键细节：补丁内**先后依赖**的 insert（先建区块、再建网格、
再建卡片，后者引用前者的 id）是编排，不是幻觉——`missingPatchReferences` 按
应用顺序走，只把"引用了本批补丁没建过、文档里也没有"的 id 记为捏造。
notMeasured：真实 LLM provider 的同批指标；Tool selection / Agent task completion。

### Visual quality（确定性半边 · §86 指标 × DEMO 合成链）

| 读数 | 值 |
|---|---|
| 自比颜色分 | **1**（恒等不变式） |
| 变体（hueAnchor=0.602 ← 主色 #4580de） | 颜色分 0.785 · 布局分 0.816 |
| 无关图 | 颜色分 0.809 · 布局分 0.750 |
| 锚点色相 ±0.09 的像素质量 | 变体 10.7% vs 反事实锚点(+0.5) 2.0% |

变体与无关图的调色板/布局分**不能**当不变式——这张首跑表就是证据：
变体颜色分（0.785）低于无关图（0.809）。原因是 §38 机制的真实形状：
hueAnchor 在 `seedBytes` 的身份哈希里（不然字节级去重会把变体塌回原图），
换锚点等于换整条 rng 流，构图随之不同；调色板相似是运气不是保证。
所以不变式钉的是真正的因果链——**锚点色相落进像素**：带锚点的变体在锚点色相
附近的像素质量必须高于换了一个反事实锚点的变体（10.7% vs 2.0%，5 倍）。
notMeasured：typography / componentCorrectness（等视觉 provider）、真实生成图的美学质量。

### Accessibility（健康门禁对注入违规的检出率）

| 读数 | 值 |
|---|---|
| 干净基线 | score=100 · 零发现 |
| 注入 4 类违规（低对比 / 缺 alt / 无名按钮 / 过小点击目标） | **检出 4/4**，全部定位到节点 · a11y 分 70 |

notMeasured：渲染后页面的**键盘**可达性（axe 盖不了真键盘走查；渲染半边见下一节）。

### 渲染后页面的无障碍（axe × 真浏览器 · e2e/a11y.spec.ts）

设计模型的静态门禁测的是**设计**；Next 壳 + 渲染投影只有对真 DOM 跑 axe 才测得到。
方法：走真发布流程建公开作品页，匿名访客在真 Chrome 里对 `/n/<handle>/<slug>` 注入
axe-core（WCAG 2.0/2.1 A+AA 四个 tag），读 `violations`。

2026-10-28 首跑读数（三跑一致）：**通过规则 24 · 不适用 39 · 违规 1 类**
——serious `color-contrast` ×7。**首跑时我把其中 2 处（`li` / `p`）归因成"作者快照的忠实
渲染"，这个归因当天就被自己的修复否证了**：改平台 token 后 7 处一起清掉，说明它们吃的
都是平台色。查代码坐实——`li` 是「还没有评论。」的空态占位，`p` 是统计告知段，两者都在
壳上；设计投影渲染的是带 inline style 的 `<div>`，一条都没进 violations。

七个节点同源于一个 token：`--nexus-color-fg-3`（11/12px 小字与占位符用的"占位级"文本色），
当时暗色 `#6b7488` 对四级表面的对比度是 **4.19 / 3.99 / 3.70 / 3.34**，浅色 `#8a92a6` 更差
（2.93 / 3.11 / 2.73 / 2.51）——AA 正文要 4.5，两个主题都不及格。

**同日修掉**（`apps/web/src/styles/tokens.css`）：暗色 → `#828ca8`、浅色 → `#5b6478`，
按 tokens.css 的字面值重算对比度为暗 **5.87 / 5.58 / 5.18 / 4.67**、浅 **5.59 / 5.93 / 5.21 / 4.79**，
四级表面全过 AA；与 fg-2 仍差 1.49×（暗）/ 1.32×（浅），三级文本层级没有塌。
修的不只是被扫到的那 5 处：改前的约束是"对 bg-0..bg-3 都要过 4.5"，因为全站 639 处
`text-fg-3` 里有些落在 bg-3 上（市场「已举报」徽标、Agent 面板 busy 态），那些面没有浏览器门。
`style-tokens.test.ts` 新增两道按文件字面值算对比度的门钉住它，并有"旧值必须不及格"的
验电用例——变异臂实测：把两个 token 改回旧值，恰好红 2 条（暗/浅各一），其余 3 条绿。

修复后读数（run6，最终字节）：**通过规则 24 · 不适用 39 · 违规 0 条**。

结构不变式（进 exit code 的那种）：`passes.length > 0`（对白页 axe 也"全绿"，那种绿不算
证据——这条防的是扫描根本没发生）与 `critical === 0`。
不断言 serious 数——0 是当前读数而不是保证，扫不到的面（见下）才是这一项真正的边界。

notMeasured：键盘可达性人工走查、Studio / 市场等其余界面的 axe（本门只扫公开作品页）。

### Performance

不在此复测：规模基准与热点路径的真数见 `docs/PERFORMANCE.md`（§146/§147 测量协议）。

## 首跑抓到的三个真谎（这就是评测存在的理由）

第一次完整跑，7 条结构不变式红了 5 条。逐条归因后：**三条是产品真缺陷，两条是评测自己的错**
（第 6 条不是首跑的，是第二片渲染后无障碍的账——归因写错被自己的修复推翻，一并记在这里）。

1. **§86 颜色指标自比 ≠ 1（产品 bug）**：`paletteOf` 只留 6 个主色，但 share 的分母是
   全部样本——多色图的自比颜色分只有 0.495。修法是除以参考图自己的主色质量
   （refColorMass），并加"8 色条纹图自比必须为 1"的回归钉。
2. **§38 合成链的注释在说谎（产品文档谎）**：renderPixels 的注释宣称"形状/横带位置不变，
   变体是同一张图的换色"，而 hueAnchor 在身份哈希里、整条 rng 流都变——注释描述的
   机制不存在。注释改真；不变式从"变体调色板相似"改钉"锚点色相落进像素"。
3. **DEMO provider 引用了不存在的 token（产品 bug）**：加区块的标题写了
   `{font.display}`，默认 token 目录里只有 font.heading/body/mono——codegen 照发
   `var(--nx-font-display)`，parse 认不回，每次加区块的往返都多一条 set op。改成 `{font.heading}`。
4. **评测语料 bug**：`createWorld` 每个 kind 只建一条，第二条 lore 根本没建，
   「三百盏灯」锚句在语料里是 0 块。改用 `addWorldNode` 补上。
5. **评测自己的引用检查器漏一类**：链式 insert（同批补丁先建后引用）被当成捏造引用，
   9 条假违规。按应用顺序带 `created` 集合重写，并加两条用例钉住"编排不算幻觉、
   顺序反了才算"。
6. **我把自己的读数归因写错了，被下一次测量纠正**：无障碍首跑把壳上 7 处 color-contrast
   中的 2 处（`li`/`p`）说成"作者快照的忠实渲染，领地归作者"。改 token 后 7 处一起消失——
   那两处吃的是平台 `fg-3`，作者投影一条都没进 violations。归因不是读数的属性，
   是读数加上一次因果验证；这一条留在文档里，是因为它是本文件唯一一次被自己的修复推翻。

## notMeasured（如实列出，不装作测过）

- Hallucination 的 LLM 裁判、Tool selection、Agent task completion——需真 provider / 真 agent 循环
- RAG 的向量半（embedding provider 未接入，#110）
- typography / componentCorrectness 视觉指标（需视觉 provider，§86 第二半）
- 渲染后页面的键盘可达性（人工走查）；Studio 界面的 axe（已扫的只有公开作品页）
- Performance——见 `docs/PERFORMANCE.md`
