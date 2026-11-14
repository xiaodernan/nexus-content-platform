# §FE-22 · `/invites/[token]` `.iv-` 门面化——验收记录

## 这次做了什么

`/invites/[token]`（§133 邀请兑现落地页）从全裸 Tailwind 改为 `.iv-` 门面族：
`page.tsx`（server：`currentUserOrNull` + force-dynamic；未登录只给一句话 + 回首页链接）+
`InviteAcceptPanel.tsx`（client：busy / error / joinedProjectId 三态）。
globals.css 新增约 20 行 `.iv-*`（`.bk-` 段之后）。零行为。

## 验证（本地实跑，2026-11-12）

```
npx tsc --noEmit -p apps/web/tsconfig.json               → TSC_EXIT=0
npx eslint <3 文件> --max-warnings=0                     → ESLINT_EXIT=0
npx vitest run apps/web/test/invites-visual-style.test.ts → 13 passed
```

零行为恒等（redact 三步序见测试）：page.tsx→`00703da0…`，InviteAcceptPanel.tsx→`40a82b13…`，
均与改前（git HEAD）逐字节一致。

## 边界（如实）

- 浏览器那一寸（真渲染/深浅主题/截图）未做：本会话不连 desktop browser。
- e2e 未跑。未登录分支的鉴权边界已进静态门（iv-backlink 在、accept 钩子不在），
  但真 HTTP 的 fresh-account accept→加入项目 happy-path 这次没有重放（已有 §133 集成测试覆盖）。
