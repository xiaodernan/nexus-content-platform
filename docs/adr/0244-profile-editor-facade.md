# ADR-0244：§FE-91 `ProfileEditor.tsx` `.pe-` 门面化——§60 简介编辑

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-90 · `apps/web/test/profile-editor-visual-style.test.ts` · `docs/evidence/fe-91-profile-editor-facade/evidence.md`

## 背景

§60 编辑自己的简介：命中发布机检红线时显示"没保存"和原因（issues[] join）——不悄悄存再说"已更新"。五个裸原子位点。

## 决定

1. 新增 `.pe-*` 门面族（globals.css，`.npf-error` 之后）：`pe-root/pe-input/pe-row/pe-saveBtn/pe-hint`。
2. **零行为恒等门**（redact）：`bee5b169…` 与 HEAD 字节一致。
3. **判据**（9/9 绿）：client + csrf/router 进门 · 钩守恒 · 字面类全 pe-* · 零裸 Tailwind · 类名闭环 · token 全声明 · 零 hex · 零新增颜色 token · **SHA256 守恒**。

## 取舍

- textarea 不动 `rows={3}`、不加 `resize` 限制（`preflight` 之外零改动）；
- 不动 PATCH 时机、不动 router.refresh 次序。

## 后果

`ProfileEditor` 加入门面矩阵。§60 账号面门面化推进。
