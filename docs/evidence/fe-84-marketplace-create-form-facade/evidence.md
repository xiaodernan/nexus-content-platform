# §FE-84 · 上架表单 `MarketplaceCreateForm.tsx` `.mfc-` 门面化——验收记录

## 这次做了什么

`MarketplaceCreateForm.tsx`（§127 上架表单）从裸 Tailwind（含 `sm:` 断点变体）改为 `.mfc-` 门面族（9 定义）。`sm:grid-cols-2` → auto-fit minmax 无 @media 实现；tags 中英逗号分割、价格容错、挂牌语义——一字不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                       → ESLINT_EXIT=0
npx vitest run apps/web/test/marketplace-create-form-visual-style.test.ts → 9 passed
```

零行为恒等：page→`051c4b9bd002602eadd8d96689cc691ace4f0b3837a0d5e7da1701c8b538fcbe`，与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- live POST /api/marketplace 未实跑。
