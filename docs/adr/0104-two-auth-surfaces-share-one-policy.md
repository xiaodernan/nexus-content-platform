# ADR-0104：两扇认证门共用一份策略——把「保持同步」从注释变成机制

- 状态：已接受（2026-11-11）
- 相关：`services/nexus-gateway/src/main/java/dev/nexus/gateway/AuthPolicy.java`（新增，单一真值源）、
  `services/nexus-gateway/src/main/java/dev/nexus/gateway/AuthFilter.java`（路由边门，改为委托）、
  `services/nexus-gateway/src/main/java/dev/nexus/gateway/PlatformAuthFilter.java`（网关自身端点门，改为委托）、
  `services/nexus-gateway/src/main/java/dev/nexus/gateway/GatewayConfig.java`（bean 的 fail-closed 改为委托同一规则）、
  `services/nexus-gateway/src/test/java/dev/nexus/gateway/AuthWhitelistParityTest.java`（双门行为一致性锁）、
  `services/nexus-gateway/src/test/java/dev/nexus/gateway/AuthPolicyTest.java`（真值源本身正确性锁）、
  `docs/adr/0103`（承接，§SC-31 把 actuator 端点纳入 auth 保护）、`docs/ROADMAP.md` §SC 第二十八片。

## 背景

网关有**两扇认证门**，protect 的是两个不同的表面：

- `AuthFilter` 是 Spring Cloud Gateway 的 `GlobalFilter`，只跑在**路由管线内**，守住转发到后端的 edge。
- `PlatformAuthFilter` 是 reactive `WebFilter`，跑在**网关自己的 controller / actuator handler** 前——
  这是 §SC-27 补的洞：那次实测发现 auth 开着时 `/platform/services` 无 token 就返回 200，把注册表的
  服务地址簿免费给了任何够得着门的调用方。

两扇门各自**复制**了同一份策略：同一张白名单（`/platform/health`、`/actuator/health`、`/fallback/**`）、
同一条「auth 开着但 secret 空白就拒绝启动」的 fail-closed 规则、同一个 401 拒答 body（含一段逐字相同的
`note`）。两个类的 Javadoc 都写着「keep the two whitelists in sync」——但那只是一句**注释**，没有任何
测试或机制钉住。§SC-31 又刚把 `/actuator/circuitbreakers` 纳进受保护面，白名单/受保护面正在变多，
漂移风险随之上升：将来任何一次「只给一侧加了个路径、只更新了那一侧的测试」，就会静默开一个 §SC-27
形状的洞。用户本轮要求「集大成」「继续演进」「自己规划」，把这份靠人自觉的同步收敛成机制，正是该做的事。

## 决定

**把两份拷贝折叠成一个 `AuthPolicy`（单一真值源），两扇门和 bean 全部委托它。** 策略的四个要素各只有
一处定义：

1. **白名单**：`AuthPolicy.OPEN_EXACT`（`/platform/health`、`/actuator/health`）与
   `AuthPolicy.OPEN_PREFIXES`（`/fallback`）。两扇门的默认构造器都引用这两个常量，不再各写 `List.of(...)`。
2. **匹配边界**：`AuthPolicy.isOpen()` 统一实现 **exact 或「整路径段」前缀**匹配——
   `path.equals(prefix) || path.startsWith(prefix + "/")`。`/fallback` 和 `/fallback/nexus-api` 放行，
   `/fallbackish` 不放行；并容忍配置侧误写的尾斜杠（`/fallback/` → `/fallback`）。两扇门原本各自的
   `isWhitelisted()` 里的四行循环删除，改为一行委托。
3. **fail-closed**：`AuthPolicy.requireSecret(enabled, secret)`——auth 开着且 secret 为 null/空白就抛
   `IllegalStateException`。**下沉到两个门的构造器本身**，外加 `GatewayConfig.authFilter()` 的 bean 也调用
   同一函数。原来只有 `PlatformAuthFilter` 构造器检查、`AuthFilter` 靠 bean 外部检查，构造 `AuthFilter`
   的其他路径（含测试）能绕过——现在门自己是守卫，不是靠调用方记得检查。
4. **401 拒答方言**：`AuthPolicy.refusalBody(reason)` 生成唯一的 body，两扇门逐字返回同一个形状，
   调用方看到的是整个网关**一种** 401，不是一个门一种。

**双锁，各管一件事**（缺一不可）：

- `AuthWhitelistParityTest`（行为锁）：对 8 条代表路径，auth 开、无 token，分别跑两扇门，要求判定一致
  （放行/401）、且 401 body 逐字相同；另钉「该开的开、该守的守」（含 `/fallbackish` near-miss）与
  「两扇门空白 secret 都构造期拒绝」。
- `AuthPolicyTest`（真值源锁）：直接断言 `isOpen` 的段边界语义（exact 不误伤 lookalike、前缀开子路径
  不开字符兄弟、尾斜杠容忍、null/真实路由保持受保护）、`requireSecret` 的三态、以及 401 方言文本。
  **必须有这一把**：结构折叠后若有人把 `isOpen` 改回裸 `startsWith`，两扇门会「一起漂移」，parity
  仍然全绿，而 `/fallbackish` 洞会静默重开——真值源锁专捕这种「一起错」的情形。

## 后果

### 首跑红，两条都是真缺陷（不是测试错）

- `[route guards /fallbackish] expected: 401 but was: 0`：裸 `path.startsWith("/fallback")` 把字符兄弟
  `/fallbackish` 也放行了。这是 §SC-27 洞的**同类变体**——门在一段本该受保护的路径上开着。
- `[route edge must refuse a blank secret] Expecting actual not to be null`：`AuthFilter` 构造器不检查空白
  secret，而 `PlatformAuthFilter` 检查，同一个「空钥匙」两扇门态度不一致。

**没有放宽断言、没有把红改绿**：两条都从**生产语义**修——匹配改段边界、fail-closed 下沉构造器。修完
4/4 parity 绿、6/6 真值源绿、既存 AuthFilterTest 9/9 与 PlatformAuthFilterTest 8/8 无回归。

### 验证读数

- 定向四条：`AuthFilterTest` 9 + `AuthPolicyTest` 6 + `AuthWhitelistParityTest` 4 +
  `PlatformAuthFilterTest` 8 = **27/27 绿**。日志可见 `/fallbackish`、`/platform/services`、
  `/actuator/circuitbreakers`、`/api/publications` 在两扇门上都记 `missing_token` → 401。
- 网关全套 `mvn -o -B test -f services/nexus-gateway/pom.xml` = **88/88 BUILD SUCCESS**
  （§SC-31 基线 78 + 本片 10）。
- 顶层 `npm run typecheck` = **14/14 PASS**。本片改动全是 `.java` / `.md`，零前端文件；
  整仓 `npm run eslint` 仍是**本机内存下的超时边界**（非 lint 报错），如实记，不假报绿。

### 权衡与诚实边界

- **段边界而非精确匹配**：`/fallback/**` 的语义是「子树」，不是「仅 `/fallback` 一个路径」；
  `/fallback/` 尾斜杠也容忍，避免配置手误把子路径全锁死或开成 `//`。
- **行为级、不 pin 常量内容**：parity 不写死「哪张表是对的」，只要求两扇门一致；`AuthPolicyTest`
  才 pin 语义。将来合法地给**两扇门同时**加白名单路径时，parity 不阻拦、真值源锁只要求新路径符合
  段语义——这正是「改一处即两处」的收益。
- **仍是同进程内的单一真值源**：这是编译期/进程内的收敛，不是跨服务/跨部署的配置中心；多实例各自
  用同一份代码常量，不存在运行时漂移。
- **零外部依赖、零新端点**：`AuthPolicy` 是纯 Java 包内类，无新依赖、无新 auth 面，不扩大攻击面。
- 未推送（无明确指令）；既存未跟踪目录 `test-results-mine*` 非本轮产物，未触碰。

## 结论

「两份拷贝 + 一句『记得同步』的注释」不是不变式，是待复发的缺陷。SC-32 把它变成**一份策略 + 两把锁**：
结构折叠让「只改一侧」在编译上不再可能，行为锁与真值源锁分别防住「两侧不一致」和「两侧一起错」。
§SC-27 那类「平台端点无 token 可读」的洞，从此有了机制层面的免疫，而不只是一份更用心的注释。
