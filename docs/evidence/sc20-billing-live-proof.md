# SC-20 — Billing 面：只读、有入口、经 gateway、经过 discovery（2026-11-10）

SC-17 给了社区一条门，这一片给了账单一条门。两条纪律沿用社区的：身份只来自门（X-Nexus-Subject），本服务
不发布（唯一入口是 gateway `/domain/**`）。

## 交付物

| 面 | 文件 | 内容 |
|---|---|---|
| Controller | `services/java-domain-service/.../billing/BillingController.java` | `GET /api/v1/billing/balance?kind=ai`、`GET /api/v1/billing/plan`；无 X-Nexus-Subject → 400；非 UUID subject → 400；未知 kind → 400（BillingService.requireKind 的句子）；用户 id 不存在 → 400（`User not found: <id>`） |
| 测试 | `.../billing/BillingControllerTest.java` | 7 条无 Spring 上下文的 MVC 测试：形状、kind 透传、plan 小写、无 subject 拒绝、非 UUID 拒绝、未知 kind 句子、不存在 id 句子 |

读数：`mvn -B test` = **97/97**（含新增 7）BUILD SUCCESS。

## 活验证（三机服务真起：registry :8761 / domain :8082 / gateway :8090，NEXUS_DOMAIN_REGISTER=true）

| 请求（经过 gateway `/domain/**` → `lb://nexus-domain-service`） | 状态 | 读数 |
|---|---|---|
| `GET /domain/api/v1/billing/balance`，无 `X-Nexus-Subject` | 400 | `{"status":400,"error":"Bad Request"}` —— 门槛拒绝，领域零触碰 |
| `GET /domain/api/v1/billing/balance`，`X-Nexus-Subject: aaaaaaaa-1111-4000-8000-000000000001` | 200 | `{"balance":0,"userId":"aaaa…001","kind":"ai"}`，响应头自动铸了 `X-Request-Id: ed760c55-…` |
| `GET /domain/api/v1/billing/balance?kind=moon-bucks`，同 subject | 400 | `{"error":"Unknown credit kind: moon-bucks"}` —— BillingService 的句子 |
| `GET /domain/api/v1/billing/plan`，同上 user id | 400 | `{"error":"User not found: aaaaaaaa-1111-4000-8000-000000000001"}` —— 拒绝而非猜测 |
| `GET /domain/api/v1/billing/plan`，真实用户 `4d5bf1ac-409a-41e2-978e-5cd10827e3ad` | 200 | `{"plan":"free"}` |
| `GET /domain/api/v1/billing/balance`，真实用户同 id | 200 | `{"balance":0,"kind":"ai"}` |

打印顺序刻意是"坏的请求先行"：无 subject 的 400、moon-bucks 的 400、不存在用户的 400——**每条都带了拒绝句，
没有一条"先猜一个默认值"**。这是社区门立的约定，这个门也守住了。

## 如实的边界

- 只读。ledger 的唯一写方是 web 层（finishTask / PLAN_MONTHLY_GRANTS）；本面不提供：余额变更、计划变更、扣减。
  写入路径的证明在 web 测试里，不在这里。
- `balance` 落到 BIGINT 的 SQL SUM；账户不存在于 `credit_ledger` 的用户（没有消费/发放过）balance=0，这是 SUM 的真定义，不是"猜测性填 0"。
- plan 端到端需要 users 行存在：`User not found` 是真实用户 id 的否定句，不是 bug。

## 下一步（顺序，不是承诺）

1. 同一形状给 permission 一个只读面（`GET /api/v1/permission/check`）并在同一拓扑里做活验证——
   permission 的两个 JPA @Query 要先与 users 表对齐。
2. `verify-topology.mts`：把这页的 curl 序列固化为可重复冒烟，`npm run verify:topology`，失败时退出码非零。
