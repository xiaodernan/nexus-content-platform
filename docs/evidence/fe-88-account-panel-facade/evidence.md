# §FE-88 · 账号面板 `AccountPanel.tsx` `.ac-` 门面化——验收记录

## 这次做了什么

`AccountPanel.tsx`（§188 登录/注册/登出/游客认领）从裸 Tailwind 改为 `.ac-` 门面族（17 定义；`.ap-` 已归 AssetsPanel，故新族）。
`inputClass`/`tabClass()` 源串改指本族——本片 SHA 不对 HEAD 守恒：全部变更见 ADR-0241 §决定第 3 条，验收改为属性位 redact 快照 + const 闭环 + 字面类全 ac-*。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                       → ESLINT_EXIT=0
npx vitest run apps/web/test/account-panel-visual-style.test.ts → 10 passed
git diff（人工逐行过目）→ 仅 className 与两个 const 源串，无结构/逻辑变更
```

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- live auth（register/login/logout 实链）未实跑。
