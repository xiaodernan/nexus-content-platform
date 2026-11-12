# §AILIVE-3 · 真 provider 走 Studio 风格的设计请求——整套 CSRF + session + 项目 + 装配 + AI 之后，拿到真模型的真句子

## 目的

§AILIVE-1 接通了 provider，§AILIVE-2 证明 CSRF→session→项目→ai/run 链路真走着。本片再补两次：
`scripts/live-ai-smoke.mts`（§AILIVE-3 后置）和 `scripts/live-design-verify.mts`（纯查库判断补丁是否落库）。

## 跑法

```
npx tsx --tsconfig apps/web/tsconfig.json scripts/live-ai-smoke.mts --confirm-real
npx tsx --tsconfig apps/web/tsconfig.json scripts/live-design-smoke.mts --confirm-real
```

（后一个等于 §AILIVE-3 所示：先建项目 → 读文档 → 提交 design-edit 诉求 → 查 DB）

## 实测（user 供给的 `gpt-6-sol` + localhost:3100 web）

每轮 `design-smoke <ns>` 产生一个 throwaway 项目；document 层有 8 个 nodes 全是初始 Home 的
Eyebrow/Headline/Subhead/Primary/Secondary/Hero/Frame/Actions。

- `POST /api/ai/run` HTTP 200；
  `capability: real`，`provider: openai-compatible`，`model: gpt-6-sol`，`patches: 1`；
  explanation=「已在 Home 页的「Eyebrow」文本节点（<nodeId>）上用 set op 把 fontSize 从 **12** 改为 **28**」；
- `agent_tasks` 落 6 行 `status=succeeded, cap=real`；

## 说不清的地方（如实记）

- **patches 未落库**：本次走"web assemble → ai-service → 返回 patches 给 client"这一最简 contract——
  Studio 的 client（`StudioDock` 的 useAgentSubmit 路径）才真正 applyPatch 并发 `/design` → 表。
  本次 smoke 不走那一步；design_nodes.tutorials 在 pdf-use.dan…，`fontSize=12` 没变不属于链路 bug。
- token 没跑通完整 Studio UX；`/studio/<projectId>` 页面没被本脚本打开，无渲染证据。
- 模型自述 "Eyebrow" 以"首段文字"挑节点——真模型确实挑到真实节点 id，链路走通真，但未独立校验到 op→DB。
- 本库有 ~1100 个历史测试 project；本片只观察 id 最大那三次。

## 仍欠

- 完整编排 → patches → `/design` PATCH → 查 op 确实落了 DB 的真端到端链（有截图才叫验证）；
- 模型自称 小纳，OpenAI 开发——prompt 行为仍有国度问题（ADR-0168 已指出）；
- 没装满 document prune（自己建项目自己长，必然 tokenPrice ≈ 0）
- 模型 `/plan` 字形被 `applyPatch` 严格校验（§ lanes）的地方没验证，多数仍然风险。
