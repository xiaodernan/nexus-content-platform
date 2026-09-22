# ADR-0002: 口令哈希走 bcrypt 回落分支，CSRF 用双提交，限流先用内存滑动窗口

日期：2026-09-23
状态：已接受

## 背景

`docs/SECURITY.md`「认证与授权」是硬约束：
- 口令：Argon2id（回落 bcrypt），绝不存明文或可逆
- CSRF：SameSite + 同源校验 + 双提交 token
- 速率限制：Redis 滑动窗口，按 用户 + IP + 路由

M1 要落地注册/登录 + 认领 guest 项目（§137）。本机 Windows 11、16GB、无 pnpm，
`apps/web` 目前零原生依赖，构建链不能引入需要 node-gyp 编译的包。

## 决定

### 1. 口令哈希：bcryptjs（纯 JS），算法封在 `server/domain/password.ts` 一个文件后面

- 走 SECURITY.md 明确允许的**回落 bcrypt 分支**，用 `bcryptjs@3`（纯 JS，无原生编译，异步 API）。cost=10，单次约 60–100ms。
- 不选 Argon2id 的现成包：`@node-rs/argon2` 带原生二进制、`argon2-browser` 带 wasm，都与"零原生依赖 + Windows 免编译"冲突。
- **可替换（§64）**：`hashPassword/verifyPassword` 是唯一入口，`verifyPassword` 按 `$2` 前缀分派，将来接 Argon2id 时旧 bcrypt 串仍能验证，会话层与调用方不动。
- 登录对"邮箱不存在"也跑一次 dummy-hash 比较，对齐时序，避免账号枚举侧信道。

### 2. CSRF：双提交 token，middleware 签发非 HttpOnly 的 `nexus_csrf`

- 会话 cookie 已是 `SameSite=Lax`（跨站 POST 不带 cookie），这是第一道防线。
- 双提交是纵深防御：另发一个前端可读的 `nexus_csrf` cookie，状态变更请求必须把它原样放进 `x-csrf-token` 头，服务端比对两者相等且非空。
- **现状：双提交已覆盖全部 mutation 路由**。auth 三路由之外，projects（建/存）、snapshots、restore、branches、switch、duplicate、variants、merge、publish（POST/DELETE）、assets（上传/删除）、ai/run 一律先过 `csrfOk` 再做任何事，不过就 `403 csrf_failed`。
- 客户端不各自造轮子：`src/lib/csrf.ts` 的 `csrfHeaders()` 是唯一取头处，`AccountPanel` 内联实现已收敛到它。上传走 `FormData` 时只加 `x-csrf-token`，绝不设 `content-type`（边界由浏览器生成）。
- 铺开之所以安全：Studio 的写入都经 `store.ts` 的 fetch，e2e 全部是浏览器驱动（cookie 天然存在、头随请求带上），没有绕过 UI 直连 API 的用例——15 条 @smoke 端到端跑通即是回归证明。

### 3. 限流：内存滑动窗口，接口形状对齐 Redis 驱动

- `RateLimiter` 接口 + 进程内 `MemoryRateLimiter`（有序时间戳数组，窗口过滤 + 计数）。
- 默认用内存驱动：单进程 dev 正确，测试可断言，零依赖。
- 生产多实例换成 Redis 驱动（`ZADD`/`ZRANGEBYSCORE` 有序集），保持接口不变——与 `storage` 的 `resolveStorage` 同一套路。
- 内存驱动在多实例下退化为"每实例独立限流"，**不是不限量**：单实例仍能挡住口令爆破。这是明确的实现现状，不假装已是分布式限流。
- 登录按 `IP + 邮箱`（10 / 15min），注册按 `IP`（10 / h）。

### 4. 会话：提权即轮换（防会话固定）

- middleware 用客户端可见的 cookie 值签发 guest 会话，意味着攻击者可事先种下一个已知 token。
- 因此 register/login 都调用 `rotateSession`：**删除旧 token 的会话行、换发新随机 token**，杜绝固定会话在提权后变成真实账号会话。
- 登出删除当前 token 的会话行并清 cookie（吊销，§80）。

### 5. 认领 guest 项目：就地升级，不搬归属

- guest 的项目/快照/资产全挂在该 user id 下。注册时把**同一行**改成真实账号（写 email / password_hash / claimed_at、guest=false），
  归属一条都不用搬，自然不漏。已是真实账号则拒绝重复注册，邮箱唯一走 `lower(email)` 唯一索引。

## 后果

- 正面：M1 认证闭环真实可跑、可测、可撤销；口令不落明文；会话可吊销且防固定；三项硬约束都落地并有测试。
- 代价 / 待办：Argon2id 尚未启用（走的是文档允许的 bcrypt 回落）；限流是单实例内存版。CSRF 双提交已覆盖全部写路由。
  剩余两条在 `docs/ROADMAP.md` 技术债与 `docs/SECURITY.md` 实现现状里写明，替换点各自单一（password.ts / RateLimiter 实现）。
- 依赖：新增 `bcryptjs`（MIT，纯 JS）。
