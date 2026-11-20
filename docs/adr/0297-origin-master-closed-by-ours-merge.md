# ADR-0297 · origin/master 陈旧引用收口——保留提交、以 ours 合并对齐（2026-11-20）

## 状态：已接受（2026-11-20；取代 ADR-0291 的“保留不动”操作结论）

## 背景

ADR-0291 记录了 2026-11-19 的状态：远端 `origin/master` 停在早间谱系 `e9c4ba8f`（Echo #156《潮候院那盏从不写名的灯》），主干则在重写后的 `master`/`main` 上继续，二者分叉。当时选择“保留不动、不强推”，因为 force-push 会改写共享历史，且远程提交只是本线同一故事的旧编号版本。

2026-11-20 用户再次明确授权：“尽量把项目的多个工作分支、各种 worktree 合并起来，综合集大成，汇到一个主分支”，“如果并轨内容没人继续做，直接接手把剩下的做完”，“即使被锁住也不要管，直接把那部分补完”。这使“以非破坏方式把旧谱系并回主干”成为明确任务，而不是待用户拍板的悬案。

## 实测前置核验

- 合并前：`本地 master = 109edfab`，`refs/remotes/origin/master = e9c4ba8f`，`git rev-list --left-right --count` 为 `1 222`。
- 远程提交 `e9c4ba8f` 触及 9 个文件；正文核验显示远程 E156 与本地 E162《潮候院那盏从不写名的灯》在归一化编号后逐行等价（53 行 / 53 行，`IDENTICAL BODY`）。
- `git diff --stat HEAD refs/remotes/origin/master` 显示远程相对当前主干净删除 24,489 行：当前 `master` 是功能与内容的 superset，不能反向覆盖。
- 常规 `-s ort` 合并与 rebase 均在 canon / BibleQuiz / world-bible 家族冲突；冲突根因是同一灯故事的双编号（远程 E156 / 本地 E162）与随之变化的正典 pin，不是独占内容缺失。

## 决定

使用非破坏合并把旧谱系收口：

```bash
git merge --no-ff -s ours refs/remotes/origin/master \
  -m "merge(origin/master): retain local superset; remote E156 lamp is duplicate of local E162"
git push origin master
```

- `-s ours` 只保留当前主干的**树**，但保留 `e9c4ba8f` 作为第二父提交：旧提交永久可达、可审计，不被重写、不被丢弃。
- 不使用 `--force` / `--force-with-lease`，远端没有历史改写。
- 合并提交：`00668e43 merge(origin/master): retain local superset; remote E156 lamp is duplicate of local E162`。
- 推送结果：`e9c4ba8f..00668e43  master -> master`，随后 `git fetch --prune` 复核 `refs/remotes/origin/master...HEAD` 为 `0 0`。

## 门禁复核（合并后实测）

- `PYTHONPATH="D:/终极项目/apps/ai-service/src" /tmp/nexus-ai-venv/Scripts/python.exe -m pytest apps/ai-service/tests -q` → **473 passed, 18 skipped, 1 warning in 18.75s**。
- `NODE_OPTIONS= npx vitest run --root packages/schemas --no-file-parallelism` → **8 files passed, 407 tests passed in 7.04s**。
- 合规测试门使用 `--no-file-parallelism`，规避本机 Vitest 默认并行池静默少报文件的问题（见项目长期记忆）。

## 后果

### 变好的事

- `origin/master` 不再是陈旧 ref；本地与远端 `master` 同一 SHA（`00668e43`），`ahead 0 / behind 0`。
- 旧谱系继续以 merge parent 可达；没有强推，没有丢弃提交。
- 后续 lane 不应再因“behind 1”误判而发起 force-push 或重复合并。

### 变差的事

- ADR-0291 中“保留不动”的操作结论已被本 ADR 取代；它作为 2026-11-19 的历史判断保留，不再作为当前操作依据。
- `-s ours` 意味着远程树没有逐字进入新树；这是有意的，因为已逐行核验其正文与本地 E162 等价，且远程整体是本地子集。若未来发现远程确有独占内容，应以新提交补入，而不是回滚本合并。

## 相关

- ADR-0291（前次判断：不强推、保留旧 ref）
- `docs/CURRENT-STATE.md`、`docs/evidence/showcase-deploy-verify-2026-11-19.md`（欠账条目已追加 2026-11-20 收口注记）
- `00668e43`（合并提交）、`109edfab`（合并前本地 HEAD）、`e9c4ba8f`（旧远端 HEAD）
