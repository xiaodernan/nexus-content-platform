# PRODUCT

## 一句话

**Describe it → Design it → Generate it → Build it → Enter it.**
把想法变成可以真正运行、可以进入的数字世界。

NEXUS 不是 chatbot、不是 Figma 复刻、不是游戏引擎、不是文生图工具、不是社交网络。
它是把这些产品的**核心工作流**融合进一个 AI-native 环境（§3/§36/§189）。

## 产品循环（必须始终成立）

```
Idea → AI Understanding → Planning → Design → Generation
     → Interaction → Iteration → Publish → Community → Remix
```

任何功能如果打断了这个循环，就是错的功能。

## 六大支柱（§1）

| 支柱 | 用户得到什么 | 落地里程碑 |
| --- | --- | --- |
| Explore | 发现角色/世界/故事/游戏/网站/设计/视频/体验 | M6：`/discover` 三个排得出来的排序 + `/search` 八类目标（§61/§165）；公开作品页的 head / OpenGraph / JSON-LD 与 `/sitemap.xml`、`/robots.txt` 同口径（§166，只收 public）；角色/世界/游戏尚未单独成列 |
| Create | AI 创作 10 类对象 | M1(设计) → M2(图像) → M3(世界/角色) → M4(游戏) → M5(视频) |
| **Studio** | AI Design + Code + Creation IDE —— **项目核心** | M1 |
| Runtime | 真正进入作品：play / walk / talk | M1(预览) → M3(角色对话) → M4(3D) |
| Agents | 自主 research/design/code/generate/test/debug/iterate/publish | M1(Design Agent) 起持续扩展 |
| Community | publish / follow / remix / comment / like / fork / collaborate | M6：六动作齐（Save 挂 publication 版本）+ `/u/<handle>` 主页 + `/analytics` 创作者数据（§168，views/opens/访客/完成度/时长/likes/remixes 各有真实写入方，未采到的写"未采集"）+ `/notifications` 收件箱（§164，只有真终态事件写行，dedupe 在库里）+ 全平台搜索（§165） |

## 项目类型（§37）

Website · Web App · Mobile UI · Game · Interactive Story · 3D Experience · Dashboard · Design System · Prototype
M1 先支持 **Website / Web App / Dashboard / Design System** 四类（它们复用同一套设计模型与生成器）。

## 用户分层体验

- **首次访客（§137）**：不注册即可输入一句 prompt → 看到视觉作品 → 在 Canvas 中体验编辑。
  仅在"保存 / 发布 / 再次进入"时要求注册。
- **创作者**：Studio 全流程 + 资产库 + 版本历史 + 分支 + 多方案比较 + 品牌 Kit。
- **观众**：分享页 / Runtime 播放 / Remix 派生。

## Wow 目标（必须可测量）

1. **WOW 60 秒（§138）**：首次输入 prompt 到画布上出现可编辑设计 ≤ 60s。
2. **第二 WOW（§140）**：进入作品后能 walk / explore / talk。
3. **第三 WOW（§141）**：一句"把城堡变成赛博城市"，环境 / lore / 角色 / 资产整体一致变化。
4. **Studio WOW（§142）**：一句"改成高端科幻游戏落地页" → 设计 + 资产 + 动画 + 响应式 + 代码全部完成，
   然后 `[Open Live Preview]`。

## 不可妥协的产品原则

- **用户始终有控制权（§143）**：AI 生成 + 手工编辑并存，AI 不是唯一控制者。
- **不锁定（§144）**：设计、代码、资产都能导出；账号可删除。
- **作品归用户（§145）**：平台只在明确条款下使用数据。
- **不造假（§159）**：禁止假 API / 假生成 / 假发布 / 假 AI / 假付费。provider 未接入时明确显示 unavailable。
- **Mock 必须戴帽子（§160）**：开发期可用 Mock Provider，但界面必须常驻 `DEMO MODE` 标识。
- **安全优先（§80-81）**：生成代码不在主机执行。
- **内容底线（§129）**：不生成非自愿亲密影像、涉未成年性内容、用于欺骗的身份冒充、违法内容；
  不复制受版权保护的角色/资产/剧情/网站内容（§30-31/52）。

## 度量

- 激活：首次 prompt → 首个可编辑画布对象的时间与成功率
- 创作：AI 事务数 / 手工编辑数之比（衡量 §143 是否成立）
- 采纳：AI 补丁被保留（未被 undo）的比例 = Design Agent 的真实质量分
- 发布：publish 成功率、Quality Gate 通过率（§179）
- 社区：remix 率 > like 率（remix 才是这个产品的价值信号）
