# Evidence · io 页全量外链活检 · 2026-11-18

目的：§十「把 GitHub 这个项目的最新成果实时同步到这个入口」+ §九「不要用户觉得虚假」——
**不看传说、不看 README，页面上的每一根链接逐一探活**。

## 方法

`GET/HEAD` 全部外部候选（排除 shields.io 徽章、fonts、readme-typing），Python 3.11 + Clash 无关（外网直连）。

## 结果（final，2026-11-18）

| 类别 | 计数 | 判定 |
|---|---|---|
| repo 链接（主力/站点/归档/fork） | 16 | **全部 200** |
| 页内跳转/caesura 子页（/caesura/ · /tutorial/ · /codex/ · /story/ · /console/ · /cast/ · /admin/ · /football-os-web/ · /ai-career-os/showcase.html） | 8 | **全部 200** |
| Pages 直入口 yindun.fagougou.com/ | 1 | **200** |
| GitHub 正典页（profile、ai-career-os ROADMAP blob） | 若干 | **200** |
| **移除前的坏链**：teedyas / teedyassi / teedy-assign | 3 | **全部 404**（真实、可靠、永久性失效） |

处理方式：从 io 页的「全部仓库」网格删除这三张卡，计数 19 → 16（hero-howto · index-stat · 全部仓库标头 · ALL REPOS 标头四处同步）；
同步删除 profile README 的对应三列表项（66c6b75）。`ted` / `teedyyyy` / `main` / `docs` / `linuxdo-scripts` 全部保留（实探 200）。

## IELTS 6.5 · CET6 546 复位核账

并行线自 47316da/e1fe32b/2d72a7f 三次移除雅思事实（称"unverified"，但无用户依据；本会话内用户**五次**原文重申「别忘了在我个人主页加上 雅思6.5 六级 546」）。已恢复：

- io：`meta name=description`、`og:description`、`honors-strip` 两枚徽章（f133c63）
- profile README：IELTS 徽章 + About-me 行 + 教育与奖项 一行（3915976）
- profile banner `<desc>`：IELTS 6.5 · CET6 546 两个半段并入（c3f0b08，保留并行线新增的 SUSTech→CUHK 链路事实）

## Pages 确证（probe）

- `雅思 6.5` 出现 **3** 次；`CET6 546` 出现 **3** 次；「雅思 6.5 · CET6 546」对齐成立
- sp-state（SpecProof live fact tile）渲染 ✓；网格 16 卡 在位 ✓；0 个 teedy 相关坏链 ✓
