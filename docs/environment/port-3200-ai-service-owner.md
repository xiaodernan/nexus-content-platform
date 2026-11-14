# 端口 3200 — ai-service 进程归属（2026-11-13 持久记录）

> 本机有多个项目也在端口 3200 上跑 ai-service（如 `D:\终极项目\apps\ai-service`），
> 与本项目的 uvicorn 同名模块、同名 venv 结构，pid 归属容易混淆。写给未来任何 agent。

## 本项目的 3200（patched 版本，启动于 2026-11-13 16:44:25）

两层进程（venv shim → 基底解释器，Windows 的正常形态）：

| pid | 进程 | 内存 | 启动 | 项目 |
|---|---|---|---|---|
| 26664 | `D:\内容创作平台\apps\ai-service\.venv\Scripts\python.exe -m uvicorn ai_service.app:app --host 127.0.0.1 --port 3200` | 4 MB | 16:44:25 | 内容创作平台（父） |
| **33080** | `C:\Program Files\Python311\python.exe -m uvicorn ai_service.app:app --host 127.0.0.1 --port 3200`（26664 的基底子进程，真正的 worker） | ~64 MB | 16:44:25 | 内容创作平台（子，**持有 3200**） |

功能：`.env` 来自 `apps/ai-service/.env`——`NEXUS_OPENAI_BASE_URL=https://wkapi.pro/v1`，
`capability=real`（llm `real`、embedding 如实 `unavailable`、无嵌入模型），
`prompt_cache_key=nexus-studio` 已接通（impl. in §AILIVE-4）；冷暖 token `cachedTokens=6272/6413` 是它的真实回执。

## 邻居不是敌人（如实）

| pid | 路径 | 项目 | 提供端口 |
|---|---|---|---|
| 23804 | `D:\终极项目\apps\ai-service\.venv\Scripts\python.exe -c " … ai_service.create_app"` | 终极项目（并行线） | 未检测/不可定论——**未触碰** |
| 24024 | `C:\Program Files\Python311\python.exe -c " … create_app …"` | 终极项目（并行线） | 未检测/不可定论——**未触碰** |

他们跟本项目的进程**模块/端口撞车只会全部混在一起**——3200 到底谁的、往哪个 .env 生效，
唯一可靠的判定法是 `Get-NetTCPConnection -LocalPort 3200 -State Listen` → `OwningProcess`，
而不是看进程名（基底解释器同名）。

## 停机规范

- **不要**随便 kill 26664——它是 shim，真正的 worker 是 33080；只 kill 33080 会让服务半死不活；
  kill 26664 会连子进程一起清盘。
- 2026-11-13 16:29 起的早一份实例 pid 24292→26464 因 `Shell` 触发 `timeout` 信号被框架收掉，
  重起后 16:44 持有现在的实例（pid 26664→33080）——小心复现：长时服务不能用短 timeout 前台命令，
  统一走 `background=true`（无 timeout），或 `infra/dev-ai.sh`。
- 重启后 **port 3200 的 patched 行为会自动恢复**（healthz / usage 均可复验）。

关联：§AILIVE-4 · ADR-0261 · `docs/evidence/ailive-4-cache-2026-11-13.md`
