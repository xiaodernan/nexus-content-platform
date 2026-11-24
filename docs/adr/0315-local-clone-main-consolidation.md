# ADR-0315 — 把 local-clone/main 并回唯一主线：14 处冲突判侧、生成物重导、判据补账

- 日期：2026-11-23
- 状态：accepted
- 相关：ADR-0291 / ADR-0297（origin/master 陈旧引用保留）、ADR-0319（origin/main 并线，原 ADR-0313）、cont.478–480

## 背景

仓库在本次开工时存在**三条线**：

1. `master`（HEAD `9ce26a74`）：已由 `d2ed638c` 并入 `origin/main` 的 94 个提交（ADR-0319，原 ADR-0313 / v1098），
   并继续完成 v1095–v1098 的 CSRF、数据库 parity、showcase 等修复。
2. `local-clone/main`（MERGE_HEAD `11efbc1c`）：另一台机器上的活跃线，独有 E219《点账》/ E220《照着点走一遍》、
   典籍室 metadata 本地化、配置中心只读操作面、ai-service 成本账与 liveness 分类、撞库压测等。
   这条线的 `docs/CURRENT-STATE.md` 已记载 cont.466/478/479/480：它已按叙事顺序吸收了 master 的 E210–E215
   并整体重排为 E212–E217，**没有删任何一篇**。
3. `origin/master`（`e9c4ba8f`）：按 ADR-0291/0297 刻意保留的陈旧引用，不动。

合并 `local-clone/main` 进入 `master` 时产生 14 处 UU 冲突，且并行会话在
`scripts/gen-bible-snapshot.mts` 中遗留了一行 `>>>>>>> local-clone/main`（未被 git 标记为冲突，
但使生成器编译失败）。`.scratch/` 证据树被双方跟踪，属有意保留（见 `.gitignore` 的说明）。

## 决定

1. **14 处冲突统一取 `local-clone/main`（theirs）为基准**。理由：该线是更完整的超集——
   `CURRENT-STATE.md` 517 个 cont. 标题对 ours 的 514，且已按叙事顺序吸收 master 的回响并重排编号；
   ours 独有的 v1098 合并记录另存于不冲突的 `docs/adr/0319-merge-origin-main-into-one-main-line.md`（原 ADR-0313），
   未丢失历史。
2. **生成物不手工选边，一律从合并后的语料重导**。删除生成器残留冲突标记后执行
   `npm run gen:bible-snapshot`：14 章 + 220 回响 + 4 附录，锚句 1334 zh / 1334 en 逐字对齐，
   `canon_digest` 274,590 chars / sha `d5e3a147…`。`guideCopy.ts` 的旧数 "two hundred nineteen"
   改为 "two hundred twenty"，测试 pin 已是 1329/14+220（digest 口径），无需再改。
3. **不盲目 re-pin 视觉 SHA**。`observer-deepread-visual-style` 的组件 SHA 从 `4e6d1fb0…` 变为
   `624023e5…`：逐字节比对确认变化来自 master 侧的正确修复（中文 kicker 去掉并列英文与模型名，
   「AI 深读 · gpt-6.2-sol」→「AI 深读」），theirs 的 pin 才是旧字节，因此重钉到实际值。
4. **record-encoding 判据修根因，不放宽规则**：
   - S2 发现 2 行可计费损伤，均为中点加字母经 GBK 误读可生成的那个汉字出现在
     数字后、右邻标点的组合中；改用中文数字后左邻 CJK，按 flank 规则正常拒绝计费。
   - S2b 发现并轨带来的 10 条新 island 行（DotRoad 页/测试、canon-review 测试、5 份压测日志、
     2 份证据文档），按既有 amendment 格式逐条登记进 `LOOKALIKE` 花名册并注明来源。
5. **lint-tree 修根因**：`.scratch/**` 被根 ESLint 配置显式忽略，作为 area 跑必然 exit 2，
   加入 `EXEMPT_AREAS` 并写明理由；并轨带来的 11 处 finding（未使用局部变量/类型、`no-base-to-string`）
   全部修掉而非写进债务台账；`scripts/stress-gateway.mjs` 同时登记到 `eslint.config.mjs` 与
   `tsconfig.tools.json`，使 typed lint 能解析它。

## 后果

- 回响编号以合并后语料为唯一真值：E206–E220，本会话早先写的 E210 定为 E212（`echo-212-forty-third`）。
- 生成物与语料一致，`verify:world-bible` / `verify:bible-snapshot` / `verify:anchor-echo` /
  `verify:record-encoding` / `verify:census` / `verify:evidence-census` / `verify:arms-freshness`
  在本机全绿；`npm run typecheck` 14/14；受影响 vitest 全绿。
- `.scratch/` 证据文件继续随仓库走，但不再被 lint-tree 误判为 CRASH。
- 三条线收敛为一条：`main` 与 `master` 指向同一合并提交；`origin/master` 陈旧引用按既定 ADR 不动。
