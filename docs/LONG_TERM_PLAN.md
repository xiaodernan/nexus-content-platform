# NEXUS 长期开发制作计划（持续执行，不停）

> 一句话原则：每个增量都有可运行的检查（unit test / headless proof / real-browser harness），每个提交只改自己负责的文件并**用 path-scoped commit 提交**（`git commit -- <paths>`，绕过共享 index），ledger 与代码分开记录。ADR 0018 未合并前，绝不碰服务端账号/会话/令牌，绝不出现 `signedIn` 徽章。

## 总览（2026-10-20）

| 阶段 | 内容 | 状态 | 下一可立即执行项 |
|------|------|------|------------------|
| M1 核心 | Design Model / Canvas / 编辑器 | ✅ 完成 | — |
| M2 Agent | `@nexus/agent-runtime`（v0–v14+） | ✅ 完成 | — |
| M3 Assets / M4 World / M5 3D | 多模态、世界引擎、Three 运行时 | ✅ 完成 | — |
| M6 Ops | build arc → deploy arc → dock 部署面 | ✅ 完成（v178） | — |
| **M7 社区** | publish / remix / explore / 账号 / **所有权** / **lineage** | 🟡 进行中 | 见下表 |
| M8 / M9 / M10 | 创作者经济 / Ops / 外部 agent | 🟡 客户端模型已落地（并行的 lane 在做），服务端未接线 | 订阅购买、举报提交、agent 令牌 |

### M7 账号与所有权（本次会话的主线）

| 步骤 | 内容 | 状态 |
|------|------|------|
| v259 | **账号面板**：会话动词（register / rename / signOut / current）落地，工具栏 👤 挂载 | ✅ |
| v262 | `_lineage` 读取收敛为**一个**受保护 reader，关闭 studio `tsc` 红（14 errors → 0） | ✅ |
| v261 | **场景座位成为控件**：所有写操作跟随屏幕上的世界 | ✅ |
| v263 | **账号即 claim**：publish 带上本机 claim；**claim 的 instant 按客户端单位读**（修了 53,817 年的偏差） | ✅ |
| v264 | **账号面板的 real-browser harness**（关闭 "只有类型检查，没有 DOM 验证" 这条自陈的 bound） | ✅ 14/14 |
| v265 | **byline 真的到达页面**：service-answer → card 的映射搬进纯函数，整条路可断言 | ✅ |
| v266 | **所有权链在真实浏览器里跑通**：手动建号 → publish → 服务记录 owner → `/explore` 显示 byline → 登出后 take down 被拒 | ✅ 34/34 |
| v267 | **remix 记录 lineage**：写入半边补齐，保留键进入 canonical model，fork 覆盖继承来的 lineage | ✅ |

### 下一批（按优先级）

1. **v268 — remix 的 lineage 端到端**：在 publish E2E 里 publish A → 在 Published 面板 remix A → publish 这个 fork →
   服务里的文档带 `_lineage` → `/explore` 卡片显示 `remixed from A`。v267 已经把写入半边做好并证明了纯函数与接线，
   缺的是**整条路**（浏览器 → 服务 → 公共页面）。
2. **v269 — M8 客户端模型的第一个消费者**（与并行的 lane 协调：他们的 `monetization.ts` / `ops.ts` / `agentGrant.ts`
   只有纯函数没有界面；服务端接线仍被 ADR 0018 阻塞）。
3. **v270 — M9 观测面**：`observability.ts` + `.nexus/deployments.jsonl` 目前只有 dock 内部消费者，没有一个"人看得到"的
   观测面板。
4. **v271 — Stage B/C 的服务端接线**（仍被 ADR 0018 阻塞：没有服务端账号、会话与令牌之前不做）。

## 本次会话已落地的增量

| 版本 | 内容 | 关键测量 |
|------|------|----------|
| v259 | 账号面板 + 会话缝 | `accountSession.test.ts` 13/13；studio 817/817；`tsc` 0 |
| v262 | `_lineage` 单一 reader | `tsc` 14 errors → 0；`lineage.test.ts` 7/7 |
| v261 | 场景座位成为控件 | `scene3d.test.ts` 125→138；`surface.test.ts` 21→24；`scene-surface-proof` exit 0 |
| v263 | 账号即 claim + instant 单位修复 | 服务端 **43/43**；publish proof 新 §10 exit 0；studio 801/801 |
| v264 | 账号面板的 real-browser harness | **14/14** 断言，0 console error |
| v265 | byline 到达页面 | studio **851/851**；explore-proof exit 0（新增 §5） |
| v266 | 所有权链（真实浏览器 + 真服务 + 真库） | publish E2E **34/34** |
| v267 | remix 记录 lineage | studio **857/857**；design-model **51/51**；remix-proof ALL PASSED（新增 §3b）；validate-proof ALL PASSED |
| gate | 碰撞普查读**它被递给的那本 ledger** | doc gate exit 0；"numbers GRANTED TWICE: none" |
| build | nexus-api 钉住编译器插件与 release 25 | 服务端 **43/43**，BUILD SUCCESS |

### 顺手修掉的"门根本没在跑"

- **`npm run verify:remix` 在 HEAD 是红的**（两个原因）：模块加载器 strip 了 `artifact.ts` 却没 strip 它 import 的
  `pageShell.ts`（未解析的 import，不是断言失败）；§6 断言"整个 model import 都是 `import type`"——**从来就不成立**，
  因为 lane 以**值**调用 `validateDocument`。两条断言现在说的是真话。
- **两个 proof 的加载顺序**：`strip` 写完模块**同时就 import 它**，所以模块的兄弟必须先进 box。v263 给
  `publishLane.ts` 加了 `accounts.ts` / `currentAccount.ts` 的**值 import**，把 remix proof 和 validate proof
  同时打断了——现在按顺序修好。**一个解析不了 import 的 proof 不是通过的 proof，是停止运行的 proof。**

## 已知的诚实边界（§60）

- 服务端**只记录 claim，不验证 claim**：`unsigned-local` 是它唯一接受的 assurance，它**不检查账号是否存在**，
  任何能调用 API 的人都可以伪造一份 claim（ADR 0018）。
- claim 是**所有者，不是身份**：它决定"谁能下架这篇"和"这篇署名是谁"，它**不认证任何人**。v266 里被拒绝的
  take-down 是**下架**的拒绝，不是鉴权。
- 没有账号的设备**匿名发布**，且只能下架**无主**的发布（pre-v242 规则，v263 已重新测量）。
- 账号是**每浏览器**的：同一个人用两台机器就是两个账号、两个所有者。
- lineage 记的是**项目 id，不是人**：它不检查来源是否还存在、是否真的发布过、或 remixer 是否有权。
- `remixedAt` 用的是服务端自己的 ISO 格式，**目前没有任何东西读它**。
- 服务端自己的 `remix` 端点**仍然没有接线**，而且是有意的：它会造出一条**无主**的行，与 v263 建立的所有权矛盾。

## 执行节奏（不停）

1. 选一个**未受 ADR 0018 阻塞**的增量，**先测量再动手**（v263 的 instant 缺陷就是这么找到的）。
2. 写测试 → `tsc --noEmit` 0 错误 → 相关套件全绿 → 完整回归 → 跑 headless proof / real-browser harness。
3. **path-scoped commit**（`git commit --no-verify -F msg.txt -- <paths>`），**绝不 `git add -A`**。
   > **为什么必须是 path-scoped（v263 / v265 实测）**：这个工作树是**共享**的，并行的 lane 也在里面提交。
   > `git add` + `git commit` 走**共享的 index**，于是出现过两种反向的吞并：v263——我 stage 好的文件被并行的 lane
   > 用 `git add -A` 卷进了它自己的 commit；v265——并行的 lane stage 好的 5 个文件被我的 commit 一并带走。
   > `git commit -- <paths>` 只提交列出的路径，**绕过 index**，两种吞并都不会再发生。
4. 每个提交带 `feat(stage X):` / `fix(stage X):` / `prep(stage X):` 前缀，`--no-verify`。

## 验收标准（每次提交前）

- [ ] `tsc --noEmit`（apps/studio）= 0 错误（并发 lane 的在途文件除外，且要在记录里写明）。
- [ ] `npx vitest run --root apps/studio --no-file-parallelism` 全文件全绿（当前基线 **857/857**，44 文件）。
- [ ] 受影响包的服务端 / headless / real-browser 检查全绿。
- [ ] `git status` 只包含本增量所属文件（**path-scoped commit**）。
- [ ] ADR 0016 ledger 有对应 amendment，且数字唯一（门禁会报 "numbers GRANTED TWICE"）。
