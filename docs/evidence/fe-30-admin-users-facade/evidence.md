# §FE-30 · `/admin/users` `.au-` 门面化——验收记录

## 这次做了什么

`/admin/users`（§131 账号与角色 + ADR-0072 过期访客回收）从全裸 Tailwind 改为 `.au-` 门面族（约 24 行）：
page（denied×2 + 账号行）+ GuestReclaimPanel（8/屏、全勾三态、回执服务端算）+ PlanSelect（下拉+确认）+ RoleButton。
denied 两态复用 `.adm-*`；通用按钮/链接复用 `.am-*`。

## 验证（本地实跑，2026-11-12）

```
npx tsc --noEmit -p apps/web/tsconfig.json               → TSC_EXIT=0
npx eslint <5 文件> --max-warnings=0                     → ESLINT_EXIT=0
npx vitest run apps/web/test/admin-users-visual-style.test.ts → 12 passed
```

零行为恒等（redact 三步序见测试）：page→`ad3ff95d…`，plan→`1d403f70…`，role→`2701465c…`，reclaim→`ffcfd0b0…`，均与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸未做：本会话不连 desktop browser。
- e2e 未跑；reclaim 之计数与收走路径未在本轮重放（皮线不碰域逻辑）。
