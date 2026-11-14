# ADR-0143：admin/realtime 加一格 breakerState——Feign 状态直接上面板

- 状态：已采纳（2026-11-11，§SC-62）
- 关联：ADR-0139（§SC-60 Feign breaker 真断真开）、ADR-0132（SC-55 发送端帧护栏）、
  ADR-0122（admin"没拿到 ≠ 全 0"裁决）、ADR-0138（§FE-6 公开面登峰造极）
- 触发（user 本轮点名）：**消息队列的合理运用 + 工程可观测性**。

## 背景

§SC-60 之后，Java 的 `/api/v1/realtime/stats` 已经能上报本进程累积帧计数 + frame cap；
但 Feign breaker 的「现在在 CLOSED 还是 OPEN」 依然只存在于 `/api/v1/system/ai-health`
（SC-59 装的面板本来就只给 healthz）——想问《这条线断了没有》得切两个端点。

两条问题：
1. **"没数出" 是 null** —— 吸 popped "闭合"的静态字面拼成假·健康，不是"接了但都没数据"。
2. **管理员要的不是给你一个 *word*，而是给你为何没开闸的句子** ——
   3 个词组：`CLOSED` / `OPEN` / `HALF_OPEN`，外加一个部署把整个 feature 关了时候的"—"；
   旧回执缺一整格也当 "—（本次 wire 份响应不带此格）" 不撒谎。

## 决定

1. **optional injection**：`WirePublisher` 双参构造器（`@Autowired(required = false)`）；
   registry 缺席 → `currentBreakerState()` 返回 null。
   这是被人「关了 breaker」的诚实状态，不是 `CLOSED`。
2. **Map.of → LinkedHashMap**：`Map.of` 的 put 不接受 `null` value——
   `breakerState=null` 在不关的本地 dev 经常出现（就是断路器 Bean 装配没到位）；用普通
   map 逐格 put，null 值如实入 JSON，不干扰 Spring 容器。
3. **wire 格式**：`breakerState`（可选字段）——
   - `CLOSED`：断路器闭合，电路在跑（**列表明是"调用通"，不等于"Python 在线"**）。
   - `OPEN`：连续失败 ≥ 5 → Feign 如实 STOP——Python 这
     一跳等于告诉 caller "现在别叫"；
   - `HALF_OPEN`：冷却时间的一部分时间过去 → 放行允许
     试一次。半开回调仍是状态、不是"半好"的微信表情。
   - `null`：`NEXUS_FEIGN_BREAKER=false` 或 bean 缺省 →
     如实「不开关 breaker」。
4. **panel 端**：`/admin/realtime` 下半区多一格 `['breaker', breakerStateText(...)]`；
   `javaWirePanelRows` 现在六行；`isJavaWireStats` / `isJavaWirePanelShape` 门只认
   `CLOSED|OPEN|HALF_OPEN|null` 四个合法形状——形状不对 → 整体"没拿到"→ 面板画一行
   "没拿到 Java 生产者"。

## 后果与证据

- **live screenshot**（`docs/evidence/fe-admin-realtime-breaker/java-wire-breaker.png`）：
  真 admin session + 真 8082 Java + 真回执，`breaker: CLOSED` 一格呈现——
  本次实拍 CLOSED，没为"展示 OPEN 假像"而造 5 连失败。
- **Java 双单元**：`WirePublisherFrameShapeTest` 6/6（含新 LinkedHashMap `"breakerState"` 校验缺席时 `"null"`）；`RealtimeControllerTest` 6/6；`AiHealthBreakerOpenTest` 1/1。
- **web**：`admin-realtime.integration.test.ts` 4/4；`realtime-stats-readout.test.ts` +
  `java-wire.test.ts` 合计 **36/36**。
- **塌委托**：此片不是新造面板；`/admin/realtime` 早在 SC-53 已就位。本片是第二晋
  Feign breaker 的 "and 能活着被看见"。

## 诚实边界

- **`breakerState` ≠ `"Python 健康"`**——断路指 Feign 这一 hop 的"拒叫"，和 Python HTTP
  是否活着无关，Python HTTP 降级要走 `/api/v1/system/ai-health`
  （和那条 separate endpoint 答复"Java 看得到 Python 报上来的真实 providers
  和 queue_size"）。
- **HALF_OPEN 不代表"问题已解决"**：冷却时间窗口内放行一条 call 试运行，
  半开态下仍有可能重新跳回 OPEN；State=半开是真实状态，不是"快好了"。
- **未覆盖 admin/realtime 的 `wireErrorCount` 这半边**：本片只补 Java producer
  的 breakerState；web 生产者那侧的 in-process driver 断路信息
  最终在 `realtime.ts` / §SC-58-JavaWire 那一格里——Java side 路径不同。
- **"CIRCUIT BREAKER 没启用"**（`NEXUS_FEIGN_BREAKER=false`）的识别如实标 null，
  不是"稳定运行"的代名词。

## 仍欠

- **admin 没线 `breakerState` 对外补充**（如 `/api/v1/realtime/stats` 本身可以加一个 draft
  未来 "circuit_state_events" rolling buffer）。
- **Java 端 `/api/v1/realtime/stats` 不参与 web 的派发频率**（那里 headline "Java 生产者"
  和下面 `Redis publish failures` 已解耦）。
- **work load**：本次未重跑 topology smoke；§SC-60 独立验证过 8082 + 8000 + 8084 stub。

未 push。详见 ADR-0139（SC-60）/ ADR-0128（SC-53）/ ADR-0142（§FE-7）。
