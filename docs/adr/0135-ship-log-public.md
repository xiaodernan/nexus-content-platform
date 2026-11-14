# ADR-0135 · `/ship` 交付日志（fork 代价：换取对公开仓库这个事实的坦白）

## 背景

这个项目每天产出的事实没有任何地方汇总——不是"我们做成了什么"，而是"今天到底做了什么"。
git 有，但人不能读。罗列出来的唯一真值必须：可被 git 复现、不需要人手工挑选、不被加工过。

## 决定（2026-11-14）

做 `/ship` 公开页：从 git log 机械生成这个「交付日志」，降序、按天分组、零装点。

1. **生成器是 `scripts/gen-ship-manifest.mts`**：`git log --reverse` 扫，过滤
   `feat|fix|refactor|docs|test|merge` 前缀+v\d{3}+ADR-\d{4}，输出两份文件：
   - `docs/ship-manifest.json`（机读）
   - `apps/web/src/lib/ship-manifest.ts`（Next import 直入）
   注册 `npm run gen:ship`。任何人 `npm run gen:ship` 都能再生成，幂等，不挑选。
2. **页本身是 §FE-Ship `.sh-*` 族**（零裸原子、零 hex、forced-colors 收口）：
   - RSC-only（无 `'use client'`），零 server-domain import，零数据库依赖，
     累计提交数 / ADR 数 / 契约数在**请求时**现数（`execFileSync('git rev-list --count')`），
     不写死、不漂移。
3. **公开**：`/ship` 是免登陆的 public 页。只对公开仓库暴露的
   已公开仓库信息（commit 是公开产物），不承诺任何私人内容；
   本页自己不引用 admin 路径也不泄露私有数据。
4. **指令面板**：`PALETTE_COMMANDS` 加入 `ship`（gb flag `17` 条），
   单测 `command-palette-registry.test.ts` 同步锁死。完整性由该门和 visual-style 门两个地方守。
5. **判据**：`ship-visual-style.test.ts` 7 门全绿 + SHA256 钉死（本线字节 `c602d3a2…`）。

## 诚实边界

- 不承诺"好看"，"成就"或"社区肯定"。只显示 git 给的数字。
- 页面还未被浏览器像素级验收（本机无 Chrome 工作窗口）——全静图渲染出来的 HTML
  字节 28794，布局按 .sh-* 段落和 tokens 仍需在有 Chrome 的机器上补一眼。
- 国家/组织名册不点名——本页不引证作者（commit author 可查但本页不渲染）。

## 代替方案被否

- ❌ 全量 git log 直接渲染：刷屏，关键字没有，读不动。
- ❌ 只显示 feat：丢了"修了什么"，也丢 accuracy。
- ❌ 用 GitHub API：本机可能不外联且 schema 漂移，git 是最真的那一支。

## 后续

- 赢的那一天，roadmap 可以引用 `/ship` 作为"最近到底发生了什么"的单一入口。
- 若有一天这个公开仓库被归档，`npm run gen:ship` 不必改，输出还是真的。
