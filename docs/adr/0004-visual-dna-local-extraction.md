# 0004 — Visual DNA：本地像素统计 + 客户端事务落地

状态：已采纳（2026-09-23，任务 #22，§30/§172-174）

## 背景

§174 要求项目保存 `Visual DNA` 且「所有 AI 生成内容遵循它」。§173 给的示例是
`Dark / Cinematic / High contrast / Large typography / Soft glass / Slow motion`——
这里面只有一小半是**能从位图测出来**的，其余要靠视觉模型或者直接读设计文档。
真实 provider 需要付费授权（§194 暂停条件），而 §190 要求先做小、验证过再扩。
所以必须决定：在没有视觉模型的现在，这一项怎么做才算「真做」而不是「假 AI」（§159）。

## 选项

1. **等 provider**：这一项标 `[ ]` 不动，M2 里跳过。代价是 §174 这条硬约束一直不可观测。
2. **本地确定性分析**：自己解 PNG、统计像素，只输出测得出的字段，测不出的留空并说明。
3. **让前端把图 base64 塞给 mock 生成"看起来像 DNA"的描述词**：最快，但那是假 AI，直接排除。

落地持久化又有两个位置：

- A. 提取路由算完直接写 `projects.document_json`——少一趟网络，但分析侧写了业务库，
  而且这次"改动"不在模型的 Command/事务历史里，撤不掉。
- B. 路由**只返回结果**，客户端把它包成一条 `setVisualDna` 补丁走 `studio.execute`。

## 决定

选 **2 + B**。

- `apps/web/src/server/domain/visualDna.ts`：纯函数、零依赖（ai-service 无 Pillow，web 侧也不引原生包），
  只认 8bit 非隔行 PNG，五种滤镜全支持，alpha<128 的像素跳过。
  任何解不了的路径返回**中文原因字符串**，调用方 415/422 透传，绝不返回半截统计冒充完整结论。
  产出的描述词只允许来自阈值可解释的量：亮度、对比、饱和、冷暖、留白、边缘密度、主色板与角色。
- `VisualDna` 类型里除 `palette` 和 `descriptors` 外全部转成可选，并加 `source.method`
  （`pixel-stats` / `vision-model` / `concept-language`）。这不是偷懒的可选字段，是**防止三种来源互相冒充**：
  像素统计永远填不出 `typography`，类型系统也不允许它假装填了。
  UI 直接把 method 显示成「本地像素统计」，用户知道自己看的是哪种证据。
- 持久化走 B：`POST /api/projects/:id/visual-dna` 无副作用（CSRF + 项目归属 + 资产归属三重校验后只做计算），
  Studio 侧 `extractVisualDnaFromAsset()` 拿到响应先 `VisualDnaSchema.safeParse`，再
  `execute('从参考图提取 Visual DNA', [{ op: 'setVisualDna', dna }])`。
  于是 §149/§150 自动成立：一次提取 = 一个可撤销事务，撤销能把上一版 DNA（或"无 DNA"）放回去。
- §174 的"约束生成"接的是**同一个真值**：DEMO MODE 的 `palette-transfer` 规则先读 `document.visualDna`，
  命中 `background/foreground/accent` 且文档已有对应 token 时才改色，并在活动流里如实写
  「读取项目 Visual DNA / 项目 DNA」。没有 DNA 才回落到内置色板，且回执换成内置来源的措辞。

## 后果

- 好：这一项现在可跑、可截图、可回归。e2e 用一张参考图提取出 `#14b8a6`，
  再让 AI「make it cinematic」，断言背景落到了参考图的青色而不是内置 cinematic 的 `#05060a`——
  §174 变成了一条会被测到失败的断言，而不是文档里的一句话。
- 代价：只支持 PNG。JPEG/WebP 能上传、能上画布，但点提取会拿到 415 和一句原因（记在 ROADMAP 资产债 3）。
  §173 示例里的 `Cinematic / Soft glass / Slow motion` 这类形容词本地给不出，留空并在 `source.notes` 里明说。
- 后续接真视觉模型时，只需新增一条 `method: 'vision-model'` 的产出路径并把 DNA 补丁的
  `source` 填全，类型与事务层都不用改；两条来源在数据里天然可分辨，可并存可对比。
