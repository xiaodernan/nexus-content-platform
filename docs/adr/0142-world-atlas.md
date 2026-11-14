# ADR 0142 — 寰宇图志：确定性黄金角夜图上的空间条目

- 状态：ACCEPTED（2026-11-14）
- 范围：世界子系统（`/world/<projectId>/atlas`，Night Chart of Space）
- 前置：v704 / ADR 0135（角色星图）、v705 / ADR 0136（世界编年）、v706 / ADR 0137（纪元链）、v708 / ADR 0141（记忆回廊）

## 背景

世界文档里有九类条目，此前有四条只读投影通道：时间（chronicle）、记忆（memories）、角色（constellation）、步行（walk）。
**空间**条目（`geography` / `factions`）没有自己的可视化通道——它们是图上最稀疏、最需要"星位感"的两类。
用户要求的是"宏观的史诗叙事，细节里又有魔鬼"；空间是其中一根支柱。

## 决定

1. **确定性排布：黄金角螺旋（phyllotaxis，137.508°）。** 同一份 world 文档 ⇒ 同一张夜图；
   位置不读随机数、不读时钟，排序键为节点 id（localeCompare 稳定）。
2. **确定性星海：mulberry32 固定种子（0x5EED_FACE）伪随机。** 110 颗星的位置/半径/亮度是
   纯函数，SSR 与 CSR 永远一致，不产生水合闪烁。
3. **灵脉（ley lines）：最近邻贪心连边。** 按欧氏距离排序、度封顶 3、无向去重，
   边数上限 ⌈1.15·n⌉——这是"星图如何发光"的算法，不是随手画线；
   n ≤ 160（超出静默截断，星位名录如实标出 160）。
4. **选择驱动用 `?pin=<id>` 查询参数，全 SSR。** 零客户端状态、零水合成本；键盘可达（anchor 原生 focus + Enter）；
   `aria-pressed` / `aria-current` 如实反映；空态、读不到就说读不到。
5. **可见性同纪律：** `projectVisibleTo` 归属判定，未授权 404；不引入发布面（发布的是设计文档，不是世界原文）。
6. **零写库、零 schema 变更。** 纯投影；Studio 顶栏新增「寰宇图志」链接（与 记忆回廊 并列）。

## 验证（本机，disposable fixture 星图 MWG35NRI / f7ec6716）

- 一次性 SQL 播种 8 条空间条目（5 地理：盐碱原/暮港/断云岭/烬湖/七盏城；3 势力：守灯会/铁月铁卫/税账书记；
  全部使用中文条目体、`updatedAt` 为播种时间；播种脚本与截图脚本均为一次性 scratch，不入仓）。
  世界现共 17 节点；atlas 显示 10 钉（6 地理 + 4 势力）。
- Playwright 登录 `constellation+mwg35nri@nexus.test`：`[data-atlas-pin]` = 10、`[data-atlas-edge]` = 12、
  `[data-atlas-ledger-row]` = 10；截图确认：深夜图面 + 灵脉渐隐 + 金色势力菱形 + 环形地理钉 +
  选中态（烬湖，青色光环）+ 右侧名录与志卡联动更新。
- `tsc --noEmit` 0；对改动文件直跑 `eslint` 0。

## 仍欠（诚实记录）

1. **无客户端交互增强**（拖拽、缩放、hover 高亮的实时反馈只靠整页导航驱动）——这是有意的 SSR 取舍，不是懒惰；
   要装饰级动效需要一次新的设计评审 + 客户端岛屿拆分。
2. **fixture 世界 `document` 曾被本 turn 的一次性播种脚本双重编码**（postgres.js 对 `JSON.stringify(x)::jsonb`
   把参数序列化两次，存成 jsonb 字符串标量）。已在 cont. 104 amendment 记录并用 `sql.json()` 修复；
   其他 35 个世界原为 object，应用写路径无恙。
3. 播种条目是 fixture 的一次性数据，不在仓内承诺；clone 出来的环境 atlas 会是空态（空态文案已就位）。
4. 空态与 160 钉上限是硬约束，不是配置项。
