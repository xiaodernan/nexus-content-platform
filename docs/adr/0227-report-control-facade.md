# ADR-0227：§FE-74 `ReportControl.tsx` `.rc-` 门面化——§132 举报入口

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-73 · `apps/web/test/report-control-visual-style.test.ts` · `docs/evidence/fe-74-report-control-facade/evidence.md`

## 背景

`ReportControl.tsx` 是公开分享页访客的举报入口（不登录也能点）：两句事实直接印在界面上（举报不会立刻撤下内容；是否下架由人看完决定）。`issues[]` 字符串join 呈现，不糊"提交失败"。

## 决定

1. 新增 `.rc-*` 门面族（globals.css）：`rc-root/rc-openBtn/rc-form/rc-select/rc-input/rc-submitBtn/rc-note/rc-error/rc-hint`；`hover` 换 `:hover`，`disabled:opacity-50`→`:disabled`。
2. **零行为恒等门**（redact）：`590a2c65…` 与 HEAD 字节一致。
3. **判据**（9/9 绿）：client + csrfHeaders 进门 · 8 个数据钩子守恒 · 字面类全 rc-* · 零裸 Tailwind · 类名闭环 · token 全声明 · 零 hex · 零新增颜色 token · **SHA256 守恒**。

## 取舍

- 不动 `REASONS` 七项的 id/
label（任何字重排都会破零行为）；
- 不动 `issues?.join('；')` 回话、不动 `setOpen(false)` 时机；
- select/input 不补 `:focus-visible`——本片节制，键盘环由 preflight/summary 呈现。

## 后果

公开分享页第三/三件组件（`.np-`·`.is-`·`.pu-`·`.rc-`）全部门面化。访客动线（读→赞→举报）的类名闭合在 token 门面一条路。
