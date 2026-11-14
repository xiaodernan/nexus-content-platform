# §FE-61 · `CommandBar.tsx` `.cb-` 门面化——验收记录

## 这次做了什么

`CommandBar.tsx`（§7 底部 AI 命令栏）从全裸 Tailwind（45 处——App）改为 `.cb-*` 门面族（35 定义）+ 复用族。零行为：MODES/EXAMPLES 常量、studio 派发、aiObservation 回读、data-demo-mode 全部——一字不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                   → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                          → ESLINT_EXIT=0
npx vitest run apps/web/test/command-bar-visual-style.test.ts → 10 passed
```

零行为恒等（redact：EOL+空白归一、className 任意形态归一 @ + cn()整体归一）：page→`d86846b848b4bd1b8185df54b272d7e4248b18b377aa2b07a0e74d905588d23d`，与改前（git HEAD）逐字节一致。

## 细节

- `.cb-demoFlag` = `rounded px-[5px] py-[1px] mono text-11` + `.cb-flagWarn`(warn 底 accent-fg)/`.cb-flagLive`(success 底 accent-fg)——LIVE PROVIDER §160；
- `data-demo-mode=on|off` 与 `.cb-flagWarn/.cb-flagLive` 之间的守恒写入判据（FE-42/45 同型）；
- `.cb-warningBanner` 用 `color-mix(warn 50%, transparent)` 边色，与 FE-35 48rem `@media` 同型——不引入 `.cb-secondary`。

## 事故记账

- 判据里**未转义的 `'data-ai-*/data-demo-mode 系列'`** 把 `*/` 闭合了 JSDoc：最初 skeleton 写法造成 transform 失败；修复：把成对注释 `*` 安全化（`data-ai- 系列` + `data-demo-mode` 成对守恒）；
- 零裸原子扫描初版漏了若干 hook (`'hover:bg-'`/`'items-center gap'`/`'hover:text-'`)——首轮红，加全后复绿；
- 实际 `.cb-accentLink` 孤儿两枚（从未被 call site 选中）→ 合并到 `.cb-accentInk2`，额外定义平稳收掉，未触发 redact 差分（class 名单独加入但 hash 判据不通过——double selected not used yet，accepted under ADR）。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e 未跑；plan/aiObservation 派发路径未重放。
