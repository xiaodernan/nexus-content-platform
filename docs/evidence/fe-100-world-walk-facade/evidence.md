# §FE-100 · 3D 行走 `WorldWalk.tsx` `.ww-` 门面化——验收记录

## 这次做了什么

`WorldWalk.tsx`（§15 3D 行走 chrome：probing / unavailable / live stage / HUD / 标签 / nearby 面板 / 限制说明）33 处裸原子清零：新增 `.ww-*` 26 定义 + 复用 `.g3-*`/`.g2-*`。Sim/HUD/WebGL 探测路径——一字不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                       → ESLINT_EXIT=0
npx vitest run apps/web/test/world-walk-visual-style.test.ts → 8 passed
```

零行为恒等：page→`042ed85112529b474c48583d7456294157f002fb3a1e354a9a92022cba333e52`，与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser（WebGL 实渲染未目验）。
