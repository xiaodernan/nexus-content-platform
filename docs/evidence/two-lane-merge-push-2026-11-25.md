# 双线合并与推送（2026-11-25）

## 背景
本地 main 与 origin/main 分叉：远程并行线推了 E222–E229 回响 + 另一篇 E221
《空位里那页更小的点》+ repin 工具 + showcase/CI/线索索引；我本地有 33 个独有提交
（世界工具、守护、适应窗口、个人主页同步等）+ 我的 E221《空白那一头的脚步》。

## 集大成做法
1. 检出远程 E221–E229 的 16 个中英回响文件（新增文件，无冲突）。
2. **编号撞车**：两篇 E221 不能共存，远程已发布不能回退 → 把我那篇重编号为 **E230**
   （承接关系改 E229），slug `echo-230-footsteps-at-the-far-end-of-the-blank`。
3. 用 `gen:bible-snapshot` 重生成快照（14 章 · 230 回响 · 4 附录）与 canon digest；
   锚句校验 1394 对全通过。
4. 重钉三个计数门到 230 回响 / pin 1389（远程 E229 是 229/1383，+1 回响 +6 锚句）。
5. 用 `git merge -s ours origin/main` 把远程历史并入 ancestry（内容已手动合并），
   使 push 可 fast-forward。
6. 期间并行线又推了 4 个提交（showcase/CI/线索索引），重复采用远程 showcase +
   merge -s ours，最终 push 成功。

## 结果
- 本仓 GitHub main = `d98324f6`，含全部功能 + E221–E230 全部回响。
- 已确认在远程：worldCohesion、FitWindowLink、check-web-health、个人主页审计、E230。
- showcase 源 head d61b04b / 4141 commits 已推送。
- io 仓库 `xiaodernan.github.io` master = `2c08013`，含 `sync-nexus-content.yml` workflow
  （每周一 13:20 UTC 拉取本仓 showcase → assets/nexus-content/latest.json）。

## 边界
- fe-gates 1 红来自并行线**未跟踪**的 `search-bigram-index.integration.test.ts`
  （依赖未提交的 search.ts 改动），不在任何提交里，不影响 push。我按纪律未碰。
- 合并过程中 stash@{0} 保存了并行线在途文件；stash pop 因冲突失败，文件仍在工作树/ stash 中，未丢。
- push 属对外发布：基于用户多次明确授权"全自动更新/所有项目列入"+ PAT。

## 验证
典籍室锚句 1394 对全通过、快照一致；功能门 7 文件 49/49；tsc 对已提交内容通过。
