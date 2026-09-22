# TESTING

开发闭环本身（§158/§192）：
`OBSERVE → PLAN → IMPLEMENT → RUN → TEST → SCREENSHOT → INSPECT → FIX → RETEST → COMMIT`

**没有跑过、没有看过的功能不算完成。** 类型检查与单测只证明代码正确，不证明功能可用。

## 分层

| 层 | 工具 | 范围 | 何时跑 |
| --- | --- | --- | --- |
| 单元 | Vitest | design-model 布局求解、Command 事务、token 解析、codegen IR、schema | 每次改动 |
| 契约 | Vitest + `contracts/*.schema.json` | web ↔ ai-service 报文：zod 为权威，导出 JSON Schema 供 Python 运行期校验，测试保证导出文件不漂移 | 每次改动 |
| 服务 | pytest（`apps/ai-service/tests`） | 契约校验、Model Router、provider 成功/失败/噪声、审批门、dryRun、体积上限 | ai-service 改动 |
| 集成 | Vitest + 真 Postgres(容器) | 项目 CRUD、snapshot/branch、publish、usage | 每里程碑 |
| 端到端 | Playwright | Studio 全流程竖向切片（见下 Golden Path） | 每里程碑 + 发布前 |
| 视觉 | Playwright screenshot + Visual Benchmark | 渲染快照、AI Diff 前后对比、参考图 vs 生成图 | Studio/渲染器改动 |
| Agent 评测 | `evals/` | design accuracy / code correctness / tool selection / RAG / accessibility | ai-service 改动 |

禁止 mock 数据库做集成测试（真实容器实例）；provider 在测试里用 Mock Provider，但必须显式标注 DEMO MODE 断言。

## Golden Path（M1 必须端到端通过）

```
1  打开 / （未登录）→ 输入一句 prompt → 60s 内 Canvas 出现设计（§137-138）
2  点击元素 → 右面板改 padding/color → 画布即时更新 → 刷新后仍在（§15-16）
3  拖动 + 缩放 + 框选多选 + Ctrl+Z/Ctrl+Shift+Z（§8/§148）
4  AI 命令栏："Make the hero 30% taller." → Plan 可见 → Activity 流式 → AI Diff → 一次 Ctrl+Z 全回滚（§7/§25-26/§149-151）
5  Layers 重命名/显隐/锁定/拖拽改父级
6  设计系统：改 color.primary token → 所有绑定节点更新 → Ctrl+Z 回滚（§12/§13，已覆盖）
7  Code 页 → 生成的 React 可编译；改一处代码 → 画布同步；不可映射片段标为 code-only（§19）
8  Preview iframe 只读渲染 + Mobile/Tablet/Desktop/Wide 切换无横向溢出（§14）
9  Screenshot 出图并出现在 Activity 与视觉 QA 结果里（§33/§87）
10 保存项目 → Snapshot 创建/比较/恢复 → 开分支并来回切换 → Duplicate 成新项目（§27/§28，已覆盖）
10b 生成 4 条方案 → 并排比较 → "A 的布局 + C 的视觉"合成 → 采纳才换画布（§29，已覆盖）
10c 真实 provider 生成方案方向（现在是确定性配方，UI 常驻 DEMO MODE）
11  Publish 过 Quality Gate → /n/<user>/<slug> 可访问（private/unlisted/public 语义正确，§56-57/§179）
12 导出 ZIP 含 .nexus/ 结构，能在干净实例导入还原（§102-104/§144）
```

## 质量门禁（§179，Publish 前必须全绿）

`Build` · `Tests` · `Security`（无高危审计项）· `Performance`（LCP/CLS/INP/bundle，§91）·
`Accessibility`（对比度 + 键盘 + ARIA，§90）· `Visual QA`（无回归，§33）。
任一未达标 → Publish 阻塞并列出原因，不允许静默跳过。

当前实现状态（如实）：`packages/design-model/src/health.ts` 的 `analyzeHealth()` 一次算出七行，
Studio「健康」页签、Publish 弹层与服务端 `runPublishGate()` 用的是同一个函数（§16）。
Build（`validateDocument`）· Accessibility（对比度/alt/按钮名称/点击目标）· Performance（**静态预算**：
节点数、树深、位图字节、缺尺寸图片、动效数——不是 LCP/CLS/INP 实测）· Visual QA（token 绑定、栅格、
越出画布、零尺寸）· Security（模型内可查：疑似明文凭据、code 节点危险写法、http 外链——不是漏洞扫描）。
分数线：Accessibility 80 · Performance 70 · Visual QA 60；Build 与 Security 有一条 error 即挡。
**Tests 与 AI QA 没有本地可算信号，状态是 `not-run`、显示"未评估"、不参与门禁**——
不是待补的空位，而是"这里还没被检查过"的可见表达（§159）。审核管线同样未接入
（`published_projects.moderation` 停在 `pending`）。唯一刻意放行的是切成 `private`：下架不该被挡。

回归锁在哪里：`health.test.ts` 断言七行齐全、未评估行 `score = null` 且 `gating = false`、
门槛两侧（3 条 warning 82 通过 / 4 条 76 挡住）、error 一票否决、40 条截断后 `omitted` 计数与全量扣分、
凭据发现脱敏（整份报告 JSON 里查不到原文）、localhost 不算明文外链；
`publish.integration.test.ts` 断言挡住时不写发布记录也不留快照、同一份坏文档切私有放行；
e2e 断言面板把"未运行的检查"列出来，而不是显示全绿。

## 性能测试（§146-147）

设计文档规模基准：100 / 1000 / 10000 节点。度量并记录：首帧渲染时间、pan/zoom 帧率（目标 ≥55fps）、
选中响应 <16ms、属性写入到画布更新 <50ms、内存峰值。回归即视为 bug。

## 约定

- 测试文件与被测文件同目录 `*.test.ts` / `tests/test_*.py`
- 不因"难测"跳过；难测处优先重构出纯函数（design-model 就是为此存在）
- 截图对比失败时**必须人眼看图**再决定更新基线，不允许盲目 approve
- 生成的代码要用真实编译器验证：`codegen.test.ts` 用 `ts.transpileModule` 断言零语法诊断；
  e2e 断言代码视图与画布同源（选中节点 → 高亮它对应的那一行）
- Code → Design 的双向不变量：`code-parse.test.ts` 断言 `parse(generate(page))` 零补丁零 unmapped（往返恒等），
  并逐条断言结构性改动**只报告不回写**；e2e 断言改类名 → 应用 → 画布与属性面板同步 → 一次 Ctrl+Z 全回滚
- Snapshot 的不变量（§27/§108）：恢复必须真的改到库里（e2e 恢复后 `reload()` 仍是恢复值），
  恢复前后各留一条快照，且"当前 == 目标"时不多写安全快照 —— `snapshots.integration.test.ts` 直接打真实 Postgres，
  因为 jsonb 会重排对象键顺序，任何用 `JSON.stringify` 判等的实现只有在真库里才会露出来
- Compare 的不变量（§27/§151）：`diff.test.ts` 断言同一份文档零差异、键顺序不同零差异、
  差异停在最浅的不同层、结构改动归为 added/removed/moved、超限如实截断
- Branch 的不变量（§28）：`branches.integration.test.ts` 打真实 Postgres 断言——当前分支只能由
  `projects.currentSnapshotId` 推出（每条分支各自持有 head 快照）、分支来回切换后各自的现场必须还在原分支上、
  内容没变时反复切换不堆噪音快照（切换本身仍留一条历史）、从历史快照开分支起点是那份快照、
  老项目自动补 main 并收养无主快照、同名分支在不同项目间互不影响
- Duplicate 的不变量（§27）：`duplicate.test.ts` 断言副本页面/组件全部换号而节点 id 不变，
  且 `activePageId`、`component.pageId`、变量 `refId`、交互 `target` 都指向副本而不是源项目；
  e2e 断言复制后 URL 的项目 id 真的变了（不能用 `/studio/[^/]+` 匹配，副本同样满足）、
  当前视觉方向被带走、副本只有一条 main 分支和一份初始快照、源项目不受影响
- 资产的不变量（§38/§80/§182）：`image-safety.test.ts` 用手搓的合法容器断言——只认 magic bytes（扩展名/Content-Type 不算数）、
  四种格式的 EXIF/XMP/IPTC/注释段都被剥掉且**剥完仍能读出原宽高**（WebP 还要断言 RIFF 声明长度被重写对）、
  截断的 PNG 宁可抛错也不存坏图；`assets.integration.test.ts` 打真库+独占临时存储目录，断言识别→剥离→落库、
  非位图被拒、同项目重复上传复用同一行、作者能取非作者返回 null、公开取字节要"发布行 + 钉住快照确实引用"两条都满足、
  删本人成功删他人拒绝、`copyProjectAssets` 让副本各持自己的行与字节（删源不影响副本）；
  `remapAssetIds`（`duplicate.test.ts`）断言清单与 paint 引用一起换号且不动源文档。
  e2e 守的是投影同源：上传后画布节点的计算样式里有真实资产 URL、面板缩略图 `naturalWidth>0`
  （证明**剥离后的字节真能被浏览器解码**，而不是只挂了个 URL）、一次上传撤销后图片层与清单条目一起消失、
  预览路由看到同一份投影
- 认证的不变量（§137/§80）：`password.test.ts` 断言哈希非明文且带 `$2` 前缀、正确/错误口令、同口令两次哈希不同（有盐）、
  过短口令拒绝、stored 为 null 也返回 false（游客/未注册走这条路）；`rateLimit.test.ts` 用假时钟断言窗口内放行到上限、
  **被挡下的请求不计入窗口**（否则限流会加速自锁）、窗口滑过后名额放出、不同桶键互不影响；
  `auth.integration.test.ts` 打真实 Postgres 断言注册**就地升级**（同一 user id 换成真实账号、名下项目 ownerId 不动从而被认领、
  写 claimed_at、口令存哈希不存明文）、提权时**旧会话 token 被吊销 + 换发新 token**（防会话固定）、邮箱唯一索引拒重复注册且不写坏已存在账号、
  口令错误与邮箱不存在返回同一 `invalid_credentials`（不泄露是否存在）；
  e2e 守用户可见结果：游客建项目 → 注册后项目仍在名下且回执显示"已认领 1" → 登出落到全新游客（项目列表清空）→
  重新登录同一邮箱项目找回
- 多方案的不变量（§29）：`concepts.test.ts` 断言两个轴各自搬得动——视觉语言只改 token 不碰节点、
  结构方向只改节点不碰 token、同一份输入两次生成得到同一组方向（没有随机数）、每条方案仍是合法文档；
  `variants.integration.test.ts` 打真实 Postgres 断言生成与合成**不推进工作区指针**、
  重复生成自动加序号不撞名、合成结果的结构等于布局来源而配色等于视觉来源、来源不存在时如实拒绝
- 比较板上的卡是投影不是图片：e2e 断言每张卡里能查到 `[data-node-id]`，
  并且"采纳才换画布"（生成后画布仍是 8 个节点，切到左右分栏那条才变 11 个）
- 打真库的用例共用一个 Postgres，整套并行时一条往返会排在别人的连接后面，
  所以 `vitest.config.ts` 把 `testTimeout` 提到 30s（默认 5s 会把这种排队误报成超时失败）
- 发布的不变量（§56/§57）：`publish.integration.test.ts` 打真实 Postgres 断言——公开 URL 锁的是
  发布那一刻的快照（改完工作区再解析仍是旧内容）、重新发布就地换版本不多出一行、
  private 的 URL 对任何人都不通、取消发布立刻解析不到而历史快照留着、门禁挡住时既不写发布记录也不留快照；
  e2e 用第二个标签页验证"访客看到的"和"作者改的"是两回事，并断言面板把"未运行的门禁"列出来
- 设计系统的不变量（§12/§13）：e2e 断言"改一个 token，绑定它的节点全线跟随"（取计算样式而不是看 DOM 属性）、
  改 token 与改节点一样在撤销栈里（Ctrl+Z 后按钮回到原色）、引用计数按花括号绑定统计
  （按裸 key 数会满屏"未使用"，而画布明明在用）、内置 token 不可删、自定义 token 只在 0 引用时可删、
  新增的 token 刷新后仍在库里
- 每个里程碑一次 commit 前至少跑：`npm run lint && npm test && npm run test:e2e:smoke`- 改了 `packages/schemas` 必须重跑 `npm run contract:export`，否则契约漂移测试会红
- 动了 ai-service 再加：`npm run test:ai-service`（Windows 控制台建议前置 `PYTHONUTF8=1`）
