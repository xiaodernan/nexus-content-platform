# DESIGN SYSTEM — Nexus Design System

两层含义，必须严格区分：
1. **NEXUS 自身产品 UI 的设计系统**（本文件）—— 让 Studio 看起来像一个高端 AI-native 工具。
2. **平台能力：用户创建自己的 Design System**（§11-13、§120）—— 那是功能，见文末。

## 视觉方向

关键词：**Deep space / Cinematic / Precise / Calm**（与 §136 "CREATE YOUR UNIVERSE" 一致）。
深色为主，允许 light；高信息密度区域靠层级与留白，不靠描边堆砌。
不做玻璃拟态泛滥、不做霓虹滥用、不做无意义渐变背景。

## Tokens（§12，产品 UI 侧）

命名空间固定为 `color / font / space / radius / shadow / motion / z / breakpoint`。

```
color.bg.0 / bg.1 / bg.2 / bg.3      面板由深到浅的 4 级表面
color.fg.1 / fg.2 / fg.3              主文本 / 次文本 / 占位
color.brand                          主行动色（青紫相，克制使用）
color.accent.1 / accent.2             强调（生成中 / 成功）
color.danger / warn / info
color.border.subtle / strong
font.sans / font.mono
font.size.12 … 28  (12/13/14/16/18/21/24/28)
space.1 … 12        (4 的倍数步进)
radius.sm 6 / md 10 / lg 16 / full
shadow.sm / md / lg / glow
motion.fast 120ms / base 200ms / slow 360ms / spring
breakpoint.sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536
```

真值定义在 `apps/web/src/styles/tokens.css`（CSS 变量）与 `tailwind` 配置双向映射；
组件**只允许**引用 token，不允许写死 hex/px。Design lint（§121）检查这一点。

设计模型这一侧同样成立，而且不只是颜色：`lintDesign` 的 `hardcoded-style` 也覆盖**未绑 token 的几何**
（非零的 `layout.gap` / `padding` / `style.cornerRadius` 字面量；0 是默认值，不算硬编码）。
这不是风格洁癖——§29 的视觉语言带的是 `geometry` 旋钮（`radius.*` / `space.*`），
节点上钉着 `10`、`64` 这样的数字时，"换一套圆角"就没有指代。因此：
起手页、结构方向新增的区块、DEMO 配方生成的 section 一律写 `{radius.md}`、`{space.16}` 这样的引用；
Code → Design 反向同步会把生成代码里的 `var(--nx-space-6)` 认回 `{space.6}`（认成数字会把绑定改坏）。
默认栅格：`space.1 … 24`（4 的倍数：4/8/12/16/24/32/48/64/80/96）、`radius.sm 6 / md 10 / lg 16 / full 999`。

## 排版

UI 文本：系统无衬线栈（Inter 优先，中文回落 PingFang SC / Microsoft YaHei）。
代码与标识符：等宽（JetBrains Mono / Consolas 回落）。
字号阶梯固定 8 档，字重只用 400/500/600/700。行高 1.5（UI）/ 1.15（展示标题）。

## 组件（§13 对应实现）

产品 UI 基础件用 shadcn/ui 风格自建在 `apps/web/src/components/ui/`：
Button · IconButton · Input · Select · Toggle · Tabs · Tooltip · Dialog · Popover · Slider · NumberField ·
ColorField · TreeItem · Panel · Splitter · Badge · Toast · CommandBar · ActivityFeed · DiffView。

约定：
- 每个组件有 `variant`（primary/secondary/ghost/danger）× `size`（sm/md/lg）× state（focus/disabled/loading）
- 状态覆盖 §124：hover / active / focus / disabled / loading / error / success
- 图标统一一套线性图标集，24px 网格、1.5px 描边

## 动效（§122）

只允许：fade / slide(≤8px) / scale / spring / scroll reveal / micro-interaction。
时长取 motion token；`prefers-reduced-motion` 下全部退化为 fade。
禁止：视差滥用、无限循环背景动画、>400ms 的面板动画。
Studio 中的"生成中"用确定性进度反馈（Activity Feed + 进度条），不用无意义 spinner。

## 无障碍（§90）

- 全部交互可键盘到达；Canvas 有键盘操作模式（方向键微调、Enter 进入、Esc 退出选择）
- 焦点环始终可见，禁止 `outline: none` 而不替代
- 对比度：正文 ≥4.5:1，大字/图标 ≥3:1；Design Critic 会检查（§32）
- 面板/树/对话框有 ARIA 语义与可访问名称
- 屏幕阅读器能读出选区与 AI 结果摘要

## 用户侧 Design System 能力（功能，非本文件视觉规范）

- 用户可创建 Design System：Colors / Typography / Spacing / Radius / Shadows / Motion / Grid / Breakpoints / Components / Icons（§11）
- Tokens 以 `color.primary`、`radius.md`、`spacing.4`、`font.heading`、`motion.fast` 点号键存储（§12），可绑定到节点属性
- Component / Variant / Property / Slot / Instance / Override（§13）；实例修改记录为 override，不切断父组件
- 导入：JSON tokens / CSS variables / Tailwind config / Figma 风格 tokens（§104）
- AI 生成内容**必须优先使用 token 而非字面值**（§12）；Brand Kit（§119）与 Visual DNA（§174）作为生成硬约束
- Design Lint（§121）：间距不一致、游离颜色、重复组件、未使用 token、糟糕排版、对比不足
