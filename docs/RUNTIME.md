# RUNTIME — 运行、预览、发布、本地开发

## 本机最小启动组合（内存只有 ~2.5GB 空闲，必须按需启动）

| 组合 | 服务 | 用途 |
| --- | --- | --- |
| `dev-core` | Postgres + Redis | 数据与队列（MinIO 不启时资产走本地磁盘） |
| `dev-studio` | + web (Next.js) | Studio 手工编辑/持久化 |
| `dev-ai` | + ai-service (FastAPI) | Agent 与生成（Mock 时也必须启，因为截图/QA 在 Python 侧） |
| `dev-full` | + MinIO | 资产/导出对象存储路径联调 |

启动脚本（根目录 `package.json` scripts）：

```bash
npm run infra:up       # 只起 postgres(+redis)
npm run infra:up:full  # 加 minio
npm run dev            # web
npm run dev:ai         # ai-service (uvicorn)
npm run dev:all        # web + ai，单终端
npm run infra:down     # 停止（不删卷）
```

端口固定（详见 `docs/ENVIRONMENT.md`，避免与本机已有容器冲突）：
web `3100` · ai-service `8000` · postgres `55433` · redis `56379` · minio `59000/59001`。

## 作品运行时（§55）

任何项目 `Design → Build → Runtime`，都可点 **PLAY**。Runtime 类型：
interactive story · game · 3D world · interactive website · AI character。

M1 实现的 Runtime = **只读渲染器**：从 design model 直接渲染，响应 interactions（§123）与 states（§124），
不执行用户代码。M4 起接入 Three.js / React Three Fiber 世界运行时（walk/explore/talk，§140）。

## 预览与沙箱（§81-83）

生成代码必须在 **Isolated Preview Runtime** 中运行：

```
project → build sandbox(临时目录 + 超时 + CPU/内存上限 + 无网络) → preview URL（独立随机子域/端口）
```

M1 允许降级为"受限渲染 + iframe sandbox(`allow-scripts` only, `null` origin, CSP 白名单)"，
一旦允许真实代码执行必须满足 `docs/SECURITY.md` 的沙箱清单，否则 UI 明确标注当前为受限预览模式。

## 部署环境（§83）

`Preview`（每次 AI 事务/手动保存后自动构建）· `Staging`（分支级）· `Production`（publish 通过 Quality Gate 后）。
M1 三者都在本机：preview 走内存工作区，staging 走快照，production 走发布记录 + 静态产物。

## 分享与发布（§56-57）

每个作品有 `/n/<username>/<slug>`。发布可见性：`public` / `unlisted` / `private`。
- `private`：仅所有者，Studio 链接
- `unlisted`：知道链接者可访问，不进 Explore，不加索引
- `public`：进 Explore/搜索/SEO（SSR + metadata + OpenGraph + JSON-LD + sitemap，§166），发布前过审核流水线（§131）

## 事件与实时（§95 / §163-164）

内部事件名固定：
```
project.created design.updated asset.generated agent.started agent.completed
project.published game.played user.liked project.remixed
```
前端通过 WebSocket 接收 generation progress / agent status / build status / preview status，
并转成通知（Generation complete · Build complete · Agent task complete · Publish complete）。

## 任务队列（§162）

图片、视频、3D、复杂 Agent 任务：`Queue → Worker → Progress → Result`。
M1 用 Redis List + FastAPI 后台 worker（同进程多 worker，可水平扩）；长任务返回 `task_id`，客户端订阅事件流。

## 导出（§103）

M1：PNG · SVG · PDF · HTML · React · Project ZIP（含 `.nexus/` 结构，§102）。
未来：Figma · Godot · Unity · Unreal。
所有导出必须能被"另一个 NEXUS 实例"重新导入（无锁定，§144）。
