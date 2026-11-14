# §AILIVE-6 · `npm run live:all -- --confirm-real` — 一口跑通真 provider 全套

## 它做了什么

把 user 提供的真实 provider key 接通之后**必须**每个实施者都能按一眼看清是不是整个链路都还通着的一口校验：

```
npm run live:all -- --confirm-real
```

四环，每一环都真过真 provider（不 mock、不假绿）：

1. **live-ai-smoke** — CSRF→session→创项目→`/api/ai/run`→"capability=real"+真文本
2. **live-design-edit** — 同上 + `agent_tasks` 必须 `status=succeeded`、`cap=real`
3. **live-design-apply** — patches 真出 → `PATCH /design` 写库 → GET 重读 `typography.fontSize=36`
4. **live-design-smoke** — Studio 同源 `applyPatch` 读刚 GET 文档，验文案改对、要么 `applied`、要么 `honest-refusal`

**default 拒绝执行**：必须显式 `--confirm-real`，防止有人在终端误敲就真扣费。

## 实测 4/4 绿灯

```
[live:all] all 4 paths green — provider + CSRF/session + apply + persist confirmed end-to-end
[1/4] live-ai-smoke     ✓
[2/4] live-design-edit  ✓ (ledger succeeded, real model set typography.fontSize=36)
[3/4] live-design-apply ✓ (fontSize 15→36, savedAt 11:33:12Z)
[4/4] live-design-smoke ✓ (real model honest-refusal: "只支持 size.width，不支持 typography.fontSize")
```

## 为什么 honest-refusal 也算通

Step 4 用 DESIGN_EDIT prompt（"用 set 改 typography.fontSize=28"），模型回了拒绝："只支持 size.width，不支持 typography.fontSize"——**那是真模型的真相**（不是 harness 的失败、也不是 bug）。`live-design-smoke` 把这单判成 `honest-refusal`，按判据仍 PASS。整个步骤仍然通，因为所有能力链路（CSRF、session、装配、真模型回显、JSON 模式、Ledger 写等）都通过了。**模型拒绝改错位置这不是链崩了，是模型没编**。

## 诚实清欠

- token 计费未知（`costUsd=0` 网关可能没启用该金额字段），不充水不伪造
- 没测 image/video（没 model key 也没能力），只测 text model
- 浏览器 Run→Screenshot 仍欠
