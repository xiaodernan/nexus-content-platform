# §FE-39 · `CodePanel.tsx` `.cd-` 门面化——验收记录

## 这次做了什么

`CodePanel.tsx`（§19 Code 视图：设计模型→代码投影 / 反向编辑 / 一次应用=一个可撤销事务）从全裸 Tailwind 改为 `.cd-*` 门面族（约 24 行）。三态：cd-applyIdle/cd-fileBtnActive/cd-disabledForbidden。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                 → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                        → ESLINT_EXIT=0
npx vitest run apps/web/test/code-panel-visual-style.test.ts → 11 passed
```

零行为恒等（redact 三步序见测试）：page→`70a1a8b2f886145b8aea070e0ce6a11ba4e59875a6d88cabbbd01bc939f4c342`，与改前（git HEAD）逐字节一致。

## 事故记账

一次用 PowerShell 脚本批量替换时，因 `@(@('from','to'))` 在该作用域被展开成两个平行元素，`.Replace('c','l')` 把文件里所有 ASCII 'c' 全部替换成 'l'（`llassName="ld-empty"`）。已在当场 `git checkout -- CodePanel.tsx` 还原并改为逐行审计。此事故未进入任何提交，ADR-0191 附录记账。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e 未跑；反向编辑路径（load/parse/map）未在本轮重放。
