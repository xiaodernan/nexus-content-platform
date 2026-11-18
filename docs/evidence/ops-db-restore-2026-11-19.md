# §OPS-DB-RESTORE · `nexus-postgres-alt` 恢复 + /bible/ask 端到端活体验证 — 2026-11-19

## 现象

- 本机 web dev（`npm run dev -w @nexus/web`，3100）上 `/` 及 `/api/*` 全 500：
  log 同一根因：`Error: connect ECONNREFUSED 127.0.0.1:5443`
  （`sessionOwnerByToken` → Drizzle `requireUser`）。
- `docker ps`：`nexus-postgres-alt`（`0.0.0.0:5443->5432`）`Exited (255) About an hour ago`；
  主仓 `nexus-postgres` 亦 `Exited (0)` 6 小时。

## 处置

`docker start nexus-postgres-alt` → 容器 6 秒 Up · `0.0.0.0:5443->5432`；`/` 恢复 HTTP 200。

## 端到端活体验证（/bible/ask · 浏览器直测）

实例 → 3100 → ai-service 8001 → Clash Verge → aizzz gateway（gpt-6.1-terra · 流式）。

```
question: 《收件人》里谁收到了那张签收单？（示例按钮 · 中文）
answer:   《收件人》里没有人签收那张签收单；收件人没有来认领。见《远信》第二节。
badge:    gpt-6.1-terra · 缓存复用 141,182 tokens   ← 93.9% 命中，证据 cont.373 的 2×141,186 同款 lane
```

page lede：正典（13 章）+ 回响（135 篇）—— v992 §BIBLE-135 已入前端。

## 遗留（如实）

- `nexus-postgres-alt` 是本机运维手动起停的容器（exit 255 是崩溃码，非正常退出）；
  生产/CI 不依赖它。重启后 schema/数据完整（`nexus-pgdata` volume 持久）。
- `nexus-postgres`（55433 宿主桥）仍然 Exited；per summary 2026-11 其 bridge 失效，不复活。
- 浏览器截图在本机会话不可用（desktop window 不可见）—— 视觉检查仅以无障碍快照做。
