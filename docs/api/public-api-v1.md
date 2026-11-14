# NEXUS 公开 API v1 — 参考（§188 / ADR-0019 / ADR-0172）

给**外部 Agent / 脚本 / 工具**调用的稳定入口。这是本项目公开接口的权威说明；端点行为以代码为准，本文档由本仓维护，改动须与代码同一提交更新。

## 地址与鉴权

- Base URL：部署时 `/api/v1`（本机开发：`http://localhost:3100/api/v1`）。
- 鉴权：`Authorization: Bearer nexus_pat_<64 hex>`，
  在 `/api-tokens` 页面签发（登录用户在自己账下创建；明文只显示一次，此后库内只存 SHA-256 哈希）。
- 作用域（scope，签发时勾选，`projects:read` / `projects:write` / `design:read` / `design:write` / `team:read` / `publish:write`）：
  缺省拒绝——没勾的 scope 一律 403，不存在的能力不是"暂时不给"而是**不存在**。
- 限流：read 120 req/min、write 30 req/min（按凭据，60 秒窗口；读多一写各自单独计数，写档更贵）。
- 访问日志：每次成功调用 `api_access` 留一行（凭据、端点、项目）；只留 30 天，读接口按分钟粒度记"这一分钟是否有人越过"，不刷单条。
- 响应头：`cache-control: no-store`（不许代理层缓存）、`x-nexus-token-hint`（8 位 hint，仅供界面对齐同一把凭据用，**不是凭据**）。

## 端点

| 方法 | 路径 | Scope | 做什么 |
|---|---|---|---|
| `GET`  | `/projects` | `projects:read` | 名下未删项目清单（spec `ApiProjectListSchema`） |
| `POST` | `/projects` | `projects:write` | 建项目 `{name, kind}`；201 + `ApiProjectDetail`；kind 不认识 → 400，不静默给 website |
| `GET`  | `/projects/<id>` | `projects:read` | 项目详情 + 文档规模（页/节点计，问了才算） |
| `DELETE` | `/projects/<id>` | `projects:write` | 软删；`?confirm=<项目名>` 逐字比对；不一致 → 400 `approval_required`（审计 + 限次） |
| `GET`  | `/projects/<id>/design` | `design:read` | 设计文档整体（唯一真值，§16）；服务端现读库里那份，**不接收外传文档** |
| `PATCH`| `/projects/<id>/design` | `design:write` | 补丁写入口（`{ops:[…]}`）；读-改-写单事务；拒法：`approval_required`（含删除类 op） / `ops_skipped`（打不到现存对象） / `document_rejected`（超规模门） / `project_not_found` |
| `GET`  | `/projects/<id>/members` | `team:read` | 团队名册 + 邀请（未回显邀请 token）；owner 与协作者都能看，外人 404 |
| `POST` | `/projects/<id>/publish` | `publish:write` | 发布/下架转发（同一套 `publishProject()`）；**`public` 拒绝**——公网发布机检与人工裁决在人的路径上；只收 `unlisted`（链接可达）与 `private`（收回） |

客户端实例：`curl -H "Authorization: Bearer nexus_pat_…" http://localhost:3100/api/v1/projects`

## 行为约定（全部为"真实会发生的事"）

- **归属判定与"不存在"是同一个答案**：别人的项目、已软删的项目，对调用方都是 404 `project_not_found`——**不存在"存在但没有权限的差别"**（存在性泄露是一样的泄露）。
- **写入口一律审计 + 闸门**：补丁写入前过审批-闸门（`WEB_APPROVAL_POLICY`），删除类 op 直接 400 待批；gateway-level CSRF 不需要（Bearer 不是浏览器 cookie，没有"被诱骗发请求"模型）；web 侧 cookie+CSRF 仅存在于浏览器那条路上。
- **读没有分页、没有字段裁剪**：顶档文档（≈2 万节点）整份回来，规模写在响应 `limits` 里，撞天花板了先看文档规模再决定怎么裁。
- **响应契约**：每一条都过 zod safeParse；过不了 → 500 `internal`（不回他不可解析的载荷）。`DELETE` 回 `recoverable` 声明（软删、快照在、**v1 没有 restore**）。
- **发布/下架响应形状一致**（`ApiPublication`）；`private` 的 publication 行仍保留，URL 由 `resolvePublishedPath` 下架，调用方不必为"发布"和"下架"写两套解析。

## 故意没给的（不是遗漏，是形状决定）

- **`public` 公网发布**：机检与裁决在人路径；v1 只给 unlisted/private。公网分享回界面走发布面板。
- **团队写（invite/revoke/remove）**：owner 的管理动作，不是 Agent 能力；GET 落 `api_access` 同账。
- **`POST /restore`**：软删恢复今天只有界面入口（与恢复快照同一入口）。
- **LIKE/FOLLOW/REMIX / 评论 / 举报 / 举报解决**：全部走 web 路径（这些动作有 UI/人工哑铃，v1 不给）。
- **分页 & 字段裁剪**：一致性优先——问到就要整份；规模在 `GET /projects/<id>` 里看。

## 错误格式

```json
{ "error": { "code": "project_not_found", "message": "…" } }
```

`x-nexus-token-hint` 是**唯一**回显给调用方的凭据片段（8 字符），用途是界面把"哪一把"对齐起来，绝不是鉴权依据。

## 证据与断言

- 端点入口、scope 名 单一真相源：`apps/web/src/server/domain/api-tokens.ts`。
- 鉴权一处判：`authorizeApiRequest(…)`（鉴权 / scope / 限流 / 访问记账 四件事共一入口）。
- 契约出处：`packages/schemas/src/index.ts` 的 `Api*` beans（契约导出：`contracts/`，双端同一份）。
- vitest 真库集成：`apps/web/test/api-v1-*.integration.test.ts`（guest-write-gate / rate-limit / team / patch / publish 各一）。
- MCP server（`apps/mcp-server`）走同一串 token 机制，操作面与本文相同。

## 环境变量（web 侧，仅进程环境）

- `NEXUS_DATABASE_URL` —— Postgres；
- `NEXUS_AI_SERVICE_URL` —— 可选；未配置时 AI 相关端点返回 DEMO（§159，`capability` 如实报 `mock`）。

## 故障排查速查

| 现象 | 去哪看 |
|---|---|
| 401 `no_token` | `Authorization` 头没给或不是 `Bearer <...>` 形状，不是凭据问题 |
| 401 `invalid_token` | 形状不对（不以 `nexus_pat_` 开头）或库里没有——可能已删，或用的不是本平台发的 token |
| 401 `revoked_token` | 你在 `/api-tokens` 吊销过一枚——拿那一枚来的就是它，换新发的一枚 |
| 401 `expired_token` | 凭据过期——重签发一枚 |
| 403 `insufficient_scope` | 这枚凭据的 scope 是 `design:read / …`，缺你要用的那一格；回界面重签发带上需要的 scope |
| 429 `rate_limited` | 读 120/min、写 30/min；回执里带 `retryAfterMs`——按它等就行 |
| 400 `invalid_patch` | 校验在**写之前**做的；看 issues 精确哪一列（path/message），不是端点坏 |
| 404 `project_not_found` | 归属与不存在的同一答案——检查凭据名下有没有这个项目 |
