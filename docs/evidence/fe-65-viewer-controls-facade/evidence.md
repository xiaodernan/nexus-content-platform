# §FE-65 · `ViewerControls.tsx` `.vc-` 门面化——验收记录

## 这次做了什么

`ViewerControls.tsx`（§14/ADR-0069 查看器控件行：公开页/预览页同一排、同一套参数名；全服务端渲染 `<a>`）从全裸 Tailwind（4 处）改为 `.vc-*` 门面族（4 定义）+ 复用族。WCAG 2.5.8 `min-height: 1.5rem`（24px）。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                   → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                          → ESLINT_EXIT=0
npx vitest run apps/web/test/viewer-controls-visual-style.test.ts → 9 passed
```

零行为恒等（redact：EOL+空白归一、className 任意形态归一 @ + pill/active/idle 三组常量雕刻 @；HEAD 雕刻 pill 一行后 == 改后 redact）：page→`f5a04b02f5ec4be8d51b4dae628f3e55b9ba552f875f2ccd44145202678ddb03`。

## 细节

- 唯一控制：pill/active/idle 三组模板字符串常量替换为 facade 命名常量（`const active = 'vc-pill vc-pillOn'`、`const idle = 'vc-pill vc-pillIdle'`）——不引入全局 CSS 动态值；
- 数字下限：`min-height: 1.5rem`（24px，WCAG 2.5.8）；
- 13 个 data-viewer-* 钩子全部守恒，行内盒完全不动。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e 未跑；public page / preview page 渲染断点/缩放路径未重放。
