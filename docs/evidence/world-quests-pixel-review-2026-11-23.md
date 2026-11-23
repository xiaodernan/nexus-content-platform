# world-quests 三张截图的像素目验（2026-11-23）

## 入口与范围

ROADMAP 两条 `[~]`（L15387、L15488）挂着「像素目验缺席」：截图已由 Playwright 产出，
但当时图像上传工具报 Backend error，只能以几何读数 + a11y 快照为准。本次窗口**实际打开图像**
逐张核对，把缺口闭掉。

对象（都是 `.scratch/` 里已按 §192 入册的真实产物，非复刻）：

| 文件 | 尺寸（像素） | 视角 |
|---|---|---|
| `.scratch/world-quests-desktop.png` | 1089 × 796 | 桌面 · 中文 |
| `.scratch/world-quests-mobile.png` | 232 × 1035 | 手机 · 中文 |
| `.scratch/world-quests-en.png` | 1089 × 796 | 桌面 · 英文 |

## 目验读数（逐张）

**desktop / zh** — 三张今日委托卡横排，标题与三步编号清楚；「其余可做的事」两行、
「已经了结」「还没有可做的东西」三段层次分明，无卡片互相覆盖。几何结论与原 e2e 一致：
1440 宽无横向溢出、卡片 top 单调。文字未见变形或重叠。
**抓到一处真缺陷**：顶上 kicker 是 `COMMISSIONS · 世界委托关员NWRQ8828`——
前半是纯英文挂牌，中文界面第一眼就看见；脚注
「数字来自 worlds / characters 真表 · 零 provider · 零写库」同样夹着英文表名与技术词。

**mobile / zh** — 390 宽下单列，卡片不挤压、三步内容未裁切；底部三个操作链接可见。
右侧悬浮的 `?`/`EN`/`☀` 按钮按设计浮在视口右缘，滚动经过列表时会盖住右侧一小段链接文字
（属固定悬浮按钮的固有 Behaviour，不是布局重叠；`N` 圆圈是 Next.js 开发指示器，生产构建不出现）。
这一项**如实记为设计取舍，不谎称修掉**。

**desktop / en** — 界面文案整体是英文，世界名 `世界委托关员NWRQ8828` 仍是中文：
这是世界文档里的**数据文本**，按项目既定口径（§i18n）数据不翻译，不算漏翻，诚实记下。
真正的界面缺陷与中文页对称：kicker 两侧完全同名（都是 `COMMISSIONS`），
中文侧不该保留英文挂牌；另有 `Leave the joint a bypass` 语义生硬（非夹杂，属文案打磨，未在本轮改）。
截图里的 `Expiration day` 在现版本已是 `Commission day`，说明截图之后已有过修复，此处不重复记账。

## 由此做的修复（不是只记不修）

1. `apps/web/src/app/world/[projectId]/quests/page.tsx` 中文块：
   `COMMISSIONS` → `委托看板`；脚注 `worlds / characters…provider` →
   「作品表与人物表真值……不调用外部模型」；`世界 id` → `世界编号`。
2. 全 src 扫描同类英文挂牌，又抓到 8 处并全部改中文（en 块一律不动）：
   `admin console` → `管理台`、`SHIP LOG` → `航行日志`、`DIGEST` → `世界大典`、
   `CHECKUP` → `世界体检`、`NETWORK` → `万象脉络`、`CHRONICLE` → `编年`、
   `public observatory` → `公开观察站`、`public observatory · 123` → `公开观察站 · 口令 123`。
3. 新增 `apps/web/test/i18n-zh-kicker.test.ts`：全 src 扫 zh 块的 `kicker:`，
   必须含汉字或以 `§` 开头（内部锚豁免），并带反例臂证明不是恒真。
   与既有 `i18n-en-purity.test.ts`（en 零中文）成对，补上用户第八点缺的那一半。
4. 七处视觉门 SHA 按真值重钉；`--testNamePattern="SHA256|SHA 钉|sha256"` 全跑 **122/122 绿**。
5. 提交 `964e0139`（pre-commit 钩子通过）。

## 诚实边界

- 这次目验看的是 **2026-11-22 20:43 产出的截图**；本轮文案修复之后**尚未重新截图**，
  所以「修复后的中文页 kicker 视觉上确实是中文」目前由源码 + 新门保证，
  不是新一轮像素读数。下一轮带起服务后重跑 `e2e/world-quests.spec.ts` 并再目验一次。
- 固定悬浮按钮遮挡一小段链接文字、`Leave the joint a bypass` 的生硬措辞，
  都**没有**在本轮改动；如实留作后续打磨，不冒充已解决。
- API 已于 2026-11-22 关闭；本轮不涉及任何 provider 调用，全部为静态源码与本地图像核对。
