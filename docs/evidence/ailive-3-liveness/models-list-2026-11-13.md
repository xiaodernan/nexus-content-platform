# wkapi.pro `GET /v1/models` 实测——2026-11-13

关联：§AILIVE-3 · ADR-0219（embedding liveness model_not_found）· `docs/evidence/ailive-3-liveness/live-smoke-2026-11-13.md`

## 请求

```
GET https://wkapi.pro/v1/models
Authorization: Bearer sk-<user key, 未出现在本文件>

HTTP 200, 509 bytes, success: true
```

## 响应（原样字节，只脱敏了 key 相关的事项；此端点不回显 key）

```json
{"data":[
  {"id":"gpt-5.6-sol","object":"model","created":1626777600,"owned_by":"openai","supported_endpoint_types":["openai"]},
  {"id":"gpt-5.6-terra","object":"model","created":1626777600,"owned_by":"openai","supported_endpoint_types":["openai"]},
  {"id":"gpt-6-astra","object":"model","created":1626777600,"owned_by":"openai","supported_endpoint_types":["openai"]},
  {"id":"gpt-6-sol","object":"model","created":1626777600,"owned_by":"openai","supported_endpoint_types":["openai"]}
],"object":"list","success":true}
```

## 结论

1. **本网关只提供 4 个 openai 兼容的 chat 模型**（`gpt-5.6-sol` / `gpt-5.6-terra` / `gpt-6-astra` / `gpt-6-sol`）——**没有任何 embedding 模型**。
   这是 ADR-0219 记账的 `model_not_found` 的上游根因：wkapi.pro 的 `/v1/embeddings` 模型不在服务面上。
2. 文本 chat 路径 **`capability=real`** 是可如实陈述的（模型列表与付费 smoke 请求双重佐证）：`gpt-6-sol` 是本项目当前默认模型，本 smoke 已用过。
3. 图像/视频 embedding 均**不存在**于本网关——NEXUS 任何地方"embedding 也是真的"的断言都必须是 **未验证/unavailable**，不能伪造。
4. 本探测是只读 list-models，零计费、无生成token；未新建任何 provider 档案，也没有最为必要的代码变更。

## 下一步（可选，不做也诚实）

- 如需 embedding：需要另一个带 embedding 服务的 provider（或者 wkapi.pro 为本账号开通 embedding 支持后补测）。
- `/v1/models` 的 4 个 chat 名单可作为 demo smoke 的**候选切换目标**（`gpt-6-sol` 仍是线程默认）。
