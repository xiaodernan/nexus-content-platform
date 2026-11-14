# ADR-0245：§FE-92 `ProjectDeleteCard.tsx` `.adp-` 复用——§74 删除项目

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-87（ADR-0240，`.adp-` 源片）· `apps/web/test/project-delete-card-visual-style.test.ts` · `docs/evidence/fe-92-project-delete-card-facade/evidence.md`

## 背景

§74 删除项目：确认词=左边名字（服务端比原值）；公开页立刻 404，快照/发布记录/评论还在，回收站可恢复。
本片与 §FE-87 注销面板是**同一语义族**（确认型破坏动作卡：open 按钮→卡片→逐字输入→confirm/cancel→notice）——本片零新 CSS，直接复用 `.adp-*`。

## 决定

1. 不新增任何 CSS：`adp-btnSm/adp-card/adp-note/adp-mono/adp-row/adp-input/adp-confirmBtn/adp-cancelBtn` 语义完全等价（数值见 FE-92 测试）。
2. **零行为恒等门**（redact）：`92c28cc1…` 与 HEAD 字节一致。
3. **判据**（7/7 绿）：client + csrf/router 进门 · 7 个 `data-project-delete*` 钩守恒 · 字面类全 `.adp-*`（8 个唯一类全部 globals 闭环） · token 全声明 · 零新增颜色 token · **SHA256 守恒**。

## 取舍

- 不新建 `.pdc-*`——同族同语义不造双命名空间；
- 不动 `router.refresh()` 语义（服务端重读列表）；
- 不动 gating（`typed.trim().length === 0` 仍可按）。

## 后果

`ProjectDeleteCard` 加入门面矩阵（复用族）。§74 破坏动作面板家族统一在 `.adp-*`。
