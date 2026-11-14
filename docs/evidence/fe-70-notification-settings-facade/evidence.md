# §FE-70 · `components/NotificationSettings.tsx` `.ns-` 门面化——验收记录

## 这次做了什么

`NotificationSettings.tsx`（§164 通知偏好面板；12 类事件开关；PUT + CSRF）从裸 Tailwind（8 处）改为 `.ns-` 门面族（11 定义）。零行为：fetch/PUT/toggle/`setSaving` 一字不动；静默 catch 与旧值保持语义保留。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                        → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                               → ESLINT_EXIT=0
npx vitest run apps/web/test/notification-settings-visual-style.test.ts → 9 passed
```

零行为恒等（redact：EOL+空白归一、className 任意形态归一 @）：page→`0ab184b027ced12d84c3529e1b201f98fcd4e9d8894b0928f614960ac79eaf1a`，与改前（git HEAD）逐字节一致。

## 细节

- `space-y-2` → flex-column + `gap`；`font-semibold` → `font-weight: 600`；
- `rounded px-2 py-1 text-11` → `.ns-toggle`，开/关两态→ `.ns-toggleOn`/`.ns-toggleOff`；
- 文件编码核查：源文件为纯 UTF-8（先前控制台把它显示成乱码，实际字节无损）。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- live PUT / 403 场景未跑。
