# ADR-0078：组件实例落成"复制体"，撤销靠 op 里自带的 instanceId

## 背景

§13 要的是 Figma 那套组件/实例。模型层其实早就有 `instantiateComponent()`，但它的返回形状
（`{instance, copiedIds}`）不带那份 `Record<id, node>`，调用方拿到也写不进页面；补丁词汇表里
更没有一条 op 会去调它。结果是：画布上想放一个组件实例，只能让 AI 手写 `insert` 一颗一颗堆。
第三十四片要把它做成端到端可用的一条 op + 面板上的一颗按钮，于是必须先决定**实例在文档里长什么样**。

摆在面前的有两条路，而且它们对之后每一格（override、变体切换、跟随主组件）的代价完全不同。

## 选项

1. **引用式实例**：实例节点只记 `componentId`，不持有子树；渲染/布局/代码生成时去主组件那棵子树上
   解析，再叠 `overrides`。这是 Figma 的做法，"实例自动跟随主组件"是白送的。
   代价在这份代码库里很具体：整条投影链**今天一处都不解析实例**——`codegen.ts` 的 `elementFor`
   没有 `instance` 分支（落到默认 `<div>`），`layout.ts`/`render.ts` 按 `parentId` 组树，
   而 `applyInstanceOverrides()` 这个唯一像样的解析函数在 `src` 里**零调用者**（只有测试导入）。
   选它就要同时改布局、渲染、代码生成、a11y 走查与搜索索引，而且改的都是别人在改的文件。
2. **物化复制体**：`instantiate` 把主组件子树深拷进 `page.nodes`，实例节点记 `componentId` 指向来源。
   所有既有投影照常工作（它看到的就是一棵普通子树）。代价：实例**不**跟随主组件，
   之后要"同步/重置"就得显式写一条 op，把来源那棵重新拷回来。
3. **不落库，只在渲染时造**：文档里只有指针，画布临时展开。预览看着对，但导出代码、
   历史 Diff、AI 上下文都读不到实例——设计模型是唯一真值（§16），这条直接违反。

## 决定

选 **2（物化复制体）**，并把"跟随主组件"如实记成还没做，而不是藏在措辞里。

- `PatchOp` 增加 `{ op:'instantiate'; componentId; instanceId; parentId?; index? }`。
  **`instanceId` 必填**不是洁癖：`invertPatch` 跑在 apply **之前**、拿的是改动前那份文档，
  那时这颗实例还不存在。op 不带着 id，就写不出"把它连同复制体一起收走"的撤销条目（§150）。
  复制体内部那些新 id 是 apply 时才生成的，逆操作因此只写一条 `remove`——它在**应用后**的文档上收子树。
- 四道校验全部排在"还没往页面落一个字"的位置：目录里没有这个组件 / 主组件根不在任何页 /
  父节点不存在 / `instanceId` 撞已有节点。任一不过就整条 skip，**不留半个壳子**——
  只有壳没有子树的节点既不是主组件也不是实例，渲染与 AI Diff 只能各自猜（§16/§159）。
- 源页按"哪一页真的有那个根节点"来找，不信任 `component.pageId` 那份可能过期的登记，
  所以主组件住在别的页、实例放在当前页是通的。
- 复制体的类型照抄主组件根，只有 `component` 降成 `container`（那是"我是主组件"的目录标记）。
  这一条是看图抓到的：无条件扭成 container 后，把一行文字存成组件再放实例，复制体就丢了文字类型，
  量出来 1440×8，文字压在原文上。
- 词表五处同批改：`packages/schemas` 的 `PatchOpSchema`、`npm run contract:export` 重导的三份
  `contracts/*.json`、`missingPatchReferences`、`design_prompt.py` 的 op 清单、MCP 工具
  `nexus_patch_design` 的 description。最后一处是数词表时才发现本来就漏着 `setVisualDna`，
  于是补了一条常驻门：op 名单从契约文件里读出来逐条要求点名，不手抄第二份清单。

## 后果

- 实例与主组件**从此各写各的**：改主组件不会*自动*传到已有实例。这一格在 `docs/ROADMAP.md` 的
  第三十四片"仍欠"里点名（连同 override / 变体切换 / 重置为主组件）。
  **口径更新（2026-11-03，第三十五片）**：手动同步那一路已经落地——`syncInstanceOps()` 产出
  `remove`+`insert` 的标准 op 串，设计系统面板每张卡上有「更新实例」，撤销/重做各按自己的账回来；
  仍然没有的是"改完自动跟上"（那是选项 1 的引用式实例，见下一条）。
- 选 2 之后，"实例跟随主组件"是一条**要落库的同步 op**，不是渲染时免费得到的投影；
  真要转向选项 1，得先把 `applyInstanceOverrides` 接进 layout/render/codegen 三条链并让它们有见证。
- 报文门那条有教训：自动保存在 PATCH 被拒时会当场换整份 PUT 兜底（`apps/web/src/studio/store.ts:638`），
  所以"界面说已保存 → 刷新后还在"这条见证**证不了某个 op 过得了 ops 契约**。
  见证因此加了一层网络侧读数（`page.on('response')` 数 PATCH 的成/拒）。
- 验证：`packages/creative-model/test/patch-instantiate.test.ts` 14 例（整份子树 / 类型照抄 /
  跨页 / 同批两次互不相交 / 四道 skip / 逆操作形状 / undo-redo / 引用计数 / diffPatch）；
  `packages/schemas/test/patch-instantiate.test.ts` 3 例；`apps/web/test/evaluation.test.ts` 一例；
  `e2e/components-panel.spec.ts` 2 例（含刷新后仍写 `引用 1` 与 PATCH 零被拒）；
  `apps/mcp-server/test/mcp.test.ts` 的词表门。臂表 A1–A6 见 ROADMAP 同一节。
  **第三十五片后的读数**：`patch-instantiate.test.ts` 17 例（末尾多一个 describe：同一串 op 在两份
  文档上各打一次）、`components-sync.test.ts` 7 例、`patch-determinism.test.ts` 22 例、
  `e2e/components-panel.spec.ts` 3 例——见 ADR-0079 与 ROADMAP 的 §13 第三十五片。
