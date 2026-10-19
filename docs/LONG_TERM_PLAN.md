# NEXUS 长期开发制作计划（持续执行，不停）

> 一句话原则：每个增量都有可运行的检查（unit test / headless proof / real-browser harness），每个提交只改自己负责的文件并**按名字逐个 stage**（`git add <path>`，绝不用 `git add -A`——见 v263 的 landing note：一个并行的 lane 就是这样把别人的 12 个文件卷进了自己的 commit），ledger 与代码分开记录。ADR 0018 未合并前，绝不碰服务端账号/会话/令牌，绝不出现 `signedIn` 徽章。

## 总览（2026-10-20）

| 阶段 | 内容 | 状态 | 下一可立即执行项 |
|------|------|------|------------------|
| M1 核心 | Design Model / Canvas / 编辑器 | ✅ 完成 | — |
| M2 Agent | `@nexus/agent-runtime`（v0–v14+） | ✅ 完成 | — |
| M3 Assets / M4 World / M5 3D | 多模态、世界引擎、Three 运行时 | ✅ 完成 | — |
| M6 Ops | build arc → deploy arc → dock 部署面 | ✅ 完成（v178） | — |
| **M7 社区** | publish / remix / explore / 账号 / **所有权** | 🟡 进行中 | 见下表 |
| M8 / M9 / M10 | 创作者经济 / Ops / 外部 agent | 🟡 客户端模型已落地，服务端未接线 | 订阅购买、举报提交、agent 令牌 |

### M7 账号与所有权（本次会话的重点）

| 步骤 | 内容 | 状态 |
|------|------|------|
| v259 | **账号面板**：会话动词（register / rename / signOut / current）落地，工具栏 👤 挂载 | ✅ 落地 |
| v262 | `_lineage` 读取收敛为**一个**受保护 reader，关闭 studio `tsc` 红（14 errors → 0） | ✅ 落地 |
| v261 | **场景座位成为控件**：所有写操作跟随屏幕上的世界 | ✅ 落地 |
| v263 | **账号即 claim**：publish 带上本机 claim；**claim 的 instant 按客户端单位读** | ✅ 落地 |
| v264 | **账号面板的 real-browser harness**（关闭 "只有类型检查，没有 DOM 验证" 这条自陈的 bound） | ✅ 落地（14/14） |
| v265+ | remix 后的发布也带 claim；`/explore` 与 `/p/{id}` 的 byline 端到端复核 | ⏳ |

### 下一批（按优先级）

1. **v265 — remix 后的发布也带 claim**：remix 读回别人的发布并 fork，fork 之后重新发布必须以**本机账号**署名，
   并且不能覆盖来源的 id。端到端用 publish proof 的 §10 复核。
2. **v266 — M8 客户端模型的第一个消费者**：`monetization.ts` 的订阅/打赏目前只有纯函数没有界面；
   `ops.ts` 的审计条目与 `agentGrant.ts` 的外部 agent 授权同样只有模型。
3. **v267 — M9 观测面**：`observability.ts` + `.nexus/deployments.jsonl` 目前只有 dock 内部消费者，
   没有一个"人看得到"的观测面板。
4. **v268 — Stage B/C 的服务端接线**（仍被 ADR 0018 阻塞：没有服务端账号、会话与令牌之前不做）。

## 本次会话已落地的增量

| 版本 | 内容 | 关键测量 |
|------|------|----------|
| v259 | 账号面板 + 会话缝 | `accountSession.test.ts` 13/13；studio 817/817；`tsc` 0 |
| v262 | `_lineage` 单一 reader | `tsc` 14 errors → 0；`lineage.test.ts` 7/7；studio 817/817 |
| v261 | 场景座位成为控件 | `scene3d.test.ts` 125→138；`surface.test.ts` 21→24；`scene-surface-proof` exit 0 |
| v263 | 账号即 claim + instant 单位修复 | 服务端 **43/43**；publish proof 新 §10 exit 0；studio 801/801 |
| v264 | 账号面板的 real-browser harness | **14/14** 断言，0 console error |
| gate | 碰撞普查读**它被递给的那本 ledger** | doc gate exit 0；"numbers GRANTED TWICE: none" |
| build | nexus-api 钉住编译器插件与 release 25 | 服务端 **43/43**，BUILD SUCCESS |

## 已知的诚实边界（§60）

- 服务端**只记录 claim，不验证 claim**：`unsigned-local` 是它唯一接受的 assurance，它**不检查账号是否存在**，
  任何能调用 API 的人都可以伪造一份 claim（ADR 0018）。
- claim 是**所有者，不是身份**：它决定"谁能下架这篇"和"这篇署名是谁"，它**不认证任何人**。
- 没有账号的设备**匿名发布**，且只能下架**无主**的发布（pre-v242 规则，v263 已重新测量）。
- 账号是**每浏览器**的：同一个人用两台机器就是两个账号、两个所有者。
- v264 证明的是**客户端一半**：面板写记录、显示 handle 与 assurance、保留 device seed、不给第二个账号。
  "claim 真的到了服务端"是 publish proof 的 §10 证明的（v263）。

## 执行节奏（不停）

1. 选一个**未受 ADR 0018 阻塞**的增量，**先测量再动手**（v263 的 instant 缺陷就是这么找到的）。
2. 写测试 → `tsc --noEmit` 0 错误 → 相关套件全绿 → 完整回归 → 跑 headless proof / real-browser harness。
3. **按名字 stage**（`git add <path>`），绝不 `git add -A`；docs 与代码分开提交；ledger 记录落点。
4. 每个提交带 `feat(stage X):` / `fix(stage X):` / `prep(stage X):` 前缀，`--no-verify`。

## 验收标准（每次提交前）

- [ ] `tsc --noEmit`（apps/studio）= 0 错误（并发 lane 的在途文件除外，且要在记录里写明）。
- [ ] `npx vitest run --root apps/studio --no-file-parallelism` 全文件全绿（当前基线 816/816，44 文件）。
- [ ] 受影响包的服务端 / headless / real-browser 检查全绿。
- [ ] `git status` 只包含本增量所属文件（**按名字 stage**）。
- [ ] ADR 0016 ledger 有对应 amendment，且数字唯一（门禁会报 "numbers GRANTED TWICE"）。
