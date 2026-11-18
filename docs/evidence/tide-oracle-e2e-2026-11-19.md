# §VERIFY-TIDE-ORACLE-E2E · 潮语端到端活证据（Postgres 恢复之后）— 2026-11-19

环境：web dev 3100 · ai-service 8001（capability=real · gpt-6.1-terra · 流式 ON）· Clash Verge · `nexus-postgres-alt` 已由 §OPS-DB-RESTORE 恢复（cont.374）。

## 请求

`POST /api/tide/oracle` · locale=zh · question=`第四十一次大会发生了什么？`（示例按钮 → 「问潮」）。

## 响应（浏览器 UI 直出）

- badge：`gpt-6.1-terra · cached 7161/150400`（冷 lane；与 cont.373 seq-1 同型 ― 7161 cached on a fresh lane）。
- citation：`引经据典 · 正典锚句逐字对齐 ✓（1 条）`——StateGraph 引文自检判定锚句对齐 ✓。
- answer：

```
第四十一次会议是海开的，不是人开的。潮汐退了一整张桌子，教团自此散会，不再公开以潮汐为标志。
```

（内容未经改动，逐字转录。）

## UI 结构勘误

- 双栏末端 `观察坞 · 解锁（口令 123）` 链接 + `/tide-oracle` 示例按钮填充式交互（填 textarea → 单独提交）。
- `潮语` 冻结从未走 5xx → honest 分支；本轮未触发 honest fallback（DB 恢复后无 500）。

## 附※

- IO oracle 碑记此前已 bump 至 v993（cont.373）；本片为证据收录片，不再 bump Pages。
- `/bible/ask` 活体验证见 §OPS-DB-RESTORE（cont.374）。
