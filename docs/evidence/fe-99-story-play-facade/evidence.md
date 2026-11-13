# §FE-99 · 互动叙事 `StoryPlay.tsx` `.st-` 门面化——验收记录

## 这次做了什么

`StoryPlay.tsx`（§54 互动叙事运行时 chrome：blocked/choices/trail/playtest/notes-replay）29 处裸原子清零：新增 `.st-*` 13 定义 + 复用 `.pk-h2`/`.pp-danger12`/`.g2-*`。blocked 语义、trail 原文、Playtest 语义——一字不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                       → ESLINT_EXIT=0
npx vitest run apps/web/test/story-play-visual-style.test.ts → 8 passed
```

零行为恒等：page→`5a101e8e42d032ee331b75128f043f116a34af6450b6168804382086c68b2bb0`，与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- live story playthrough 未实跑。
