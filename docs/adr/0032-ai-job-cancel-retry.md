# ADR-0032 §162 取消与重试：队列先受理、账本后 CAS；重试开新行

日期：2026-10-09 · 状态：已采纳（同日落地，`ai-jobs.integration.test.ts` 41 条 + e2e `@smoke §162` 钉着）

## 背景

异步作业（§162）落完审批门（ADR 之前的 §162 × §74 那一片）之后，缺两件用户等一件事时最常要的：

1. **取消**：提交之后发现 prompt 写错了。作业在队列里，任务行在账本里，两边是两个真值源——
   取消要说清楚"哪一边停了、哪一边记了"。
2. **重试**：作业失败/被取消之后想再来一次。`agent_tasks.attempt` 这一列从 0000 建库起
   就没有第二个写入方，"第几次"在表里永远是 1。

DEMO MODE 这一侧还叠着一个洞：`demo_job_` 前缀的作业活在 web 进程内存里，
2026-10-09 之前的观察一律去问 ai-service → 404 → 任务行被错落成 failed（或没 URL 时永远 running）。
取消/重试接上去之前，这个洞必须先补（真值在哪个进程，观察就该问哪个进程）。

## 选项

**取消的语义：**

- A. 取消 = 直接把任务行写成 `cancelled`，不碰队列。
  简单，但 worker 还在跑、算力照花，结果回来之后两边对不上——而且"行说了算"违背
  "队列才是作业还跑不跑的真值"。
- B. 取消 = 先让队列受理（排队中的当场落账，运行中的立 `cancelRequested` 标志、
  worker 在检查点丢弃结果），成功之后再 CAS 任务行。
  两条真值各记各的，200 的含义是**受理**而不是**已停止**（jobStatus 可能仍是 running）。
- C. 取消 = 两阶段事务（先两边各写 pending，再两阶段提交）。
  web 的账本与内存/ai-service 的队列没有共同事务管理器，做出来是假的分布式事务。

**重试的形态：**

- A. 原行原地重置（status 回 running、attempt+1）。
  历史没了——"第一次为什么失败"从表里消失，违反"账本是如实记录"。
- B. 开新行：`attempt = prev.attempt + 1`、`input.retryOf = 上一行`、
  `input.request = 客户端带来的原始 AiRequest`（服务端把 `context.document` 防御性剥掉，
  §68——文档从来只在服务端装配，不许客户端塞回来）。旧行一个字不动。

## 决定

**取消（B）：**

- 入口 `POST /api/ai/jobs/<jobId>/cancel`（csrf + 限速 30/10min），语义与 ai-service
  的 `POST /v1/ai/jobs/<id>/cancel` 同口径：
  - 404：不是自己的/查不到；409：行已终态、等审批、队列那侧已终态、行刚好被别的路径改了；
  - 503：队列问不到——**账本行一个字不动**（不能先把行说成取消、结果却可能还会完成）；
  - 200：受理。`jobStatus` 照实带回来（running 只表示标志立住了，检查点落账前它仍是 running）。
  - 幂等：行已经 cancelled 再点一次也回 200（"这一行刚刚已经被取消了"）。
- 顺序是**队列先、账本后**：标志没立上就先写行的话，worker 照样把结果生出来，
  那时行是 cancelled、结果却已经花了算力。反过来（先成功后 CAS）CAS 没赶上就照实说
  "这一行刚刚已经落成 X，这次取消没有改动"，不覆盖。
- 用户主动取消**不发通知、不扣点**；审计记 `ai.job.cancel`（`AuditInput.action` 本就是自由串，
  不需要新开枚举）。
- DEMO 队列同语义：`queued` → 当场 `markCancelled`（worker 的 claim 只认 queued，自然跳过）；
  `running` → 立标志，worker 在三个检查点（领取后、生成前、结果落地前）看见就丢弃结果——
  已经算出来的补丁也按取消丢弃，`response` 永远是 null。
- 观察那条路补上 cancelled 分支：队列报 cancelled 而行还在 running → `cancelTask` 落账
  （正常路径下取消路由已经先写了，走到这儿是 CAS 没赶上或取消不是从这儿发起的），不谎报成 failed。

**重试（B）：**

- 入口 `POST /api/ai/tasks/<taskId>/retry`（csrf + 限速 20/10min），四道门依次：
  ① 404（行不存在/不是自己的）② 409 sync（那一行不是异步作业，重试走重新提交）③
  409（只允许 failed / cancelled 重试）④ 409（`input.request` 缺失——老行诚实回"重试不了"，
  不猜当时说了什么）。门都过了才落新行。
- 新行走**同一条共享管线** `submitClientRequest`（装配 → 上限 → 拒收 → submitJob），
  与 `POST /api/ai/jobs` 是同一个函数——两条入口不许长出两套提交语义。
- UI：任务列表挂"重试"（只对自己的 failed/cancelled 行出现），点了开 `attempt=2` 的新行，
  旧行还在表里；`data-task-retry-note` 说"已重试：新任务 …"。

**DEMO 观察的真值来源：** `demo_job_` 前缀问 web 进程内存（`getDemoJob` + `demoStatusOf`），
其余问 ai-service；两条路产出同一份 `AiJobStatusResponse` 形状。DEMO worker 的终态口径
与 ai-service `jobs.py` 一致：provider 回 error → `job.status = failed`、error 原样落
`job.error`，只有真做成了才带 `result`。

## 后果

- "200 = 受理 ≠ 停止"这句话必须在**每一层**都成立：API 的 note、任务行的 error、
  状态行、观察报文的 `jobStatus` 各说各的，谁也不冒充谁（e2e 钉了先"受理"后"已取消"两句话的先后顺序）。
- 取消之后 `jobStatus` 可能短暂地仍是 running：这不是 bug，是检查点还没走到；
  界面把这一段明说成"队列在跑，检查点落成 cancelled 之前状态仍是 running"。
- 重试的新行带着 `retryOf`，"第一次为什么失败"由旧行自己保存——账本不改写历史。
- DEMO 内存队列重启即失（报文 `backend: demo-memory` 里就带着），取消/重试都不改变这一点。
- 测试环境两个坑，都已在代码/测试里显式处理：
  ① React StrictMode 的 effect 清理会把 `pollStop` 拨真而挂载侧不再拨回，
  轮询还没开始就被上一轮清理判了死刑（误报"等了 3 分钟"）——effect 挂载时必须复位；
  ② dev server 首次命中 `[jobId]/cancel` 动态路由要现场编译，这一两秒会把"受理"拖到
  第一次观察落账之后（200 变 409）——e2e 在开跑时先 POST 一次预热，生产没有这一段。
- DEMO 作业的两段等待被刻意拉长到 2.2~3.4 秒：完成得比第一次轮询（1.5 秒）还快的话，
  观察会先把行落成 `awaiting_approval`，随后的取消只能吃 409——"受理在先"的语义要求
  取消窗口先于任何终态收敛。
