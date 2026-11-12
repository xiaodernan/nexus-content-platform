# ADR-0242：§FE-89 `ImportPanel.tsx` `.ip-` 门面化——§144 NO LOCK-IN 反向那一寸

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-88 · `apps/web/test/import-panel-visual-style.test.ts` · `docs/evidence/fe-89-import-panel-facade/evidence.md`

## 背景

§144：作者带走的 zip 必须能**装回来**——导入的结果是一个**新项目**（不是往当前项目追加），所有数字来自服务端回执（几份文档/几张图/多少代码文件忽略/导出时间）；拒收逐条列 `issues`；资产进不了库必须点名（不算失败，但报"完成"就是谎话）。

## 决定

1. 新增 `.ip-*` 门面族（globals.css，`.adp-cancelBtn:disabled` 之后）：`ip-root/ip-title/ip-hint/ip-mono/ip-strongInk/ip-file/ip-busyNote/ip-receipt/ip-strongNote/ip-inlineLink/ip-metaMono/ip-note/ip-warnList/ip-mono11/ip-hintList/ip-error/ip-issuesList`。
2. **零行为恒等门**（redact）：`741a5c91…` 与 HEAD 字节一致。
3. **判据**（9/9 绿）：client + csrf/router 进门 · `data-import-*` 全钩守恒 · 字面类全 ip-* · 零裸 Tailwind（含 `file:` 变体与 `disabled:opacity-40`） · 类名闭环 · token 全声明 · 零 hex · 零新增颜色 token · **SHA256 守恒**。

## 取舍

- `file:` → `::file-selector-button` 完全等；`ip-issuesList` 不加 `:hover`（拒收事实本身已经是全部 affordance）；
- "包不里有推断值"口径不动（`body.counts?.design ?? 0` 这种服务端容错语义原样保留）；
- 不新增 `429/401/413/415` 分流文案——现状"状态码 + reason + issues 全摊开"已经足够诚实。

## 后果

`ImportPanel` 加入门面矩阵。§144 闭环（导出→带走→装回）两端全部门面化。
