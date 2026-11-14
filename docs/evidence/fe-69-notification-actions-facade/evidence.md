# §FE-69 · `components/NotificationActions.tsx` `.nd-` 门面化——验收记录

## 这次做了什么

`NotificationActions.tsx`（§164 标记已读按钮，`useRouter` + CSRF header 标记收件箱已读，回显"已标记 N 条"原样含 0）从裸 Tailwind（2 处）改为 `.nd-` 门面族（1 定义）+ 复用 `.nb-resultInk`。零行为：CSRF/POST/busy/result/router.refresh 全部一字不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                       → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                              → ESLINT_EXIT=0
npx vitest run apps/web/test/notification-actions-visual-style.test.ts → 9 passed
```

零行为恒等（redact：EOL+空白归一、className 任意形态归一 @）：page→`ced6592aca3758720ee156a1bc326e1ae084251ee8a54a7ec5dbffc88a4341d6`，与改前（git HEAD）逐字节一致。

## 细节

- `rounded-[…] border border-[…] px-2 py-0.5 text-11 text-fg-2 hover:bg-bg-2 disabled:opacity-50` → `.nd-readBtn`（hover 改 `:hover:not(:disabled)`）；
- `ml-2 text-11 text-fg-3` → `.nb-resultInk`（复用铃铛边注字体）；
- `.nd-readBtn:focus-visible` 使用 brand outline。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e / live POST 未跑。
