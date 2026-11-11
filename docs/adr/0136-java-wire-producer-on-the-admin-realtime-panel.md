# ADR-0136：admin/realtime 下半区看 Java 生产者——两个世界的账，同一张表盘

- 状态：已采纳（2026-11-11，§SC-58，承接 §SC-55/ADR-0132 的发送端护栏 + §SC-53/0130/0134 的消息队列线）
- 关联：`/admin/realtime`（§163 诊断入口）、`/api/admin/realtime`、`server/realtime/java-wire.ts`、
  `services/java-domain-service/.../RealtimeController.java`（`GET /api/v1/realtime/stats`，SC-55 加的端点）、
  ADR-0132（同一护栏在两种语言里的第二份复制）、ADR-0028（realtime redis fanout）
- 触发（user 本轮点名）：**消息队列的合理运用 + 前后端协同 + 登峰造极的前端 + Spring Cloud 微服务元素**。

## 背景

`GET /api/v1/realtime/stats`（§SC-55）之后，Java 生产者那一侧的账（`publishedTotal` /
`tooLargeDropped` / `redisFailures`）已经存在，**但没有任何一处界面能消费它**。
`/admin/realtime` 只画 web 这一个进程的线路账——管理员想知道"Java 这半出去的帧可不可信"，
只有两条路：读代码，或者猜。这是产线上最典型的"两个世界各自正确、合在一起没人敢说"：
web 侧账记得很漂亮，Java 侧没人接。

## 决定

1. **不新开一张卡，把下半区接到既有诊断入口**。`/admin/realtime` 下面加一节"Java 生产者（domain-service）"，
   与上半区同一口径：**没拿到 ≠ 全 0**——domain-service 没在跑、端点连不上、回执形状不认识，
   一律印一行"没拿到"，绝不画五个 0 冒充"接了但都很静"。
2. **一个 additive 字段**：`/api/admin/realtime` 的响应新增 `javaWire: JavaWireStats | null`。
   旧字段一字未动、老形状门照旧成立（`isKnownStats` 只认老字段；面板只画它认得的东西）。
3. **`fetchJavaWireStats()` 门面**（`server/realtime/java-wire.ts`）：`AbortSignal.timeout(3000)`、
   只收形状、`NaN/negative/空 channel` 一律 `null`；端点经 `NEXUS_JAVA_WIRE_STATS_URL` 可配，
   默认 `http://127.0.0.1:8082/api/v1/realtime/stats`（与 domain-service 默认端口一致）。
4. **视觉用既有 `.gw-`/`.dc-`/`fg-*` 原语**、零新增颜色 token（ADR-0122 红线）——
   Java 那节使用与 Web 那节同一张纸、同一条 `dl` 网格、同一条字号；分界一条 `border` 一条细线。
5. **admin 门一如既往**（role=admin 双重拒绝 + `no-store`）；页面**明写**两件事：多实例各算各的、
   Java 侧只报计数（不带任何帧内容）。
6. **截图为证**：`docs/evidence/fe-admin-realtime/java-wire-panel.png` ——
   真 Chrome + 真 admin session（截图后该 session 行已从库删除，明文 token 不留存）+
   真 domain-service 进程 + `POST /probe` 一帧 → 面板显示 `已发 1 · 超限丢 0 · 线路异常 0`，
   完整能力链：Java 端点 → web server fetch → 面板渲染，零假数据。

## 后果与证据

- 新判据 `test/java-wire.test.ts` **5/5**（形状门含 `wireChannel` 空 / `maxFrameBytes=0` / NaN / 非 2xx / fetch 抛错 → 全 null）；
  `realtime-stats-readout.test.ts` 净增 **14**（javaWireNote / panelRows / kb 逐档钉）；
  `admin-realtime.integration.test.ts` **4/4** 回归过（打真库，新增 key 不影响老判据）；
  `tsc --noEmit` EXIT=0、eslint EXIT=0；截图人眼看到完整 Java 一节，五格俱全。
- 页面**不再像两张皮**："web 总线"与"Java 生产者"一页之内对照而读——运维第一件事是对账，
  对账不用打开第二个终端了。
- 门槛保持：这页仍要 role=admin；读数只对有权限看的面板可见。

## 诚实边界

- 只看**这一台** domain-service 与**这一台** web 实例（多实例各算各的；线路查不到远端）；
- `no-store` 已加在 route 上——以前 route 没有它，本片顺手补上（轮询读数不该被任何网络层缓存）；
- 截图那一次的 `Java 生产者在线：已发 1` 是本次进程内计数，重启即 0（与 web 进程内账同语义）；
- 没新增 skill/E2E：真浏览器截图是一次性的人眼验证；自动化 E2E 待干净窗口（可用正在施行中的 FE-4/FE-5 e2e 脚手架模式补 `admin-realtime.spec.ts`）。

## 仍欠

- `wireChannel`/`maxFrameBytes` 之外的 Java **帧内容样本**仍不来自这条链路——下一次 MQ 片可评估
  "最最近 N 帧截断样本"（会触及帧内容暴露，先过 ADR-0132 的红线评估）；
- 多实例聚合读数；javaWire 上线后 `verify:topology` 未必（`/domain/**` 路径已有 gateway LB 路由，
  想走网关拿得到同一端点——topology 接入待干净窗口）；
- 没有真浏览器 E2E；CI `topology` job 仍未被真实 push 驯服。
