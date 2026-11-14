# ADR-0240：§FE-87 `AccountDeletionPanel.tsx` `.adp-` 门面化——§144/ADR-0025 注销入口

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-86 · `apps/web/test/account-deletion-panel-visual-style.test.ts` · `docs/evidence/fe-87-account-deletion-panel-facade/evidence.md`

## 背景

§144/ADR-0025 注销面板：**注销不是删除**（收据四数：私有草稿软删/已发布作品留公网/会话吊销/API 凭据吊销）；点开才从 `GET /api/account` 现取清单；确认词逐字输入即便不匹配按钮照样能按（拒绝必须在界面上显形）；不强制先导出。

## 决定

1. 新增 `.adp-*` 门面族（globals.css，`.ae-note` 之后）：`adp-card/adp-note/adp-hint/adp-error/adp-ghostBtn/adp-btnSm/adp-counts/adp-offer/adp-draftList/adp-inlineLink/adp-mono/adp-row/adp-input/adp-confirmBtn/adp-cancelBtn`（15 定义）。
2. **零行为恒等门**（redact）：`c9eb10c3…` 与 HEAD 字节一致。
3. **判据**（9/9 绿）：client + csrf/router 进门 · `data-account-*` 全钩守恒 · 字面类全 adp-* · 零裸 Tailwind（含 `placeholder:`/`hover:`/`self-start`） · 类名闭环 · token 全声明 · 零 hex · 零新增颜色 token · **SHA256 守恒**。

## 取舍

- `adp-input` 内置 `::placeholder`（`placeholder:text-fg-3` → token）；
- `adp-counts`/`adp-draftList` 显式 preflight 归零（不加深 `ul` 语义假设）；
- 不动 `!typed.trim()` gating、不动 `setReceipt(null)` + `router.refresh()` 次序。

## 后果

`AccountDeletionPanel` 加入门面矩阵。§144 账号闭环（注销收据）全表面门面化。
