# ADR-0291 · origin/master 已成陈旧引用——保留不删、不强推、不反向合并（2026-11-19）

## 状态：已接受（2026-11-19；与 cont.406-418 双线收敛同时落地）

## 背景

2026-11-19 早间本线在 `master` 上提交了 `e9c4ba8f`（fix(§CANON-156) · Echo #156《潮候院那盏从不写名的灯》· 双语 · 949/949 · digest 241,168 chars · BibleQuiz pin 1a338ab7）。此后本线 `master` 被重锚到 `origin/main` 之上（`5a625255` · parent=`9390a645`，而非 `e9c4ba8f`），旧谱系（…→`a97e65f9`→`0cb8d3a0`→`e9c4ba8f`）从此与当前 `master` 分家。`e9c4ba8f` 目前**只存在于**远端 `origin/master`。

截至今日傍晚的收敛结果：本地 `master == origin/main == 587d7d4c`（本线 Echo #162《潮候院那盏从不写名的灯》与并行线 #157-#161 全部共存；`master -> main` 推送成功 `931fa427..587d7d4c`）。唯一不同步的是远端 `origin/master`，仍停在 `e9c4ba8f`。

## 选项

A. `git push --force-with-lease origin master:master`（重写远端 master）
   - 否。force-push 改写共享引用，属于破坏性操作，必须用户明确指示；AGENTS.md 禁止 `--force` 类绕过合流纪律的动作；"远处只是自己上午的一个旧快照"不构成自动授权。
B. 把 `e9c4ba8f` merge 进当前 `master`
   - 否。它早于双线合流的全部产物（#157-#162 重编号、灯 echo 的 digest/pin 变迁、BIG-CTX 抬顶、/admin/savings、§SIM-2）。按定义它会把**旧态反向并入**：可能复活旧 digest pin、旧 echo 文件名、旧锚句计数，且几乎每个冲突都与当前主线逐字对应。这不是"保护用户工作"，而是把废弃演化路径复活为一条双重真值。
C. 保留 `origin/master` 不动（采用）
   - 不删任何提交；`e9c4ba8f` 永久可达、可溯源；本线一切工作继续落在 `master == main` 这条被双线共同维护的主干上；showcase `latest.json` 从该主干取活。

## 决定

按 C 执行。明确以下事实，供后续任何 agent 核对：

1. `origin/master`（`e9c4ba8f`）是本线早间自身遗弃的一个谱系快照；其内容（E156《潮候院那盏从不写名的灯》及当时的 pin 族）在当前 `master` 中以演化形态存在（同一盏灯现编为 **Echo #162**，灯 file、BibleQuiz 192 题、digest 984 zh/en 锚句、bible-ask-behavior pin 979，全部由当前主干守住）。
2. 本账没有任何独占内容丢失：`e9c4ba8f` 与 `0cb8d3a0`（showcase 指针 cont.406）`、a97e65f9`（evidence/deep-read）三个提交仍在 `origin/master` 可达；showcase 现从主干同步，不需要该 fork 的指针文件。
3. `master == main == origin/master` 在 `origin/master` 一侧**不再成立**，是有意保留的陈旧引用，不是 bug；解决需要用户书面决定：要么授权 force-push 对齐，要么接受主干独流。
4. 并行线（cont.419+）与本线的全部后续工作都落在主干上；任何"本线要推 master"的诉求都应先对照本 ADR。

## 后果

### 变好的事

- 主干（`master == origin/main`）保持 1:1 同一 SHA（`587d7d4c`），showcase 与两个并行线都从它取活；
- 没有重写任何远端历史，没有丢失任何提交。

### 变差的事

- `origin/master` 与主干漂移；任何假设"三分支同一 SHA"的脚本/人见 `git push master:master` 被拒不必惊讶——不是失败，是本决策的预期行为。

### 能撤销

撤销需要用户动作：`git push --force-with-lease origin master:master`（或由用户亲自合并旧谱系）。agent 无权单方面执行。

## 相关

- ADR-0290（provider cache proxy）、ADR-0286（BIG-CTX digest 配额）
- 并行线 cont.417-418（Echo #161《前院只收落叶的信树》/ §SIM-2 合成用户行为再跑）
- `docs/ROADMAP.md`（本线行动项以主干为准）
