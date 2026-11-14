# §FE-51 · `CharacterPanel.tsx` `.cp-` 门面化——验收记录

## 这次做了什么

`CharacterPanel.tsx`（§46 Character System 的角色档案面板）从全裸 Tailwind（44 处）改为 `.cp-*` 门面族（39 定义）+ 复用 `.wd-*` / `.gp-*`。
`const INPUT` 去糖为 `.cp-inputShared`（input/textarea 双载）；cn 三元拆 tab(selected/idle)·save(ready/idle)·notice(err/idle) 三态。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                   → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                          → ESLINT_EXIT=0
npx vitest run apps/web/test/character-panel-visual-style.test.ts → 10 passed
```

零行为恒等（redact：EOL+空白归一、INPUT 共享类常量归一多行、className 任意形态归一 @ + cn()整体归一）：page→`db5864a8548a6fe699bd205d294660f90c0dc575aabec558f8a7e3bab4ceb048`，与改前（git HEAD）逐字节一致。

## 细节

- `const INPUT` 是本次唯一一处埋在 JS 里的裸原子（与 FE-45 `const cls` 同构）；拆出 `.cp-inputShared` + `:focus{bg-3}`，与其原始 `focus:bg-bg-3` 行为一致。
- `${INPUT} mt-1` → `cp-inputShared gp-mt1`；`${INPUT} mt-1 font-mono` → `cp-inputShared gp-mt1 cp-mono`；`${INPUT} min-w-0 flex-1` → `cp-inputShared cp-grow`。
- placeholder 里的 `#1b1205 #f5b451` 是**写给用户的色板示例文案**——不是样式，hex 判据只拦 CSS 段与 className 字面量。
- `.cp-stickyBar` 元素名保留 `sticky` 词根——判据扫 `className="sticky` 组合而非词根（避免假红）。

## 事故记账

- 判据把 `sticky` 当否决子串首轮假红——strict tailwind-scan 不该用裸 substring：reworded 为 `className="sticky`。
- `'${INPUT} mt-1 font-mono'` 初代 `${INPUT} gp-mt1 font-mono` 漏掉末尾 `font-mono`（裸原子泄漏）——由零裸 Tailwind 门抓出并修复。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e 未跑；肖像/场景生成 create()→save()→reload 路径未在本轮重放。
