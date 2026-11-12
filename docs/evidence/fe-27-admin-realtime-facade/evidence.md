# §FE-27 · `/admin/realtime` `.ar-` 门面化——验收记录

## 这次做了什么

`/admin/realtime`（§163 诊断入口）从全裸 Tailwind 改为 `.ar-` 门面族（约 24 行）+ `.adm-*` 补三个共用类
（`.adm-shellNarrow` / `.adm-headBaseline` / `.adm-capNote`）。轮询判据（4s/no-store/isKnownStats）
与四分格（wire/java/breakers/actuator/ai capability）一字不动。

## 验证（本地实跑，2026-11-12）

```
npx tsc --noEmit -p apps/web/tsconfig.json                → TSC_EXIT=0
npx eslint <3 文件> --max-warnings=0                      → ESLINT_EXIT=0
npx vitest run apps/web/test/admin-realtime-visual-style.test.ts → 13 passed（新判据）
npx vitest run apps/web/test/realtime-stats-readout.test.ts    → 30 passed（既有判据，未动）
```

零行为恒等（redact 三步序见测试）：page→`09b484f7…`，panel→`f66b4716…`，均与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。四秒轮询 + Java actuator 真相有外链未验证渲染层。
- e2e 未跑。既有 `realtime-stats-readout` 30 例绿。
