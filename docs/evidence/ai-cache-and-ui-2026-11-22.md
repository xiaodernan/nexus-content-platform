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
