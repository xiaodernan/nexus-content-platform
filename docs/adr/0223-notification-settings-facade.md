# ADR-0223：§FE-70 `NotificationSettings.tsx` `.ns-` 门面化——§164 通知偏好面板

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-69 · `apps/web/test/notification-settings-visual-style.test.ts` · `docs/evidence/fe-70-notification-settings-facade/evidence.md`

## 背景

`NotificationSettings.tsx` 是 §164 通知偏好面板：按 kind（12 类）开关，PUT `/api/notifications/settings`（CSRF），成功后回写 `settings`。
`fetch` 失败静默吞 `.catch(() => {})`——失败保持旧值，不弹错（本片不变）。

## 决定

1. 新增 `.ns-*` 门面族（globals.css）：`ns-loading/ns-card/ns-title/ns-desc/ns-list/ns-row/ns-kindLabel/ns-toggle/ns-toggleOn/ns-toggleOff`。
   - `space-y-2` → `.ns-list` 用 flex-column + gap（视觉等价，语义更直接）；
   - `rounded px-2 py-1` → `.ns-toggle`；开/关两态→ `.ns-toggleOn`/`.ns-toggleOff`（不再内联条件 className）；`disabled` 半透不改色。
2. **零行为恒等门**（redact）：`0ab184b0…` 与 HEAD 字节一致。
3. **判据**（9/9 绿）：client + csrfHeaders/NOTIFICATION_KINDS 进门 · 字面类全 ns-* · 零裸 Tailwind · 类名闭环 · 零 hex · token 全声明 · 零新增颜色 token · 零 transition/@media/@keyframes · **SHA256 守恒** · 钩子守恒（data-notification-settings/data-notification-setting）。

## 取舍

- 不动 silent-catch、不动 `data.settings` 空回写、不动 `saving` 半失能；
- 不强加 `:focus-visible`——该控件是 `<button>` 但视觉上仿生开关，brand outline 留给 `.nd-readBtn` 那种命令按钮（同家族内已足够）；
- `font-semibold` → `font-weight: 600`（原子对齐 Tailwind 默认 semibold）。

## 后果

`NotificationSettings` 加入门面矩阵——通知面板家族（`.nb-`/`.nd-`/`.ns-`/`.np-`）全部门面化完毕，全部零行为、全部 9-10/10 绿。
