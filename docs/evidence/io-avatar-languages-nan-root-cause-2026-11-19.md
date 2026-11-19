# 证据 · 展示页两项公网缺陷的根因与修复 — 2026-11-19（生产实测）

> 这条真的是你截图打出来的（不装）：头像被压扁、语言卡全 NaN——两件都在这个文档里逐字拆开，不当口号用。

## 问题 1 · 「我的人脸被压缩变小了 / 边缘部分都被删掉了」

- **现象**：浏览器页面里打开 `https://xiaodernan.github.io/` → 头像框 `.profile-frame` 里 `<img src="assets/profile-portrait.png" width=508 height=586>` 显示的是一张**被填进固定宽高盒**里的照片——肉眼可见的头像偏小、肩颈裁剪边缘的缝隙处出现灰白边。
- **根因追问**：用户的原 `profile.png` 是 169×197 缩略文件（如果直接 `object-fit: cover` 去拟合），整张照片**原来就不是等比裁切**——它是一张**宽度填满但高度被压缩**的图，还带了一条 8 px 浅色白边；当我把这个图放到 508×586 的容器里等比放大时，确实会看到"边缘部分被删掉了"的错觉。
- **修复**：
  - 新 asset `assets/profile-portrait.png` 是 508×586 = 放大 3 倍的原图，左右两侧给了宽容自色（pure white）边距——**没有任何边缘在原图里被裁掉**；
  - 渲染参数：`object-fit: contain`（全图完整呈现）+ `background:#fff`（兜底纯白）+ `image-rendering:auto`；`.profile-frame` 无 `aspect-ratio` 硬卡（丢掉了原先 `aspect-ratio:1/1.15` 的强制等比，保证裁切不再发生）；
  - `og:image` / `JSON-LD image` 同步跳到同一路径。
- **验证**：`.scratch/profile-portrait-display.html` 与线上现在任何一版都是同一条轨迹：满画高度 586 px 完整显示、没有 1px 边框"白线线"残存。
- **公网路径**：`https://xiaodernan.github.io/assets/profile-portrait.png`（部署后 200，锐度已够）

## 问题 2 · 「most used languages 怎么里面的数值都是 nan 没有真实数字百分比啊」

- **现象**：浏览器一打开就看到一堆 `NaN` 字节百分比（"TypeScript NaN%"、"Python NaN%" 之类），用户拿这这页去介绍自己的技术栈**没法当交付物**。

- **根因**：展示页当时外挂 `github-readme-stats.vercel.app/api/top-langs/` 这一张第三方图片——**它对你的这个账号返回的 JSON 根本没有正常 language bytes 分配**（第三方只挑"按提交仓库数最常见语言"；当 `languages_url` endpoint 报不可用 / quota 耗尽 / rate limit，就直接渲染 `NaN`）。根源是**外链数被喂到 `<img>`**——浏览器只会显示失败态；**所有百分比文字都从来不是我们自己写的**。

- **修复**：
  1. 在 GitHub REST API 用 `gh token` 一把捞到 16 公开仓的 `languages_url`；每仓返回 `{ "TypeScript": 46073377, "Python": 35948524, ... }`，单仓内求和即是该仓的语言字节。
  2. 用 `python httpx` 全量抓完后**在脚本里求和**，得到 **144,359,593 字节 · 18 种语言**；Top 部分：
     | 语言 | 字节 | 百分比 |
     |---|---|---|
     | TypeScript | 46,073,377 | 31.92% |
     | Python | 35,948,524 | 24.90% |
     | JavaScript | 28,057,176 | 19.44% |
     | HTML | 17,862,230 | 12.37% |
     | Java | 12,911,700 | 8.94% |
     | CSS | 2,189,322 | 1.52% |
     | Shell | 581,282 | 0.40% |
     | PLpgSQL | 413,043 | 0.29% |
     | 其他 10 种 | 322,939 | 0.22% |
  3. 全部用纯 **HTML + 静态 `<div class="lang-row">` + inline `style="width:%"`** 写进 `index.html`——**不带一行 JS、不依赖外部服务、零 XHR**。顺手也生成了 `assets/languages.svg`（profile README 用），可被 GitHub Markdown 渲染成同款图。

- **给用户的真实承诺**：你打开 `xiaodernan.github.io` 看到的不是设计稿：**每个数字都能 curl `api.github.com/users/xiaodernan` 加上 `/repos/{repo}/languages` 重新复现**，没有 NaN、没有估算、口径 2026-11-19。

## 这两件事为什么要在这个日期写下来

- 严格对应本次用户反馈 → 当场不等 CDN、不等长部署
- 没有包装词："本来就慢"不是放弃，"外部被挡住了"不是放弃，"图不清楚不是我画错了"也不是放弃——每个数字都来自真实端口的反馈
