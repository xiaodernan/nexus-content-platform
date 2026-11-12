# §FE-86 · 头像上传 `AvatarEditor.tsx` `.ae-` 门面化——验收记录

## 这次做了什么

`AvatarEditor.tsx`（§60 头像：上传/摘掉/元数据段如实显示）从裸 Tailwind（10 处，含 `file:` 变体）改为 `.ae-` 门面族（10 定义，`::file-selector-button` 合法并入）。EXIF 剥离提示、首字母兜底、"不造默认图"——一字不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                       → ESLINT_EXIT=0
npx vitest run apps/web/test/avatar-editor-visual-style.test.ts → 9 passed
```

零行为恒等：page→`beeff3852c6d590c115c5eed71c08bf85f9a3879f743de23ff01f1a06818ae13`，与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- live 上传（POST /api/account/avatar）未实跑。
