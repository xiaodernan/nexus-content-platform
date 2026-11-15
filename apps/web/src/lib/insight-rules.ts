/**
 * 洞察台「深度优化措施」的规则引擎——确定性、双语、可测的启发式判定。
 *
 * 纪律（§159）：
 * - 每条建议都把触发它的那些数字一起端出来，结论不悬空；
 * - 这是**规则**，不是模型猜测、不是 "AI 觉得……"；库里没数的东西不许说；
 * - 阈值集中在 RULE_THRESHOLDS，改动即产品决策本身；
 * - severity 三档：act（该动手）/ watch（值得盯）/ keep（保持）。
 */
import { leastSquares } from './insight-math';

export interface InsightMetrics {
  usersTotal: number;
  guestsTotal: number;
  projectsTotal: number;
  publishedTotal: number;
  opens30d: number;
  botOpens30d: number;
  likes30d: number;
  comments30d: number;
  creditGranted30d: number;
  creditConsumed30d: number;
  realCalls30d: number;
  demoCalls30d: number;
  tokensIn30d: number;
  tokensCached30d: number;
  dailySignups: number[];
  dailyPublishes: number[];
  dailyOpens: number[];
}

export type InsightSeverity = 'act' | 'watch' | 'keep';

export interface InsightAction {
  id: string;
  severity: InsightSeverity;
  title: { zh: string; en: string };
  evidence: { zh: string; en: string };
  action: { zh: string; en: string };
}

export const RULE_THRESHOLDS = {
  publishRate: { watchBelow: 0.4, actBelow: 0.15 },
  openReach: { watchBelow: 150, actBelow: 40 },
  interactionRate: { watchBelow: 0.02 },
  guestShare: { watchAbove: 0.6 },
  botOpenShare: { watchAbove: 0.1 },
  creditBurn: { watchAbove: 0.85 },
  demoHeavyShare: { watchAbove: 0.9 },
} as const;

const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;
const per1 = (v: number): string => v.toFixed(2);
const int = (v: number): string => String(Math.round(v));

export function evaluateInsightRules(m: InsightMetrics): InsightAction[] {
  const out: InsightAction[] = [];
  const projects = Math.max(m.projectsTotal, 1);
  const published = Math.max(m.publishedTotal, 0);
  const openDenom = Math.max(m.opens30d, 0);
  const usersAll = Math.max(m.usersTotal + m.guestsTotal, 1);
  const granted = Math.max(m.creditGranted30d, 0);
  const calls = Math.max(m.realCalls30d + m.demoCalls30d, 1);

  // 1) 发布转化：项目 → 发布作品
  const publishRate = published / projects;
  {
    const t = RULE_THRESHOLDS.publishRate;
    if (publishRate < t.actBelow) {
      out.push({
        id: 'publish-conversion',
        severity: 'act',
        title: { zh: '发布转化偏低：项目都建好了却没发布', en: 'Publish conversion is low: projects built, not shipped' },
        evidence: { zh: `${int(published)} 个已发布作品 / ${int(projects)} 个项目（${pct(publishRate)}，阈值 actBelow ${pct(t.actBelow)}）`, en: `${int(published)} published of ${int(projects)} projects (${pct(publishRate)}; actBelow ${pct(t.actBelow)})` },
        action: { zh: '把发布引导做进 Studio 发布键旁（已存在「帮助」抽屉，让那一屏先被看到）；/guide 第⑩节补一段「发布前三件事」。', en: 'Put the publish path next to the Studio publish button (the “Help” drawer already renders there); add a “three things before publishing” block to /guide §10.' },
      });
    } else if (publishRate < t.watchBelow) {
      out.push({
        id: 'publish-conversion',
        severity: 'watch',
        title: { zh: '发布转化有空间：项目比发布多', en: 'Publish conversion has headroom' },
        evidence: { zh: `${int(published)} / ${int(projects)}（${pct(publishRate)}）`, en: `${int(published)} / ${int(projects)} (${pct(publishRate)})` },
        action: { zh: '观察「保存未发布」的项目列表，抽样 10 个看卡在导出还是发布；导出路径加一句「发布后别人才能看见」。', en: 'Sample the saved-but-unpublished projects; check whether they stall at export or at publish; add “others can only see it after publish” near the export CTA.' },
      });
    }
  }

  // 2) 触达：每个发布作品平均打开次数
  {
    const perWork = openDenom / Math.max(published, 1);
    const t = RULE_THRESHOLDS.openReach;
    if (published > 0 && perWork < t.actBelow) {
      out.push({
        id: 'open-reach',
        severity: 'act',
        title: { zh: '触达低：发布了几乎没人打开', en: 'Reach is low: published but barely opened' },
        evidence: { zh: `${int(openDenom)} 次打开 / ${int(published)} 个作品 = ${per1(perWork)} 次/作品（actBelow ${t.actBelow}）`, en: `${int(openDenom)} opens / ${int(published)} works = ${per1(perWork)} opens per work (actBelow ${t.actBelow})` },
        action: { zh: '别再往 /discover 灌量了——先查 discovery 卡片 CTR；缺封面/标题差的作品在广场没有点击欲。在发布流里强制「封面预览 + 一句话介绍」。', en: 'Stop pouring into /discover until you fix card CTR — weak covers/titles get no taps. Enforce “cover preview + one-line pitch” in the publish flow.' },
      });
    } else if (published > 0 && perWork < t.watchBelow) {
      out.push({
        id: 'open-reach',
        severity: 'watch',
        title: { zh: '触达一般：作品间曝光不均', en: 'Reach is mediocre — exposure is uneven' },
        evidence: { zh: `${per1(perWork)} 次/作品（30 天合计打开 ${int(openDenom)}）`, en: `${per1(perWork)} opens per work (${int(openDenom)} opens in 30 days)` },
        action: { zh: '在 /discover 上线前 24h 给新发布作品一个显式「新作」曝光位；让强者更强之前先保证每作品至少被看见。', en: 'Give fresh publishes an explicit “new” slot during the first 24h; make sure every work is at least seen before ranking winners.' },
      });
    }
  }

  // 3) 互动率：点赞+评论 / 打开
  {
    const rate = (m.likes30d + m.comments30d) / Math.max(openDenom, 1);
    if (openDenom > 0 && rate < RULE_THRESHOLDS.interactionRate.watchBelow) {
      out.push({
        id: 'interaction-rate',
        severity: 'watch',
        title: { zh: '互动率偏低：看客不留痕', en: 'Low interaction: silent spectators' },
        evidence: { zh: `(${int(m.likes30d)} 赞 + ${int(m.comments30d)} 评论) / ${int(openDenom)} 次打开 = ${pct(rate)}`, en: `(${int(m.likes30d)} likes + ${int(m.comments30d)} comments) / ${int(openDenom)} opens = ${pct(rate)}` },
        action: { zh: '把「点赞 / 一句话评论」的入口放到作品完成页的终止处（游戏通关屏 / 文章读完屏），那一刻的转化最高。', en: 'Put the “like / one-line comment” affordance at the completion screen (game-end / article-end); conversion peaks at that exact moment.' },
      });
    }
  }

  // 4) 游客占比
  {
    const share = m.guestsTotal / usersAll;
    if (share > RULE_THRESHOLDS.guestShare.watchAbove) {
      out.push({
        id: 'guest-claim',
        severity: 'watch',
        title: { zh: '游客占比高：身份没绑定，资产会丢', en: 'High guest share: identities unbound, work at risk' },
        evidence: { zh: `${int(m.guestsTotal)} 游客 / ${int(usersAll)} 用户（${pct(share)}）`, en: `${int(m.guestsTotal)} guests / ${int(usersAll)} users (${pct(share)})` },
        action: { zh: '在第一次「保存成功」后弹「绑定邮箱，防止换浏览器丢作品」；兑换路径已存在于 /credits，把提示放进去。', en: 'Prompt “bind your email before your work vanishes with this browser” right after the first save — the redemption path already exists on /credits.' },
      });
    }
  }

  // 5) 爬虫打开占比
  {
    const share = m.botOpens30d / Math.max(openDenom, 1);
    if (openDenom > 0 && share > RULE_THRESHOLDS.botOpenShare.watchAbove) {
      out.push({
        id: 'bot-opens',
        severity: 'watch',
        title: { zh: '打开里爬虫占比高：阅读数不全是人', en: 'Bots inflate opens: not every open is a reader' },
        evidence: { zh: `${int(m.botOpens30d)} / ${int(openDenom)} 疑似爬虫打开 = ${pct(share)}（阈值 ${pct(RULE_THRESHOLDS.botOpenShare.watchAbove)}）`, en: `${int(m.botOpens30d)} / ${int(openDenom)} suspected-bot opens = ${pct(share)} (watch ${pct(RULE_THRESHOLDS.botOpenShare.watchAbove)})` },
        action: { zh: '在 /discover 与创作者 analytics 的热度分里默认剔除 suspectedBot 行，把「人读」与「机器读」分开呈现。', en: 'Exclude suspectedBot rows from /discover ranking and creator analytics by default; show “readers” and “crawlers” separately.' },
      });
    }
  }

  // 6) Credits 燃尽：消费 / 发放
  {
    if (granted > 0) {
      const burn = m.creditConsumed30d / granted;
      if (burn > RULE_THRESHOLDS.creditBurn.watchAbove) {
        out.push({
          id: 'credit-burn',
          severity: 'watch',
          title: { zh: '额度燃尽快：发放的额度接近被烧完', en: 'Credits burn fast: grants nearly consumed' },
          evidence: { zh: `30 天消耗 ${int(m.creditConsumed30d)} / 发放 ${int(granted)} = ${pct(burn)}`, en: `30-day consumed ${int(m.creditConsumed30d)} / granted ${int(granted)} = ${pct(burn)}` },
          action: { zh: '要么提高默认 free 档月包、要么在耗尽前 20% 给一次性提醒；现在用户的体感是「用着用着就不够了」。', en: 'Raise the default free-tier monthly grant or fire a one-shot warning at 20% remaining — “it just stopped mid-flow” is the worst felt experience.' },
        });
      }
    }
  }

  // 7) Demo 调用占比高：说明大部分用户卡在无 provider
  {
    const demoShare = m.demoCalls30d / calls;
    if (demoShare > RULE_THRESHOLDS.demoHeavyShare.watchAbove) {
      out.push({
        id: 'demo-heavy',
        severity: 'watch',
        title: { zh: 'AI 调用几乎都是 DEMO：真 provider 没接上', en: 'Most AI calls are demo-mode: the real provider is not wired' },
        evidence: { zh: `${int(m.demoCalls30d)} / ${int(calls)} 次调用为 demo（${pct(demoShare)}）`, en: `${int(m.demoCalls30d)} / ${int(calls)} calls were demo (${pct(demoShare)})` },
        action: { zh: '在「AI 生成」入口旁常驻一条说明：当前 provider 状态 + 一键跳到配置页；DEMO MODE 的体验与真 AI 差太远，用户以为是「产品的水平」。', en: 'Keep an always-visible line next to the AI entry: current provider status + one click to settings. Demo output is the bar first-time users judge the product by.' },
      });
    }
  }

  // 8) 签约趋势：连续下行的信号
  {
    const fit = leastSquares(m.dailySignups);
    if (fit && m.dailySignups.length >= 14 && fit.slope < -0.05 && fit.r2 >= 0.5) {
      out.push({
        id: 'signup-trend',
        severity: 'watch',
        title: { zh: '注册曲线连续下行：获客在漏水', en: 'Signup curve trending down: acquisition is leaking' },
        evidence: { zh: `近 ${int(m.dailySignups.length)} 天斜率 ${fit.slope.toFixed(3)} 用户/天，R² = ${fit.r2.toFixed(2)}`, en: `Slope over the last ${int(m.dailySignups.length)} days: ${fit.slope.toFixed(3)} users/day, R² = ${fit.r2.toFixed(2)}` },
        action: { zh: '回看注册后第一次失败的地方（认证/邮箱/没立刻看到价值的空编辑器）；把「第一次成功生成」做成注册后的第一屏目标，而不是让空画布占据它。', en: 'Audit where post-signup dies (auth / email / empty canvas); make “first successful generation” the post-signup milestone instead of a blank editor.' },
      });
    }
  }

  return out;
}
