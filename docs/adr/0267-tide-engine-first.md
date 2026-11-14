# ADR-0267 — 世界潮汐（v710 §B）：引擎先立、契约次之，声明面板后补

- 状态：引擎片 + 持久化契约片 + Studio 声明面板均已落地（v719–v721）；tide 全链成立
- 日期：2026-11-14（v719 引擎片 → v720 契约片 → v721 声明面板）
- 关联：v710（ROADMAP）、ADR-0266（ephemeris 确定性投影）、ADR-0265（llm_stream 决策）

## 背景

v710 立项说「世界 tide 推演——v709 投影上叠加作者声明的扰模（drought / progeny / inflation 等细碎的环境压力），
每种扰模由 world-model 层独立函数算出；可单测、可复现」。

真实现状演进：
- v719（引擎片）：世界文档**还没有** pressure 字段——先立引擎、页面如实空白机制、单测钉死；
- v720（契约片）：WorldDocument 增可选 `pressures?: WorldTidePressure[]`（上界 16 条）——
  `@nexus/schemas` 的 `TidePressureSchema`（severity 只认 1/2/3，z.union literals）与
  `@nexus/world-model` 的 `WORLD_TIDE_PRESSURE_KINDS`（同名同序）两处各自成文、测试对齐；
  `validateWorld` 新增 `bad-pressure` 代码（kind 不认识 / id 空·重复·超长 / label 空·超长 / severity 越界·非整数），
  全部逐项列进 issues 永不静默剥掉；`lib/tide.ts` 改为 re-export 模型侧权威清单（零双份清单漂移）。

## 决策（为什么不是「一次到尾」）

- 张口就做「声明面板」= Studio 编辑器 + Command add/remove/update + undo/redo + 持久化往返 + 视觉判据 + §FE-Editor SHA 全套——
  全部挤在一片里，在本机内存锯齿（0.5–2.5GB）下风险太大，任何一环漏了就带着半成品落到一个态里（§§159、254 的判据纪律）；
- 张口就捏「作者必然这样想」的散文 = 编造，违背 §159（测错 ≠ 显 0；界面不说谎）；
- 契约片是纯加法（optional field），老世界照样读得出来，AI service 侧根本不可见 tide（没到 CONTRACT_EXPORTS 清单）。

## 步态

1. **引擎片（v719）**：`lib/tide.ts` 纯函数——五扰模各守一规（drought 干亢水词典 / progeny 繁衍幼词典 / inflation 通胀账本暴露 / erosion 寂蚀 body<120 字 / murmur 潮声叙事线+传闻词典）；severity 不参与任何计数；非法声明进 invalid；确定性双跑深相等。`tide.test.ts` 13 legs + §FE-TD 7/7。
2. **页面片（v719）**：`/world/<id>/tide` RSC——声明区如实空白指引；「若声明·机制预演」五张卡全部真演算（零叙事）；severity 1 要闻 / 2 季节 / 3 纪元只是着墨。
3. **契约片（v720）**：`packages/schemas` TidePressureSchema(可选，上界 16) + `packages/world-model` WORLD_TIDE_PRESSURE_KINDS（权威清单）+ `validateWorld` bad-pressure + `tide-pressure.test.ts` 14 legs（含本片新增的 setWorldTidePressures 五例）+ world-contract 新增契约段（kind 清单锁死、老文档自洽、severity/label/id/上界 16 回归）。验证：world-model 11 文件 125 条绿 · schemas 390 条绿 · web tide 13/13 · tide-visual-style 7/7 · tsc web EXIT=0 · census OK 2125。
4. **声明面板片（v721）**：`setWorldTidePressures(document, pressures | null)`（setWorldTerrain 同一流派）——null 收掉全部回到字节形状、否则逐项过门整批拒绝、document 引用不变；`WorldPanel.tsx` 底部新「潮汐扰模（作者声明）」段：label（≤40 字）+ kind + severity（1 要闻 / 2 季节 / 3 纪元）选择器 + id 自动生成（`tp_<base36><序号>`）+ 删除/收掉全部；全部 .wd-* 类（新类零个）、`worldStore.showNotice` 原样显示理由、§FE-48 SHA 按惯例重钉（863b21…→29e46e0b…）。

## 不做的事（显式记录）

- 不新增 WorldNode kind——`WorldNodeLore` 纪律不动；
- tide 投影不落库、不成为第二份世界真值——读时演算，和 ephemeris 同一性；
- 不把 LLM/trusted judge 接进 tide——词典与阈值都是可复现的确定性规则；
- severity 永不进入任何计数公式——算法不给作者缩水，也不给作者放大。

## 后果

- 用户现在能走通「作者声明扰模 → 潮汐页照声明真演算」全链；
- 契约落库后，声明面板就是 setWorldTerrain 流派的平移，算法侧零改动；
- tide 页面从 codex 页脚与 digest 板块两处可达（各 SHA 重钉并留有钩子）。
