# §FE-55 · `MemoryPanel.tsx` `.mm-` 门面化——验收记录

## 这次做了什么

`MemoryPanel.tsx`（§48 角色记忆 CRUD）从全裸 Tailwind（34 处）改为 `.mm-*` 门面族（29 定义）+ 复用族。
零行为：studio save/clear/scope-switch 全部路径、embedded 判定（true/false 都正常落库）；明文 vs 向量化双态不造假。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                   → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                          → ESLINT_EXIT=0
npx vitest run apps/web/test/memory-panel-visual-style.test.ts → 8 passed
```

零行为恒等（redact：EOL+空白归一、className 任意形态归一 @ + cn()整体归一）：page→`973ddab6f6ecd1152e73cc6e8f361c3ebf0833d59f33230aa53a9dea7a4f926b`，与改前（git HEAD）逐字节一致。

## 细节

- embedded=false 的唯一视觉区别 = `.mm-semi90`（0.9 透明度）——与原 Tailwind `opacity-90` 逐字节对等；
- `.mm-xshrink` 同 §GE-5 `native: btn' { background: transparent; color: fg-3 }` 范式，hover 色 danger-ink；
- `.mm-clearAll` 用 text-decoration underline（不是 underline offset）——原原子無装饰偏移，逐字节守恒。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e 未跑；clear/save harness 路径未重放。
