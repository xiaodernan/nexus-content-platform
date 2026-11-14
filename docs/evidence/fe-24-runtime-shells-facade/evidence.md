# §FE-24 · `/game` 与 `/world` 运行时壳 `.rt-` 门面化——验收记录

## 这次做了什么

`/game/[projectId]`（§50，编译 §54 游戏设计 → PlayByKind）与 `/world/[projectId]`
（§140，世界文档 → WorldWalk 全屏 3D）从全裸 Tailwind 改为 `.rt-` 门面族：
两文件都是 server 组件（鉴权 requireUser + projectVisibleTo + notFound 守卫），
globals.css 新增约 16 行 `.rt-*`（`.tl-` 段之后）。零行为。
`.rt-stage { height: 100dvh; width: 100% }` 等价 `h-dvh w-full`；`py-16` 用字面 `4rem`
（token 尺度止于 space-12，不发明新 token）。

## 验证（本地实跑，2026-11-12）

```
npx tsc --noEmit -p apps/web/tsconfig.json               → TSC_EXIT=0
npx eslint <3 文件> --max-warnings=0                     → ESLINT_EXIT=0
npx vitest run apps/web/test/runtime-pages-visual-style.test.ts → 12 passed
```

零行为恒等（redact 三步序见测试）：game page→`4dc0a0b5…`，world page→`819282fa…`，
均与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸（真渲染/WebGL 首帧/深浅主题/截图）未做：本会话不连 desktop browser。
- 3D 运行时本身（WorldWalk 帧循环/实例化）未测、未动；e2e 未跑。
- 零 @media 是有意保持与基线一致。
