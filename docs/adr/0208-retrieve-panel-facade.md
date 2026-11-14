# ADR-0208：§FE-56 `RetrievePanel.tsx` `.rp-` 门面化——§49 语料检索面板

- 状态：Accepted
- 日期：2026-11-13
- 关联：§FE-55 · `apps/web/test/retrieve-panel-visual-style.test.ts` · `docs/evidence/fe-56-retrieve-panel-facade/evidence.md`

## 背景

`RetrievePanel.tsx` 是 §49 的检索面板：在项目语料（世界条目 / 角色档案 / 记忆 / 分镜镜头 / 游戏实体）里查一句。
结果里带着"怎么命中的"（全文 / 子串）和三个加数——不藏在一个黑盒分数后面；没有 provider 时向量检索显示不可用、那段假分会被显式拦截。

## 决定

1. **新增 `.rp-*` 门面族**（globals.css，`.mm-` 段之后）：14 定义——lead11/lead11ink/row2Mt/wrap2Mt/ghostBtnFaint(:disabled .5)/ghostBtnFaintSm(py-0.5→2px)/chipSm/sourceChip/dangerMono11/ink11shrink，+ 复用 `.wd-*`/`.cp-*`/`.ds-*`/`.hi-*`/`.mm-*`/`.ap-*`/`.gp-*`。
2. **唯一代码变更**：删除唯一使用点消失后已死的 `import { cn } from '@/lib/cn'`（redact 守恒：HEAD 雕刻 cn 一行后与改后 redact 字节一致）。
3. **零行为恒等门**（redact）：page `4ee170c1…` 与雕刻过的 HEAD 字节一致（不钉死绝对路径、测试内嵌雕刻对比）。
4. **判据**（9/9 绿）：client + csrfHeaders 进门 · 字面类全 rp-/复用族 · 零裸原子 · 类名闭环 · 零 hex · token 全声明 · 零 transition/@media/@keyframes · **SHA256 守恒** · 钩子守恒（data-retrieve-hit/data-retrieve-source）。

## 取舍

- 不动 score 计算、不动 `retrieve` 返回值 field map、不动「向量不可用」文案行；
- 不动 CSRF 路径（`csrfHeaders()`）；
- 不动 `.rp-sourceChip` 的 3px 圆角——与原文 `rounded-[3px]` 逐像素对齐。

## 后果

`RetrievePanel` 加入门面矩阵。Studio 余 10 面板继续（WorldGraphView/RetrievePanel done，最大是 WorldGraphView 27）。
