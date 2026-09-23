# 0007 — Code Index（§69）：目录从投影现算，不落库；符号读真 AST；排序先词法

状态：已采纳（2026-09-24，任务 #34）

## 背景

§69 要一份 Code Index：File / Symbol / Function / Class / Component / Dependency，
目的是让 Agent「找到真正相关代码」而不是让用户替它指路。三条既有纪律同时管着这件事：

- **§16**：设计模型是唯一真值，代码是它的投影。所以"项目的代码长什么样"这个问题，
  权威答案在 codegen 那一趟里，不在任何一份手写文件里。
- **§68**：不许把整份文档 / 整个 repo 塞进模型上下文。目录是解法，但目录自己也得进上下文，
  于是它也要受预算管（§70 / ADR-0006 已经为此立过一次规矩）。
- **§81**：生成代码不得在主机执行。所以任何"跑一遍真编译器/真打包器顺便把符号导出来"的
  省事方案（tsc --listFiles、SWC、esbuild 的 metafile）都得排除——我们要的是**读**，
  一旦开始执行，那条线就没了。

三个分叉各自要表态：目录从哪来、符号怎么读、相关性怎么排。

## 选项

**目录从哪来**

1. **写进 `files` 表**：schema 里这张表是现成的（`path` / `content` / `checksum` / `code_only`，
   注释直接引 §102 / §105），至今没有任何代码往里写过一行。看起来"终于用上它了"。
   排除：库里存代码或代码结构就是第二份真值。页面改名、token 改动、切 mode 都会让它过期，
   而这份目录**没有任何一项是算不出来的**。算得出来的东西写进库，迟早有一天读到的是旧的。
2. **扫真实仓库目录**：排除，而且是要写下来的那种排除——本仓库的代码和"某个设计项目的代码"
   是两件事。§69 说的项目代码是**这个设计项目投影出来的那一份**，扫仓库会让目录回答一个没人问的问题，
   还会顺手把 §68 违反掉。
3. **每次从 `generateProject()` 的产物现算**：目录说的就是发出去的那份代码，
   归属由发射器自己标注（`GeneratedFile.origin`），而不是事后靠文件名反推。

**符号怎么读**

1. **正则**：便宜，但会漏也会错（`export default`、嵌套函数、解构参数、JSX 里的表达式）。
   错的符号比缺的符号坏得多：Agent 会照着不存在的名字去改。
2. **真 AST**（`typescript` 编译器 API，只读 `createSourceFile`，不 emit 不执行）：
   行号、参数、import 全部从节点上读；解析失败**报失败**，不报"0 个符号"。

**相关性怎么排**

1. **语义**（embedding + 向量）：这是终态，但 §49 的向量那半还没落地（要 provider、要钱）。
2. **词法 + 逐条写理由**：离线可跑、可解释、可测；命中了什么就写在结果里，没命中就发空目录。

## 决定

**3 + 2 + 2**：`apps/web/src/server/domain/code-index.ts` 每次装配现算，
符号走真 AST，排序词法且逐条给理由。

三条落地细节，都是为了让"目录说谎"这件事没有藏身处：

- **发射器标归属**：`GeneratedFile.origin` 只有 `page` / `tokens` / `barrel` 三种，
  由 codegen 在生成那一刻写死。`node-region` 是目录自己从模型里补的（见后果第 4 条）。
- **totals 永远来自未裁的那一份**，被预算丢掉的文件/符号单独记 `dropped` 与 `trimmed`
  ——与 ADR-0006 同一条规矩，两个目录不能一边严格一边宽松。
- **发出去的是 digest 不是目录**：`buildCodeDigest` 只带 path、语言、归属的人话描述、行数、
  符号名（`kind:名字`）、依赖与命中理由；**代码正文一个字符都不上线**（§68）。
  这条有 e2e 之外的直接断言：`ai-assemble.integration.test.ts` 要求线上那份
  含符号名 `CouponCountdown`、但不含区域正文（`十分钟后可领` / `60_000` / `return <b>`）。

## 后果

正面：

- §71 的 Code 分支从 `not-indexed` 变成 `indexed`，note 是「N 个文件、M 个符号、K 条内部依赖（§69，真实 AST）」——
  一句能被面板核对的话，不是一个状态标签。Studio 面板同一行还报目录字符数与"几个文件没解析出来"。
- 建这个目录**当天就照出一个真 bug**：页面名没有 ASCII 字符时（中文项目名是常态），
  `pascalCase()` 过滤后剩空串，`word[0]?.toUpperCase()` 拼出字符串 `"undefined"`，
  于是导出的工程里有 `components/nexus/undefined.tsx`、`export function undefined()`。
  以前没人发现，因为预览看的是渲染结果、codegen 测试用的是英文名页面。
  已修（回落 `PageN`）并在 `packages/design-model/test/codegen.test.ts` 钉住。
  这正是 §69 想要的效果：**逼着系统把自己的产物说清楚，谎就藏不住**。
- 成本可控且已知：10k 节点 `buildCodeIndex` 220.9ms，其中 `generateProject` 单独 118.5ms
  ⇒ AST 那半约 100ms。数字与测量条件在 `docs/PERFORMANCE.md`。

代价与已知边界（都写进 `CODE_INDEX_OMISSIONS`，不靠注释）：

1. **每次装配都重算，没有缓存**。它和 §70 的设计目录同命，也同一个键可缓存
   （`documentId + updatedAt + mode`）。现在不做，因为 §68 的预算裁剪是每次请求的参数，
   缓存命中率的账还没到需要还的时候。
2. **`typescript` 只能住在 web 服务端**。模型包（`@nexus/design-model`）要发浏览器，
   绝不能 import 编译器，所以目录落在 `apps/web/src/server/domain/` 而不是包里——
   这是"包边界"第一次被一个具体依赖逼出形状。`next.config.ts` 加 `serverExternalPackages: ['typescript']`，
   让 Node 运行时从 node_modules 加载它，而不是打进 server bundle（动态 require 警告 + 几百个内部模块）。
3. **排序是词法的，不是意图**。`queryTokens` 做了 CJK 二元切词，所以中文查询能命中中文页面名；
   但它不理解"把按钮改圆一点"指的是哪个组件——那要 §49 的向量半。命中理由逐条随结果发出去，
   为的是让读的人能判断"这个排序可不可信"，而不是只能信。
4. **code-only 区域在导出的代码里是字符串**（`codegen.ts:544` 的 leaf 分支），
   所以它们的符号不并进 `.tsx` 目录。目录给它们的位置 `code-only/<页面>/<节点>.<语言>`
   是**我们自己起的寻址名**，导出工程里没有这份文件。这句话必须写出来，
   否则一个看起来像 path 的东西就会被当成 path 用。
5. **还没有"按 path 取正文"的通道**（§69 的后半截）。Agent 现在知道有哪几份文件、里面有什么符号，
   但读不到实现。这一条在面板的 `unavailable` 列表里，e2e 有断言（`data-context-unavailable` 含"代码正文"），
   所以它不会因为"目录做完了"被顺手划掉。
