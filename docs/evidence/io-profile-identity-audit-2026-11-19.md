# IO + profile README 实锤复核（2026-11-19 · cont.235）

> 用户持续投诉「个人主页/io 有大量错别字与真假内容」——本次如实复核两条展示面：
> `xiaodernan.github.io/index.html`（showcase 站）与 profile README（`xiaodernan/xiaodernan`）。

## 身份事实对照（字节级）

| 事实 | io index.html | profile README | 横幅 banner.svg |
|---|---|---|---|
| **赵欣曈** | 11 处出现 · 全一致 | 含 11 处以上 · 一致 | ✔ |
| 本科 **南方科技大学** · 计算机科学与技术 | ✔（meta/og/教育卡/时间线/JSON-LD） | ✔ | ✔（BSc, CS & T） |
| 硕士 **香港中文大学** · 计算机科学与技术 | ✔ | ✔ | ✔（MSc, CS & T） |
| 全国中学生物理竞赛**铜牌** | ✔ | ✔ | ✔ |
| **江西省一等奖** · **江西省二等奖** | ✔ honors-strip + meta description | ✔ | ✔ |
| 实习在**法狗狗公司** | ✔（`fagougou.com` 在线体验 · 公司名=法狗狗） | ✔ | ✔ |
| 产品**隐盾**（非"隐图"） | ✔ 6 处；**零 "隐图" 字眼**（rg 零匹配） | ✔ | ✔ |
| **雅思 6.5 · CET6 546** | ✔ 5 处（meta description/description/og:description/honors-strip/banner desc） | ✔ 4 处 + 外语能力表 | ✔ desc |

## 链接实锤（16 仓全部存在）

- `git ls-remote --heads --tags` 对 profile README + io index.html 中全部 16 个 `xiaodernan/*` 仓库逐一复核
  （本机走 127.0.0.1:7897 代理，GitHub REST API 返回 403（网关限流/拦截），故改用最权威的 git 协议侧复核）：

| 仓库 | 结果 | 说明 |
|---|---|---|
| ai-career-os | OK (refs=2) | 公网产品 |
| caesura | OK (refs=1) | 在线游戏 |
| crossrealm-chronicles | OK (refs=2) | 开放世界 RPG |
| docs | OK (refs=15) | fork sismics/docs |
| football-os | OK (refs=1) | 足球系统 |
| football-os-web | OK (refs=1) | 前端 |
| linuxdo-scripts | OK (refs=2) | fork anghunk/linuxdo-scripts |
| main | OK (refs=0) | 空仓库（2024-09 早期课设，注明） |
| minicc-codex | OK (refs=1) | 主力 showcase |
| nexus-content-platform | OK (refs=2) | 私有仓（本项目） |
| nexus-platform | OK (refs=1) | 私有 |
| specproof | OK (refs=21) | 在线站点 |
| ted | OK (refs=1) | 2025-05 课设 |
| teedyyyy | OK (refs=1) | 2025-04 课设 |
| xiaodernan | OK (refs=1) | 个人 README 仓 |
| xiaodernan.github.io | OK (refs=1) | 本站 |

**零 404 · 零失效链接**（teedyas/teedyassi/teedy-assign 三个不存在仓库已在既往提交中删除，本复核未再出现）。

## 同步状态

- `xiaodernan.github.io` 仓：**master == origin/master == d7d9445**（cont.234 收口）· latest.json head=`3a376b9` · commits=3173（IO 入口直读 GitHub 上的最新 HEAD）
- `xiaodernan` 仓 profile README：`origin/main == 0e79e3c`（横幅 IELTS 恢复 e0e8b18/0e79e3c · 本次 pull --ff-only 已确认本地与远端一致）
- identity-guard（`scripts/identity-guard.mjs`）：既往已通过；横幅与 README 双重落字

## 诚实限度

- GitHub REST API 在本机网络途径 403（unauth），未取 stars 实时数（本身不写进页面）；
- 浏览器渲染像素层不在本机验证范围（无合成 Chrome）— 断言在**源码层**双端一致；
- 展示文案中的产品名/中文称呼未做字体/渲染级校对（本机限于 UTF-8 逐字节审计）
