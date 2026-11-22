# 按键教学说明全量巡检（2026-11-22 · §A11Y-NAMES）

> 用户要求「主界面给各种按键和操作加上附带的教学说明，方便用户理解」。
> 这一片把这句要求变成可复检的读数，而不是"看着应该有"。

## 尺子一：axe 规则层

`button-name` / `link-name` / `aria-command-name` / `aria-tooltip-name` 四条，排除 `nextjs-portal`：

| 页面 | 违规 |
|---|---|
| 首页 / | 0 |
| 用户指南 /guide | 0 |
| 发现 /discover | 0 |
| 市场 /marketplace | 0 |
| 典籍室 /bible | 0 |
| 回响线索索引 /bible/threads | 0 |
| 潮汐信 /tide-wire | 0 |
| 宇宙地图 /map | 0 |
| StateGraph /stategraph | 0 |
| 通知 /notifications | 0 |
| 额度 /credits | 0 |
| 积木库 /blocks | 0 |
| 搜索 /search?q=e2e | 0 |

## 尺子二：纯图标控件层

没有可见文字、又没有 `title` / `aria-label` 的控件（这才是"用户不知道该点什么"的形状）：

- 13 张公开页面：**0 个**
- Studio（真注册账号 + 真项目）：**1 个**（主题切换），带 `title="切换到浅色主题"`

## Studio 的教学说明存量

`apps/web/src/studio/shell-i18n.ts` 的 `tabHints`：15 个左栏页签各一句，中英各一份：

```
layers     画布上的每个节点都列在这里；点一层就选中它
design     项目的设计系统：token 与组件，AI 按它审美出图
assets     图片、字体、AI 生成物都进这里，画布里随便用
world      世界观大典：章节、回响、词条——这个宇宙的底稿
game       游戏图与玩法配置：可直接试玩的关卡原型
storyboard 故事分镜：镜头、旁白与时长——导出就是视频脚本
team       成员与角色：viewer 只读 · editor 可改 · owner 可删
characters 角色卡片：名字、声音、出场记录，与正典互证
memory     AI 记住的这件事：可查看、可删除，作用于本项目
retrieve   从正典或资产里找一段原文，直接喂给 AI 用
context    这一轮 AI 到底看到了什么——完全透明
agent      指挥 AI 的面板：选 Agent、看计划、批准或拒绝它的改动
history    本项目的时间线：每次保存、每次 AI 改动可回看
health     项目的体检：渲染、存档、一致性问题清单
ai-health  LLM 缓存读数：前缀稳定度 / 网关命中率，按 30 秒刷新
```

`viewHints`（画布 / 多方案 / 代码三个视图）同理。`title` 与 `aria-label` 同时挂：
鼠标用户看到 tooltip，读屏用户听到同一句——两拨人听到的不是两句话。

## 结论与边界

- **这一条要求已经是满足状态**；本轮补的是读数与记录。
- 真正缺"为什么"的地方不在名字，在三处专门载体，都已实测：
  `/guide`（十四段双语说明书）、游戏内 `GameTutorial`（可折卡片，`GamePlay` / `RpgPlay` 都挂）、
  发布弹层的 `MODERATION_LIMITS`（五条，与机检结论同时出现）。
- 本片**没有**改动任何产品代码——读数全绿就没有为改而改。