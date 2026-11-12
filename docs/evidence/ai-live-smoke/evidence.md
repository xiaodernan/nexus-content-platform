# §AILIVE-2 · 端到端 live AI smoke（真网关、真项目、真 API）— 2026-11-12

**这次验证的是什么**：不是 provider 直接打、也不是单测里的 mock——而是经过 web 的真入口：

```
GET /  → proxy 签 `nexus_csrf`（+guest 可选的 `nexus_session`）
POST /api/auth/register  （IP 限流 10/h，本轮真吃了一次）
POST /api/projects       （CSRF + session + crate）
POST /api/ai/run         （CSRF + session + project 权限 + credits + real provider → /v1/ai/run）
```

即 `CSRF double-submit`、`session 限制`、`ipWriteGate`、`design doc 装配`、`credit ledger`、`核实与通知发送` 全部真走一遍。

## 结果（本机 3100 dev server，`--confirm-real`）

```
HTTP 200 · capability=real · provider=openai-compatible · model=gpt-6-sol
explanation=WCAG AA 要求正文（普通大小文本）的文字与背景对比度至少为 4.5:1；…
usage = { tokensIn: 9217, tokensOut: 58, latencyMs: 3897.9, demoMode: false, toolCalls: 1, costUsd: 0 }
[live] 真实 provider 链路 ✓ (capability=real)
```

## 跑法

```
npm run live:ai-smoke -- --confirm-real
```

**默认拒绝执行**。没带 `--confirm-real` → 直接 exit 2 + 打印说明。刻意这样：本脚本不主动触港海外口径的计量，
但每一次真实调用都如实减一次 token 预算——由运营者显式放行。

## 约束要点

- **不动 apps/ai-service/.env 以外的人**——key 不出现在 commit 里任何位置（.env.example 是占位模板）。
- **不覆盖** build/runtime：不生成 taskId 以外的副作用；脚本的一次 run 产生：
  - 1 个临时账号（`live-ai-smoke-<ts>@example.test`）、1 个临时项目
  - 1 条 `agent_tasks` 行 + 1 次结算 + 1 次 notification（ai/run 记录本次真跑过来）
  - 1 次计费（tokensIn=9217 tokensOut=58）
- **`--confirm-real` 默认拒绝**：没带 → 退出 2；有带才真跑；防止误导无意识的批量集成。
- 本脚本不带 `--confirm-real` 跑不通过；断言的是 `capability='real'`，不断言 answer 文本（真实模型不是确定性的）。

## 仍欠

- **浏览器层的 live smoke**：本次仅走了 HTTP API layer；真渲染还要开真浏览器点「studio → AI agent」那个流程
  （§158 Run→Screenshot→Inspect），这一刀不偷懒补不了。
- **/api/ai/jobs 异步 job**：同一套接法已验证，但还没跑异步路径；脚本 live:ai-smoke 默认 intent=freeform 走同步。
- **envelope**：HTTP 头部 `x-nexus-task` 没被脚本消费（run 已经返回 print 了 payload）；如需跟踪一回合的轨迹，
  请在 Studio 侧真跑一次。
