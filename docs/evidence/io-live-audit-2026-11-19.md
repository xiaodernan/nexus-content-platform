# 公网实印 · xiaodernan.github.io · 2026-11-19 终印（缓存旗标 final-938）

> 目的：证明展示页真正的线上渲染不再是设计稿、不再 NaN、不再巨大头像。
> 方法：用内置浏览器加载带缓存戳 `?_fresh=final-938` 的 URL，抓取 DOM 属性直接断言。

## 断言矩阵

| 断言 | 值 | 结论 |
|---|---|---|
| `<img.profile-frame>` `src` | `assets/profile-portrait.png` | ✅ 头像已换 |
| 宽度 / 高度 | `281 × 333 px`（不失真） | ✅ 不再"被压扁" |
| `.gh-figures`（`MOST USED LANGUAGES / 语言字节占比`） | 有，渲染面高度 261px | ✅ 已换静态面板 |
| `.lang-row` 行数 | **9 行** | ✅ TS/Python/JS/HTML/Java/CSS/Shell/PLpgSQL/Other |
| `.lang-pct` 取值 | **`['31.91%','24.87%','19.45%','12.42%','8.93%','1.52%','0.40%','0.29%','0.22%']`** | ✅ 全部有限值 |
| `img[src*="github-readme-stats"]` | **不存在** | ✅ 旧 NaN 面板已下线 |
| `.index-stat-num` 四格 | `20 / 9 / 4 / 2` | ✅ 账号仓库 / 旗舰 / 公网产品 / fork（正确：16 公开 + 4 私有） |
| 页脚 | `© 2026 赵欣曈` | ✅ 姓名正确 |
| 成长路径条目 | `南方科技大学 · 计算机科学与技术` / `香港中文大学 · 计算机科学与技术` | ✅ |
| 荣誉条目 | `全国中学生物理竞赛 · 铜牌` / `江西省一等奖` / `江西省二等奖` / `雅思 6.5` / `六级 546` | ✅ |

## 生成方式

页面本身对 GitHub 外部 stats 卡片的硬引用已全部删除；"MOST USED LANGUAGES" 的数字来自一次离线跑 `python gh-langs` 的 `languages_url` 字节求和，版本 `2026-11-19`，保存在 `assets/github-languages.json`。

## 复核命令

```powershell
# 浏览器实测：
start https://xiaodernan.github.io/?_fresh=final-939
# 字节数缓存验证：
curl -s https://xiaodernan.github.io/assets/github-languages.json
# 不应出现：
curl -s https://xiaodernan.github.io/ | findstr /c:"github-readme-stats" /c:"top-langs" /c:"NaN"
# 返回空即为通不过的禁忌：出现任何一条都意味着外部卡片回潮。
```
