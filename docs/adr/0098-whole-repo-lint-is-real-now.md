# ADR-0098：整仓 lint 变成真的——配置补齐到每一个文件，规则改出来的真 bug 一并修掉
- 状态：已接受（2026-11-10）
- 相关：`eslint.config.mjs`（根）、`tsconfig.tools.json`（根）、`package.json`（根 devDependencies）、
  `agents/runtime/src/args.ts`（新）、`apps/studio/src/lib/fetchBody.ts`（新）、
  `agents/runtime/src/embedding.ts`、`packages/world-engine/src/rag.ts`、`packages/world-engine/src/worldEngine.ts`、
  `agents/exec-host/src/execHost.ts`、`agents/exec-host/src/containerExec.ts`

## 背景

`npm run eslint`（根 `eslint .`）在本仓库**从来没跑起来过**。README 与历次交接都写着「`npm run eslint` 0
errors」，但实际是：

1. **配置加载期就崩**：根 ESLint 10 与 `apps/studio` 的 ESLint 9 两版并存，`eslint-config-next@15.5.29`
   的 `@rushstack/eslint-patch` 去打补丁一个没在跑的实例（见 ADR-0096）；
2. 修好加载之后，**跑起来了但一塌糊涂**：364 条错误。分两类——
   - **262 条是「文件不在任何 tsconfig 里」**（`Parsing error: … was not found by the project service`）：
     六个包的 `tsconfig.json` 为了构建（`rootDir: src`）明确 exclude 了 `test/`，而 project service 只认最近的
     `tsconfig.json`；`docs/evidence/**` 与 `tools/**` 的 `.mjs` 证明脚本、`agents/*.mjs`、`packages/*/test/**`
     全都没有对应的 tsconfig；
   - **102 条是真实的规则违反**：`no-unused-vars` 111、`no-base-to-string` 52、`no-useless-escape` 18、
     `no-floating-promises` 11、`no-misused-promises` 9 等等。
3. 整仓 type-aware lint（~1167 个 TS/TSX 文件、project service 逐个建 TS Program）**需要超过 Node 默认堆
   （4288 MB）**，本机实测默认堆直接 `FATAL ERROR: Reached heap limit`。

## 选项

### 配置层：怎么让 project service 认得每一个文件

1. **`allowDefaultProject` 通配**：这条规则的 glob **不许含 `**`**，且默认最多 8 个文件（`maximumDefaultProjectFileMatchCount`）；
   262 个文件、十几个目录，得写十几条单层 glob，还得抬高上限。否。
2. **给每个包新增一份 `tsconfig` 供 lint 用**：改动面大，且要维护第二份「测试用 tsconfig」，与包自己的
   `tsconfig.test.json` 重复。否。
3. **指到包已经有的那份 `tsconfig.test.json`**（选定）：那六个包本来就有一份（`include: ["src","test"]`），
   只是 project service 看不见它。用经典的 `project` 模式指过去，类型感知的规则（尤其 `no-floating-promises`）
   在测试里也照样跑——测试代码里漏一个 await，同样是一次静默失败。
4. **`.mjs` 证明脚本跑非类型规则**（沿用仓库对 `**/*.config.mjs` 的既有先例）：`disableTypeChecked` 会把
   `projectService` 关掉，解析期就不会再去建 program。`allowJs` 让它们进 `tsconfig.tools.json`。
   `no-undef` 另配 Node 全局（`globals.node`）——`.mjs` 不是 TypeScript，typescript-eslint 的 configs 对它
   不生效，所以「关掉 no-undef」那一手不落在它们身上。

### 规则层：发现的东西怎么处置

1. **关掉规则**：本仓库的规则集是「只收能抓到 bug 的规则」；关掉它等于把防线拆了。否。
2. **按规则逐条 disable**：那会让 `eslint-disable` 变成噪音，下一个人分不清哪条是真豁免。否。
3. **改代码，让规则说的是真话**（选定）：能等价改写的改写（`[^\x00-\x7F]` → `[^\p{ASCII}]`），确实是规则
   表达不了的才定向豁免并**写清原因**。

## 决定

### 配置层

- 根 `eslint.config.mjs`：
  - 新增一块给六个包（`ai-providers` / `design-model` / `three-runtime` / `world-engine` / `exec-host` /
    `runtime`）的 `test/**`：`projectService: false` + `project: [.../tsconfig.test.json]`。**名单逐个包写，
    不用通配**：那六个之外的包（`schemas` / `creative-model` / `game-model` / `video-model` / `world-model` /
    `mcp-server` / `apps/web`）的 `tsconfig.json` 本来就 include 了 `test/**`，通配一次会把它们也拽进来，
    而它们不在任何 `tsconfig.test.json` 里——从「解析不了」换成「文件不在项目里」，一样红，只是换个错法。
  - 把 `docs/evidence/**/*.mjs`、`tools/**`、studio 的两个配置文件并进 `scripts/`、`evals/` 那一块
    （`project: ['./tsconfig.tools.json']`），并在 `tsconfig.tools.json` 的 `include` 里补上对应路径。
  - 新增 `.mjs` 的 Node 全局块（`globals.node`）。
  - 挂上 `@next/eslint-plugin-next`，按 studio 自己那份配置的**同样 21 条、同样严重度**交给 `apps/studio/**`：
    studio 源码里那条 `eslint-disable-next-line @next/next/no-img-element` 在根配置下原本是「规则未找到」而报错；
    挂上之后两个门看同一件事，而不是一个看得到、另一个看不见。
- 根 `package.json`：`"eslint": "node --max-old-space-size=10240 node_modules/eslint/bin/eslint.js ."`
  （直接走 node 而不是设环境变量，Windows 与 POSIX 都不挑 shell）；新增显式依赖 `globals`（此前只是传递依赖，
  而 `eslint.config.mjs` 现在直接 import 它）。

### 代码层：规则改出来的真 bug（这些不是「为了绿而绿」）

- **`updateAgentConfig` 是空壳**（`packages/world-engine/src/worldEngine.ts`）：收了 `config` 什么都不做，body 里
  只有一句「Would need to expose config update in CharacterAgent」。**一个承诺了改变却什么都不改的方法就是假
  API**（§159）。改为在 `CharacterAgent` 上开一道真门 `updateConfig`（合并而非替换），引擎调它。
- **`onEnd(async (e) => …)` 会挂死**（`agents/exec-host/src/{execHost,containerExec}.ts`）：`onEnd` 的监听器
  类型是 `(end) => void`，返回值被**丢弃**。监听器里抛出的异常会变成一次无主的 rejection，而外层那个 promise
  将永远不落定。改为**同步监听器 + 收尾挂在 promise 链上**（`void cleanupSettled.then(() => settle(e))`）——
  收尾等的那件事一件没少，而监听器不再是那个把异常扔掉没人管的东西。
- **RAG 的查询向量算了却不用**（`packages/world-engine/src/rag.ts`）：`qVector` / `qTokens` 算完就扔，打分走的是
  纯词面的 `hybridScore`——它对**每个候选**都重新 embed 一遍 query。`vectordb.ts` 里还手写了同一套规则的**另一份
  实现**。现在规则只有一份：`agents/runtime/src/embedding.ts` 的 `hybridScoreFrom`，`hybridScore` 自己委托给它，
  `rag.ts` 与 `vectordb.ts` 都走它。**打分结果一字未变**（既有测试逐位比对过），只是不再重复算。
- **`ToolImpl = (args) => unknown | Promise<unknown>`**（`agents/runtime/src/registry.ts`）：`unknown` 吸收并集的
  其它成员，所以 `| Promise<unknown>` 什么都没说，只是读起来像「Promise 被排除了」。改为 `unknown` 本身。
- **`String(args.prefix)` 会印出 "[object Object]"**（agent-runtime 的五处）：工具参数在类型上是 `unknown`，
  而注册表在门口就按 `ToolArgSpec` 拒绝了类型不符的参数。新增 `agents/runtime/src/args.ts` 的 `stringArg` /
  `stringArrayArg`——**一条规则一处实现**，读出来的是字符串，不是 `[object Object]`。
- **`validateDocument` 把 `parentId` 字符串化**（`packages/design-model/src/validate.ts`）：这份校验收的是类型系统
  之外的字节，`root.parentId` 是 `unknown`，`String()` 它只会印出 `[object Object]`。改为报它的类型，是字符串
  就把字符串说出来。
- **`vitest.config.ts` 里有一个零宽空格**（U+200B）：它让注释里那个 glob `packages/*/test` 是**错的**。
  已清除，并附了一个全仓隐藏字符扫描器（U+200B / U+200C / U+200D / U+2060 / U+FEFF / U+00A0 等）。
  **而清掉它之后，文件解析不出来了**——这才是有意思的地方：那个 glob 里的 `*/` 会**提前关闭块注释**，
  于是注释的其余部分被当成代码（一个没闭合的字符串字面量）。那个零宽空格一直挡在 `*` 和 `/` 之间，
  替这条注释挡了灾，也把原因藏给了所有读它的人。现在 glob 写成 `<pkg>`，原因写在注释里。
- **`kill: c.kill` 把 `this` 丢了**（agents/exec-host/test/execHost.test.ts）：`kill()` 里用 `this.killed` 和
  `this.emitEnd(...)`，而它被摘成 `c.kill` 塞进包装对象——包装对象上没有 `emitEnd`。改为
  `kill: () => c.kill()`：this 留在那个 FakeChild 上。unbound-method 抓到的正是这一类。
- **provider 接口声明 `this: void`**（packages/ai-providers/src/types.ts）：四个 provider 方法的实现
  （providers.ts 里零 `this.`）本来就不依赖 this，写明之后调用方才能把其中一个函数交给别的东西
  （mock 的 `expect(...).not.toHaveBeenCalled()`）而不必担心 this 悄悄变了。

## 后果与证据

- `npm run eslint`：从**跑不起来**（配置加载即崩）到 **0 错误**。
- 整仓 type-aware lint 需要超过默认堆，所以脚本把堆上限写死成 10 GB；本机（16 GB / 空闲约 4 GB）跑得完。
- `npm run typecheck`：14/14 通过。
- 受影响的包测试：agent-runtime 658、three-runtime 635、exec-host 358、design-model 169、world-engine 109、
  ai-providers 95、studio 2857 —— 全绿。
- 定��豁免只有四处，每一处都写明为什么：ANSI 转义序列必须匹配 ESC（`no-control-regex` 表达不了）、
  证明脚本要 `new Function` 求值（`no-implied-eval`）、跨闭包改写的循环标志（`no-unmodified-loop-condition`，
  仓库对测试桩早就承认过这个误报）、以及一条**测试的主题就是**「宿主抛出不是 Error 的东西」。
