# FE-3 之后的登峰造极红线：公开面视觉协议

2026-11-11 三片里程碑（§FE-1 /discover、§FE-2 /marketplace、§FE-3 / 首页）落下的所有前端视觉，
**全部锚在 `apps/web/src/styles/tokens.css` 已经定义的 token 上**。这里写清楚为什么、怎么做，
以及不许突破的什么——这份文档是后续任意前端"好看一点"的唯一参考，避免再出现"想加一个新渐变色先加 kind 再加 token"的一样法。

## 六条纪律

### 1. 零新增颜色 token

不为了"这一页好看"加一块新色进 tokens.css。所有新视觉的色值都从已有的 `--nexus-color-*` 推导——
`color-mix(in srgb, <token> X%, transparent)`、`linear-gradient(<token> → <token>)`、`box-shadow var(--nexus-shadow-*)`。

**原因**：token 是编译期承诺（§tokens.css 文件头写着"把本协议映射成 Tailwind 工具类；组件里只允许出现这些语义名"）。

### 2. 渐变 + 透明度是免费的

`linear-gradient` 和 `color-mix(in srgb, <token> X%, transparent)` 都不需要新 token——它们结合两个已定义的 token 就能合成一切需要的色阶。
所有 "渐变墨字标题"（`background-clip: text`）、"压边"（`border-image` 的 `::after` 伪元素）、
"发光徽章"（`color-mix` 描边 + glow shadow）都不含任何 Hex 字面量。

### 3. 层级与缓动只走 motion token

`--nexus-motion-base/slow/ease`、`--nexus-radius-*`、`--nexus-shadow-*` 三大基石，
`prefers-reduced-motion` 下归零动画（不改展示语义）。

### 4. 信息架构不动

新视觉**只是载体**：DOM 顺序、`h1/h2` 层级、`Link` 语法、`aria-current="page"` 一律保持已有。
好看不等于稀释语义——关注/发布/下架 等功能不因装饰变得更远或更难点。

### 5. 公开面先于内部面

优先级：`/`（首页）→ `/discover` → `/marketplace` → `/search` → `/blocks` → Studio 内部面板。
门面先行：门面对每一位全平台游客可见，每一条改善都是一枚增长杠杆；
Studio 的密度已为职业用户优化，装饰在那里只会稀释信息密度。

### 6. 写作里永远承认它只是载体

所有有视觉添加的 commits 都只改载体——schema、发布记录、路由语义、content 结构全部冻结。
"我们做的是升格"，**不是**别名式重构。

## 收尾记

**后续要补的**：`docs/evidence/fe-elevation/` 下补截图（本轮全仓 vitest 与 dev server 争内存未开跑 Playwright 截图）；
design-system 文档需要再抄一次这些六条进 `apps/web/src/styles/tokens.css` 头部注释以便新人直接从 CSS 文件读到。
