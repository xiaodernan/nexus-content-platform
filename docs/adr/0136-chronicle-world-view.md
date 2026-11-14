# ADR 0136 — 「世界编年」：world chronicle view（v705）

- 状态：ACCEPTED（2026-11-14）
- 上游：ADR 0135（人物星图——同一份世界文档的另一个投影）
- 范围：`packages/world-model`（WorldNode.lore）+ `packages/schemas`（zod optional）+
  `lib/chronicle.ts`（纯推导）+ `ChronicleView.tsx`（横向年表）+
  `/world/<id>/chronicle` 路由 + Studio 世界面板入口

## 背景

世界的两半：人物（§46）与世界（§44）都在，但"时间"这一维完全不存在于模型里。
故事线和历史条目只能在节点列表里平铺；"史诗般的叙事"需要一条横向展开的年表。

## 决定

1. **加而不改**：`WorldNode.lore = { era?: string; order?: number }` —— 可选、缺省缺席、
   老文档/老客户端整字节透传（zod 同字段 optional；validateWorld 增 `bad-lore` 校验）。
2. **只有 story / history 进年表**：quests / geography / factions 是空间，不入时间。
3. **纪元排序 = 纪元内最小 order 升序**；未标纪元殿后；纪元内 `(order ?? MAX, updatedAt desc, id asc)`。
4. **零写库**：页面纯投影；chronicle 全部由 `lore` 推导；
   `era` 只是作者写的字 —— 不做"算法给的历史感"（§159）。
5. **零依赖纯函数**：`buildChronicle` 7 个分支全单测钉住（排序/殿后/丢弃/重复/day progression）。
6. ** Studio 入口**：世界面板同栏补「世界编年」按钮（`data-enter-chronicle`）。

## 验证（本机，真实数据）

- `chronicle.test.ts`：6/6 单测；tsc 0；对每个文件直查 eslint 0（chronicle.ts / ChronicleView /
  pages / WorldGraphView / world-model / schemas）。
- **端到端播种**（fixture 账号 `constellation+mwg35nri`，项目 f7ec6716「星图 MWG35NRI」）：
  先 PUT 世界文档拿到含 lore 的 7 个故事/历史节点（灰灯纪/灰烬纪/铁月纪各 2 + 未标纪元 1）→
  GET /world/f7ec6716…/chronicle → 渲染出 4 列纪元、7 张卡片、每纪元 1..N 序号
  （历史=金 chips，故事=蓝 chips）；截图留存本轮回复。
- 端到端证明：lore 经过 zod → validateWorld → 库 → 读 → 渲染 这条链路没有字段丢失
  （eras 分组正确、order 正确、未标纪元殿后）。
- world-model roundtrip：PUT 后重新 GET 拿到的 nodes 里 lore 原样保留（zod 显式携带）。

## 仍欠（诚实记录）

1. ~~Studio 还没有 lore 的编辑入口~~——v705.2（cont. 99）已落地：story/history 条目在 Studio 世界面板获得「纪元 + 序」编辑行（`data-world-era` / `data-world-order`），经 `patchLore` 合并后写库；`lore: undefined` 整片摘掉（字节级回老文档）；validateWorld / zod 全链路保持空缺省。
2. ~~「记忆回声」没有~~——v705.3（cont. 100）已落地：story/history 条目获得「记忆回声」单行字段（≤ 240 字，纯感官刻痕，不是剧情梗概）；栏内编辑行 + chronicle 卡片左侧竖线的 italic 渲染；GET/PUT 往返保留；seeded 实测证据（见 cont. 100 与本轮截图）。
2. 同纪元跨日期顺序靠 order 手工标：不写 order 的条目按 updatedAt 兜底，会让"写错日期"的账也对
   （这是规格，不是缺陷；文档在 lib/chronicle.ts 注释里说过了）。
3. 未做横向年表的无限滚动 / 虚拟化 —— 500 条 story/history 以上时页面会一次性挂载（同角色上限
   1e4 级节点；本项目今天还不到 20 条）。超大世界再加窗口化。
