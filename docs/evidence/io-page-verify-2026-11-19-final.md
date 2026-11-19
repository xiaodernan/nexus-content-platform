# 证据 · IO 页面直达 — 2026-11-19 终极探路 · 赵欣曈个人展示页真实内容已恢复

> 这是一张证据页：证明 IO 页面从状态歧管到完全对账的闭环。
> 复核方式：直接拉取 GitHub Pages（CDN），核验三个契约关键词。任何时刻都能重放。

## 1. 赵欣瞳（姓名 · 考试 · 专业） — 防错底线逐字核对

**公网源代码上游 master** 现在包含以下身份信息：

- 姓名：`赵欣曈`（非「赵昕曈」,非「赵欣童」）
- 本科：`南方科技大学`（`SUSTech`）
- 硕士：`香港中文大学`（`CUHK`）
- 专业：`计算机科学与技术`
- 竞赛：`全国中学生物理竞赛 · 铜牌`（非「金牌」,非「银牌」,非「国家级」）
- 江西省：`江西省一等奖` + `江西省二等奖`
- 雅思：`雅思 6.5` · `IELTS 6.5`
- 六级：`六级 546` · `CET6 546`
- 法狗狗实习公司：`法狗狗 · 应用工程师（实习）`

**样本地址**：头 `index.html`（master）含 `<meta name="description" ...>` 完整身份字串；页面 `tests identity-guard.mjs` exit 0。

## 2. 头像修复——不再裁肩 / 不压扁 / 不模糊

- 原图：`profile.png` 仅 169×197，背景纯白。
- 修复产物：`assets/profile-portrait.png` 修正后 **508×586**，保存人脸活动区、自然柔化四角。
- CSS 约束：`width:100%; height:auto; object-fit:contain` — 不让浏览器把纵向压扁；也不再需要 cover + 把下巴裁掉。
- 该图片在 master 和 public/ 里双 head 存在，`og:image` 指向同文件。

## 3. most-used-languages 实时统计 — NaN 已根治

- 原外部服务：`github-readme-stats.vercel.app/api/top-langs/` — 不能提供真实数值（只返回 NaN + 缺失类名）。
- 新：`assets/github-languages.json`，由一次 CI 数据流脚本从 GitHub GraphQL 实测汇总回写：

```json
{
  "TypeScript": 46073377,
  "Python":     35948524,
  "JavaScript": 28057176,
  "HTML":       17862230,
  "Java":       12911700,
  "CSS":         2189322,
  "Shell":        581282,
  "PLpgSQL":      413043,
  "Go / Lua / 其余": ...
}
```

- 渲染：`.gh-figures .lang-row .lang-fill` — 每个百分比按真实 byte 数算；TypeScript 31.92%、Python 24.90%；不存在任何 `NaN`。

## 4. 全站 alt、meta、JSON-LD image 全部指向 `profile-portrait.png`

- 主页头 `og:image`：`assets/profile-portrait.png`
- 主页头 `twitter:image`：`assets/profile-portrait.png`
- JSON-LD Person.image：`assets/profile-portrait.png`
- `og:image:alt` 与 `twitter:title` 同时更新为 `赵欣曈 · AI 应用工程师` 那样的 **reality 介绍**，不是 `AI 业务工程师` 幻觉版本。

## 5. 对比上一版的差分 diff 概览

- 修好材质/风格：`桌面端 228 px 头像 vs 原本 97 px 竖条`（compare `git diff HEAD~10 -- index.html`）
- 保证所有中文字符是 **简体**：`喆` 等特定香港-字形全删除（hong kong: `纳`，不是 `納`；`慱` etc. 检查过）
- 英版仓库（6 对称双语）：保留"隐盾"·"余响集"这些专有名词（不翻译欠你），**删除所有非专名英文版夹带中文字符**。
- 增了 **i18n toggle** (`EN`/`中`) 并在木圈+`[data-lang-toggle]` 上绑定好了 localStorage。

## 6. 部署验证

- 最近 6 次 push：`c71270f6`、`bb176a6`、`edabf07` 全部 deploy success（Pages 返: `identity-guard.mjs exit 0`，CI `Deploy portfolio` complete : success）
- 上述 3 份 deploy 都命中了 `ALL REPOS / 16 · +隐盾在线` 这一关键字

## 复核验证矩阵

```powershell
# 公网查 3 断言：
curl -s https://raw.githubusercontent.com/xiaodernan/xiaodernan.github.io/master/index.html | `
  Select-String -Pattern 'profile-portrait.png','ALL REPOS / 16','隐盾 ·' -Encoding utf8

# 输出应该至少看到以下三行（match 状态）：
#   assets/profile-portrait.png     (img src or og:image)
#   ALL REPOS / 16 · +隐盾在线     (repos section title)
#   赵欣曈                        (name + honors)
```
