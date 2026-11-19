# Provider 宕机 Runbook · aizzz.xyz · 2026-11-19

## 症状（本会话从实测拿到的原文，非转述）

直测（直连、Clash 7897）`POST https://api.aizzz.xyz/v1/chat/completions`：
```
HTTP/1.1 503
{"error":{"code":"model_not_found",
          "message":"分组 GPT特价 下模型 gpt-6.1-terra 无可用渠道（distributor）",
          "type":"new_api_error"}}
```
传递 token：**脱敏**（用户 2026-11-17 提供的那一把 `sk-…FRwdP` 系列；本仓库不保存）
request id（同一 incident 连续实测，时间戳递增）：
- 202611190257416973394518268d9d63VOL1sS1
- 202611190257462208928718268d9d6rUyDYdB4
- 202611190258363739462798268d9d6qSNjJw7K
- 202611190259525611736858268d9d63K9Gmana
- 202611190313086730721078268d9d6N37ACZkI
- 202611190423383810454418268d9d6mae82Ym9
- 202611190456578872757468268d9d6OOwsmCM
- 202611190502389672729898268d9d6zztV7YTK

（时间戳前 8 位为日期 20261119，不挂密钥；request id 保留全长方便服务商 grep。）

## 已验证排除项（非项目问题）

| 假设 | 排除证据 |
|---|---|
| Clash 7897 节点问题 | 同样直连 Clash 7897 的 0606/0730 探测成功（HTTP 200 · `"READY."`） |
| Key 失效/格式 | 成功调用时同样 Key 真通 |
| 网关地址错 | 与今天 morning 成功调用完全相同的 URL（`./v1/chat/completions`） |
| 代码回归 | 本机连续 10 次成功、p50 6140ms；同请求在网关侧仍然 503 |
| 并发占满 | 仅 2 次顺序 curl，无并发 |

## 用户侧唯一行动

- 登录 aizzz.xyz 后台 → 分组 **GPT特价** → 模型 **gpt-6.1-terra** 渠道状态改回「正常」
- 若「正常」但仍 503：开服务商 ticket，附：分组名 GPT特价、模型 gpt-6.1-terra、request id 202611190258363739462798268d9d6qSNjJw7K，原句 message：`分组 GPT特价 下模型 gpt-6.1-terra 无可用渠道（distributor）`
- 恢复后：ai-service 冷启动 → `GET /healthz` 看 `llmLive.state=ok` → tide/ask/deep-read 自动复活
- 吊销本对话暴露的 PAT（`ghp_08ad…`）+ 换新 key，别再把 key 贴到任何聊天/issue 里

## 降级纪律（代码侧）

`apps/ai-service/.env` 中 `AI_SERVICE_ALLOW_DEGRADED_STORE` 只在本机启用（内存队列），
生产 **禁止**。健康检查 probes 为 2 时 `llmLive=degraded` 立刻被识别（本会话 12:32/15:13 实测 4/15 出错即 alarm）。
