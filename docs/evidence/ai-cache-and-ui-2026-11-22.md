# 真机读数 · 2026-11-22（缓存 / 移动端溢出 / 观察站 AI 清单）

机器：Windows 11 本机 · web `127.0.0.1:3100` · ai-service `127.0.0.1:3200` · provider `api.aizzz.xyz/v1` · 模型 `gpt-6.2-sol`

## 1. 前缀缓存：同 prompt 连打三次，第 2 次起 100%

命令：`npm run live:cache-probe -- --confirm-real`

| 调用 | tokensIn | cachedTokens | 命中率 |
|---|---|---|---|
| call-1 | 347,185 | 0 | 0% |
| call-2 | 347,185 | 347,185 | 100% |
| call-3 | 347,185 | 347,185 | 100% |

脚本结论行：`[live] stream-cache latched after first call ✓`

- 347k 的输入说明上下文没有被截断（远高于用户提到的 5–9 万），前缀在第二次起稳定复用；
- 该探针走 `NEXUS_LLM_STREAM=1` 的流式路径（`apps/ai-service/.env:23`），与"非流命中率低"的旧现象分开。

## 2. 公开页移动端横向溢出巡检（390×844）

12 条路由全部 `scrollWidth == clientWidth == 390`，无横向溢出：
`/`、`/guide`、`/discover`、`/marketplace`、`/pulse`、`/insight`、`/map`、`/daily`、
`/onboarding`、`/about-nexus`、`/bible`、`/stategraph`。

## 3. 观察站「AI 深读 · 结构化清单」真机点击

- 口令 123 进入 `/admin/observe`，点击「生成 AI 深度建议」；
- 返回 4 条结构化建议（HIGH/HIGH/MEDIUM/LOW），`pageerror` 为 0；
- 其中 1 条带 `.obs-aiAdviceAudit` 标注：模型写出的 `0.08%` 不在喂给它的聚合快照里，
  被标为「未在快照原文出现（可能是模型推算）」；
- 样式读数：`display:grid`、`padding:16px`、`border-radius:10px`、按钮背景 `rgb(139, 92, 246)`
  ——此前这五个类名在 `globals.css` 里零定义，是裸按钮。

## 4. 并行会话缓存（`npm run probe:cache-parallel`，4 路）

生产路径 web → ai-service → provider，system 前缀 24,208 字符：

| 组 | 形状 | 读数 |
|---|---|---|
| P0/cold | 顺序首打 | tokensIn=26205 · cached=0（0.0%，provider 未报） |
| P0/warm | 顺序第二打 | cached=26205（100.0%）· 0.08s |
| P1 ×4 | 同前缀、不同 user，同毫秒并发 | 每组 cached=23101（88.2%）· 2.81–5.55s |
| P2 ×4 | 字节完全相同，同毫秒并发 | 全部 100.0% · 0.12–0.38s（被合并/回放） |
| P3 | 并发后再顺序一发 | 100.0% · 0.09s |

**PASS**：并行会话下 lane 稳定、同文并发被合并、并发后缓存自愈。
注意 P1 的 88.2% 不是"掉了"：8 路并发里每条 user 不同，system 前缀仍然全命中，
差额正是各自不同的 user 段——这与"同前缀共享、变体各付各的"的预期一致。
