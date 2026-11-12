# §FE-54 · `PublishPanel.tsx` `.pb-` 门面化——验收记录

## 这次做了什么

`PublishPanel.tsx`（§57 Publish：选 Public / Unlisted / Private + 如实报告 §179 门禁 + §163 项目频道发布链路 build/preview 两行）从全裸 Tailwind（32 处）改为 `.pb-*` 门面族（26 定义）+ 复用 `.sb-*` / `.wd-*` / `.hi-*` / `.ap-*`。
零行为：PANEL_ID / popover-dismiss / publish dispatch / HealthWatch 派生 / aria-controls / data-publish-open — 一字不动。

## 验证（本地实跑，2026-11-13）

```
npx tsc --noEmit -p apps/web/tsconfig.json                   → TSC_EXIT=0
npx eslint <2 文件> --max-warnings=0                          → ESLINT_EXIT=0
npx vitest run apps/web/test/publish-panel-visual-style.test.ts → 10 passed
```

零行为恒等（redact：EOL+空白归一、className 任意形态归一 @ + cn()整体归一）：page→`5ad0738084b4e86b5201d24da1c71149c8bd65d0ac6ce830a6885167908142b8`，与改前（git HEAD）逐字节一致。

## 细节

- **唯一一段 @media**（520px）：`.pb-popPanel @media (max-width: 520px)` = Tailwind arbitrary `max-[520px]:` 的逐字节播进来；`> 520px` 与 `<= 520px` 的两套布局完全对齐原设计；
- `.pb-popPanel shadow-2xl` → `--nexus-shadow-lg`（Tailwind 2xl 与 §FE-41 一致镜像）；
- `.pb-publishBtn` Live/Idle 双态（Live = brand 底 accent-fg；Idle = border-strong 透明底 hover bg-2）。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e 未跑；publish 完整 dispatch→library visibility 链未重放。
