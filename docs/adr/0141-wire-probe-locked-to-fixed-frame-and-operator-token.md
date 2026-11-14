# ADR-0141：线路探针门——probe 不给调用方定制帧位 / 门钥匙 = operator token

- 状态：已采纳（2026-11-11，§SC-61）
- 关联：ADR-0128（SC-53 线路探针）、ADR-0132（SC-55 发送端帧护栏）、ADR-0140（并行会话的 game-model 片）
- 触发：probe 在按原设计时是"任意 operator/player 都能按"的通道——任何人来一条 `POST /probe?channel=projects:critical&title=...` 就能把任意文本灌上 `nexus:realtime:v1` 线路，那是一条可被滥用的 wire injection 入口。本片一刀把它收回。

## 背景

原 Probe 设计（§SC-53 初稿）是一个**问诊探针**：`POST` + `?channel=foo&title=bar` + X-Nexus-Subject gate。这在 SC-53 当时被判为"应该加门"，但实际放的是 `web/Studio` 前面一个**不显眼入口**。

对外打开的 consequence：
- 安全边界 ≠ 只有 `X-Nexus-Subject`——任何带 UUID header 的请求（内网未认证）都能注入任意 `{channel, title, body}` frame，被 web 总线乱作假的 notification；
- probe 得"被调用方任意定制"——这让它从"行为验证"变成"**伪造的 broadcast 端点**"；
- 一个 Redis pub/sub 通道就成了攻击者的放大器：指向 Studio 的控制通道 `project:danger` 也能被人乱写入。

## 决定

1. **frame 必须固定**：`channel=projects:probe`、`title=probe event`、`body` 丢、`type=notification`——这条 frame 是运维基准线，<strong>鉴权不替"线路上写了些啥"说谎</strong>。
2. **双门结构**：{@code X-Nexus-Operator-Token}（部署时环境赋值的 operator token）优先于 probe 路径；缺了/错了/没部署就一律 403；不存在 "no-auth probe" 这回事。
3. **amp 护栏不破**：剩余 one-use `?channel=` 参数全部抛开——任何调用方试图 override `channel/title/body` 都被静默忽略，frame 仍然固定（判据 `legalTokenDoesNotBypassChannelOrMessageOverride`）。
4. **独立门 key**：不复用 `X-Nexus-Subject`——operator token 是独立的 authority，部署要配合设 `NEXUS_OPERATOR_TOKEN`（否则 probe 就是 NULL_CLOSED）。

## 后果与证据

- `POST /api/v1/realtime/probe` 现在任何情况下，`channel=projects:probe`、`title=probe event`、no body、no arbitrary override。
- `RealtimeControllerTest` 6/6 Pass：未设 token → 403 `probe_disabled`；缺 header → 403 `operator_token_required`；错 token → 403 同上；对 + post → 200 published=true 带固定 frame；Redis 不可达 → 503 published=false `redis_unavailable`；
- live 端对 probes 三态（无 header / 错 / 对）→ HTTP 403/403/200；`npm run realtime:java-to-web` PASS 三 verdict——"projects:probe" 频道收到 web 总线那边，并且 frame shape 走 `RealtimeWireFrameSchema.safeParse` mindset；java 全套 **137/137**。

## 边界

- wire channel 现在 `nexus:realtime:v1` 是 **都能写**的（Java 端任何对象、不限于 probe 都能 publish）——**Frame 扔掉不保护 consumer**；capability doesn't equal safety.
- §SC-55 frame guard 仍是发送端 byte cap；
- 目前这里做的"固定 frame + operator token"是专用护栏，**不是** full auth service；`NEXUS_OPERATOR_TOKEN` 泄出去就等于实际可广播——轮转、存放与移动的策略都不是 Java 层的职责；
- `OPEN circuit` in Feign（SC-60）不接手 frontend——造好了不等于安全闭环；还没 collapsee 像 Java 那样到真正的 producer of trusted content；
- `.scratch/realtime-java-to-web/` 运行产物已删除。

## 仍欠

- probe 之上还没放到`verify:topology` assert：拓扑 job 有效 remote discover 但 `realtime/probe` 未作为必经路径测过；
- Java 没有其它业务写路径 emit 帧上线：like/follow/remix 都为 web TS 生态，Java 只 consumer 说事；
- Operator token 生命周期：没有自动轮换；deploy infra 负责；
- Studio 没挂断 "projects:probe" 的 last-mile 判据：从 web 侧订阅看哪儿叫'收到'，走的是已有 `WIRE_CHANNEL` 去重逻辑（跳过 wireErrorCount）而不是专门 probe listener。
