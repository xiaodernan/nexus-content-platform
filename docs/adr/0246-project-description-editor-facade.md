# ADR-0246：§FE-93 `ProjectDescriptionEditor.tsx` `.pe-`/`.adp-` 复用——§49 项目简介

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-91（ADR-0244）· §FE-87（ADR-0240）· `apps/web/test/project-description-editor-visual-style.test.ts` · `docs/evidence/fe-93-project-description-editor-facade/evidence.md`

## 背景

§49 项目简介：展开后才显示输入框（九个项目如果每个常驻 textarea 这一屏没法看）；为什么不并进 TopBar 的设计文档 PUT（改一个像素都跑一次保存会被自动覆盖掉）。本片基本是 §FE-87 与 §FE-91 两个族的同义件，故复用 + 两处小增量。

## 决定

1. 复用 `.adp-row/.adp-note/.adp-btnSm/.adp-cancelBtn` 与 `.pe-hint/.pe-root/.pe-input/.pe-saveBtn`。
2. 新增 `.pe-monoHint`（计数器）与 **`.adp-btnSm:disabled { opacity: 0.4 }`（禁用态补齐）**——后者不改变任何既有 `.adp-btnSm` 用例的渲染（两个调用点都从未 `disabled`——已逐行确认）。
3. **零行为恒等门**（redact）：`15830c42…` 与 HEAD 字节一致。
4. **判据**（7/7 绿）：client + csrf/router 进门 · 8 个数据钩守恒 · 字面类全 pe-/adp- · 零裸 Tailwind · 复用类全 globals 闭环 · token 全声明 · **SHA256 守恒**。

## 取舍

- 不造 §FE-93 专属 `.pde-*` 族（同族同语义不造双命名空间——§FE-92 同一决定）；
- `.adp-btnSm:disabled` 增量原地落子（FE-87 段内）而非新段——段内补注释，并显式声明既有用例零影响。

## 后果

`ProjectDescriptionEditor` 加入门面矩阵（复用↑、命名空间↓）。§49 项目简介面零裸原子。
