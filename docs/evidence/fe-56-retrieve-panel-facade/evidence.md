# §FE-56 · `RetrievePanel.tsx` `.rp-` 门面化——验收记录

## 这次做了什么

`RetrievePanel.tsx`（§49 语料检索：结果带"怎么命中的"+三个加数，没有 provider 不假装向量检索可用）从全裸 Tailwind（28 处）改为 `.rp-*` 门面族（14 定义）+ 复用族。
唯一代码变更：删除唯一使用点消失后已死的 `import { cn } from '@/lib/cn'`；redact 守恒：HEAD 雕刻 cn 一行后与改后 redact 字节一致。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                   → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                          → ESLINT_EXIT=0
npx vitest run apps/web/test/retrieve-panel-visual-style.test.ts → 9 passed
```

零行为恒等（redact：EOL+空白归一、className 任意形态归一 @ + cn()整体归一）：carved-HEAD === 改后（`4ee170c1…`）。

## 细节

- `.rp-sourceChip` 3px 圆角（`rounded-[3px]`）逐像素代理；`.rp-ghostBtnFaintSm` 的 `py-0.5`（Tailwind = 2px）→ `padding: 2px` 忠实对应；
- cn 单元分支（`'shrink-0 rounded-[3px]…font-mono text-10 text-fg-3'`）移至纯字面量后无分支、但**类名保留在 globals.css**，不新增颜色 token。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e 未跑；CSRF fetch 未在本轮重放。
