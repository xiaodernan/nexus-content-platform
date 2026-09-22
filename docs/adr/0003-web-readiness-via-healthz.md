# ADR 0003：web 侧真实链路就绪判定改为查询 ai-service /healthz

- 状态：已采纳（2026-09-22）
- 相关：§159 / §160 / docs/SECURITY.md「密钥与配置」/ docs/ARCHITECTURE.md 边界纪律 2

## 背景

M1 的 DEMO MODE 标识与 `/api/ai/run` 的路由决策（走真实 ai-service 还是本地确定性 Mock）都依赖
`apps/web/src/lib/env.ts` 的 `getAiCapabilities()` / `isDemoMode()`。

早期实现通过"web 进程环境变量里有没有 provider key"来判断是否进入真实链路。这有两个问题：

1. 直接违背 `docs/SECURITY.md` 的硬边界——**"Provider key 只在 ai-service 进程；web 永不接触"**。web 读 key 的存在性本身就是接触密钥面。
2. 误判：真实场景是 ai-service 配了 key、web 没配。此时 web 判定 `demo`，把已就绪的真实链路错误降级成 DEMO；反之若给 web 也塞 key 才能点亮，又把密钥扩散到了第二个进程。

## 选项

- A. 保持 web 读自身 env（现状）：违背边界，且部署时要在两个进程重复配 key。
- B. web 每次渲染转发/持有 key 给 ai-service：把密钥搬进 web 进程，更糟。
- C. web 向 ai-service `/healthz` 询问它自己的 provider 就绪状态，key 只活在 ai-service。

## 决定

采用 C。`getAiCapabilities()` / `isDemoMode()` 改为 **async**，通过 `fetchAiServiceHealth()` 拉取 `HealthResponse`：

- `text`：以 `health.capability === 'real'` 为准（llm provider 就绪即 real）。
- `image` / `video`：在 `health.providers[]` 中按 `kind` 查 `status === 'real'`（M1 恒 demo，为 M2/M5 预留升级路径）。
- 调用方若已探测过 `/healthz`（如首页 readiness 面板），把结果作为 `prefetched` 传入，避免同一次渲染重复探测。
- `prefetched === undefined` 表示"尚未探测"→ 触发一次 `fetchAiServiceHealth()`；`null` 表示"探测过但服务不可达"→ 如实回落 `demo`，绝不编造真实状态（§159）。

三处调用点（`app/page.tsx`、`app/api/ai/run/route.ts`、`app/studio/[projectId]/page.tsx`）相应改为 `await`。

## 后果

- 正面：provider key 单进程持有，符合安全边界；"ai-service 就绪即真实链路"判定正确，无需在 web 重复配 key。
- 代价：能力判定由同步变异步，页面渲染多一次本地 HTTP 探测（1.5s 超时，`cache:'no-store'`）；拿不到 ai-service 时诚实显示 DEMO MODE（§160），不误报可用。
- 边界：`/healthz` 不可达 ≠ provider 失败，二者错误语义在就绪面板分别展示（serviceState: missing/ready/unreachable）。
