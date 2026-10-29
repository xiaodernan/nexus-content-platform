# ADR-0071：三行转发头都读，优先级 `x-forwarded-for` → `Forwarded` → `x-real-ip`

- 状态：已接受（2026-10-30）
- 相关：ADR-0070（IP 取可信链的右端）、ADR-0060（guest 自动签发需要身份之前的闸）、SECURITY.md「认证与授权」、§137、§159

## 背景

ADR-0070 把 `clientIp()` 从"取 `x-forwarded-for` 最左端"改成"取可信链的右端"，但**读的还是那两行头**：

```ts
const xff = request.headers.get('x-forwarded-for');
// 读不出才回落
return request.headers.get('x-real-ip');
```

RFC 7239 定义的 `Forwarded: for=...;by=...;proto=...;host=...` 是这一族的**标准写法**（XFF 从来不是标准，
只是实现事实），会只写这一行的前置确实存在（Envoy、部分 HAProxy 配置、一些 CDN 边缘）。ADR-0070 文末
「仍欠」第 5 条写的就是这个洞。

**处理器层面的读数**：一个只有 `Forwarded`、没有 `x-forwarded-for` 与 `x-real-ip` 的请求，
`readForwardedChain()` 报的是"三行头都不在场"⇒ `headerPresent=false` ⇒ `gateIp()` 返回 `null`
⇒ `ipWriteGate` 让路。臂 B4 量的正是这一格（把 `Forwarded` 那一支去掉＝修之前的样子）：

```
AssertionError: expected [ '201', '201', '201', '201', '201' ] to deeply equal [ '429', '429', '429', '429', '429' ]
```

**但活体探针把这个说法修正了一半**（`.scratch/s28-forwarded-live-probe.mts`、
`.scratch/s28-forwarded-live-probe2.mts`，打真 dev server，不经手搓 Request）：
`node_modules/next/dist/server/base-server.js:612` 那句

```js
req.headers['x-forwarded-for'] ??= originalRequest?.socket?.remoteAddress
```

是**无条件**跑的（`BaseServer.run`，dev 与 `next start` 同一条路）。所以真 HTTP 路上 `x-forwarded-for`
几乎总在案——客户端没写时，Next 把**socket 对端**填进去。观测到的四站：

| 站 | 发出去的头 | 预期（按"读 `Forwarded`"） | 实测 |
| --- | --- | --- | --- |
| 灌桶 ×21 | `Forwarded: for=192.0.2.<轮换>;by=10.0.0.1, for=198.51.100.90` | 第 21 次 429 | 前 20 全 404、第 21 次 429（但桶是 `::1`，见下） |
| P2 | `Forwarded: for=198.51.100.90, for=192.0.2.240` | 404（右端全新） | **429** |
| P3 | `x-forwarded-for: 198.51.100.90` + `Forwarded: for=192.0.2.241` | 429（XFF 赢＝满桶） | **404** |
| S1 / S2 | 同一个地址串 `198.51.100.92`：S1 只写 `Forwarded`，S2 只写 XFF | S1=404 | S1 **429**（`retryAfterMs=3286152`，接在灌桶那批之后往下走）／S2 **404** |

P2、P3 与预期**正好相反**，S1/S2 用同一个地址串换一行头就换了桶——三条一起指向同一个解释：
处理器读到的 XFF 是 Next 注入的 socket 对端，XFF 优先，于是 `Forwarded` 那一支在真路上走不到。

所以这一洞的真面目是两件事，不是一件：

1. **处理器契约层面**：`Forwarded` 没被读＝那一行形同免限流（B4 的五个 `'201'`）。
2. **Next 之路层面**：只写 `Forwarded` 的前置并不是"站在闸外面"，而是**它的用户全落进前置自己的那一只桶**
   ——20/小时的额度给整 POP，这是一台共享灭火器，方向与 (1) 相反，危害一样真实。

## 选项

1. **只支持 XFF，文档里要求运维把 `X-Forwarded-For` 显式设上**（nginx 的
   `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`）。这一条**并没有被否掉，反而是结论的另一半**：
   上面第 2 件事只能靠部署解决。但只做这一条不够——(1) 那格是处理器的事实，代码该读三行就读三行。
2. **三行头读到的段并成一条链**。听着最宽容，实际是重新开一条"换一行头换一个桶"的路：同一个对端
   会因为前置写了 XFF 还是写了 `Forwarded` 落进两只不同的桶。桶键必须**一个形状只有一条链**。
3. **三行都读，按优先级只取一条链**（本决定）。
4. **以 `Forwarded` 为主、XFF 只作回落**（"标准优先"）。双重否掉：既有部署与 Next 自身填的都是 XFF，
   换了主判据等于让最常见的形状靠回落读；更要命的是**任何客户端都能自己写 `Forwarded`**，
   而 ADR-0070 刚堵掉的正是"客户端写的那一段决定桶"——XFF 在场时赢，是那道闸还活着的前提。
5. **长度启发**（`Forwarded` 的链比 XFF 长就用 `Forwarded`，想救"只写标准头的前置"）。否：
   直接暴露时客户端同时写 `x-forwarded-for: 1.1.1.1` + `Forwarded: for=2.2.2.2, for=3.3.3.<rand>`
   就能把右端换成自己控制的地址，ADR-0070 的洞当场重开。

## 决定

`readForwardedChain()` 读三行头，规则四条：

1. **优先级**：`x-forwarded-for` 给得出可用地址就用它；用不上了再看 `Forwarded`；两行的链都空才退到
   `x-real-ip`（nginx 的 `$remote_addr` 是覆盖写的）。**后面的行不再往同一条链上叠**——理由见选项 2。
2. **`headerPresent` 覆盖三行**：三行都不在场才是"标识不出"，那道闸照旧让路（ADR-0070 的口径不动）；
   只要有一行在场，就读不出地址的那批就落进 `INVALID_IP_BUCKET`（`invalid-xff`）一只共享桶照常限——
   **写一行读不出的头换不来免限流**，这一句现在对标准头同样成立。
3. **`Forwarded` 只认 `for=`**：一跳一段（逗号），段内分号分参数。`by=` 是上游代理自己（拿它当客户端＝
   把反代的地址记到人头上）、`host=` 是请求的 Host、`proto=` 是协议——**三者永不进桶键**。
   值可以带引号（RFC 7239 要求含冒号的地址整个括起来），引号里还可以再带端口：
   `for="[2001:db8:cafe::1]:47116"` → `2001:db8:cafe::1`，靠的是 ADR-0070 那一个 `normalizeAddress()`，
   不新写一套解析。`for=unknown` 与混淆值 `for="_gzz3"`（RFC 7239 §6.1）**不是地址**：丢段。
4. **`NEXUS_TRUSTED_PROXY_COUNT` 对三条链同样生效**（同一个 `pickTrusted()`）。桶名字面量仍是 `invalid-xff`，
   **不改名**：改名把日志与既有见证全卷进来，收益只是好看；代价换不来，就在常量注释里写清"三行头共用这一格"。

限额依旧一个没动：`projects/create` 20/小时、`auth/register` 10/小时、`auth/login` 按邮箱 10 次/15 分钟。

## 后果

**好了的地方**：处理器的口径补齐——三行头都读，`for=` 的三种写法（裸地址、引号包 IPv6、引号带端口）
和 `unknown` / 混淆值都被逐条判过；"头在场却读不出"的共享桶从"那一行 XFF"扩到三行。

**仍然存在的限度（别读成已经解决）**：

1. ADR-0070 的后果 1 **原样成立，并且这一片又量了一次**：直接暴露时右端仍是客户端写的
   （P3 那一站就是活证：XFF 换成 `198.51.100.90` 就跳出了已经灌满的 `::1` 桶）。
   垃圾 XFF + 轮换 `Forwarded` 是同一族的又一个写法，不是新的洞——它要求"前面没有会追加的反代"，
   而那正是后果 1 说只能靠部署解决的那一档。
2. **新的一条，要紧**：在 Next 之路上的部署里，`Forwarded` 那一支基本走不到（XFF 被 `??=` 填了 socket 对端）。
   前置只写 `Forwarded` 的实际结果是**该前置后面所有人共用一只桶**（桶＝前置地址）。
   部署要求写死这句：**前置必须写 `x-forwarded-for`（追加），或至少与 `Forwarded` 一致**。
   要在代码里真正解决这一格，需要 ADR-0070 选项 4 那档（可信 CIDR 表 + 从右往左走到不信任的跳就停），
   而它的前置条件是"处理器能拿到 socket 对端"——现在拿不到，这一格记进仍欠，**不要在本 ADR 里假装已解决**。
3. 做了地址混淆的前置（`for="_gzz3"`）后面所有人都共用 `invalid-xff` 一只桶——真实的粗化，比第 2 条窄。
4. 两行头同时在场且互相矛盾时 **XFF 赢**（选项 4 被否的理由），活体第 S1/S2 站观测到的就是这个规则。
5. 内存驱动仍每实例一套桶、重启即失忆；Redis 有序集那一格照旧欠着（`hit()` 要变 async，33 处调用点 / 30 个文件）。

**见证**（逐字读数在 `docs/ROADMAP.md` 文末「§SEC 第二十八片」一节）：

- `apps/web/test/client-ip.test.ts`：新增 11 条（整份 26 条）打在改实现**前**——**9 failed | 16 passed**
  （`.scratch/s28-red-before-fix.txt`）。那 16 条恒绿的是"只写 XFF"与"三行都不在场"的形状，
  对本片的洞没有区分度，与 ADR-0070 那次的教训同族。改后 `client-ip.test.ts` + `rateLimit.test.ts`
  **32 passed (2 files)**，加上新那条"Next 注入的那一段会盖住 `Forwarded`"后 **33 passed**。
- `apps/web/test/guest-write-gate.integration.test.ts` 第 ⑥ 条（真库真路由，处理器直接调用）：
  前置只写 `Forwarded: for=192.0.2.<轮换>;by=10.0.0.1, for=198.51.100.77`，25 次里前 20 放行、
  后 5 个 429，且 `guest` 只多 20 个——被挡的那 5 个一个身份都没建。
- **活体两趟**（见上面的四站表）：这一片的结论有一半来自这里，包括推翻初始假设的那两个读数。
- 变异臂 7 条逐个点名（红在谁身上都是具体那一条用例，不是"总数变了"）：
  B1 `for=` 换成"任何参数都收" → 1 红（`expected '203.0.113.60' to be null`）；
  B2 不剥引号 → 1 红（`expected null to be '2001:db8:cafe::1'`）；
  B3 `Forwarded` 抢在 XFF 前面 → 1 红（`expected '192.0.2.43' to be '198.51.100.9'`）；
  B4 **根本不读 `Forwarded`（＝修之前的样子）** → 4 红，其中两条是闸层，读数是五个 `'201'` 对五个 `'429'`；
  B5 `for=unknown` 当地址 → 2 红；
  B6 XFF 读不出时不再回落 → 第一版写成重复 `const` 让 vitest 报"no tests"，**那一跑作废**，重写后 2 红；
  B7 两条链合并（选项 2）→ **2 failed | 31 passed**，红在"XFF 说了算"那条与活体形状那条
  （`expected '192.0.2.51' to be '198.51.100.1'`）——后者是新用例**独享的牙**。
