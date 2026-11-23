# ADR-0228 · 本机 Provider 连通 recipe（Clash Verge 7897 + NEXUS_LLM_STREAM=1 + ai-service :8001）

状态：历史 recipe（2026-11-17 落地；当前 provider 已关闭，见 ADR-0317）

> **2026-11-24 更新**：ADR-0317 取代本文任何“按 recipe 起服务即可恢复 `capability=real`”的承诺。
> 本文保留为历史接线记录；只有 API 恢复、凭据有效且真实 liveness 探测成功，才可宣称 `real`。

## 背景
用户点名「一直显示非流」「命中率低」「连不上 provider」。根因：本机
`apps/ai-service/.env` 把 `NEXUS_LLM_STREAM=0` 钉死，代码默认 `llm_stream=True`（v694 起）；
直连 `https://api.aizzz.xyz/v1` HTTP 403 必须走 Clash Verge mixin 端口 `http://127.0.0.1:7897`；
`/home` sibling 占用 8000，`ai-service` 默认 8000 不可用，必须改 8001 或别的端口；
`apps/web` 需要 `NEXUS_AI_SERVICE_URL=http://127.0.0.1:8001` 指过去，否则一切 /api/bible/q 503（honest §159 路径）。

## 决定
- 本机 local dev 按此组合起跑，public 实例（Docker/Jenkins/K8s）不走 Clash，走自有 Egress 白名单。
- 本 recipe 不入仓（.env 与环境变量各自本地）；证据与步骤写入 evidence 档。
- 生命周期：本机 dev 期间 ai-service 8001 常驻附属；deployments 走各自平台的配置。

## 决定的理由
- 本机为人工作环境，本机无 K8s 任务构建方式不能升职为"配置默认"，它只是本机开发姿势。
- 上游 aizzz.xyz 只放行 Clash Verge 的 7897；"stream SSE vs non-stream" 在我们观察中性能差异大（stream TTFT 2.4s vs non-stream 2.8–3.7s）；
  同时能说明 distributor channel-local cache 的行为：cached_tokens 在 streak 间稳定可 QA。

## 后果
- 任何本地 fresh clone：API 恢复且凭据有效时，可按本历史 recipe 接线；但 `capability=real`
  仍须由真实 liveness 探测判定，不能由配置存在推定（ADR-0317）。
- evidence 档 §PROVED-12 留 18.7× speedup；
- 仍未验证 production 部署：Docker/Jenkins 行为不在此范围。
