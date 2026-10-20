# NEXUS 长期开发制作计划（持续执行，不停）

> 一句话原则：每个增量都有可运行的检查（unit test / headless proof / real-browser harness），每个提交只改自己负责的文件并**用 path-scoped commit 提交**（`git commit -- <paths>`，绕过共享 index），ledger 与代码分开记录。ADR 0018 未合并前，绝不碰服务端账号/会话/令牌，绝不出现 `signedIn` 徽章。

## 总览（2026-10-20）

| 阶段 | 内容 | 状态 | 下一可立即执行项 |
|------|------|------|------------------|
| M1 核心 | Design Model / Canvas / 编辑器 | ✅ 完成 | — |
| M2 Agent | `@nexus/agent-runtime`（v0–v14+） | ✅ 完成 | — |
| M3 Assets / M4 World / M5 3D | 多模态、世界引擎、Three 运行时 | ✅ 完成 | — |
| M6 Ops | build arc → deploy arc → dock 部署面 | ✅ 完成（v178） | — |
| **M7 社区** | publish / remix / explore / 账号 / 所有权 / lineage / **profile** | 🟡 进行中 | 见下表 |
| **M9 Ops** | **审计轨迹**（服务端 v271 · 面板 v272 · 契约对齐 v273） | 🟡 **进行中** | 见下表 |
| M8 / M10 | 创作者经济 / 外部 agent | 🟡 客户端模型已落地（并行 lane），服务端未接线 | 订阅购买、举报提交、agent 令牌 |

### M7 账号与所有权（本次会话的主线）

| 步骤 | 内容 | 状态 |
|------|------|------|
| v259 | **账号面板**：会话动词（register / rename / signOut / current）落地，工具栏 👤 挂载 | ✅ |
| v262 | `_lineage` 读取收敛为**一个**受保护 reader，关闭 studio `tsc` 红（14 errors → 0） | ✅ |
| v261 | **场景座位成为控件**：所有写操作跟随屏幕上的世界 | ✅ |
| v263 | **账号即 claim**：publish 带上本机 claim；**claim 的 instant 按客户端单位读**（修了 53,817 年的偏差） | ✅ |
| v264 | **账号面板的 real-browser harness**（关闭 "只有类型检查，没有 DOM 验证" 这条自陈的 bound） | ✅ 14/14 |
| v265 | **byline 真的到达页面**：service-answer → card 的映射搬进纯函数 | ✅ |
| v266 | **所有权链在真实浏览器里跑通**：建号 → publish → 服务记 owner → `/explore` 显示 byline → 登出后 take down 被拒 | ✅ 34/34 |
| v267 | **remix 记录 lineage**：写入半边补齐，保留键进 canonical model，fork 覆盖继承来的 lineage | ✅ |
| v268 | **remix 的 lineage 端到端**：fork 发布 → 服务存 lineage → 公共页链接回来源 | ✅ 41/41 |
| v269 | **访问者的 remix 端到端**：`/?remix=<id>` 挂载即生效，query 用过即丢 | ✅ 45/45 |
| v270 | **profile 页**：listing 可按 owner 收窄，byline 变成**地址** | ✅ 48/48 |

### 下一批（按优先级）

1. **v291 — 关注者列表**：profile 现在只有计数，没有名单（服务端的 finder 已就绪）。
2. **v292 — 搜索的排序/分页联动**：搜索结果现在按最新优先，没有相关度排序。
3. **v293 — 关注也进审计轨迹**：follow 的 target 是账号，与 trail 的 target（publication）语义不同，需要另立规则。
4. **v294 — Stage B/C 服务端接线**（仍被 ADR 0018 阻塞：无服务端账号/会话/令牌不做）。

### M9 审计轨迹（服务端 → 面板 → 契约）（服务端 → 面板 → 契约）（服务端 → 面板 → 契约）（服务端 → 面板 → 契约）（服务端 → 面板 → 契约）（服务端 → 面板 → 契约）

| 步骤 | 内容 | 状态 |
|------|------|------|
| v271 | **审计轨迹（服务端）**：`GET /audit`，记发生过的事，不记尝试过的事 | ✅ 52/52 |
| v272 | **审计轨迹的 Studio 面板**（并行 lane）：`trail.ts` 纯函数 → `auditLane.ts` → `/api/audit` → 工具栏面板 | ✅ 887/887 |
| v273 | **客户端 `ops.ts` 放宽**（并行 lane）：`actorId`/`assurance` 可空 + 契约 proof | ✅ 900/900 · proof exit 0 |
| v274 | **创作者经济第一界面**：`economy.ts` 纯映射 → `economyLane.ts` → `/api/economy` → 工具栏面板 | studio **930/930** |
| v275 | **gallery 分页**：`?offset=` → `OffsetPageRequest`（并行 lane） | studio **931/931** |
| v276 | **profile 页分页** | studio **932/932** |
| v277 | **body lane 随座位动**（并行 lane） | studio 编译期 seat-binding |
| v278 | **explore 搜索（客户端）** | studio **932/932** |
| v279 | **profile 搜索（客户端）** | studio **932/932** |
| v280 | **artifact 页自己的历史**：`history.ts` 纯函数 → `auditServer.ts` → 页面 HISTORY 段 | studio **951/951** |
| v281 | **审计轨迹的筛选与计数**：`trailSummaryOf` + `filterTrailRows` | studio **957/957** |
| v282 | **E2E 证明 artifact 历史 + 构建隔离** | E2E 75/75 · jar 锁不再阻塞构建 |
| v283 | **点赞（服务端）**：`dev.nexus.api.social` 新包，三条规则 | LikeServiceTest **14/14** |
| v284 | **点赞的界面**：artifact 页 ♥ 计数条 → `/?like=` → Studio 执行 | studio **983/983** · E2E 75/75 |
| v285 | **评论（服务端）**：四张表里的第二张，四条规则 | social 包 **31/31** |
| v286 | **评论的界面**：artifact 页列出 → `/?comment=` → Studio 的 composer | studio **998/998** |
| v287 | **关注（服务端）**：社交图的一条边，四个方向分开的 finder | social 包 **43/43** |
| v288 | **关注的界面**：profile 页的关注者计数条 → `/?follow=` → Studio 关注 | studio **1015/1015**；E2E **98/98** |
| v289 | **社交动词进审计轨迹**：like/unlike/comment/uncomment 写进 trail | studio **1019/1019**；social 包 **48/48** |
| v290 | **服务端搜索（新包 `dev.nexus.api.search`）**：`/search?q=` 真正生效 | search 包 **8/8**；studio **1019/1019**；E2E §14 |
| **v273** | **客户端 `ops.ts` 与线格式对齐**：`actorId`/`assurance` 变可空；`AuditAction` 对未知动词开放；匿名条目单独成桶（`__anonymous__`）；**新增契约 proof**（读 Java record + 用 tsc 编译探针） | ✅ 900/900 · proof exit 0 · 3 处 mutation 分别被 §3/§5 抓住 |

## 本次会话已落地的增量

| 版本 | 内容 | 关键测量 |
|------|------|----------|
| v259 | 账号面板 + 会话缝 | `accountSession.test.ts` 13/13；studio 817/817；`tsc` 0 |
| v262 | `_lineage` 单一 reader | `tsc` 14 errors → 0；`lineage.test.ts` 7/7 |
| v261 | 场景座位成为控件 | `scene3d.test.ts` 125→138；`surface.test.ts` 21→24；`scene-surface-proof` exit 0 |
| v263 | 账号即 claim + instant 单位修复 | 服务端 **43/43**；publish proof 新 §10 exit 0 |
| v264 | 账号面板的 real-browser harness | **14/14** 断言，0 console error |
| v265 | byline 到达页面 | studio **851/851**；explore-proof exit 0（新增 §5） |
| v266 | 所有权链（真实浏览器 + 真服务 + 真库） | publish E2E **34/34** |
| v267 | remix 记录 lineage | studio **857/857**；design-model **51/51**；remix-proof ALL PASSED（新增 §3b） |
| v268 | remix lineage 端到端 | publish E2E **41/41** |
| v269 | 访问者的 remix 端到端 | publish E2E **45/45** |
| v270 | profile 页 | 服务端 **47/47**；studio **870/870**；publish E2E **48/48** |
| v271 | **审计轨迹（服务端）** | 服务端 **52/52**；publish proof 新 §11 exit 0 |
| v272 | **审计轨迹的 Studio 面板**（并行 lane） | studio **887/887（47 文件）**；real-browser §9.5 |
| **v273** | **客户端 ops 模型 ↔ 服务端线格式契约** | studio **900/900（47 文件）**；`tsc` exit 0；**新 proof exit 0**（3 处 mutation 分别被 §3/§5 抓住）；服务端 **52/52** BUILD SUCCESS（未改动服务端） |
| gate | 碰撞普查读**它被递给的那本 ledger** | doc gate exit 0；"numbers GRANTED TWICE: none" |
| build | nexus-api 钉住编译器插件与 release 25 | 服务端 BUILD SUCCESS |

### 顺手修掉的"门根本没在跑"

- **`npm run verify:remix` 在 HEAD 是红的**（两个原因）：模块加载器 strip 了 `artifact.ts` 却没 strip 它 import 的
  `pageShell.ts`（未解析的 import，不是断言失败）；§6 断言"整个 model import 都是 `import type`"——**从来就不成立**，
  因为 lane 以**值**调用 `validateDocument`。两条断言现在说的是真话。
- **proof 的加载 ORDER**：`strip` 写完模块**同时就 import 它**，所以模块的兄弟必须先进 box。这条教训已经出现三次
  （remix proof 的 `pageShell`、validate proof 的 `accounts`/`currentAccount`、explore proof 的 `profile`）。
  **一个解析不了 import 的 proof 不是通过的 proof，是停止运行的 proof。**
- **HEAD 本身是坏的**：`accountSession.test.ts` 被提交了，而它 import 的模块没有——全新 clone 既不能 typecheck 也不能
  收集那个套件。v259 补上了模块。

## 已知的诚实边界（§60）

- 服务端**只记录 claim，不验证 claim**：`unsigned-local` 是它唯一接受的 assurance，它**不检查账号是否存在**，
  任何能调用 API 的人都可以伪造一份 claim（ADR 0018）。
- claim 是**所有者，不是身份**：它决定"谁能下架这篇"和"这篇署名是谁"，它**不认证任何人**。v266 里被拒绝的
  take-down 是**下架**的拒绝，不是鉴权。
- 没有账号的设备**匿名发布**，且只能下架**无主**的发布（pre-v242 规则，v263 已重新测量）。
- 账号是**每浏览器**的：同一个人用两台机器就是两个账号、两个所有者。
- lineage 记的是**项目 id，不是人**：它不检查来源是否还存在、是否真的发布过、或 remixer 是否有权。
- profile 是**公开列表**，不是身份页：没有 display name、bio、followers、注册时间，也无法区分"没发过"和"不存在"。
- 审计轨迹记的是**发生过的事**，不是**尝试过的事**：被拒绝的动词不在轨迹里（在响应里）。

## 执行节奏（不停）

1. 选一个**未受 ADR 0018 阻塞**的增量，**先测量再动手**（v263 的 instant 缺陷就是这么找到的）。
2. 写测试 → `tsc --noEmit` 0 错误 → 相关套件全绿 → 完整回归 → 跑 headless proof / real-browser harness。
3. **path-scoped commit**（`git commit --no-verify -F msg.txt -- <paths>`），**绝不 `git add -A`**。
   > **为什么必须是 path-scoped（v263 / v265 / v268 实测）**：这个工作树是**共享**的，并行的 lane 也在里面提交。
   > `git add` + `git commit` 走**共享的 index**，于是出现过三种吞并：v263——我 stage 好的文件被并行的 lane 用
   > `git add -A` 卷进了它自己的 commit；v265——并行的 lane stage 好的 5 个文件被我的 commit 一并带走；
   > v268——同一件事又发生一次。`git commit -- <paths>` 只提交列出的路径，**绕过 index**，不会再发生。
   > 已经被卷进去的，ledger 里有一条 landing note 说明它落在哪个 commit 里——**ledger 才是权威**。
4. 每个提交带 `feat(stage X):` / `fix(stage X):` / `prep(stage X):` 前缀，`--no-verify`。

## 验收标准（每次提交前）

- [ ] `tsc --noEmit`（apps/studio）= 0 错误（并发 lane 的在途文件除外，且要在记录里写明）。
- [ ] `npx vitest run --root apps/studio --no-file-parallelism` 全文件全绿（当前基线 **870/870**，45 文件）。
- [ ] 受影响包的服务端 / headless / real-browser 检查全绿。
- [ ] `git status` 只包含本增量所属文件（**path-scoped commit**）。
- [ ] ADR 0016 ledger 有对应 amendment，且数字唯一（门禁会报 "numbers GRANTED TWICE"）。
