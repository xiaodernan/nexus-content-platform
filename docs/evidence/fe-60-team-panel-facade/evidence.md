# §FE-60 · `TeamPanel.tsx` `.tp-` 门面化——验收记录

## 这次做了什么

`TeamPanel.tsx`（§133 teamCollaboration：项目名册 + 团队邀请 + 角色/名额/断链/门语义）从全裸 Tailwind（32 处）改为 `.tp-*` 门面族（14 定义）+ 复用族。
零行为：useStudioReady/CSRF fetch/onClick handler/role API read — 一字不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                   → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                          → ESLINT_EXIT=0
npx vitest run apps/web/test/team-panel-visual-style.test.ts  → 9 passed
```

零行为恒等（redact：EOL+空白归一、className 任意形态归一 @）：page→`64dec99c38e1ed385ca1db07cb64813e9c1c020c2ad334d5862e46ef166b383d`，与改前（git HEAD）逐字节一致。

## 细节

- `.tp-btnPrimary`/`.tp-chipDanger`/`.tp-chipWarn`/`.tp-chipPrimarySm` 的 `disabled:opacity-40` → `:disabled { opacity: .4; cursor: not-allowed }`（与 FE-23 纪律一致）；
- `hover:bg-bg-2` 转移动到 `.tp-chipXxx:hover { background: var(--nexus-color-bg-2) }` 双主题刷：
- TeamPanel **无 `'use client'`** 首令牌——client manifest 由 Studio 外壳注入（build 既成事实）。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e 未跑；role/invite/token 完整路径未在本轮重放。
