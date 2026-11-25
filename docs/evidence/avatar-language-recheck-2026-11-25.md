# 头像与语言百分比复核（2026-11-25，用户反复提的两项）

## 头像（"被压缩变小、边缘被裁掉"）
- io 页 `index.html` 两处头像 `<img src="assets/profile-portrait.png" width="508" height="586">`。
- 原图 `assets/profile-portrait.png` 实际 PNG 尺寸 **508×586**，与 HTML 属性逐字一致 ⇒
  比例 0.867 完全匹配，**无拉伸压缩、无裁切**。
- 页内无针对头像的 `object-fit/固定方形/圆形裁切` 规则。结论：此项已达标（无则加勉）。

## Most Used Languages NaN
- io 页 `index.html` 中 `NaN` 出现 **0 次**。
- 语言百分比全是真实数字：TypeScript 32.51% · Python 24.58% · 19.44% · 12.50% ·
  8.60% · 1.49% · 0.38% · 0.27% · 0.21%，`lang-fill` 宽度与百分比一致。
- 结论：此项已达标（无则加勉）。

## 核对脚本
`.scratch/check-avatar-io2.py`（头像 HTML 行）、`.scratch/check-avatar-io.py` 用 struct 读 PNG IHDR、
`.scratch/check-lang-pct.py`（NaN 计数与百分比）。
