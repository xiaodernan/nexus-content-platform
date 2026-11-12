# §FE-47 · `DesignSystemPanel.tsx` `.ds-` 门面化——验收记录

## 这次做了什么

`DesignSystemPanel.tsx`（§12/§13 设计系统面板：token CRUD + 组件存/删 + 颜色/尺寸/字体/阴影/其他五组）从全裸 Tailwind（55 处）改为 `.ds-*` 门面族（69 定义）。
零行为：parseInput/resolveColor/`TOKEN_KEY`/studio.execute/isColor/tokenUsage——一字不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                   → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                          → ESLINT_EXIT=0
npx vitest run apps/web/test/design-system-panel-visual-style.test.ts → 10 passed
```

零行为恒等（redact：EOL+空白归一、className 任意形态归一 @ + cn()整体归一）：page→`9fb3d0540e7b1c2b8dbdab46053fd3bea0d6c920a53c6f7e36bb3b66ce02247a`，与改前（git HEAD）逐字节一致。

## 细节

- cn 三元映射：token 删除键拆 `.ds-iconSm` + `.ds-iconSmReady`(hover bg-2+danger-ink) / `.ds-iconSmIdle`(not-allowed+opacity .3)。
- 任意值原子（`w-[72px]/h-5/w-6/h-3.5/w-3.5/gap-[3px]/py-[2px]/px-[2px]`）全部 rem 等价量化；字面量 0.625rem 只在 font-size-10 档位出现。
- `.ds-instanceChip` 承载"这个组件这一页上有几颗实例"的 inline count 标签；`.ds-componentCard` 是卡容器，`.ds-rowCard` 是行级 hover 高亮容器。

## 事故记账

- 判据计数初版多 sent gap：`ds-` 段 defs 计数用了 `[,{:\s]` 宽松 delimiter，和图片 FE-45 一样保留，不重复记账；段内 count 仍在 ≥ 60，可过。
- 零裸扫描初版漏了若干 hook：`'ml-auto'` 由 apply 脚本尾随清掉最后一处（`ds-btnGhostMonoEnd` 收尾），再用 regex 扫 `ml-auto` 双保险，不复现。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e 未跑；component ref/count/remove 路径未在本轮重放。
