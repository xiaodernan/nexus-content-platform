# ADR-0067：§86 视觉基准第一切片 —— 结构网格指标，不是像素逐点比

日期：2026-10-28。状态：已实施（`apps/web/src/server/domain/visualBenchmark.ts`、
`POST /api/projects/[projectId]/visual-benchmark`）。

## 背景

MASTER_DIRECTIVE §86 要求"参考截图 × 生成截图"的视觉比较，明确说
**"不要只使用 pixel-perfect comparison"**，并点名列 layout / spacing / alignment / color /
typography / component correctness 六个维度。

## 选项

1. **逐像素 SSIM/MAE**：被 §86 明文否掉——挪半格内容就全盘崩溃，分数回答不了"哪里不像"。
2. **接视觉 provider 打分**：半边可行，但依赖真实 provider 授权（未配置），且一旦 provider 不可用
   整个基准就哑了——违反"确定性部分不借 provider"的切片纪律。
3. **本地确定性结构指标**（选这个）：所有可从像素统计推出的维度本地算，推不出的维度如实披露
   `notMeasured`，不许编数。

## 决定

- **32×32 归一化网格，各自映射自己的尺寸，不重采样**。两张图不需要同尺寸（生成图和参考图
  纵横比经常不同）；纵横比差 >5% 时披露 `shapeMismatch`，不装作没看见。
- **墨量**：每格采 ≤256 样本，与该图自己 5-bit 调色板的主色（背景）色距 >60 算"有墨"。
  复用 §30 Visual DNA 的 PNG 解码纪律：只认 8-bit 非隔行，解不开就带原因拒绝（§159 不猜）。
- **指标**：布局 = 软 Jaccard（Σmin/Σmax，两图都空视为 1）；间距 = 行/列墨量剖面的
  1−平均绝对差；对齐 = 带边（空↔墨过渡）在 ±2 格容差内的匹配率；颜色 = 逐格映射到
  加权调色板的得分；另给 `meanAbsLuminanceDiff` 但**明确标注它不是分数**，只是原始读数。
- **notMeasured 是结构的一部分**：typography（"字号、字重、字体从位图测不出来"）与
  componentCorrectness（"这块是不是那个组件"需要语义判断）进响应体，而不是悄悄缺字段。
- **路由门**与 visual-dna 同口径：CSRF、requireUser、projectVisibleTo（404）、两张资产都必须
  属于该项目（404 不泄露存在性）、非 PNG 415（消息说清是哪张图）、解不开 422 带原因。
  纯计算，不写库，没有审批面。

## 后果

- 没有 provider 也能给数：参考图 vs 生成图的比较结果今天就可复算、可测试（9 纯函数用例 +
  7 真库真存储路由用例；变异探针把 softIoU 写死为 1，精确红在两处预测断言）。
- 这些指标回答的是"结构像不像"：内容挪到对角 ⇒ 布局/对齐 0；挪半格 ⇒ 对齐仍 1、布局掉半；
  换色 ⇒ 布局 1、颜色掉。它们**不回答**"好不好看""是不是同一个组件"——那两格在 notMeasured 里
  等视觉 provider。
- 欠着的三格：Studio 界面入口（现在只有 API）、provider 接入半边（typography /
  componentCorrectness 的真实来源）、§85 Evaluation 整条没开工。
