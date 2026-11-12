# §FE-25 · `/preview/[projectId]` `.pv-` 门面化——验收记录

## 这次做了什么

`/preview/[projectId]`（§124 / ADR-0063 只读模型投影，作者鉴权视角）从全裸 Tailwind 改为 `.pv-` 门面族：
两处 sticky/bar 面（`bg-1/95` + backdrop-blur）、状态预览条（三态 chip，active/idle）、画布。
globals.css 新增约 18 行 `.pv-*`（`.rt-` 段之后）。
`bg-1/95` 与 `bg-1/70` 不透明度 → color-mix（零新增 token）；内联 style（scale/transform/版式盒）红线保留。

## 验证（本地实跑，2026-11-12）

```
npx tsc --noEmit -p apps/web/tsconfig.json             → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                   → ESLINT_EXIT=0
npx vitest run apps/web/test/preview-visual-style.test.ts → 12 passed
```

零行为恒等（redact 三步序见测试）：page→`1d8e84b5…`，与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸（真渲染/深浅主题/首帧绘制/截图）未做：本会话不连 desktop browser。
- ViewerControls 未动（与公开页共用，出本片范围）；3D/real-browser 路径未测。
- e2e 未跑；零 @media 有意保持与基线一致。
