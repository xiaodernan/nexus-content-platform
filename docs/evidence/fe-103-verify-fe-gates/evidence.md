# §FE-103 · `verify:fe-gates` 门禁——验收记录

## 这次做了什么

FE 门面矩阵被钉成可执行门禁：`node tools/ci/fe-gates.mjs`（或 `npm run verify:fe-gates`）。显式 walk 找 `apps/web/test/*-visual-style.test.ts`，本地展开成 argv 交给 `npx vitest run --reporter=dot`——Windows 不让 shell 误解通配符，避免"0 test files found"的坑。

## 验证（本地实跑，2026-11-13）

```
node tools/ci/fe-gates.mjs    → fe-gates: 94 visual-style suites；当次 94 files / 969 tests 全绿（退出码 0）
```

## 边界（如实）

- 本门禁不接入任何 hook/CI——本片不动 codex-global hook；
- 它只守"裸原子 + SHA 守恒 + 判据闭环"，不覆盖 route/domain/db 的行为测试；
- `verify:fe-gates` 首次编写时曾因 `vitest run apps/web/test/*-visual-style.test.ts` 在 Windows shell 与 vitest 的 filter 语义不一致，结果"No test files found"；本片改为 `.mjs`显式 walk+argv，并在本日全树重跑的第二次确证绿（94/969）。
