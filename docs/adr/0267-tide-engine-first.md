# ADR-0267 — 世界潮汐（v710 §B）：引擎先立，声明面板后补

- 状态：已落地（引擎片 + 门面页），声明面板未落地（诚实写在案）
- 日期：2026-11-14
- 关联：v710（ROADMAP）、ADR-0266（ephemeris 确定性投影）、ADR-0265（llm_stream 决策）

## 背景

v710 立项说「世界 tide 推演——v709 投影上叠加作者声明的扰模（drought / progeny / inflation 等细碎的环境压力），
每种扰模由 world-model 层独立函数算出；可单测、可复现」。

真实现状：世界文档（@nexus/world-model WorldDocument）**没有** pressure 字段，`WorldNodeLore` 只有 `era` / `order`。
作者今天没有任何合法途径在 Studio 里「声明一个扰模」。所以 §B 不能照立项原文一步到位：

- 张口就做「声明面板」= 先在 document 里为不存在的字段盖一个 zod 扩展、再补 Studio 表单 + Command/undo/redo + 持久化 + 校验 —— 全部挤在一个片里，本机内存锯齿（0.5–2.5GB）下风险太大，任何一环漏了就会带着半成品落到一个态里；
- 张口就捏「作者必然这样想」的散文 = 编造，违背 §159（测错 ≠ 显 0；界面不说谎）。

## 决策

**分片推进，先引擎后声明**：

1. **本片**：`lib/tide.ts` —— 纯函数引擎。TIDE_PRESSURE_KINDS 五种扰模（drought 干亢 / progeny 繁衍 / inflation 通胀 / erosion 寂蚀 / murmur 潮声），每种独立判定规则：
   - drought：title+body 命中水词典（海/河/雨/tide/water…）——干旱不遍布全图；
   - progeny：kind ∈ {creatures, characters, factions} 且命中繁衍词典（幼/卵/孵/spawn…）；
   - inflation：kind ∈ {items, factions} **一律暴露不认词典**——价格不会跳过某一代商人；
   - erosion：body trim 长度 < 120 字的一切落笔节点——薄的纸先破；
   - murmur：kind ∈ {story, history} 且命中传闻词典（风声/谣/whisper…）。
   - `severity`（1 要闻 / 2 季节 / 3 纪元）**不参与任何计数**——是作者着墨，不是算法的输入。
   - 非法声明不静默：全部列进 `invalid`（原因逐字可见）；合法声明按输入顺序投影；
   - `mostActiveId` 命中最多者，并列 → id 字典序最小；全空 → null。
2. `tide.test.ts` 13  legs 钉死（含确定性双跑、边界 =120、severity 不换 hits、大写/中文水词、invalid 三情境）。
3. `/world/<id>/tide` 页面如实空白机制：声明区在文档无 `pressures` 时显示指引（「写了一条就亮」），
   但下方「若声明 · 机制预演」的五张卡片全部来自**当前文档的真演算**——零叙事、零补假事件，
   severity 不定罪、只展示。世界读不出来 ⇒ 零数字（td-empty 页）。
4. **下一片**（未承诺）：WorldDocument 增可选 `pressures?: TidePressure[]`（加法、可选、向后兼容）+
   Studio 落笔声明（add/remove Command、zod 校验、severity 选择器）；那时页面自动从「空白指引」亮成「已声明投影」。

## 不做的事（显式记录）

- 不新增 WorldNode kind——`WorldNodeLore` 纪律不动；
- tide 投影不落库、不成为第二份世界真值——它是读时演算，和 ephemeris 同一性；
- 不把 LLM/trusted judge 接进 tide——词典与阈值都是可复现的确定性规则，不允许「模型口头潮水」。

## 后果

- 用户在未声明页面是「看得到引擎、但还不能落笔扰模」——诚实中间态；
- 引擎钉死后，下一片的声明面板只是 Command + zod + 选择器的工作量，算法侧零改动；
- tide 页面从 codex 页脚与 digest 板块两处可达（两处各自 SHA 重钉并留有钩子）。
