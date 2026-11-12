# §FE-37 · `CharacterChat.tsx` `.ch-` 门面化——验收记录

## 这次做了什么

`CharacterChat.tsx`（§47 角色对话框，CharacterPanel + /world HUD 共用）从全裸 Tailwind+cn() 改为 `.ch-*` 门面族（约 16 行）。speaker 字号保留字面量 0.625rem（见 ADR-0189）。

唯一代码字节变更：删除 `import { cn } from '@/lib/cn'` 一行（唯一使用点消失后已死）。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                  → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                        → ESLINT_EXIT=0
npx vitest run apps/web/test/character-chat-visual-style.test.ts → 12 passed
```

零行为恒等（redact + 雕刻 cn 一行）：
- BASE carve+redact → `ef0f39809c9d2d9c4a9b7b6de08e1d3ebea14305a3ba9d4be967bb3e3e26e82d`
- 当前 redact → `ef0f3980…`（同一值）

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- 对话语料（CTA 的 send/CSRF/map idx）未重放；e2e 未跑。
