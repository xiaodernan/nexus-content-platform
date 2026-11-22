# ADR 0313 · 配置中心加"看得见的刷新"，但不加可写的配置源

日期：2026-11-23
状态：已采纳
相关：ADR 0095（注册表/网关拓扑）、ADR 0311（一个数字顶两件事）、§SC-71（共享默认值是箭靶）

> 命名：本片落地前在代码注释里挂的是 `SC-19`，与 `docs/ROADMAP.md` 2026-11-10 那一片的
> SC-19（拓扑实跑证据）同号；`SC-64` 又已被并行会话占用。`SC-NN` 这个空间不再够用，
> 所以代码/测试/README 一律改挂本 ADR 编号，不再排队造新号。

## 背景

`nexus-config` 是 Spring Cloud Config Server 的 `native` 模式：配置从自己的 jar 里读，客户端启动时
合并一次。它今天有两个说不出口的哑点：

1. **改没改看不出来。** 客户端起来之后配置就固定了；运维改了一个值，唯一的确认方法是重启客户端，
   或者像 §SC-71 记的那次事故一样等 domain-service 继承了不属于它的端点面之后再回头找。
2. **改过什么没有账。** 出事时问"这个键是什么时候变的、从什么变成什么"，进程里没有任何地方能回答。

`ConfigServedDefaultsHealthIndicator` 已经把"共享默认值收窄"钉成了一条探针，但探针说的是
"打进 jar 的那份对不对"，回答不了"现在这一版和上一版差在哪"。这一片补的就是后者。

## 选项

**A. 上 Spring Cloud Bus + MQTT/Kafka，改一处全集群 `@RefreshScope` 刷新。**
这是教科书写法，也是唯一能真正做到"客户端不重启就换新值"的正规路。代价：为了一个只被两三个人
一天按几次的操作面，往拓扑里加一个必须高可用的 broker，并且每个客户端都要跟着改。
本机内存只剩约 2.5GB（`docs/ENVIRONMENT.md`），多一个常驻 broker 不是免费的。

**B. 给配置中心加可写的覆盖层（Redis 或 Postgres 存 overrides）。**
能让"改"这件事真的发生在服务端，也能让审计有内容可审。但配置中心从此要能写机密值——
`nexus.db.password` 这类键会落到一份需要备份、需要加密、需要 TTL 策略的数据里，
而这套仓库现在的纪律是"机密只放在进程环境里，不进数据库"（`docs/SECURITY.md`）。
方向不对：这一片的价值是"看得见"，不是"可写"。

**C. 只读的操作面：指纹 + 再读一次报差异 + 变更账本（选它）。**
三个端点都不写配置。"刷新"的含义是**重新读取真值并把差异说出来**，与客户端拿到的报文同源
（判据取自 `EnvironmentRepository` 本身，也就是 `GET /{app}/{profile}` 构造报文用的同一个对象）。
不新增依赖、不新增进程、不动客户端，先把"看不看得见"这一格填掉。

## 决定

C。落地形状：

- `ConfigOpsService.read(app, profile)` → `{digest, values}`；摊平用 **先出现的赢**
  （`Environment.propertySources` 越具体越在前），指纹是键有序列化后的 SHA-256。
- `ConfigOpsController` 暴露 `GET /version`（只说形状不说值，含 `servedEmpty`）、`POST /refresh`
  （`status ∈ {established, unchanged, changed, empty-source, source-error}`）、`GET /audit`。
- `ConfigChangeAudit` 只追加、有上界（`nexus.config.audit.keep`，默认 200），
  `totalRecorded` 与 `kept` 分开放：淘汰最旧条目不该把"一共记了几条"也说小。
- 敏感键按**名段**判（`password|passwd|secret|token|credential|credentials|apikey`），
  不用子串：子串会把 `keysize` 误脱敏，又会漏掉别的写法。脱敏后仍留 8 位指纹，
  因为"换了密钥"与"看不出换没换"是两种处置。
- 门：`nexus.config.admin-token` 没配 → 三个端点全 503；配了但不匹配 → 401。
  空白口令当没配。令牌走 header，走常量时间比较。

四条不是可有可无的判断，各自有臂钉着：

| 规则 | 塌掉的话会怎样 | 臂 |
|---|---|---|
| 没变就不记账 | 账本退化成"刷新被点了几次"的计数器（ADR 0262/0310/0311 同一族） | `aRefreshThatChangesNothingWritesNoAuditEntry` |
| 基线按 `app/profile` 分别记 | 两条配置线互相顶掉，"第一次"这个判断变成看测试跑的顺序 | `eachDocumentKeepsItsOwnBaseline` / `profilesKeepSeparateBaselines` |
| 名字先验再进门 | `application=../../etc/passwd` 拿到 200（实测：去掉校验就是 200） | `aTraversalShapedApplicationNameIsRejectedBeforeTheRepositoryIsTouched` |
| 一个空源 / 一个抛错的源，不许冒充"这一版就是没键" | 拼错的 `search-locations` 先当基线，恢复后把每个键都报成新增；默认 500 页则把原因只留在日志里 | `anEmptySourceIsDistinguishedFromADeploymentThatSetsNothing` / `aRefreshAgainstAnEmptySourceRefusesToEstablishOrOverwriteABaseline` / `aSourceThatRaisesNamesItselfWithoutHandingOverTheStack` |

变异验证做了 10 处，每处只红该红的那条臂：摊平顺序翻转 →1 臂；`diff.empty()` 短路去掉 →2 臂；
脱敏关掉 →1 臂；名字校验去掉 →1 臂（且状态从 400 变 200）；503 分支去掉 →2 臂；基线键去掉 profile →1 臂；
`servedEmpty` 写死 `false` →1 臂；空源守卫短路 →1 臂（503 变 200）；`cause` 改成异常 message →1 臂
（内部路径漏给 caller）；`/version` 的 try/catch 去掉 →1 臂（异常直接逃出方法）。

## 后果

- 运维第一次可以在不重启任何客户端的情况下问出"这一版是什么指纹、和上一版差哪几个键、
  这个键上次是什么时候变的"。
- **客户端那一半仍然没做（已知未完成，不是本片范围）**：服务端说"变了"，被通知到的客户端仍要
  自己 `@RefreshScope` 才吃得到新值。要做的是给每个客户端加 `spring-cloud-starter` 的 context refresh
  入口，并由某个东西去调它们——那才真正需要选项 A 的总线。本片刻意不做的是"推"，
  因为把"我改了"变成"所有实例都用上了"需要一个会失败的传播层，而失败面（半集群新值半集群旧值）
  比看不看得见严重得多。
- `nexus-config` 仍是只读的。若将来要写，机密值的存储问题必须先有答案（选项 B 的代价）。
- 审计在进程内：重启即清零。这不是"持久审计日志"，面板与文档都不许这样称呼它；
  要持久化就得选一个存储，那又把选项 B 的存储问题请回来了。
- **`/actuator/health` 看不见"供了个空"**（真机量到，2026-11-23，打包 jar，端口 18892）：把
  `search-locations` 指到一个存在但什么都不放的目录，health 回 `{"status":"UP"}`，而 `/version` 是
  HTTP 200 + `keyCount: 0`。客户端那边只会安静退回自己打包的默认值，还以为中心答过了。
  这一格不是本篇选出来的口味，是运维面上唯一一个能说出"这个部署其实什么都没供"的地方——
  所以 `servedEmpty` 与 `empty-source` 必须存在，而不是让 0 独自承担两件事（§ADR-0311 同形）。
  同一次真机里还量到源抛错的两种来路，回的都是 `source-error` + `FailedToConstructEnvironmentException`：
  `file://C:\Users\…`（反斜杠没转 URL）与 YAML 里重复的 `gateway:` 键；两者都不写账、都不动基线，
  把文件改回来后第一次刷新是 `established`（而不是"每个键都新增"），改一个值之后是 `changed` 并点名
  `nexus.gateway.rate-limit.rate-per-second` 的 `from "50" to "999"`。完整六步在 `services/nexus-config/README.md`。
- 探针新增 25 条臂（`ConfigOpsRefreshAuditTest` 9 + `ConfigOpsGateTest` 9 + `ConfigChangeAuditTest` 7），
  模块 31 条全绿；`ConfigServerTest` 原有 5 条与 `ConfigServedDefaultsHealthIndicatorTest` 未受影响。
