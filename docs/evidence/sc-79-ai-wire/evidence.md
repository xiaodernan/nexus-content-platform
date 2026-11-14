# §SC-79 · /admin/realtime capability 诊断——admin 能看见了

## 做的事

用户提供真实 provider 后，admin `/admin/realtime` 之前没法回答「ai 真的在真跑 vendor 还是
mock DEMO」。补一个 `ai-capability` 段（sibling of Java）：

| 字段（service/capability/providers[]/queue → `/admin/realtime` 里新增 `data-ai-capability` 区） |
|---|
| `service` — `nexus-ai-service 0.1.0` |
| `capability` — `real | mock | unavailable` |
| `providers[]` — `llm:real[gpt-6-sol/text-embedding-3-small], …` |
| `queue` — `redis (capacity=1, pending=0, running=0)` |

未拿到 / token error / 回执不认识 → 画一句诚实回执，不画 0 也不写真/假。

## 三层实证

### 单元测试（apps/web/test/realtime-stats-readout.test.ts）

- `isKnownStats` 缺省/null/真形状均通过（before 27 → after **30**）
- `aiCapabilityPanelRows` null → null；真实形状 → 4 行（service/capability/providers/queue），providers 含 gpt-6-sol
- eslint/tsc 双绿

### 服务端 round-trip（ADMIN 夹具 obs-admin+fixture@nexus.test / role=admin）

- `/api/admin/realtime` HTTP 200，回执 JSON 含新字段 `aiCapability`：
```json
{
  "service":"nexus-ai-service","version":"0.1.0","capability":"real",
  "providers":[
    {"kind":"llm","name":"openai-compatible","status":"real",
     "models":["gpt-6-sol","text-embedding-3-small"],"reason":""}, …
  ],
  "queue":{"backend":"redis","pending":0,"running":0,"capacity":1,"note":"作业存在 Redis 里（带 TTL）：重启不丢，多副本部署时轮询打到任何一台都能查到。"}
}
```
Admin 正确登录（role=admin）、role=member 同一端点 → 403 forbidden。

## 诚实边界

- 浏览器视觉 Run→Screenshot §158 没做（browser 本会话掉线 + 多 agent 抢资源）——本证据只声称 HTTP 维 + 单元测；
  真渲染留给下一次干净 Chrome 会话 + a11y-internal 一类权威套件。
- 新 section 不与既有 Java section 共享代码；沿 java-wire 接线口径（shape 守门 → panel row 判据独立）。
- 未优化任何 `/api/admin/realtime` 调用路径。
