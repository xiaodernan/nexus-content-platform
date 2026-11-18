# Evidence · 潮汐签 · Tide Cast 接入 /insight · 2026-11-19

## 圈图

新增一条 LLM 真链路：
GET /insight（123 解锁）→ 点 *潮汐签 · TIDE CAST* →
POST /api/insight/tide-cast { locale: 'zh' } →
ai-service (stategraph default lane) → gpt-6.1-terra →
返回 `{ oracle, model, cachedTokens, tokensIn }`。

用户看到的不是“AI 报告”，而是「潮说两句」——与 /insight 里 InsightAiAnalysis（分析员动作建议）互补：
- 分析员：判断动作 + 数字论据
- 潮汐签：两句潮汐语调，没有方案、不挑剔数据

## 实测

| 调用 | cachedTokens | tokensIn | oracle |
|---|---|---|---|
| call-1 | 0 | （~5,112） | 总览里有3429名用户、1313个项目与140件已发布作品，近30日记录757次打开。近30日打开中87.2%来自机器人，发布趋势轻微下行，潮声仍未显出清晰方向。 |
| call-2 | **5,112** | **5,112**（100% hit） | （同上） |

## 零侵扰

- 新路由零业务数据库访问：digest 数据来自 `collectInsightSnapshot()`（与 InsightAiAnalysis 同源）
- `nexus-insight` cookie + CSRF + 按 IP 10/h 闸
- 前缀字节稳定，全模型 KV 缓存可复用（call-2 = 100% verified）
- provider 不可达 → 502，不出现伪造 oracle
- 观测结果 δ：zero commitment to any metric= personal — 入参 digest 本就是不携带任何个人字段的聚合；模型被显式禁止再从这些数据反推个人

## 暴露的复合问题

- **Docker Desktop 全军覆没**（本机、未必是同一横切）：nexus-redis / nexus-postgres（当前运行 OK，但每次 Desktop 崩溃大约 15-20 分钟）—— 已要求重启；在 probe 周期内自愈
- 没有新 proxy 配置；沿用 Clash 7897；HTTP_PROXY 未变
- 不改任何 `.env` 或 secrets
