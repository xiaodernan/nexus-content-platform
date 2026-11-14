# ADR-0247：§FE-94 `RestoreProjectButton.tsx` `.adp-` 复用——§74 回收站恢复

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-93（ADR-0246）· §FE-92（ADR-0245）· `apps/web/test/restore-project-button-visual-style.test.ts` · `docs/evidence/fe-94-restore-project-button-facade/evidence.md`

## 背景

§74 回收站恢复：恢复 ≠ 删除侧的审批门——"一句话动作"，恢复不破坏任何东西，设成门槛只会让人以为删掉的项目找不回来。成功后**不写**"已恢复"（列表会因 refresh 少掉这一行，留下来是假状态）。

## 决定

1. 不新增任何 CSS：直接复用 `.adp-row/.adp-btnSm/.adp-note`（FE-93 的 `.adp-btnSm:disabled` 增量让禁用态也精确等价）。
2. **零行为恒等门**（redact）：`f080d95f…` 与 HEAD 字节一致。
3. **判据**（7/7 绿）：client + csrf/router 进门 · 两钩守恒 · 字面类全 `.adp-*` · 零裸 Tailwind · 类名闭环 · token 全声明 · **SHA256 守恒**。

## 取舍

- 不新造 `.rpb-*`；
- 不动 `router.refresh()` 时序；
- 不做"清空 notice"的任何额外交互。

## 后果

`RestoreProjectButton` 加入门面矩阵（复用↑）。§74 双侧（删↑恢复↑）全部门面化。
