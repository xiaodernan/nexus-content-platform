# ADR-0191：§FE-39 `CodePanel.tsx` `.cd-` 门面化——§19 Code 视图、三态双相编辑器

- 状态：Accepted
- 日期：2026-11-13
- 关联：§19 · §16/150 · `apps/web/test/code-panel-visual-style.test.ts` · `docs/evidence/fe-39-code-panel-facade/evidence.md`

## 背景

`CodePanel.tsx` 是画布旁边的第二块投影：页面组件经受限 JSX 解析器回到设计模型（一次应用 = 一个可撤销事务 §150），再由模型重新投影；解析器吃不下的片段如实报告（mappings 为 0 时一行都不回写、issues 带行号上屏，§159 不静默丢弃）。本片只换皮。

## 决定

1. **新增 `.cd-*` 门面族**（globals.css，`.np-` 段之后）：`.cd-root/.cd-empty/.cd-toolbar/.cd-fileBtn/.cd-fileBtnActive/.cd-disabledForbidden/.cd-ghost/.cd-pushEnd/.cd-apply/.cd-applyIdle/.cd-canvas/.cd-editor/.cd-line/.cd-lineHit/.cd-lineIdle/.cd-gutter/.cd-lineText/.cd-report/.cd-appliedNone/.cd-changeName/.cd-warn/.cd-hint`——双主题 token、零 hex、零 @media、零动效；三态
   - `cd-applyIdle`（映射为 0 时 disabled + cursor-not-allowed + border-subtle，与 .cd-apply 的 accent-2 实底互斥）；
   - `cd-fileBtnActive`（选中文件实底 fg-1）；
   - `cd-disabledForbidden`（editing=true 时 tabs 禁用）。
   - editor :focus-visible 环内缩（offset:-2px，贴合 Code 视图的等宽排版）。
2. **零行为恒等门**：剥 className 后 SHA256 与 git HEAD 一致（`70a1a8b2…`）。
3. **判据**（11/11 绿）：'use client' 保留 + codeToPageOps/studio.execute/mappings 守卫进门 · 字面类全 cd-*/am-* · 零裸 Tailwind · 类名闭环 · 零 hex · token 全在 · 零新增颜色 token · 零 transition/@media · **SHA256 守恒** · 钩子守恒（15 个 data-code-*：view/empty/file-*/copy/apply/cancel/edit/editor/report 四组/hint）。
4. **脚本事故记账（当场拦截并还原）**：一次 PowerShell `Replace($pair[0],$pair[1])` 因 `@(@('a','b'))` 被展开成两个元素 "a"/"b"，`$pair[0]`/`$pair[1]` 取到首两字符 → `.Replace('c','l')` 把全文件 ASCII 'c' 全部替换成 'l'（`llassName="ld-empty"`）。已 `git checkout --` 还原并全程手写校验；教训：带 segment 的脚本，pair 必须写成 `$pairs = @(@('from','to'))` 并在每次运行后立即 grep 验证 `c === 0` 种的异常模式。此事件未入任何提交。

## 取舍

- 不动 hitRef 滚动、mappings 守卫、一次性撤销事务、反向映射规则。
- 不动 filePath 派发、chip 三个 class（disabledForbidden 队列）——行为。
- 不做截图：browser 不可用。

## 后果

`CodePanel` 加入门面矩阵。Studio 余 24+ 面板继续。
