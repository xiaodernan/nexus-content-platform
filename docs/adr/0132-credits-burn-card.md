# ADR 0132 — 「点数燃烧」卡：/credits 的 least-squares 耗尽预测（v700）

- 状态：ACCEPTED（2026-11-14）
- 范围：`lib/burn-projection.ts`（纯函数）+ `server/domain/credit-burn.ts`（只读聚合）+
  `components/CreditsBurnCard.tsx`（SVG sparkline 卡）+ `/credits/page.tsx` 插槽

## 背景

/credits 是信息密度最高的一页（四类余额、流水、档位、存储、发布名额），但没有一项回答用户
最想问的问题："**照现在的用法，我的 AI 额度什么时候见底？**"。这是典型的"给人安全感"功能，
也是纯前端+纯函数能做对的功能。

## 决定

1. **口径：仅 AI 类 + delta<0 + UTC 日分组 + 近 30 天**（AI 是今天唯一有消耗方且与"用多少天"
   强相关的类别；video 有消耗但无法代表"用多少天"，脚注里明说不计；image/compute 无消耗方）。
2. **预测器 = least-squares 线性外推**（闭式 2x2 正规方程；零填充窗口；slope ≥ 0 或
   活跃燃烧天数 < 3 时**不给日期**，页面原话说"样本不够，不猜"）。所有边界（NaN/负数/∞/封顶
   9999 天）由纯函数收敛，全部有单测。
3. **失败降级 = 平直序列 → "不猜" 卡**：SQL 异常/坏 jsonb 全部吞到返回全零，绝不让整页 500。
4. **诚实三件事**：footnote 写"外推不是承诺；发放不计燃烧；video 不在这条预测里"；
   没有精确到小时的敷衍（天数 + ISO 日期 + 封顶 9999）；空态/不猜态不用 0% 冒充。
5. **零新依赖**：SVG sparkline 手绘（面积渐变 + 虚线外推段）；count-up 动画与 v699 同一套
   easing（easeOutExpo，prefers-reduced-motion 直落终值）。

## 验证（本机，诚实）

- `burn-projection.test.ts`：15 用例（补零/跨月/坏行丢弃/斜率闭式解/三态判定/封顶/NaN）全绿；
  三套相关 vitest 31/31；tsc 0；eslint 0。
- **真实 DB（55433，先 down 后 Docker 恢复）drizzle 全链路**：top burner / cache-probe owner /
  陌生 id → owner 门与 bad-id 均正确；"projecting" 态被实测过的 dev 数据不满足（无 ≥3 活跃
  燃烧日），走的是'insufficient-data'侧；该侧就是真实用户今天在页面上会看到的样子。
- **唯一未验证层 = 像素/动画**：本机 Next 16 dev 实例水合在此环境反复失败（/_next/hmr 被
  allowedDevOrigins 挡住 + 机器重启两次 + Docker 停摆一次），浏览器里 Tab 切换无法触发提交，
  截图未拿到。SQL/SSR/HTML 插槽位置、编译、类型、单测全绿替代；像素级补验留作环境恢复后动作。
- **环境事实（这一轮才看清）**：此机器上 Docker Desktop 会随系统重启停摆——nexus-postgres /
  nexus-redis 都因此中断过；恢复后所有 200/500 与 hydration 异常全部消失（实测：GET / 从 500
  回到 200，注册 POST 200）。这属于部署面，写进 CURRENT-STATE。

## 仍欠（诚实记录）

1. 像素级/a11y 浏览器实测（环境恢复后补）。
2. 预测口径若要把 video 纳入，或拆成"按天均 vs 按活跃日"两条曲线，另议；当前一条已覆盖核心问题。
3. 每个用户都看到"不猜"直到真的开始稳定燃烧——这是数据决定的，不是代码决定的；不造"预测"。
