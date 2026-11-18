# Evidence · cont. 222 StateGraph 默认车道 · 2026-11-18

环境：prod build（next build）+ next start :3461 · ai-service uvicorn :3200 · provider gpt-6.1-terra @ aizzz（Clash 7897）· 真实注册用户（新账）+ 真实新建项目（website）。

| 诉求 | 命令 | 结果 |
|---|---|---|
| 缺省车道 | POST /api/ai/run（无 header） | **HTTP 200 · capability=real · model=gpt-6.1-terra · x-nexus-orchestration=stategraph** |
| 上下文缓存 | 同上，响应 usage | tokensIn=**87,095** · cachedTokens=**80,254（92.1%）** · cacheReported=true |
| 逃生门 | 同请求 + header `x-nexus-orchestration: lane-a` | **HTTP 200 · x-nexus-orchestration=lane-a** · capability=real |
| 车道回声单测 | `vitest run orchestration-lane.test.ts` | **4/4 PASS** |
| 车道回声集成（真库真账） | `vitest run ai-run-orchestration-lane.integration.test.ts` | **4/4 PASS**（stategraph 默认回声 / lane-a 逃生门 / 乱传拼写回落 stategraph） |
| 全门禁 | `npm run verify:fe-gates` | **147/147 · 1353/1353** |
| 类型 | `tsc -p apps/web/tsconfig.json --noEmit` | **0 errors** |

ADR-0236 落账；guide（zh/en）与路由注释同步为"默认 stategraph，逃生门 lane-a"。docker slate 状态正常，heal 无需介入。
