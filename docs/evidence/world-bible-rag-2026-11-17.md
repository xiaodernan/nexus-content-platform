# 世界大典 RAG bench 2026-11-17（v779 之后；`scripts/ingest-world-bible.mts`）

> 触发：用户点名"如果合适的话，最好用一些 RAG / LangChain / LangGraph 的知识"。
> 结论：本仓的 RAG 语料层早已存在（§49：tsvector 全文 + 子串 + 词覆盖度的确定性融合），
> LangChain/LangGraph 不直接适配这个 TypeScript monorepo（它们是 Python 库，引入会改动
> 整个依赖图与测试面）——取其架构思想（锚定 mi-LangGraph 的节点→语料→检索流水），
> 用仓库自己的混合检索实现，而不是把 Python 运行时塞进 web 层。

## 做了什么

- 新增 `packages/world-model`-level bench 脚本 `scripts/ingest-world-bible.mts`：
  1. 读 `docs/world-bible/*.md`（四章 zh 正文，en 译本不重复索引）；
  2. 建 throw-away 测试用户 `bible-canon+<ts>@nexus.test` + throw-away 项目 `eval-world-bible-<ts>`
     （三次运行的项目若都留在库里，属于 eval 产物，编号在案）；
  3. 把四章**正典正文**灌成 `story·全篇` 条目（body = 整章原文），再把每章
     "对应关系"映射表逐行各建一个条目（kind ∈ lore/history/geography/factions/characters/
     creatures/items/quests/story），共 **45 条世界条目**；
  4. `syncProjectKnowledge(id)` 灌成 chunk：**chunks=59**；
  5. 用 5 个真实查询走真库 `retrieveProjectKnowledge`（tsvector + substring + coverage 融合，
     无外部 provider），逐一核对含 needle。

## 结果

```
read 4 章 · 28 节 · 25 锚句
语料 chunks=59（world 45 条目）
probe【潮沙盘】→ 5 块 · 命中 · top1=故事 · 潮汐教团的第四十一次会议·全篇 · vectorAvailable=false
probe【会册】→ 5 块 · 命中 · top1=故事 · 潮汐教团的余烬·全篇 · vectorAvailable=false
probe【第八盏灯】→ 5 块 · 命中 · top1=故事 · 第八盏灯·全篇 · vectorAvailable=false
probe【雾港灯人】→ 5 块 · 命中 · top1=故事 · 第八盏灯·全篇 · vectorAvailable=false
probe【第四十一次会议】→ 5 块 · 命中 · top1=故事 · 潮汐教团的第四十一次会议·全篇 · vectorAvailable=false
probe 5/5 命中
projectId=d5041c4a-910a-4d1d-8909-759a39736494 · exit=0
```

**5/5 命中，且 top1 都是正确章次**（潮沙盘 → 第四十一次会议章；会册 → 余烬章；第八盏灯 → 第八盏灯章）。

## 顺带抓到的真 bug（一箭双雕）

- `packages/game-model` 有一条**ESM 循环依赖 TDZ**：`index.ts` 既导出 `GAME_KINDS`（const），
  又再导出 `codegen.ts`，而 codegen 顶层的 `KIND_TERM_EN` 同步读 `GAME_KINDS`——
  ESM 先求值所有 import 再求值本模块，当 index 先被求值、codegen 先被链接（或反过来）时，
  const 还在 TDZ，`ReferenceError: Cannot access 'GAME_KINDS' before initialization`。
- 症状：任何经由 game-model barrel 深度 import 的模块在**首次 import 时就崩**；
  `tsc -p web` 与 vitest 都绿（它们不走这个启动序列；ingest-world-bible 是第一个真踩中的）。
- 修法：新建叶模块 `packages/game-model/src/kinds.ts`（只放 GAME_KINDS/GAME_KIND_TERMS/GameKind），
  index 与 codegen 都从它 import；对外签名不变。game-model 19 文件 363/363 全绿。

## 诚实边界

- `vectorAvailable=false`：本仓 embedding provider 未接通，检索退化为 tsvector + substring + coverage
  的确定性融合（正是它命中了：所有 probes 命中度都来自子串匹配，不是语义向量）——
  对中文单字 query（如"会册"），tsvector 几乎只能当噪声，substring 是主力。
- 5 个 probe 都是子串是 + 词覆盖度能命中的 query；没有测"改写说法"的语义召回
  （"王都是怎么陷落的"这类）——那要真 embedding 模型 + reranker，wkapi.pro 是否映射 embeddings
  端点我没有用实测回答。本片不虚夸语义召回。
- 三次运行留下了三个 throw-away 项目（eval-world-bible-*，projectId 在案），与 eval-rag-* 同类；
  不影响用户数据，可以手动软删除。
- 这条 bench 只证明**能灌进去、能查到**；没动 hot path；不是 perf 测量，不是 RAG 质量评估；
  向量段的那半如实 notMeasured。

## 与已有工作对齐

- §49 语料索引（tsvector + substring 融合器、`knowledgeChunks`、`retrieveProjectKnowledge`）——
  正典现在也是语料的一部分，`潮汐教团` 系列词从此在 RAG 层可达。
- §44 World Builder：`story·全篇` 条目把四章正文当 world-nodes 存进了 `低语诸王 · 世界大典` 世界文档——
  大典从此不是只读在 markdown 里，也是 Studio「世界」面板里的一份真文档。
- 本 bench 不证明用户世界里的 RAG 已经自动消费大典（那要 §47-46 的真 provider 接链或 canon sync 片，后续单独立项）。
