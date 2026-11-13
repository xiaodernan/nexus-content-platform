# ADR-0257：§FE-103 `verify:fe-gates`——把门面矩阵钉入可执行门禁

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-37…§FE-101/§FE-102/§FE-104 · `tools/ci/fe-gates.mjs` · `package.json#verify:fe-gates` · `docs/evidence/fe-103-verify-fe-gates/evidence.md`

## 背景

FE-37…FE-101 把 `apps/web` 全树切到了 token 门面族，并配套了 35+ 个 `*-visual-style.test.ts`（redact SHA 守恒 + 每片 ADR/evidence）。这些判据每片都可单独跑，但**"判据集"不是门禁**——只有把它们钉成一条命令并列进 `package.json` scripts，任何人收官前都能复现。2026-11-13 合跑时 **94 套 / 969 判据全绿**（FE-37 至 FE-102 全班，含并行会话留下的 warnDEMO 修正经 §FE-104 入账）。

## 决定

1. `tools/ci/fe-gates.mjs`：显式 `readdir` 遍历 `apps/web/test/*-visual-style.test.ts`，本地展开后交给 `npx vitest run --reporter=dot`——Windows 下不让 shell 误解通配符，也不让 vitest 自带过滤语义相互对不上（实测 `node tools/ci/fe-gates.mjs` 退出零）。
2. `package.json` 新增 `verify:fe-gates` → `node tools/ci/fe-gates.mjs`。
3. 本片**不**自动接入任何 hook/CI——与 §FE-102 的 `no-raw-tailwind` 同一克制（不动 codex-global hook）；它是收官前一次可执行自检。
4. 本门禁**不**承诺覆盖行为测试（route/domain/db）——只守"没有原子泄漏 + SHA 守恒 + 判据闭环"三条线；行为链路仍由 `test:main` / 各 verify:* 各管各的。

## 取舍

- glob 收集基于命名约定 `*-visual-style.test.ts`——FE 系列锁定的命名，新片必须遵循（收官 ADR 才不被割裂）；
- 不引入 reporter/counts 可配置——`dot` 已够。失败即停，退出码即结论；
- 不承诺"修复回归"本身——门禁只报告事实，不修。

## 后果

FE 门面矩阵从『手写命令跑过一次』升级为 `npm run verify:fe-gates` 任何人可复现。FE 系列收尾现在有统一门禁：`tsc` + `verify:fe-gates` + `verify:no-raw-tailwind`。
