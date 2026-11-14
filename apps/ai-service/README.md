# NEXUS AI Service (`@nexus/ai-service`)

设计 Agent / 代码 Agent / 角色对话 / 异步作业的 **provider 语汇的唯一落点**——web 进程从不直接持 provider key，所有出网调用都经过此服务（§76-79, §159）。

## 怎么跑

```bash
bash infra/dev-ai.sh          # http://127.0.0.1:3200  (AI_SERVICE_PORT 可覆盖)
```

`.env` 读自这里（`apps/ai-service/.env`，已 gitignored）：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `NEXUS_OPENAI_API_KEY` | 无 | 要真 provider 才填；没填则 `capability=unavailable`，**诚实，不冒充** |
| `NEXUS_OPENAI_BASE_URL` | `https://api.openai.com/v1` | 本机开发目前指向 `https://wkapi.pro/v1` |
| `NEXUS_OPENAI_PROMPT_CACHE_KEY` | `nexus-studio` | **prompt caching lane**：unset→缺省 `nexus-studio`；显式空串→关 |
| `NEXUS_MODEL_{FAST,BALANCED,REASONING,VISION,EMBEDDING}` | 见 `config.py:DEFAULT_MODELS` | 本机实测 ws unavailable（wkapi.pro 仅 exposed chat models） |
| `NEXUS_LLM_JSON_MODE` | `1` | response_format json_object |
| `NEXUS_REDIS_URL` | 无 | 配置则启用 Redis 队列（`nexus:ai:*` + TTL）；连不上**启动失败**（不静默降级） |
| `AI_SERVICE_PORT` | `3200` | uvicorn 监听端口 |

## 端点

- `GET /healthz` — 能力/模型/队列 三格诚实报告（§159）
- `GET /v1/capabilities` — 同上
- `POST /v1/ai/run` — 设计请求：补丁生成、审批挂起；**契约校验前置**，违约 400/500， provider 违约 502
- `POST /v1/ai/chat` — 角色对话（§47）：纯文本；对话不落代际库
- `POST /v1/ai/jobs` — 提交异步作业（图片/视频/3D 等长时任务）
- `POST /v1/ai/jobs/{id}/cancel` — 取消
- `GET /v1/ai/jobs/{id}` — 查状态

## 真实 provider（2026-11-12 起）

本机开发默认接 wkapi.pro 的 `gpt-6-sol`（`/healthz` 报 `capability=real`，model 真能用、`provider/prompt_cache_lane` 都能看见）。Key **仅活在 ai-service 进程**（`__repr__` 脱敏，永不入日志）；web 进程不持 key。

**连接失败怎么办**：healthz 退回 `unavailable` + 真实原因；所有 AI 端点返回 `503 provider-unavailable` 且 `demoMode=false` 或 `mock`（UI 依据 `getAiCapabilities()` 挂"未配置/DEMO"徽标，§160）。没有"看起来配了却静默跑 DEMO"的中间态。

## Prompt caching（§AILIVE-4 · 2026-11-13）

OpenAI 兼容网关若命中 128-token 块前缀，自动缓存（prefix-identical）；本服务按 OpenAI 官方参数 `prompt_cache_key` 发 lane，把同一 workload 的补丁推到同一分片，命中后网关在 `usage.prompt_tokens_details.cached_tokens` 报数。实测：同 payload 第二次 `cached_tokens=6272/6413（97.8%）`；`stream_options include_usage` 的结尾帧被网关砍掉——非 stream 接口拿不到不能读数。

- 缺省 lane = `nexus-studio`；`NEXUS_OPENAI_PROMPT_CACHE_KEY=`（显式空串）关
- usage 契约新增 `cachedTokens`（default 0），加法兼容，没字段的 provider 一律记 0
- 验证：`npm run probe:cache`（L1 直连 / L2 /v1/ai/run 都 `ALL PASS` 才算宣称接通）
- 详见 `apps/ai-service/.env.example`（必填项明示）、`docs/adr/0261-prompt-cache-key-wire-proof.md`、evidence、ADR

## 运维往来

- 进程归属（谁 hold 住 3200；pid 两层；别跨线程杀错）→ `docs/environment/port-3200-ai-service-owner.md`
- 重启 = `bash infra/dev-ai.sh`（从本仓根目录跑）；**不要把`pkill`当分块方案**——会误伤并行线的 uvicorn
- 约束全文见 `docs/ARCHITECTURE.md`（provider 可替换性、进程边界、契约方向）

## 结构

```
src/ai_service/
  app.py            # FastAPI 入口（/healthz + /v1/* + jobs 子进程装配）
  config.py         # Settings / load_settings / sanitize_no_proxy（NO_PROXY 方括号清洗）
  design_prompt.py  # system prompt 压缩、截断留痕、reply 解析
  execution.py      # 设计请求执行器 + chat 执行器（同步）
  jobs.py           # 内存/Redis 队列 + Worker 协程
  contract.py       # 自垃圾合同文件包（validator）
  providers/        # LLMProvider / EmbeddingProvider 协议 + openai-compatible 实现 + Registry
  __main__.py       # entrypoint
```

遵循 AGENTS.md：无假 provider、无假完成、`capability` 永远诚实报告、DEMO MODE 不冒充真。

See also (repo root): `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/ENVIRONMENT.md`, `docs/adr/0261-…`, `docs/evidence/ailive-4-cache-2026-11-13.md`.
