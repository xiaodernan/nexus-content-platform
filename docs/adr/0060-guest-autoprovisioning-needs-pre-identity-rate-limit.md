# ADR-0060：guest 自动签发之后，按身份限流的那一族要补一道"身份之前的闸"

## 背景

§137 的免注册首次体验是这样落地的：`middleware.ts` 给每个**没有会话 cookie** 的请求
签一个随机 token 写进 cookie，`requireUser()` 拿不到会话行就**就地建一个 guest 用户**
（`server/domain/session.ts` 的 `createUserSession`）。

这条设计本身没问题——一个正常浏览器会存下 cookie，于是"一个浏览器一个身份"成立。
问题出在它与**限流**的组合上：所有按 `user.id` 拼键的限流桶，对**不存 cookie 的客户端**
每次都是新键。`rateKey(route, ip, userId)` 拼出来是 `${route}|${userId}|${ip}`，
`userId` 一新，整条键就是新的。

2026-10-24 用探针实测了 `POST /api/published/report`（打真库）：

- 12 个不同 token → 建 **12 个 guest 用户**、**0 次 429**；
- 同一个 token 打 12 次 → 只建 1 个 guest，第 11 次起 429
  （**按身份的那道闸本身是生效的**，失效的只是它的键）。

`marketplace/route.ts` 的注释早就点破过这件事——"guest 会话每次未知 token 都会新建一个
guest 用户，不限流就等于'换 cookie 就能无限造行'"——并因此加了 `user.id + IP` 双键。
但双键挡不住新身份：`userId` 每次不同，键照样是新的。

更糟的是扫下来发现**三条写入口本来就没有任何限流**：
`POST /api/projects`、`POST /api/ai/run`、`POST /api/account/api-tokens`。
于是一个绕开 cookie 的客户端可以无上限地建用户 + 项目 + 文档 + 任务行 + 凭据，
把"首次体验"变成一条免成本的写入口。`POST /api/ai/run` 虽有 §133 的额度闸兜底，
但 free 档每月发 100 点，而 guest 可以无限新建——额度闸限的是"一个身份做多少"，
限不住"建多少个身份"。

## 选项

1. **让 `requireUser()` 不再自动建 guest**（读路径用 `currentUserOrNull`）：
   `currentUserOrNull` 的存在理由正是这个（"否则任何人反复探测 `/api/admin/*`
   就能白手造出一堆用户与会话行"）。但这一改是**产品行为变更**：
   公开页上的点赞 / 评论 / 举报 / 关注都会要求先登录，§137 承诺的
   "guest 会话即可 Create → Design → Publish" 直接作废。这不是本轮能替产品定的。
2. **在中间件里按 IP 限流 guest 会话的签发**：一处改动覆盖所有路由。
   但中间件跑在每一次请求上（含页面导航），超限就得对 HTML 导航也回 429；
   且页面浏览与 API 写操作共用一个桶，两者互相挤占额度。误伤面比收益大。
3. **在每个"无会话可达的写入口"上，`requireUser()` 之前加一道按 IP 的闸**：
   与 `auth/register` 完全同形状（那一格早就这么做：`rateKey('auth/register', ip)`）。
   精确、可逐个定价、不碰产品行为，代价是要改 N 个路由文件。

## 决定

**选 3**。新增 `ipWriteGate(route, req, limit, windowMs)`（`server/security/rateLimit.ts`），
接到 10 条写入口上，一律放在 `requireUser()` **之前**：

| 路由 | 限额 | 理由 |
| --- | --- | --- |
| `POST /api/projects` | 20/h | 本来没有限流；真人一小时建不了几个项目 |
| `POST /api/ai/run` | 60/h | 本来没有限流；一次指令条交互一次 |
| `POST /api/ai/jobs` | 60/h | 同上，异步那一扇 |
| `POST /api/account/api-tokens` | 10/h | 本来没有限流；凭据是低频动作 |
| `POST /api/published/report` | 20/h | 举报是少数动作 |
| `POST /api/published/interact` | 120/h | 点赞/评论比举报频繁，但人做不过 120 |
| `POST /api/follow` | 60/h | |
| `POST /api/blocks` | 60/h | |
| `POST /api/marketplace` | 20/h | 上架是重度动作 |
| `POST /api/account/avatar` | 60/h | 每次都要重编码 + 删旧对象 |

**闸门必须在 `requireUser()` 之前**，这是本 ADR 的核心：被挡住的请求**一个 guest
都不该建**。建了就是"限流了但还是付了代价"——用户行照样涨，只是不再涨项目行。
变异探针专门钉这条：把闸挪到 `requireUser()` 之后，测试精确红。

两条限度写进代码注释，不绕过去：

1. **标识不出来的请求不进这个桶**（没有 `x-forwarded-for` / `x-real-ip` 时
   `ipWriteGate` 直接放行）。限流只能限住能标识的对象；给标识不出的请求一个共享桶，
   会把同部署下的正常用户一起挡掉——那是用一种故障换另一种故障。
   生产前面总有反代，会带上 XFF。
2. **IP 是粗粒度身份**：同一 NAT 后的多人共用一个桶。所以限额取宽，
   真正的"这个人"仍由各路由原有的按身份闸去管——这里是兜底，不是替代。

## 后果

- 换 cookie 绕不过写入口：探针里 25 个不同 token 打 `POST /api/projects`，
  前 20 个 201、后 5 个 429，且**只建了 20 个 guest**（不是 25 个）。
- 正常浏览器不受影响：它存 cookie，`hasSession` 为真，根本不走新建分支；
  且按 IP 的限额取宽，真人碰不到。
- 各路由原有的按身份限流**一条没删**——两层各管各的。
- 没有反代、拿不到 IP 的部署（纯直连）仍然没有这道兜底。这是已知限度，
  不是遗漏；要补的话得先有稳定的客户端标识，而那超出了限流的范围。
- §137 的 guest 首次体验**产品行为一字未改**：guest 照样能建项目、发评论。
- 遗留：`GET /api/auth/me`、`GET /api/projects` 这类**读**入口也会建 guest
  （一个用户行，没有别的副产品）。本轮没给读入口加闸——给 GET 返回 429
  会让账号面板直接坏掉，而它值得单独评估（例如只建行不返回）。
