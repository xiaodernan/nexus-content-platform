# ADR-0068：观测性走"进程内计数器 + 请求追踪 id"，不接供应商、不包路由

日期：2026-10-28。状态：已实施（`apps/web/src/server/observability.ts`、`apps/web/src/instrumentation.ts`、
`apps/web/src/middleware.ts`、`apps/web/src/server/domain/metrics.ts`、`GET /api/admin/metrics`、`/admin/observability`）。

## 背景

`docs/ROADMAP.md` 在 §84/§85 的"仍欠"里记着一句：**"metrics/tracing 也没接，所以『线上发生了什么』
目前只能靠审计表 + stderr"**。这句话当时是准的，而且准得难看：

- `apps/web/src` 里没有任何 metrics / traceId / correlationId 的代码（只有一处 `requestId`，
  那是 provider 报文里的字段，不是请求作用域的关联 id）；
- 出问题时能看的只有 23 处零散 `console.*` 与一张 `audit_events` 表；
- 错误日志不知道自己属于哪一次请求，所以"这次 500 与那条被拒的审计是同一件事吗"没有答案。

约束不是"想要个仪表盘"，而是仓库自己的四条纪律：

1. `AGENTS.md` 绝对禁止 §159：**不许假 API / 假实现**。一个接了但永远返回 0 的计数器比没有更糟。
2. `AGENTS.md` 架构纪律 #4：**Provider 必须可替换**，业务代码不得直接 import 具体 SDK。
3. `apps/web/test/route-security-gate.test.ts` 钉的是**路由的形状**：每个写路由里必须出现 `csrfOk`
   或 `authorizeApiRequest`。101 个 `route.ts` 各自重述"CSRF → 身份 → 限流 → 业务"，
   把这条链收进一个 wrapper 会连门的前提一起拆掉。
4. 本机 e2e 预算受产品自己的限流约束（建项目 20 次/小时/IP），**一次动 101 个路由的回归今天验不动**。

## 选项

1. **接 OpenTelemetry / prom-client**：功能最全，但这是仓库里第一个可观测性依赖
   （`@opentelemetry/api` 今天只是 drizzle 与 next 的 optional peer，没装）。
   且真要用起来还得配 exporter、collector、存储——那是运维决定，不是这台机器能验证的事。
   选它的代价是"代码接上了但读数没人看过"，正好踩 §159。
2. **包一层 route handler wrapper，统一计时与状态码**：形状最漂亮，能拿到 per-route 的耗时与响应码。
   代价是改 101 个文件 + 重写那道安全形状门，而回归要靠大量 e2e——本机跑不动（约束 4）。
3. **只在"本来就只有一处"的窄口插桩 + 请求追踪 id 走头**（选这个）：
   `recordAudit`、`MemoryRateLimiter.hit`、AI 提交那两条门、Next 的 `onRequestError`。
   零新依赖，零路由改动，每一个指标都有一个真实写入方。

## 决定

- **追踪 id 由中间件签发**，写进 request header（`x-nexus-trace`，16 hex）并回一份到响应头。
  下游用 `next/headers` 的 `headers()` 读，因此**域函数不必接一个 `req` 参数**——35 个 `recordAudit`
  调用点一个都不用来接这次改动。进来的 id 先验形状再用（`/^[0-9a-f]{8,32}$/`），不对就换新的：
  响应头要回显它，不验就是允许外部控制我们的响应头内容。
  不用 `AsyncLocalStorage`：中间件与路由处理器不在同一个异步上下文，而 `headers()` 是 Next 自己维护的
  请求作用域，实测在请求外调用抛 `"outside a request scope"`——所以 `currentTraceId()` 把这个抛吞成 null，
  因为这一句要在审计写入的 catch 旁边调用，日志标签不许把业务请求带崩。
- **指标名单是声明式的**（`METRICS` 常量）：标签名必须声明，能枚举的值就枚举，自由值过字符集与长度，
  每个指标最多 64 条序列，超出折进 `nexus_metric_cardinality_overflow_total`。
  基数失控的 metrics 是一种自我 DoS——限流键的形状是 `路由|身份|IP`，而 `auth/login` 那一格的"身份"
  是**邮箱**，整串进标签等于把账号名单抄进内存里长住的地方。所以只取键的第一段。
- **两个读出口**：`/admin/observability` 给人看，`GET /api/admin/metrics`（`?format=text` 出 Prometheus
  文本 exposition）给机器抓。两者都只对 `role=admin` 开，与 `/admin/*` 其余几张同一口径。
  JSON 里带 `scope.kind = 'single-process'`：不写这一句，读的人会把一个实例的数当成整站的数。
- **进程内与库里分栏，不合并成一张表**。计数器重启清零；跨重启的事实只有库里那三本已经有人在写的账
  （`audit_events` / `agent_tasks` / `api_access_buckets`），由 `domain/metrics.ts` 聚合读。
  页面空着不等于平台上没发生事，这一句印在屏幕上而不是只写在注释里。

## 后果

**得到的**：错误日志带关联 id（实测：`[api] 未处理错误 trace=f76f3ed2935b7532 method=GET path=/ routeType=render`）；
审计决定、限流判定、AI 生成的能力档与耗时、未处理错误都能数；`npm test` 里有四道结构性门
（每个声明的指标必须有写入方 / 标签名单与调用点必须对得上 / **调用点**不许出现身份标签 /
**声明层**不许出现身份标签）。后两道是分开的：调用点那道查的是"传了什么"，声明层那道查的是
"名单里写了什么"——有人把 `email` 正经声明进 `METRICS`，调用点就合法了，只有后者看得见。
（这一刀是变异臂逼出来的：第一版只查调用点，而它取实参用的 `[^)]*` 会在 `String(input.allowed`
那个 `)` 处截断，`actorId` 正好落在截断之后——门在真违章面前报绿。判据已改成按括号配对取整个实参列表。）

**付掉的**：
- **per-route 的响应码与整请求耗时今天没有真数据源**。Next 16 的 instrumentation 只有 `register()` 与
  `onRequestError`；中间件返回的是它自己造的那份响应，拿不到处理器的最终状态码。
  所以这一格**留空**而不是用一个中间件计时假装接上——选项 2 是它的后续，但要和形状门一起改，单独一片做。
- 单进程口径：多实例各算各的，没有跨实例合并，也没有持久化。真要接后端时，
  `exposition()` 是唯一需要替换的函数（其余调用点只碰 `increment`/`observe` 两个入口）。
- dev 热更新会重新求值模块，所以注册表挂在 `globalThis` 上——否则每次存盘计数器悄悄清零。

**没做的**（照实记，不当已完成）：`nexus_audit_write_failures_total` 只在造的"库断了"那条单测里涨过；
中间件排除的 `api/projects/import` 那条路上没有追踪 id；后台/管理界面的其余页面还没接这条读出口。
