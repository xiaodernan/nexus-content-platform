# ADR-0166：并轨收尾（b003200e→d199a820 十一提交索引追平）+ FE-16 两处判据自身修实

- 状态：Accepted
- 日期：2026-11-12
- 关联：ADR-0162/0163（FE-14/15 门面化纪律）· ADR-0164/0165（FE-16/17，本轮接手）· ADR-0154（静态判据锚真实代码 / 注释不得喂绿）· §CRIT-1（判据自身缺口当场修实）

## 背景 / 为何有这一片

我在 §FE-15 提交（`b003200e`，09:43）后因会话压缩中断。恢复时发现 HEAD 已由**并行会话**前移到
`d199a820`（12:59），中间 **11 个提交**已落地、涵盖 8 个逻辑片，但**三处索引文档
（ROADMAP / CURRENT-STATE / memory）最后提交仍停在 `b003200e`，一行未动**——项目状态快照与
真实代码脱节 11 个提交。按用户长期授权"并轨的内容那边没做完就直接接手、不等锁"，本片做两件事：
① 验收这 11 个提交并追平索引；② 补上 ADR-0164 诚实边界列为"后继欠账"的 FE-16 变异臂，
并在造臂过程中当场修实两处**判据自身**的真实缺陷。

## 一、并轨 11 提交全景（按因果序，全部实测验收）

| 片 | 提交 | 交付 | ADR / 证据 |
|---|---|---|---|
| §A11Y-4 | `2a63d0b2`+`d199a820` | `/admin` 管理台首页（十处总入口，访客/管理员不再 404）、`AdminNav` 补 home 格、纯导航 server 组件零行为 | `docs/evidence/admin-home/evidence.md` + 4 张真 Chrome 图（dark/light/narrow-390/forced-colors） |
| §PERF-6 | `ba4b9d2d` | `MemoryJobStore._pending` 从 `list` 改 `deque`，worker 热路径 `pop(0)` O(n) → `popleft()` O(1) | `apps/ai-service/src/ai_service/jobs.py` |
| §ENV-1 | `8ca63ef5` | 同机重启后容器清点 + 500 根因 + 纠正"e2e 本机不可用"的过时结论（`--output` 绕 node-safe-delete 守卫） | `docs/ENVIRONMENT.md` |
| §SC-77 | `5d94f5e3` | domain-service 上 `/actuator/prometheus`，暴露面精确 `{health,info,circuitbreakers,prometheus}` | `ActuatorShapeTest` + `docs/spring-cloud-stack-map.md`（live 200，35,724 bytes / 433 行真 Micrometer 字节） |
| §SC-77b | `f8e63c3b` | nexus-api 同样上，暴露面 `{health,info,prometheus}`；JPA 一对都有抓数面；共享默认不放开 | 同上（live 200，14,605 bytes / 240 行） |
| §FE-16 | `4469b7a4`+`9a09d039`+`eaaa76f4` | `/credits` `.cr-` 门面化（58 处、账本语义色、48rem 断点、字号不串档）+ e2e 补产物锚/字号分档 | **ADR-0164** + `e2e/credits-visual.spec.ts` 6 门 |
| §FE-17 | `ea5031f3` | `/notifications` `.notif-` 门面化（语义色沉没/亮起、40rem 双列 footer） | **ADR-0165** + `docs/evidence/notifications-facade/evidence.md` |
| §SC-78 | `ee23f9fd` | domain-service 补 caffeine，Spring Cloud LoadBalancer 真吃本地缓存，不再每请求解析 eureka 目录 | `pom.xml`（`spring-boot-starter-cache` + `caffeine`） |

**接手验收（本轮实跑，不编）**：横向 **19 个静态门文件 226/226**（含 FE-16 修实后 14/14、
FE-17 12/12、A11Y-4 admin-home 10/10、token/全局样式门全绿，证明各段互不污染）；
`e2e/credits-visual.spec.ts` **真 Chrome 离线 6/6**；`e2e/admin-home.spec.ts` **真 Chrome 离线 4/4**；
`tsc -p apps/web --noEmit` **0**、`tsc -p e2e --noEmit` **0**（后台长窗口 + 限堆 4096MB）。
结论：11 个提交**无遗留红门、无静态回归**，可安全追平索引。SC-77/77b live 200 抓数、
A11Y-4 四张截图为并行会话已落证据，本轮不重复造、也不谎称本轮重跑过 Java/live boot。

## 二、判据自身修实 ①：FE-16 `crSegment` 段边界——前缀枚举 → 段头注释锚

**缺口（臂驱动，S4/S10 交叉印证）**：`credits-visual-style.test.ts` 的 `crSegment` 用写死前缀枚举
`/\.(tc|an|mr|me|mi|mp)-/` 找段尾。但 globals.css 段头实际插入序是
`cr(FE-16) → notif(FE-17) → tc(FE-15) → an(FE-14) → …`，FE-17 的 `.notif-` 不在枚举里，
被整段误吞进 `crSegment`。`.notif-grid2` 合法的 `@media (min-width: 40rem)`（ADR-0165：
sm=40rem 真编译）撞上本片"不得出现 40rem"门 → **判据假红**（生产 CSS 无错）。
更深处是**系统性脆弱契约**：全库 15 个视觉门的 `xxSegment` 几乎都用"下一个已知前缀"枚举切片，
任何新段插进枚举盲区都可能误吞、假红甚至假绿（FE-17 判据用 `indexOf('/* ── §FE-15')`
段头锚是正确范式，唯 FE-16 漏网）。

**修实**：`crSegment` 改用 `/\*\s*─+\s*§FE-\d+/`（下一个 §FE 段头注释）为边界，与 FE-17 同范式，
不再枚举前缀——任何后续插段/改序都不会再误吞。修后静态 **14/14**、横向 **226/226**、e2e **6/6**。
**验伪器 S10**：专门把段头锚**改回旧枚举**，复现 `.notif-` 40rem 被误吞 → 断点门假红重演 KILLED，
证明修实是真实修复、不是把门改松绕过（§CRIT-1：修实必须有牙可证）。

## 三、判据自身修实 ②：定界符门纯计数盲区——补"编译后真实规则体存活"

**缺口（臂 S12a 抓出）**：定界符门原是单一全局计数状态机（遇 `/*` 进、遇 `*/` 出）。
删掉 `.cr-` 段头注释的 `*/` 时，FE-17 段头 `/*` 被吞进"未闭合"态、再被 FE-17 段尾 `*/` **重新配平**，
`strayOpen/strayClose` 仍全 0 → **门假绿**；但浏览器按 CSS 非嵌套注释语义
（`/*` 取最近 `*/`）会把 `.cr-page` 两条真实规则吞进注释，CSS 编译挂。门 JSDoc 声称
"堵注释未闭合导致真编译挂"，却抓不住最典型的未闭合，名不副实。
（注：全套臂里 S12a 确实让另一门"类名闭环"红了，产品缺陷被门集合接住；但点名的定界符门假绿，
仍按 §CRIT-1 修实——与 FE-15 S11 钩子假绿洞同类。）

**修实**：给定界符门补一道与浏览器一致的断言——用 `cssNoComments`（`/* → 最近 */`，非嵌套）
剥离后，page 用到的每个 `cr-*` 主类都仍带**真实规则体 `{…}`**，不许只剩注释里被提到的类名文本
喂绿（ADR-0154）。期望集合取 page 真实用到的 35 个 `cr-` 类（非写死列表，随 page 结构自适应）。
验证：基线 35 个真实规则体全存活 → 14/14 不假红；S12a 删 `*/` → `.cr-page` 被吞 → 点名门 KILLED。
门标题同步更新为"定界符严格配对 + 编译后 .cr- 规则体不被吞"，名实相符。

## 四、FE-16 变异臂（补 ADR-0164 后继欠账）

**16 臂 = 14 语义 + 2 等价**，沿用 FE-15 的 vitest/Playwright **JSON reporter 结构化判定**
（只认真进 failed 集合的门标题，SIGTERM/解析失败判 ERROR，每臂备份→断言 find 存在→断言字节变→
跑门→恢复→4 文件 md5 核验）。覆盖：剥类全文哈希（S1 改诚实文案）、账本负色撞正色（S2）、
三元条件破坏（S3）、48rem→40rem（S4）、字号串档（S5）、回裸 Tailwind（S6）、写死 hex（S7/S11）、
data 钩子加后缀（S8，验精确 token 集合门）、删 size-24 token（S9）、**段边界根治证伪（S10）**、
**定界符真未闭合（S12，修实后点名红）**、e2e 计算样式回退（E1）+ 真 Chrome 账本撞色（E2）；
等价臂 CSS/className 值内尾随空白（Q1/Q2）全绿 EQUIV-OK＝门锚语义非文本指纹。
两臂驱动出两处修实（S12a 定界符、S1 锚点漂移修臂前提），全部当场修实、重跑全绿。

## 后果 / 诚实边界

- 索引追平：ROADMAP 追加 §INTEGRATE-1 覆盖 11 提交 8 片；CURRENT-STATE 置顶并轨收尾快照；
  memory append-only；`docs/spring-cloud-stack-map.md` 补 SC-78 caffeine 一条（此前只记到 77b）。
- 两处判据修实**零生产代码改动**——只动 `credits-visual-style.test.ts` 一个判据文件；
  FE-16/17 门面化生产文件、`globals.css` 各段、`tokens.css` 一字未改。
- **未 push**；SC-77/77b live boot 抓数、A11Y-4 四张截图为并行会话既有证据，本轮只读验收未重造；
  Java 单测、Python worker 单测未在干净窗口独立重跑（本轮验证聚焦 web 静态门 + 离线 e2e + tsc）；
  真读屏器听读、hover/active 逐帧人工看图仍欠。
- **系统性遗留（如实记，不在本片强行铺开）**：其余 13 个视觉门的 `xxSegment` 仍是前缀枚举范式，
  今天全绿只因下游段恰好未在枚举盲区；根治须逐门改段头锚 + 各配变异臂，作为一个独立判据治理片推进，
  不谎称已全库根治。本片只修实际暴露的 FE-16 一处 + 立下可复制范式（FE-17 既有 / 本片 `crSegment`）。
