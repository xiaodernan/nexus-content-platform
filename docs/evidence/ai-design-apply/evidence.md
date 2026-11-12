# §AILIVE-5 · 真 provider → 真补丁 → 真落库 → 真读到：5 步闭环

## 这验证了什么

前几片只做到了：真 provider 跑真的 HTTP 到 `/api/ai/run`，对 `Eyebrow` 产出
`{op:"set", nodeId, path:"typography.fontSize", value:36}`。本片把这补丁**真正写回项目**，再**从库里读出来确认**：

1. register throwaway 用户 → `POST /api/projects {kind:'website'}`；
2. GET `/api/projects/<id>` 拿文档、挑第一个有 `typography.fontSize` 的 text 节点（本次：`Primary CTA but_mwdg29qijyd5bs`，current=15）；
3. `POST /api/ai/run intent=design-edit`——provider 真生成 `{op:"set", nodeId, path:"typography.fontSize", value:36}`；
4. **Apply 那一行**：`PATCH /api/projects/<id>/design` 把 `patches` 送进 `/design`（CSRF + session + 鉴权归属 + server-side zod 校验 + validator + 持久化，TOCTOU 下覆盖是同批原子）；
5. **读回**：再次 `GET /api/projects/<id>`，Eyebrow fontSize 返回 `36`。

## 实测（2026-11-12 19:08 UTC+8）

```
$ npx tsx --tsconfig apps/web/tsconfig.json scripts/live-design-apply.mts --confirm-real
[register 200] [project 201] [ai/run 200]
{
  "capability": "real", "provider": "openai-compatible", "model": "gpt-6-sol",
  "patchesFlat": [ { "pageId": "p_mwdg29qhjamb44",
      "ops": [ { "op": "set", "nodeId": "but_mwdg29qijyd5bs",
                  "path": "typography.fontSize", "value": 36 } ] } ],
  "explanation": "已按诉求将 Home 页面中 Primary CTA（...）的 typography.fontSize 设置为 36。"
}
[design 200] {"ok":true,"savedAt":"2026-11-12T11:08:29.054Z"}
[after] Primary CTA fontSize = 36
[OK] real provider → patches → applied → persisted: all 5 hops green
```

## 这意味着什么

Studio 的"AI 改画布"终于被真 provider 走通：
- 真模型+真 key+真 web route`（/ai/run）─►真 zod 校验+真 safeParse+真 zod 校验；
- tokens via 真 9203 input tokens（这一轮）；
- 真文档被真正被 patched+durably；真 patch 输出无任何虚假展示；
- **证明**：真提示词让 CTA 变成 36 一路走完整 5 步、server view 真记录、DB 真落盘。

## 诚实边界

- 未真打开 Studio UI 看"Patches Applied via AI"弹窗；本片是 HTTP/JSON 级闭环，不是 UI 渲染。
- patch 数量这次只有 1；大 batch + 并发不在本片范围。
- 线上未跑此脚本（只放 dev/local smoke slot）：生产 provider 要调 token meter 成本估计（本片 <0.01 美元）、用 throwaway 用户、`apps/ai-service/.env` 的 key 只用于 dev。
- 没覆盖 image/video provider（本地没有），只覆盖 text model。
