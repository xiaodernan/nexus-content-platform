# E221 落库证据 + 3100 端口归属发现（2026-11-25）

## E221《空白那一头的脚步》
- 承接 E220：第一个越过空白的人回头看见什么；6 节 6 对锚句，中英逐字对齐。
- 验证：`verify:world-bible` 锚句 1340 对全通过（全库唯一）；`verify:bible-snapshot` 一致；
  canon digest 274895 字符 / sha 9d537a28…；canon_digest pytest 4/4；相关 vitest 44/44。
- 真浏览器（3101 本仓 dev server）：`/bible` 正文含「空白那一头的脚步」「二百二十一」，
  零 pageerror。提交 `2b0c71a6`。

## 端口归属（重要边界）
排查 E221 呈现时发现：**3100 被并行线的 `next start` 生产构建占用**
（进程工作目录 `D:\终极项目`，PID 会变），它跑的是旧生产代码，不是本仓最新改动。
因此：
- 访问 `http://127.0.0.1:3100/bible` 看到的是**旧构建**，不含 E221——这不是 E221 的 bug。
- 本仓最新改动要真浏览器验证，用 `npx next dev -p 3101`（apps/web 目录）。
- 我装的 `nexus-web-watchdog` 每 5 分钟探测 3100，若端口被并行线服务占着它会跳过
  （探测 200 即退出），不会杀别人的进程；但这意味着它此刻守护的是那台服务而非本仓 dev。
  本仓 dev 由 3101 单独跑。
- 按纪律不杀并行线进程。让 watcher 守护本仓端口的办法（已实施）：计划任务 action 改为
  `scripts/watchdog-start-dev.cmd`（前台 `next dev -p 3101`），`MultipleInstancesPolicy=IgnoreNew`
  保证单实例；服务在跑时新 tick 因端口占用退出（无副作用），挂了则下个 tick 拉起并持续运行。
- 关键教训（2026-11-25 实测）：在计划任务上下文里用 node `detached spawn` 拉 next dev，
  子进程会随任务结束被终止（日志 `WEB_RECOVER_FAILED`，手动跑同样命令却 `WEB_RECOVERED`）；
  必须让服务进程就是任务进程本身。两次真机杀 3101 监听进程，分别于 05:04、05:08 自动恢复 200。
- probe 超时从 8s 调到 15s：首编译（E221 页 16s）会让 8s 探测误判 DOWN 而重复拉起。
