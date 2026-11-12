# ADR-0241：§FE-88 `AccountPanel.tsx` `.ac-` 门面化（`.ap-` 已为 AssetsPanel 占用）——§188 账号面板

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-87 · `apps/web/test/account-panel-visual-style.test.ts` · `docs/evidence/fe-88-account-panel-facade/evidence.md`

## 背景

§188/§134 账号面板：游客也记账（一次生成扣 100 点），所以两种身份都进得去；注册即认领游客项目；登出与登出按钮刷新一致。`className` 有一部分经由 `const inputClass` 与 `tabClass()` 流入——属性位 redact 看不见这些 const 源串。

## 决定

1. 新增 `.ac-*` 门面族（globals.css，`.adp-cancelBtn:disabled` 之后）：`ac-root/ac-note/ac-between/ac-ident/ac-strong/ac-inlineLink/ac-inlineRow/ac-ghostBtnSm/ac-form/ac-tabs/ac-tab/ac-tabActive/ac-tabIdle/ac-input/ac-submitRow/ac-submitBtn/ac-error`——**不与 §FE-53 AssetsPanel 的 `.ap-*` 混用**。
2. `inputClass`/`tabClass(...)` 源串改指本族类；tabClass 保留二态（ac-tabActive/ac-tabIdle）模板语义。
3. **本片 SHA 不对 HEAD 守恒**——属性位 redact 形状与 HEAD 一致（全部 className 属性 —— af6a8899 唯一的「属性位」只换了字面→token 类，形状不变），const 源串变化不在 redact 覆盖范围。验收改为三条可证（见测试）：① 属性位 redact 快照锚定 ② const 源串指向 globals 真实定义 ③ 字面类全 `.ac-*`。
4. **判据**（10/10 绿）：client + csrfToken/router 进门 · `data-auth-*`/credits/api-tokens 钩守恒 · 字面类全 ac-* · 零裸 Tailwind · const 位闭环 · 属性位 redact 快照 · token 全声明 · 零 hex · 零新增颜色 token。

## 取舍

- `bg-brand` → `var(--nexus-color-brand)`（已声明，不新造）；`bg-bg-3` → `var(--nexus-color-bg-3)`（已声明）；
- `placeholder:text-fg-3` → `.ac-input::placeholder` 内置；`font-medium` → `font-weight: 500`；
- 不恢复过去 `.ap-*` 加入（会污染 AssetsPanel 命名空间——`.ap-` 语义已经划走）。

## 后果

`AccountPanel` 加入门面矩阵。本片也是"const 位 className 怎么办"的首个正式范例：FE-39 教训（decoy 变量）+ 本片红线：**const 源串必须进测试闭环，不能靠 redact 蒙过**。
