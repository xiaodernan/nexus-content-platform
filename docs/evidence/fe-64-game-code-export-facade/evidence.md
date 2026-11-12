# §FE-64 · `GameCodeExport.tsx` `.ge-` 门面化——验收记录

## 这次做了什么

`GameCodeExport.tsx`（§60 Game Code 导出面板：游码导出三种形态）从全裸 Tailwind（16 处）改为 `.ge-*` 门面族（7 定义）+ 复用族。黄色 amber 三档 → `.ge-warnBanner`（color-mix warn/30/10 等价对应）；saveBlob 路径——一字不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                   → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                          → ESLINT_EXIT=0
npx vitest run apps/web/test/game-code-export-visual-style.test.ts → 9 passed
```

零行为恒等（redact：EOL+空白归一、className 任意形态归一 @）：page→`508e49c2d399864caa69e8ca98a8ca4d0c52ad526b984eaa5be642c2fe26f019`，与改前（git HEAD）逐字节一致。

## 细节

- `.ge-warnBanner` 代理原 `border-amber-400/30 bg-amber-500/10 text-amber-100`：改用 `color-mix(in srgb, var(--nexus-color-warn) 30%, transparent)`（30% 边色）+ `bg: color-mix(...10%, transparent)`（10% 底）+ `color: warn-ink`——与 FE-45/48 同一组 color-mix 宗谱；
- `.ge-listFaint`/`.ge-listFaintMt2` 共用 `list-style: disc outside; padding-left: 1.25rem`——与 `ul list-disc pl-4` 等价；
- 黄色 amber 清零（零个 #hex、零个 amber 字面）——门内完备。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e 未跑；saveBlob 三分支派发路径未重放。
