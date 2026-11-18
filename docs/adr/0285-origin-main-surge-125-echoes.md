# ADR-0285 · 第二条支线（cont.241-251）于 2026-11-18 接入 main-line：8 个新回响（E118–E125）

## 状态
已接受（2026-11-18，承 ADR-0283 两线合流协议）

## 背景

origin/main（另一条支线 lineage-2）在 2026-11-11 之后继续活跃工作：cont.241–251 期间：

- 新上线 8 个回响：《退潮之后》《潮信》《第四十四次会》《靠门的椅子》《借椅子》《潮的名字》《旧册子里的名字》《潮起来的时候》（其 27–34）；
- 题目：题库从 82 → 98 题（每个新回响 +2）；
- Lighthouse a11y 全绿（`§五`：对比度/可读名/真重叠修复 + `.tt-fab-locale` 定位 + `.kb-fab` 避让 + 强制色收口）；
- /tide-wire stats 走 `unstable_cache(…, revalidate:3600, tags:['tide-wire'])`；
- CommandPalette 标签 `命令` → `命令面板`（aria-label 同步）；LocaleToggle → `.tt-fab-locale`；
- `.globals.css` 两个残缺闭括号（forced-colors 缺 `}` 与 §MAP-1 注释前多余 `}`）。

这条支线因为该机器推送的 PAT 之前只有 `repo`——workflow 缺失，所以一直停在 origin/main 等 main-line 收敛（也正是合流问题反复被提出的原因）。

## 选项

A. 忽略 origin/main，main-line 自己再写 8 篇新回响。
B. 按 ADR-0283 协议（其实就是 blob 逐字移植 + 双语逐字对齐 + 重建 digest）把这 8 个新回响移植进 main-line，E 类名重定为 E118–E125；其余前端修复直接并入。

选项 B。A 是浪费、也是对"并轨方做了部分没做完接手"指令的违背（§二）。

## 决定

- origin/main 的 8 个新回响（E27–E34）→ main-line 编号 **E118–E125**（接在 main-line E117 之后）；文件名、slug（`echo-118-…` 至 `echo-125-…`）、锚句 `Echo No.` 与 Zh 标号（`其一百一十X`）、交叉引用（其余回响/回响互指）、`gen-bible-snapshot.mts` slug 表**统一重映射**；`lineages-alt` 仍保留 origin/main 归档快照（reference）。
- Digest 重建：**96,679 chars**（13 章正典 + 125 回响 + 4 annex）；`verify:world-bible` **768/768** 全绿；`anchors.generated.ts` 重生成 **626 锚句**。
- 题库：其 27–34 一共 16 题→ main-line `apps/web/src/components/BibleQuiz.tsx` 按原文忠实植入（ZH 翻译保留原作措辞），总数 **71 → 87**；verdict 满分门槛 71→87；`empty` 文案与 en `lede` stale「五个正典章节」同步修。
- Lighthouse a11y 与 globals.css 两个 brace 修复、tide-wire `unstable_cache` 包装——**不改任何可 pin 的字节（formatting 以外）**。其 visual-style pins 重钉。
- guideCopy 数字更新为主线版本：13 章 + **一百二十五回响** / **626 锚句**（zh & en）。
- BibleQuiz 标题/aria-label · `progressLabel: '本轮进度'/'Progress'`；章节标签 125+ 用现成的 `_cn()/_roman()` 算法（替换掉 `echoLabel` 旧硬编码阵列）。
- 题库/`quiz-visual-style.test.ts` 用例数 71 → 87、答案序列补 16 个 0（该支线新题全部答案 = 0，逐字核验了 zh/en 答案序列一致性）。
- 前端 pins（bible-ask ×2、bible-quiz ×1、bible ×1）按真实产物重钉。

## 后果

- digest 再扩 ~12KB（HEADROOM 仍充足约 15k chars）；
- Pages 将随 `sync:showcase` 推进；origin/main 本日推送（PAT 带 workflow 权限，见 `cont.350` 记录）；
- 两条 Line 的 git hash 分歧彻底消失：main-line 现在包含 origin/main 全部可用内容；支线悬挂分支可安全归档。（本次未删 origin/main 上任何内容：合入后通过 `git push origin HEAD:main` 快进推送，保留审计。）

## 不做的事

- 不替换 quiz 的答案分布（支线出题确实全部答案=0，这是出题习惯问题——记录在此，不偷偷改）。
- 不调整 `world-bible` 128K 预算与 `AiChatRequest.system.max=112,000`（撑得住本次 digest）。
