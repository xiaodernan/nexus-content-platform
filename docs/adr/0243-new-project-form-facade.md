# ADR-0243：§FE-90 `NewProjectForm.tsx` `.npf-` 门面化——§2 新建项目

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-89 · `apps/web/test/new-project-form-visual-style.test.ts` · `docs/evidence/fe-90-new-project-form-facade/evidence.md`

## 背景

§2 新建项目：只有名称与类型——不生成任何"看起来像 AI 结果"的内容（§159）。五个裸原子位点。

## 决定

1. 新增 `.npf-*` 门面族（globals.css，`.ip-issuesList` 之后）：`npf-root/npf-input/npf-select/npf-submit/npf-error`；`placeholder:text-fg-3` → `::placeholder` 内置。
2. **零行为恒等门**（redact）：`1c2c07cd…` 与 HEAD 字节一致。
3. **判据**（9/9 绿）：client + csrf/router 进门 · 三钩守恒 · 字面类全 npf-* · 零裸 Tailwind · 类名闭环 · token 全声明 · 零 hex · 零新增颜色 token · **SHA256 守恒**。

## 取舍

- `bg-brand` → `var(--nexus-color-brand)`；`font-medium` → `font-weight: 500`；
- 不动 `!name.trim()` gating、`router.push` 语义；
- 不加 spinner/进度——本片节制，出错照实说（`issues[]` join）。

## 后果

`NewProjectForm` 加入门面矩阵。
