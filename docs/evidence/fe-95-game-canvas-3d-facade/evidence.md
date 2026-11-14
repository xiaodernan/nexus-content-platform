# §FE-95 · 3D 画布 `GameCanvas3D.tsx` `.g3-` 门面化——验收记录

## 这次做了什么

`GameCanvas3D.tsx`（§51 第三种画法 chrome：WebGL probing / unavailable / live 容器）从裸 Tailwind（5 处）改为 `.g3-` 门面族（5 定义）。HUD/sim/three 栈/PaintProbe 一字不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                       → ESLINT_EXIT=0
npx vitest run apps/web/test/game-canvas-3d-visual-style.test.ts → 9 passed
```

零行为恒等：page→`e9876d4c6398e4a7ac3486acd337335a3eed58aa1d26ec81df8ea24a3565e5b7`，与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser（WebGL 实渲染未目验）。
- e2e `data-game-3d-painted` 未实跑。
