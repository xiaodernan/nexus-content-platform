# §FE-53 · `AssetsPanel.tsx` `.ap-` 门面化——验收记录

## 这次做了什么

`AssetsPanel.tsx`（M2 Asset Library：资产清单列举+预览+删除）从全裸 Tailwind（43 处）改为 `.ap-*` 门面族（42 定义）+ 复用 `.wd-*`/`.sk-*`/`.pp-*`/`.ds-*`/`.hi-*`/`.cp-*`/`.sb-*`/`.gp-*`。
唯一代码变更：删除 `import { cn } from '@/lib/cn'` 一行（唯一使用点消失后已死；redact 守恒：HEAD 雕刻该 cn 行后与改后 redact 字节一致）。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                   → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                          → ESLINT_EXIT=0
npx vitest run apps/web/test/assets-panel-visual-style.test.ts → 10 passed
```

零行为恒等（redact：EOL+空白归一、className 任意形态归一 @ + cn()整体归一）：雕刻 cn 一行后的 HEAD === 改后，哈希测试内嵌实现（不钉死绝对常量 URL），调试过程中抓住了 CN 雕刻锚点的第一版（从 40438 字符降到 35392，HEAD 雕刻正确）。

## 细节

- `referenceCounts` 保留 §147 原文（节点数+资产数之 Map 翻式、不再每资产一次全页扫描）；
- `data-vbench-*` 系列 16 个钩子全在；`data-vbench-*` 的 pixel-bench 真 provider 路径只有 `rendered=true` 才进，未渲染格不硬造分；
- `.ap-bannerWarn` 用 color-mix(warn 15%)，与 token/warn-ink 双主题一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e 未跑；delete 路径与 vbench/pixel-bench 真调用未在本轮重放。
