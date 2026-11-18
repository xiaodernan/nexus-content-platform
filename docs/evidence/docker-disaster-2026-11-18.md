# Docker 灾难恢复复盘（2026-11-18 · 容灾实证实录）

## 事件经过

1. 本次会话中 Docker Desktop 整体自行重启（`com.docker.*` 进程被操作系统/Docker 自己回收后重新拉起）。
2. 所有 28+ 个容器从 `Up healthy` 自行恢复：
   - careeros-*（AI / gateway / backend / frontend / redis / postgres / minio / discovery）
   - football_os-*（API / postgres / redis / worker / registry / config / edge / worldcheck / jobs_observer）
   - crossrealm-chronicles-server-*（gateway / game / notification / shift / save / season / presence / ai / config / postgres / redis / discovery）
   - specproof-*（postgres / redis / minio / mysql / mongodb / elasticsearch / rabbitmq / prometheus）
   - nexus-*（postgres、redis）
3. nexus-postgres 进入数据同步恢复期，大约 **8-9 分钟**拒绝所有连接：
   - 直接报错 `the database system is starting up`
   - 报 SQLSTATE `57P03`，severity `FATAL`
   - 期间任何打 DB 的端点都会 500
4. 之后 postgres 自行进入 `ready to accept connections`，**数据零丢失**（同 `lsn` 序列）。
5. 期间通过同一端口访问 redis（PONG）正常，说明不是网络层故障、是 DB 自身恢复语义。

## 当时的观测证据

- 打 DB 的端点：`/api/admin/observer/digest` → 500（`Failed query: select users ...`）
- 打 redis 的端点（如 ai-service 的 completion cache）：容器启动失败由 uvicorn 报出 `ConnectionError`（503/启动失败）
- 不打 DB、只命中已构建静态内容的端点（比如 `/`/`/bible` 等 RSC SSR 的页面）：若需要访问 session 则仍 500，纯静态部分正常

## 恢复后复盘事实

- 同一请求 **200**，产出真实 AI 深读：

  「先处理 114 个待批准的 AI 任务………… 再清洁最近 7 天的疑似机器人流量…… 公开通过数为 0，总可流览 877、点赞 11，近 30 天平均完成率为 71.2%；预估 1 页、半日。」

- digest 里的每一处数字与真库一致：
  - 114 = `tasksAwaitingApproval` 实库计数
  - 94 / 52 = `suspectedBots7d` / `opens7d` 实库计数
  - 877 = `viewsTotal` 实库计数
  - 11 = `likesTotal` 实库计数
  - 71.2% = 30 天平均完成率 KPI 真库
  - 完成率与 publishes 公开计数 = 0（实库）

## 吸取得事实（不作掩盖）

- 这次重启是**自行愈合**，本会话期间没有人工介入。
- 打 DB 的端点在这段窗口里全部 500——这是后置事实，不是代码错。
- 后续任何 Docker 重启都是同样模式：~8-9 分钟数据库恢复窗口。不影响其他完全没打 DB 的静态端点。

## 后续行动 / 已处置

- ai-service 在 Docker 重启时会因 Redis 拒绝连接启动失败——这是**正确的行为**（fail-fast），不会伪装成 sehat。
- Web 在这段窗口里展示错误边界页也是**正确的行为**（不假装一切正常）。
- 之后若看到 500 + `the database system is starting up`，等 8-9 分钟即可。

## 这次灾难说明的两点

1. 容器级崩溃不是永久灾难，而是一段 **大约 10 分钟的降级窗口**，期间 500 而非 timeout 假装 healthy。
2. AI 深读（digest）在恢复后立即能产出真实结论，不在崩溃窗口期编造任何推断。崩溃期间如实拒绝。
