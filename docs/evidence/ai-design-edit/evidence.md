# §AILIVE-4 · 真 provider 端到端设计编辑——HTTP + agent_tasks ledger 同时验证

## 这次验证了什么

这不是「HTTP 200 就算成功」，而是在真模型、真装配、真调用、真落库之下，从请求到补丁生效：

1. 注册抛弃用户 → `POST /api/projects`（kind=website）；
2. `GET /api/projects/<id>` 拿到文档，找第一个 text 节点（本轮：Headline `tex_mwdfsb1z6rqamo`）；
3. `POST /api/ai/run intent=design-edit selection=[<nodeId>]`；
4. **断言回复**：`capability=real` · `demoMode=false` · `provider=openai-compatible` ·
   `model=gpt-6-sol`；patches 里有 `{op:"set", nodeId, path:"typography.fontSize", value:36}`；
   explanation 引用了真实 nodeId；
5. **断言 `agent_tasks`**：新一行 `status=succeeded`，`cap=real`，`requires_approval=false`，
   `agent_key=design-edit`。
6. 另一个活人的 `POST /api/ai/run intent=critique` 先于本片走通（`live-ai-smoke`，
   未做 ops-vs-no-ops 验证——这一片就是那一寸）。

## 跑法

```
npx tsx --tsconfig apps/web/tsconfig.json scripts/live-design-edit.mts --confirm-real
```

默认拒跑（`--confirm-real`）。一次调用，~3 500 ms 真调用，一次 create-project 副作用（项目留在库里）。

## 实测（2026-11-12）

```
$ npx tsx --tsconfig apps/web/tsconfig.json scripts/live-design-edit.mts --confirm-real
[ai/run 200]
{
  "capability": "real",
  "provider": "openai-compatible",
  "model": "gpt-6-sol",
  "patches": [
    { "op": "set", "nodeId": "tex_mwdfsb1z6rqamo",
      "path": "typography.fontSize", "value": 36 }
  ],
  "explanation": "已按诉求将 Home 页 Headline 的 typography.fontSize 设为 36。",
  "usage": { "tokensIn": 9203, "tokensOut": 103, "latencyMs": 3462.6,
              "costUsd": 0, "toolCalls": 1, "demoMode": false }
}
agent_tasks id=754b52f9-00f8-40ca-9791-f57b1042b2f3 cap=real status=succeeded
            approval=false agent=design-edit
[OK] real provider declared design-edit
```

## 诚实边界

- **未覆盖**：实际 Studio client 怎么 applyPatch → 文档怎么 pixel diff 显示 → 截屏/diff 验收。那张证据
  需要 Studio 真跑 + 真 Chrome 验收——这次我只验证了 **2 个 endpoint 内部事实**（ai/run 真生成 + agent_tasks ledger）。
- 真 provider 返回 `costUsd=0`（网关未计费）；`tokensIn≈9203`/`tokensOut≈103`。
- 每次跑留一条 throwaway 用户 + 一个项目在库——删除可不就（live 类脚本，一次成）。
- provider 偶发语义漂移（比如 operation tag 大小写 / path 同义词写法）未被覆盖——
  这份脚本是判据+回归，不是 fuzzer。
